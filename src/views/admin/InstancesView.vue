<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { agentApi, virtualisApi, networkApi } from '@/lib/endpoints'
import type { BatchAction, BatchResult, FreeIPEntry, VPC } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type {
  HostInterface, VirtualisAgent, VirtualisImage } from '@/lib/types'
import type { VirtualisDriver, VirtualisInstance } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import Pager from '@/components/app/Pager.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cpuLabel, formatDateTime } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const error = ref('')
const instances = ref<VirtualisInstance[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showCreate = ref(false)
const confirmDeleteOpen = ref(false)
const pendingDeleteId = ref<number | null>(null)
const creating = ref(false)
const selected = ref<number[]>([])
const batchAction = ref<BatchAction>('start')
const batchBusy = ref(false), deleteBusy = ref(false), confirmBatch = ref(false)
const batchResults = ref<BatchResult | null>(null)
const submittedIds = ref<number[]>([])
const pageIds = computed(() => [...new Set(instances.value.map(item => item.id))])
const selectedIds = computed(() => [...new Set(selected.value)].filter(id => pageIds.value.includes(id)))
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every(id => selectedIds.value.includes(id)))
const batchRows = computed(() => submittedIds.value.map(id => ({ id, ok: batchResults.value?.ok?.includes(id) ?? false, reason: batchResults.value?.failed?.find(row => row.id === id)?.reason || '服务端未返回结果，请检查日志后再重试' })))
const actionLabels: Record<BatchAction, string> = { start: '开机', stop: '关机', restart: '重启', delete: '移入回收站' }
function toggleSelection(id: number, checked: boolean) {
  selected.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(value => value !== id)
}
async function runBatch() {
  if (batchBusy.value || !selectedIds.value.length) return
  batchBusy.value = true; batchResults.value = null
  submittedIds.value = [...selectedIds.value]
  try {
    batchResults.value = await virtualisApi.batch(submittedIds.value, batchAction.value)
    confirmBatch.value = false
    await load()
  } catch (e) {
    error.value = errorMessage(e)
    batchResults.value = { ok: [], failed: submittedIds.value.map(id => ({ id, reason: `请求失败，执行状态未知：${error.value}。请刷新并核对该实例的操作日志，不要盲目重试。` })) }
    confirmBatch.value = false
  }
  finally { batchBusy.value = false }
}
let listRequest = 0

const formName = ref('')
const formAgentId = ref<string>('')
const formDriver = ref('auto')
const formType = ref<'container' | 'vm'>('container')
const formCpu = ref(2)
const formMem = ref(1024)
const formDisk = ref(20)
const formArch = ref('x86_64')
const formImageId = ref<string>('none')
const formNetworkMode = ref<'nat' | 'dedicated' | 'vpc' | 'none'>('nat')
const freeIPs = ref<FreeIPEntry[]>([])
const vpcs = ref<VPC[]>([])
const formIPEntry = ref('manual')
const formVPC = ref('')
let networkRequest = 0
watch([formAgentId, formNetworkMode, showCreate], async () => {
  const request = ++networkRequest
  formIPEntry.value = 'manual'; formVPC.value = ''; freeIPs.value = []; vpcs.value = []
  formIPv4.value = ''; formGateway.value = ''; formDNS.value = ''; formBridge.value = ''
  if (!formAgentId.value) return
  try {
    const agentID = Number(formAgentId.value)
    if (formNetworkMode.value === 'dedicated') { const items = await networkApi.freeIPs(agentID); if (request === networkRequest) freeIPs.value = items }
    if (formNetworkMode.value === 'vpc') { const items = await networkApi.vpcs(agentID); if (request === networkRequest) vpcs.value = items }
  } catch (e) { if (request === networkRequest) toast.error(errorMessage(e)) }
})
watch(formIPEntry, value => {
  const entry = freeIPs.value.find(i => String(i.id) === value)
  if (entry) { formIPv4.value = entry.cidr; formGateway.value = entry.gateway; formDNS.value = entry.dns.join(','); formBridge.value = entry.interface }
})
watch(formVPC, value => {
  const vpc = vpcs.value.find(i => String(i.id) === value)
  if (vpc) { formDriver.value = vpc.driver; formBridge.value = vpc.name; formGateway.value = vpc.gateway; formDNS.value = (vpc.dns ?? []).join(',') }
})
const formBridge = ref('')
const hostIfaces = ref<HostInterface[]>([])
const hostIPv4Count = ref(0)
const formMaxNATMappings = ref(0)
const formAutoPassword = ref(true)
const formMAC = ref('')
const formIPv4 = ref('')
const formGateway = ref('')
const formDNS = ref('')
const formBandwidth = ref(0)

const agents = ref<VirtualisAgent[]>([])
const drivers = ref<VirtualisDriver[]>([])
const images = ref<VirtualisImage[]>([])

const selectedAgent = computed(() => agents.value.find(a => String(a.id) === formAgentId.value) ?? null)

const availableDriversForAgent = computed(() => {
  if (!selectedAgent.value) return []
  return (selectedAgent.value.drivers ?? []) as string[]
})

const driverItems = computed(() => {
  const base: Array<{ value: string; label: string; disabled?: boolean; hint?: string }> = [
    { value: 'auto', label: 'auto（自动选择该节点可用驱动）' },
    { value: 'incus', label: 'incus' },
    { value: 'qemu', label: 'qemu' },
    ]
  if (!selectedAgent.value) return base.map(b => ({ ...b, disabled: true, hint: '请先选择被控节点' }))
  if (!availableDriversForAgent.value.length) return base.map(b => ({ ...b, disabled: true, hint: '该节点未上报可用驱动' }))
  return base.map(item => {
    if (item.value === 'auto') return { ...item, disabled: false }
    const ok = availableDriversForAgent.value.includes(item.value)
    return { ...item, disabled: !ok, hint: ok ? undefined : '未安装' }
  })
})

// 独立 IP 模式的挂载接口下拉项：优先软件网桥，其次物理网卡。
const ifaceItems = computed(() => hostIfaces.value.filter(i => i.kind === 'bridge' || i.kind === 'physical' || i.kind === 'vlan'))
const dedicatedAvailable = computed(() => hostIPv4Count.value >= 2)

let hostNetworkRequest = 0
async function loadAgentNetwork() {
  const request = ++hostNetworkRequest
  const agentId = formAgentId.value
  hostIfaces.value = []
  hostIPv4Count.value = 0
  if (!formAgentId.value) return
  try {
    const summary = await agentApi.hostNetwork(Number(agentId))
    if (request !== hostNetworkRequest || agentId !== formAgentId.value) return
    hostIfaces.value = summary.interfaces ?? []
    hostIPv4Count.value = summary.ipv4_count ?? 0
  } catch { /* 节点暂时不可达时表单仍可用，仅无候选接口 */ }
}

const filteredImages = computed(() => {
  if (!formDriver.value || formDriver.value === 'auto') return images.value
  return images.value.filter(img => img.driver === formDriver.value || img.driver === 'auto')
})

async function load() {
  const request = ++listRequest
  selected.value = []
  loading.value = true
  error.value = ''
  try {
    const data = await virtualisApi.instances({ page: page.value, page_size: pageSize.value })
    if (request !== listRequest) return
    instances.value = (data.items ?? []) as VirtualisInstance[]
    total.value = data.total
  } catch (e) { if (request === listRequest) error.value = errorMessage(e) } finally { if (request === listRequest) loading.value=false }
}

async function loadMeta() {
  try { drivers.value = await virtualisApi.drivers() } catch {}
  try { images.value = await virtualisApi.images() } catch {}
  try { agents.value = await agentApi.list() } catch {}
}

watch([formAgentId, showCreate], () => {
  if (!showCreate.value) { ++hostNetworkRequest; return }
  if (!formAgentId.value) { formDriver.value = 'auto'; return }
  if (availableDriversForAgent.value.length && !availableDriversForAgent.value.includes(formDriver.value) && formDriver.value !== 'auto') {
    formDriver.value = 'auto'
  }
  loadAgentNetwork()
})

watch(filteredImages, () => {
  if (formImageId.value !== 'none' && !filteredImages.value.some(img => String(img.id) === formImageId.value)) {
    formImageId.value = 'none'
  }
})

// CPU 输入兼容小数核数（如 0.5）：保留 3 位小数精度，提交时换算为毫核。
function parseCpu(value: string) {
  const cpu = parseFloat(value)
  formCpu.value = !isNaN(cpu) && cpu > 0 ? Math.round(cpu * 1000) / 1000 : 1
}

async function create() {
  if (!formName.value.trim()) { toast.error('请输入名称'); return }
  if (!formAgentId.value) { toast.error('请选择被控节点（主控不负责创建实例）'); return }
  if (formNetworkMode.value === 'vpc' && !formVPC.value) { toast.error('请选择 VPC 网络'); return }
  // CPU 支持小数：整数核只发 cpu；小数核换算为毫核，cpu 存向上取整的核数。
  const cpuMilli = Number.isInteger(formCpu.value) ? undefined : Math.round(formCpu.value * 1000)
  creating.value = true
  try {
    await virtualisApi.createInstance({
      name: formName.value.trim(),
      agent_id: parseInt(formAgentId.value),
      driver: formDriver.value,
      type: formType.value,
      spec: { cpu: Math.ceil(formCpu.value), cpu_milli: cpuMilli, memory_mb: formMem.value, disk_gb: formDisk.value, arch: formArch.value },
      network: {
        mode: formNetworkMode.value,
        bridge: formBridge.value.trim() || undefined,
        mac: formMAC.value.trim() || undefined,
        ipv4: formIPv4.value.trim() || undefined,
        gateway: formGateway.value.trim() || undefined,
        dns: formDNS.value.split(',').map(value => value.trim()).filter(Boolean),
        bandwidth_mbps: formBandwidth.value || undefined,
      },
      image_id: formImageId.value !== 'none' ? parseInt(formImageId.value) : null,
      max_nat_mappings: formMaxNATMappings.value || 0,
      auto_password: formAutoPassword.value,
      ip_pool_entry_id: formNetworkMode.value === 'dedicated' && formIPEntry.value !== 'manual' ? Number(formIPEntry.value) : undefined,
      vpc_id: formNetworkMode.value === 'vpc' ? Number(formVPC.value) : undefined,
    })
    toast.success('实例已在被控节点上创建')
    showCreate.value = false
    formName.value=''; formImageId.value='none'; formNetworkMode.value='nat'; formBridge.value=''; formMAC.value=''; formIPv4.value=''; formGateway.value=''; formDNS.value=''; formBandwidth.value=0; hostIfaces.value=[]; hostIPv4Count.value=0; formMaxNATMappings.value=0; formAutoPassword.value=true
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

function removeItem(id: number) {
  pendingDeleteId.value = id
  confirmDeleteOpen.value = true
}

async function doRemoveItem() {
  if (pendingDeleteId.value === null || deleteBusy.value || batchBusy.value) return
  deleteBusy.value = true
  confirmDeleteOpen.value = false
  try { await virtualisApi.deleteInstance(pendingDeleteId.value); toast.success('已移入回收站'); await load() } catch (e) { toast.error(errorMessage(e)) } finally { deleteBusy.value = false }
}

function statusVariant(s: string) {
  if (s==='running') return 'default'
  if (s==='stopped') return 'secondary'
  if (s==='error') return 'destructive'
  return 'outline'
}

function formatAgent(agent?: VirtualisAgent | null) {
  if (!agent) return '-'
  return agent.display_name || agent.name
}

onMounted(async () => { await load(); await loadMeta() })
</script>
<template>
  <div>
    <PageHeader title="实例" description="实例运行在被控节点上，主控仅做编排与展示">
      <template #actions>
        <Button :disabled="!agents.length" @click="showCreate=true">创建实例</Button>
      </template>
    </PageHeader>
    <p v-if="!agents.length" class="text-sm text-amber-600 mb-2">暂无在线被控，请先在“被控节点”页添加并接入至少一个节点。</p>
    <ErrorAlert :message="error" />
    <div class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <span class="text-sm">已选 {{ selectedIds.length }} 项 <span class="text-muted-foreground">（仅当前页，切页会清空）</span></span>
      <select v-model="batchAction" data-testid="batch-action" aria-label="批量操作" :disabled="batchBusy || deleteBusy" class="h-9 rounded-md border bg-background px-3 text-sm"><option v-for="(label, action) in actionLabels" :key="action" :value="action">{{ label }}</option></select>
      <Button data-testid="run-batch" size="sm" :disabled="!selectedIds.length || batchBusy || deleteBusy || loading" @click="confirmBatch = true">{{ batchBusy ? '执行中…' : '执行批量操作' }}</Button>
      <Button size="sm" variant="ghost" :disabled="batchBusy || !selectedIds.length" @click="selected = []">清空选择</Button>
      <RouterLink to="/admin/trash" class="ml-auto text-sm text-primary hover:underline">查看回收站</RouterLink>
    </div>
    <Card v-if="batchResults" data-testid="batch-results" class="mb-4"><CardContent class="p-4 space-y-2"><h2 class="text-sm font-medium">批量结果 · {{ batchRows.filter(row => row.ok).length }} 成功 / {{ batchRows.filter(row => !row.ok).length }} 失败或未确认</h2><ul class="divide-y text-sm"><li v-for="row in batchRows" :key="row.id" class="flex gap-3 py-2"><span>#{{ row.id }}</span><span :class="row.ok ? 'text-muted-foreground' : 'text-destructive'">{{ row.ok ? '成功' : row.reason }}</span></li></ul></CardContent></Card>
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-auto">
          <table class="w-full text-sm">
            <thead class="border-b bg-muted/30">
              <tr>
                <th class="h-10 px-4 text-left"><input type="checkbox" aria-label="选择本页全部实例" :checked="allSelected" :indeterminate="selectedIds.length > 0 && !allSelected" :disabled="batchBusy || deleteBusy" class="size-4 accent-primary" @change="selected = ($event.target as HTMLInputElement).checked ? [...pageIds] : []" /></th>
                <th class="h-10 px-4 text-left font-medium">ID</th>
                <th class="h-10 px-4 text-left font-medium">名称</th>
                <th class="h-10 px-4 text-left font-medium">被控</th>
                <th class="h-10 px-4 text-left font-medium">驱动</th>
                <th class="h-10 px-4 text-left font-medium">规格</th>
                <th class="h-10 px-4 text-left font-medium">镜像</th>
                <th class="h-10 px-4 text-left font-medium">状态</th>
                <th class="h-10 px-4 text-left font-medium">创建时间</th>
                <th class="h-10 px-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in instances" :key="it.id" class="border-b hover:bg-muted/20">
                <td class="px-4 py-2"><input type="checkbox" :aria-label="`选择实例 #${it.id}`" :checked="selectedIds.includes(it.id)" :disabled="batchBusy || deleteBusy" class="size-4 accent-primary" @change="toggleSelection(it.id, ($event.target as HTMLInputElement).checked)" /></td>
                <td class="px-4 py-2">{{ it.id }}</td>
                <td class="px-4 py-2"><RouterLink :to="`/admin/instances/${it.id}`" class="text-primary hover:underline">{{ it.name }}</RouterLink></td>
                <td class="px-4 py-2"><Badge variant="outline">{{ formatAgent((it as any).agent) }}</Badge></td>
                <td class="px-4 py-2"><Badge variant="outline">{{ it.driver }}</Badge></td>
                <td class="px-4 py-2">{{ cpuLabel(it.spec.cpu, it.spec.cpu_milli) }} / {{ it.spec.memory_mb }}MB / {{ it.spec.disk_gb }}GB</td>
                <td class="px-4 py-2">{{ it.image?.name ?? (it.image_id ?? '-') }}</td>
                <td class="px-4 py-2"><Badge :variant="statusVariant(it.status) as any">{{ it.status }}</Badge></td>
                <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(it.created_at) }}</td>
                <td class="px-4 py-2 text-right">
                  <div class="flex justify-end gap-2">
                    <Button variant="outline" size="sm" @click="$router.push(`/admin/instances/${it.id}`)">详情</Button>
                    <Button variant="destructive" size="sm" :disabled="batchBusy || deleteBusy" @click="removeItem(it.id)">移入回收站</Button>
                  </div>
                </td>
              </tr>
              <tr v-if="instances.length===0"><td colspan="10" class="text-center py-8 text-muted-foreground">暂无实例</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <Pager :page="page" :pageSize="pageSize" :total="total" :disabled="batchBusy || deleteBusy || loading" @update:page="(v:number)=>{ if (!batchBusy && !deleteBusy) { selected=[]; page=v; load() } }" />

    <Dialog :open="showCreate" @update:open="(v:boolean)=> showCreate=v">
      <DialogContent class="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建实例</DialogTitle>
          <DialogDescription>必须先选择被控节点，驱动与镜像选项由该节点的实际能力决定</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="my-vm-01" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-2">
              <Label>被控节点 *</Label>
              <Select v-model="formAgentId">
                <SelectTrigger><SelectValue placeholder="选择被控节点" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="agent in agents" :key="String(agent.id)" :value="String(agent.id)" :disabled="agent.status!=='online'">
                    {{ agent.display_name || agent.name }}（{{ agent.status }} · {{ (agent.drivers ?? []).join(', ') || '无驱动上报' }}）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>类型</Label>
              <Select v-model="formType as any">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="container">容器</SelectItem>
                  <SelectItem value="vm">虚拟机（qemu/incus 支持）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid gap-2">
            <Label>驱动</Label>
            <Select v-model="formDriver">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in driverItems" :key="item.value" :value="item.value" :disabled="!!item.disabled">{{ item.label }}{{ item.hint ? `（${item.hint}）` : '' }}</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="!selectedAgent" class="text-xs text-amber-600">请先选择被控节点。</p>
            <p v-else-if="!availableDriversForAgent.length" class="text-xs text-muted-foreground">该节点尚未上报可用驱动，无法创建实例。</p>
          </div>
          <div class="grid grid-cols-4 gap-3">
            <div class="grid gap-2"><Label>CPU</Label><Input :modelValue="String(formCpu)" @update:modelValue="(v:any)=> parseCpu(v)" type="number" min="0.1" step="0.1" /><p class="text-xs text-muted-foreground">支持小数核数（如 0.5），最低 0.1 核。</p></div>
            <div class="grid gap-2"><Label>内存 MB</Label><Input :modelValue="String(formMem)" @update:modelValue="(v:any)=> formMem=parseInt(v)||128" type="number" /></div>
            <div class="grid gap-2"><Label>磁盘 GB</Label><Input :modelValue="String(formDisk)" @update:modelValue="(v:any)=> formDisk=parseInt(v)||5" type="number" /></div>
            <div class="grid gap-2"><Label>架构</Label><Select v-model="formArch"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="x86_64">x86_64</SelectItem><SelectItem value="arm64">arm64</SelectItem><SelectItem value="aarch64">aarch64</SelectItem></SelectContent></Select></div>
          </div>
          <div class="grid gap-2">
            <Label>镜像</Label>
            <Select v-model="formImageId">
              <SelectTrigger><SelectValue placeholder="选择镜像（可选，已按驱动过滤）" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                <SelectItem v-for="img in filteredImages" :key="String(img.id)" :value="String(img.id)">{{ img.name }}（{{ img.driver }} / {{ img.type }}）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label>最大 NAT 映射数</Label>
              <Input :modelValue="String(formMaxNATMappings)" @update:modelValue="(v:any)=> formMaxNATMappings=parseInt(v)||0" type="number" min="0" />
              <p class="text-xs text-muted-foreground">该实例可创建的 NAT 端口转发上限，0 表示不限。NAT 模式下创建时自动生成一条 SSH 映射。</p>
            </div>
            <div class="grid gap-2">
              <Label>SSH 访问</Label>
              <div class="flex h-10 items-center gap-2">
                <input id="auto-password" type="checkbox" v-model="formAutoPassword" class="size-4 accent-primary" />
                <Label for="auto-password" class="font-normal">自动生成 root 随机密码</Label>
              </div>
              <p class="text-xs text-muted-foreground">密码可在实例详情页查看，创建时自动映射 SSH 端口（仅 NAT 模式）。</p>
            </div>
          </div>
          <div class="space-y-4 rounded-md border p-4">
            <div><div class="text-sm font-medium">虚拟网卡与网络</div><p class="text-xs text-muted-foreground">NAT 由被控自动配置默认网络（共享主机出口 IP）；独立 IP 把实例网卡直连主机网段，仅当主机有至少 2 个 IPv4 地址时可用。</p>
              <p v-if="formAgentId && !dedicatedAvailable" class="text-xs text-amber-600">该节点当前 {{ hostIPv4Count }} 个 IPv4 地址，独立 IP 模式不可用。</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="grid gap-2"><Label>网络模式</Label><Select v-model="formNetworkMode as any"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nat">NAT（共享主机 IP）</SelectItem><SelectItem value="dedicated" :disabled="!dedicatedAvailable">独立 IP（直连主机网段）</SelectItem><SelectItem value="vpc">VPC 私有网络</SelectItem><SelectItem value="none">禁用网卡</SelectItem></SelectContent></Select></div>
              <div v-if="formNetworkMode === 'dedicated'" class="grid gap-2">
                <Label>挂载接口</Label>
                <Select v-model="formBridge">
                  <SelectTrigger><SelectValue placeholder="自动选择物理网卡" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">自动选择物理网卡</SelectItem>
                    <SelectItem v-for="iface in ifaceItems" :key="iface.name" :value="iface.name">{{ iface.name }}（{{ iface.kind }} · {{ (iface.ipv4 ?? []).join(', ') || '无 IPv4' }}）</SelectItem>
                  </SelectContent>
                </Select>
                <p class="text-xs text-muted-foreground">选择已存在的网桥或物理网卡；网桥直接挂载，物理网卡以 macvtap 直连。</p>
              </div>
            </div>
            <div v-if="formNetworkMode === 'dedicated'" class="grid gap-2">
              <Label>从独立 IP 池选择</Label><Select v-model="formIPEntry"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">手动填写网络参数</SelectItem><SelectItem v-for="entry in freeIPs" :key="entry.id" :value="String(entry.id)">{{ entry.cidr }} {{ entry.note }}</SelectItem></SelectContent></Select>
              <p class="text-xs text-muted-foreground">选择地址后自动填写网关、DNS 和接口。提交时会检查地址是否仍可分配。</p>
            </div>
            <div v-if="formNetworkMode === 'vpc'" class="grid gap-2">
              <Label>VPC 网络</Label><Select v-model="formVPC"><SelectTrigger><SelectValue placeholder="选择该节点的 VPC" /></SelectTrigger><SelectContent><SelectItem v-for="vpc in vpcs" :key="vpc.id" :value="String(vpc.id)">{{ vpc.name }} · {{ vpc.subnet }} · {{ vpc.driver }}</SelectItem></SelectContent></Select>
              <p class="text-xs text-muted-foreground">默认由 DHCP 分配地址。可在“VPC 与 IP 池”页面创建网络。</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="grid gap-2"><Label>MAC 地址</Label><Input v-model="formMAC" placeholder="52:54:00:xx:xx:xx" /></div>
              <div class="grid gap-2"><Label>IPv4 / CIDR</Label><Input v-model="formIPv4" placeholder="192.168.1.20/24" /></div>
              <div class="grid gap-2"><Label>网关</Label><Input v-model="formGateway" placeholder="192.168.1.1" /></div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2"><div class="grid gap-2"><Label>DNS（逗号分隔）</Label><Input v-model="formDNS" placeholder="1.1.1.1,8.8.8.8" /></div><div class="grid gap-2"><Label>带宽限制 Mbps</Label><Input :modelValue="String(formBandwidth)" @update:modelValue="(v:any)=> formBandwidth=parseInt(v)||0" type="number" min="0" /></div></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreate=false">取消</Button>
          <Button :disabled="creating || !formAgentId" @click="create">{{ creating ? '创建中...' : '创建' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog :open="confirmBatch" :busy="batchBusy" :danger="batchAction !== 'start'" :title="`批量${actionLabels[batchAction]} ${selectedIds.length} 个实例`" :description="batchAction === 'delete' ? '仅操作本页已选实例。它们将关机并移入回收站；每条执行结果都会单独列出。' : '仅操作本页已选实例。关机或重启会中断服务；失败项不会阻止其他实例执行，请逐条核对结果。'" @update:open="v => { if (!batchBusy) confirmBatch = v }" @confirm="runBatch" />
    <ConfirmDialog :busy="deleteBusy" :open="confirmDeleteOpen" @update:open="(v:boolean)=> confirmDeleteOpen=v" :title="$t('confirm.deleteInstanceTitle')" :description="$t('confirm.deleteInstanceDesc')" danger @confirm="doRemoveItem" />
  </div>
</template>
