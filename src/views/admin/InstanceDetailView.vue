<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RFB from '@novnc/novnc'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { InstanceMetrics, NATMapping, NetworkStatus, VNCInfo, VirtualisImage, VirtualisInstance, InstanceOperationLog, NetworkConfig } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatBytes, formatDateTime } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const id = Number(route.params.id)
const inst = ref<VirtualisInstance | null>(null)
const loading = ref(false)
const error = ref('')
const actionLoading = ref('')
const images = ref<VirtualisImage[]>([])
const reinstallImage = ref<string>('')
const metrics = ref<InstanceMetrics | null>(null)
const network = ref<NetworkStatus | null>(null)
const vnc = ref<VNCInfo | null>(null)
const telemetryLoading = ref(false)
const networkLoading = ref(false)
const vncLoading = ref(false)
const consoleOpen = ref(false)
const vncTarget = ref<HTMLElement | null>(null)
const vncConnected = ref(false)
let rfb: RFB | null = null
let telemetryTimer: ReturnType<typeof setInterval> | undefined

// NAT 映射与 SSH 密码管理。
const natMappings = ref<NATMapping[]>([])
const natForm = ref({ protocol: 'tcp', guest_port: '', host_port: '', remark: '' })
const natBusy = ref(false)
const showPassword = ref(false)
const passwordBusy = ref(false)
const configureBusy = ref(false)
const operationLogs = ref<InstanceOperationLog[]>([])
const logsLoading = ref(false)
const networkForm = ref<NetworkConfig>({ mode: 'nat' })

const sshMapping = computed(() => natMappings.value.find(m => m.guest_port === 22 && m.protocol === 'tcp') ?? null)
const sshHost = computed(() => inst.value?.agent?.ip || inst.value?.agent?.endpoint?.replace(/^https?:\/\//, '').replace(/:\d+$/, '') || '')
const sshCommand = computed(() => sshMapping.value && sshHost.value ? `ssh root@${sshHost.value} -p ${sshMapping.value.host_port}` : '')

async function loadNAT() {
  try {
    const fresh = await virtualisApi.instance(id)
    inst.value = fresh
    natMappings.value = fresh.nat_mappings ?? []
  } catch { /* 详情加载失败时主流程已有错误提示 */ }
}

async function addNAT() {
  const guestPort = parseInt(natForm.value.guest_port)
  if (!guestPort || guestPort < 1 || guestPort > 65535) { toast.error('请填写实例端口（1-65535）'); return }
  natBusy.value = true
  try {
    await virtualisApi.createNATMapping(id, {
      protocol: natForm.value.protocol,
      guest_port: guestPort,
      host_port: parseInt(natForm.value.host_port) || 0,
      remark: natForm.value.remark.trim() || undefined,
    })
    toast.success('映射已添加' )
    natForm.value = { protocol: natForm.value.protocol, guest_port: '', host_port: '', remark: '' }
    await loadNAT()
  } catch (e) { toast.error(errorMessage(e)) } finally { natBusy.value = false }
}

async function removeNAT(mappingId?: number) {
  if (!mappingId || !confirm('确认删除该端口映射？')) return
  natBusy.value = true
  try {
    await virtualisApi.deleteNATMapping(id, mappingId)
    toast.success('映射已删除')
    await loadNAT()
  } catch (e) { toast.error(errorMessage(e)) } finally { natBusy.value = false }
}

async function rotatePassword() {
  const password = generatePassword()
  if (!confirm('生成新的 root 密码并注入实例？旧密码将失效。')) return
  passwordBusy.value = true
  try {
    const updated = await virtualisApi.setPassword(id, password)
    inst.value = updated
    natMappings.value = updated.nat_mappings ?? natMappings.value
    showPassword.value = true
    toast.success('密码已更新，运行中的实例会自动注入')
  } catch (e) { toast.error(errorMessage(e)) } finally { passwordBusy.value = false }
}

function generatePassword(len = 16) {
  const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += charset[Math.floor(Math.random() * charset.length)]
  return out
}

const memoryPercent = computed(() => {
  if (!metrics.value || metrics.value.memory_total_mb <= 0) return 0
  return Math.min(100, Math.max(0, metrics.value.memory_used_mb / metrics.value.memory_total_mb * 100))
})

function statusLabel(status: string) {
  const labels: Record<string, string> = { running: '运行中', stopped: '已关机', creating: '创建中', error: '异常', suspended: '已暂停' }
  return labels[status] ?? status
}

function formatRate(value: number) {
  return `${formatBytes(Math.max(0, value))}/s`
}

async function load() {
  loading.value=true
  error.value=''
  try { inst.value = await virtualisApi.instance(id); if (inst.value.network) networkForm.value = { ...inst.value.network } } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function loadImages() {
  try { images.value = await virtualisApi.images() } catch {}
}

async function refreshTelemetry(showToast = false) {
  if (!inst.value) return
  telemetryLoading.value = true
  const results = await Promise.allSettled([virtualisApi.metrics(id), virtualisApi.network(id)])
  if (results[0].status === 'fulfilled') metrics.value = results[0].value
  if (results[1].status === 'fulfilled') network.value = results[1].value
  telemetryLoading.value = false
  if (showToast) toast.success('实例状态已刷新')
}

async function checkNetwork() {
  networkLoading.value = true
  try {
    network.value = await virtualisApi.network(id)
    const observed = network.value.interfaces?.flatMap((item) => item.ipv4 ?? []).find((item) => item && item !== '127.0.0.1')
    if (inst.value && observed) {
      inst.value.observed_ip = observed.split('/')[0]
      inst.value.ip = inst.value.observed_ip
    }
    toast.success(network.value.reachable ? '网络检测通过' : '网络检测未通过')
  } catch (e) { toast.error(errorMessage(e)) } finally { networkLoading.value = false }
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const page = await virtualisApi.operationLogs(id, { page: 1, page_size: 50 })
    operationLogs.value = page.items ?? []
  } catch (e) { toast.error(errorMessage(e)) } finally { logsLoading.value = false }
}

async function configureNetwork() {
  if (!confirm('将重新配置实例网络，并重新初始化 SSH/NAT。运行中的实例可能会重启，继续吗？')) return
  configureBusy.value = true
  try {
    const result = await virtualisApi.configureNetwork(id, networkForm.value)
    inst.value = result.instance
    natMappings.value = result.instance.nat_mappings ?? natMappings.value
    await Promise.all([refreshTelemetry(), loadLogs()])
    toast.success(`网络配置完成（操作 ${result.operation_id}）`)
  } catch (e) {
    await loadLogs()
    toast.error(errorMessage(e))
  } finally { configureBusy.value = false }
}

async function loadVNC() {
  vncLoading.value = true
  try {
    vnc.value = await virtualisApi.vnc(id)
    if (!vnc.value.available) {
      toast.error(vnc.value.message || '当前实例没有 VNC')
      return
    }
    rfb?.disconnect()
    rfb = null
    consoleOpen.value = true
    await nextTick()
    if (!vncTarget.value) return
    const webURL = vnc.value.web_url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/instances/${id}/vnc/ws`
    // resizeSession 必须关：QEMU 对 VGA 的 SetDesktopSize 请求会回
    // "Invalid screen layout"，随后画面不再渲染，看起来像连不上。
    rfb = new RFB(vncTarget.value, webURL)
    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.viewOnly = false
    rfb.addEventListener('connect', () => { vncConnected.value = true; toast.success('VNC 已连接，黑屏时在画面内点击或按键唤醒') })
    rfb.addEventListener('disconnect', (e) => {
      vncConnected.value = false
      const detail = (e as CustomEvent).detail || {}
      // 断开原因打进 console：clean=false 且秒断通常是浏览器刷新/手动重连，
      // 握手阶段异常则要看这里和主控、被控两侧的 journal 对照。
      console.warn('[VNC] 断开', detail)
      toast.error(detail.clean ? 'VNC 连接已断开' : 'VNC 异常断开，请点击「重连 VNC」重试')
    })
  } catch (e) { toast.error(errorMessage(e)) } finally { vncLoading.value = false }
}

function disconnectVNC() {
  rfb?.disconnect()
  rfb = null
  consoleOpen.value = false
}

/** 全屏控制台：新窗口里独立连接（内嵌窗口保留）。 */
function openConsoleWindow() {
  window.open(`/admin/instances/${id}/console`, '_blank', 'width=1280,height=820')
}

async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); toast.success('已复制') } catch { toast.error('复制失败，请手动复制') }
}

async function power(action: string) {
  actionLoading.value=action
  try {
    const imgId = action==='reinstall' && reinstallImage.value ? parseInt(reinstallImage.value) : undefined
    const updated = await virtualisApi.power(id, action, imgId as any)
    inst.value = updated
    toast.success(`执行 ${action} 成功`)
    await refreshTelemetry()
  } catch (e) { toast.error(errorMessage(e)) } finally { actionLoading.value='' }
}

async function refreshStatus() {
  actionLoading.value='status'
  try {
    inst.value = await virtualisApi.status(id)
    await refreshTelemetry()
    toast.success('状态已刷新')
  } catch (e) { toast.error(errorMessage(e)) } finally { actionLoading.value='' }
}

async function del() {
  if (!confirm('确认删除？会同时销毁被控节点上的资源。')) return
  try { await virtualisApi.deleteInstance(id); toast.success('已删除'); router.push({ name: 'instances' }) } catch (e) { toast.error(errorMessage(e)) }
}

onMounted(async () => {
  await load()
  await Promise.all([loadImages(), refreshTelemetry(), loadLogs()])
  telemetryTimer = setInterval(() => refreshTelemetry(), 10000)
  await loadNAT()
})

onBeforeUnmount(() => {
  if (telemetryTimer) clearInterval(telemetryTimer)
  disconnectVNC()
})
</script>

<template>
  <div>
    <PageHeader :title="inst ? `实例 #${inst.id} - ${inst.name}` : '实例详情'" description="被控资源、网络检测、VNC 与电源操作">
      <template #actions>
        <Button variant="outline" @click="router.push({ name: 'instances' })">返回列表</Button>
      </template>
    </PageHeader>
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <div v-else-if="inst" class="space-y-6">
      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><span class="text-muted-foreground">ID：</span>{{ inst.id }}</div>
          <div><span class="text-muted-foreground">名称：</span>{{ inst.name }}</div>
          <div><span class="text-muted-foreground">类型：</span>{{ inst.type === 'vm' ? '虚拟机' : '容器' }}</div>
          <div><span class="text-muted-foreground">被控：</span>{{ inst.agent?.display_name || inst.agent?.name || '-' }}</div>
          <div><span class="text-muted-foreground">驱动：</span><Badge variant="outline">{{ inst.driver }}</Badge></div>
          <div><span class="text-muted-foreground">状态：</span><Badge>{{ statusLabel(inst.status) }}</Badge></div>
          <div><span class="text-muted-foreground">规格：</span>{{ inst.spec.cpu }}C / {{ inst.spec.memory_mb }}MB / {{ inst.spec.disk_gb }}GB</div>
          <div><span class="text-muted-foreground">镜像：</span>{{ inst.image?.name ?? inst.image_id ?? '-' }}</div>
          <div><span class="text-muted-foreground">网络：</span>{{ inst.network?.mode || 'nat' }}{{ inst.network?.bridge ? ` / ${inst.network.bridge}` : '' }}</div>
          <div><span class="text-muted-foreground">创建：</span>{{ formatDateTime(inst.created_at) }}</div>
          <div><span class="text-muted-foreground">更新：</span>{{ formatDateTime(inst.updated_at) }}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SSH 访问</CardTitle>
          <CardDescription>NAT 模式下创建实例时自动生成密码并映射 22 端口</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <template v-if="sshCommand">
            <div class="grid gap-2">
              <Label class="text-muted-foreground text-xs">连接命令</Label>
              <code class="bg-muted/40 block overflow-x-auto rounded-md border p-3 text-sm">{{ sshCommand }}</code>
            </div>
            <div class="grid gap-2">
              <Label class="text-muted-foreground text-xs">root 密码</Label>
              <div class="flex flex-wrap items-center gap-2">
                <code class="bg-muted/40 rounded-md border px-3 py-2 text-sm tabular">
                  {{ inst.ssh_password ? (showPassword ? inst.ssh_password : '••••••••••••••••') : '未生成' }}
                </code>
                <Button variant="outline" size="sm" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</Button>
                <Button variant="outline" size="sm" :disabled="passwordBusy" @click="rotatePassword">重置密码</Button>
              </div>
              <p class="text-muted-foreground text-xs">QEMU 虚拟机需客户机安装并运行 qemu-guest-agent，密码注入才会生效。</p>
            </div>
          </template>
          <p v-else class="text-muted-foreground text-sm">
            {{ inst.network?.mode === 'nat' ? '尚未生成 SSH 映射（实例可能创建于该功能上线前，可手动添加 22 端口映射）。' : '非 NAT 模式请直接使用独立 IP 连接。' }}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>NAT 端口映射</CardTitle>
          <CardDescription>
            把宿主机端口转发到实例端口；上限 {{ inst.max_nat_mappings ? `${inst.max_nat_mappings} 条` : '不限' }}，当前 {{ natMappings.length }} 条
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-if="natMappings.length" class="divide-y rounded-md border">
            <div v-for="m in natMappings" :key="m.id" class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div class="flex items-center gap-3">
                <Badge variant="outline">{{ m.protocol.toUpperCase() }}</Badge>
                <span class="font-medium tabular">{{ m.host_port }}</span>
                <span class="text-muted-foreground">→</span>
                <span class="tabular">实例 {{ m.guest_port }}</span>
                <span v-if="m.remark" class="text-muted-foreground">{{ m.remark }}</span>
              </div>
              <Button variant="ghost" size="sm" class="text-destructive" :disabled="natBusy" @click="removeNAT(m.id)">删除</Button>
            </div>
          </div>
          <p v-else class="text-muted-foreground text-sm">暂无映射。</p>

          <form class="grid gap-3 sm:grid-cols-5" @submit.prevent="addNAT">
            <div class="grid gap-1">
              <Label class="text-muted-foreground text-xs">协议</Label>
              <Select v-model="natForm.protocol">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-1">
              <Label class="text-muted-foreground text-xs">实例端口 *</Label>
              <Input :modelValue="natForm.guest_port" @update:modelValue="(v:any)=> natForm.guest_port=v" placeholder="80" inputmode="numeric" />
            </div>
            <div class="grid gap-1">
              <Label class="text-muted-foreground text-xs">宿主端口（留空自动）</Label>
              <Input :modelValue="natForm.host_port" @update:modelValue="(v:any)=> natForm.host_port=v" placeholder="自动分配" inputmode="numeric" />
            </div>
            <div class="grid gap-1">
              <Label class="text-muted-foreground text-xs">备注</Label>
              <Input :modelValue="natForm.remark" @update:modelValue="(v:any)=> natForm.remark=v" placeholder="网站" />
            </div>
            <div class="flex items-end">
              <Button type="submit" class="w-full" :disabled="natBusy">添加映射</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between gap-3"><div><CardTitle>实例状态</CardTitle><CardDescription>数据由被控节点实时采集，每 10 秒刷新</CardDescription></div><Button variant="outline" size="sm" :disabled="telemetryLoading" @click="refreshTelemetry(true)">{{ telemetryLoading ? '刷新中...' : '刷新' }}</Button></div>
          </CardHeader>
          <CardContent class="space-y-5">
            <div v-if="metrics" class="space-y-4 text-sm">
              <div>
                <div class="mb-1 flex justify-between"><span>CPU</span><span>{{ metrics.cpu_percent.toFixed(1) }}%</span></div>
                <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${Math.min(100, Math.max(0, metrics.cpu_percent))}%` }" /></div>
              </div>
              <div>
                <div class="mb-1 flex justify-between"><span>RAM</span><span>{{ metrics.memory_used_mb }} / {{ metrics.memory_total_mb || inst.spec.memory_mb }} MB</span></div>
                <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${memoryPercent}%` }" /></div>
              </div>
              <div class="grid grid-cols-2 gap-3 rounded-md border p-3">
                <div><div class="text-muted-foreground">下载带宽</div><div class="font-medium">{{ formatRate(metrics.bandwidth_rx_bps) }}</div><div class="text-xs text-muted-foreground">总计 {{ formatBytes(metrics.network_rx_bytes) }}</div></div>
                <div><div class="text-muted-foreground">上传带宽</div><div class="font-medium">{{ formatRate(metrics.bandwidth_tx_bps) }}</div><div class="text-xs text-muted-foreground">总计 {{ formatBytes(metrics.network_tx_bytes) }}</div></div>
              </div>
              <div class="text-xs text-muted-foreground">采集时间：{{ formatDateTime(metrics.collected_at) }}</div>
            </div>
            <div v-else class="py-5 text-sm text-muted-foreground">暂无资源数据，请确认被控节点在线且实例已创建。</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div class="flex items-center justify-between gap-3"><div><CardTitle>网络检测</CardTitle><CardDescription>检查被控节点可见的实例网卡与外部连通性</CardDescription></div><div class="flex gap-2"><Button variant="outline" size="sm" :disabled="networkLoading" @click="checkNetwork">{{ networkLoading ? '检测中...' : '检测网络' }}</Button><Button size="sm" :disabled="configureBusy" @click="configureNetwork">{{ configureBusy ? '配置中...' : '配置网络' }}</Button></div></div>
          </CardHeader>
          <CardContent class="space-y-4">
            <div v-if="network" class="flex items-center gap-2 text-sm"><Badge :variant="network.reachable ? 'default' : 'destructive' as any">{{ network.reachable ? '网络正常' : '网络异常' }}</Badge><span v-if="network.latency_ms">延迟 {{ network.latency_ms.toFixed(1) }} ms</span></div>
            <p v-if="network?.error" class="text-sm text-destructive">{{ network.error }}</p>
            <div v-if="network?.interfaces?.length" class="space-y-2">
              <div v-for="iface in network.interfaces" :key="iface.name" class="rounded-md border p-3 text-xs">
                <div class="flex justify-between font-medium"><span>{{ iface.name }} <span class="text-muted-foreground">{{ iface.state || '-' }}</span></span><span>{{ iface.mac || '-' }}</span></div>
                <div class="mt-1 text-muted-foreground">IPv4：{{ iface.ipv4?.join(', ') || '-' }} · IPv6：{{ iface.ipv6?.join(', ') || '-' }}</div>
                <div class="mt-1 text-muted-foreground">RX {{ formatBytes(iface.rx_bytes) }} · TX {{ formatBytes(iface.tx_bytes) }}</div>
              </div>
            </div>
            <div v-else class="text-sm text-muted-foreground">暂无网卡信息。</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><div class="flex items-center justify-between gap-3"><div><CardTitle>VNC 连接</CardTitle><CardDescription>通过主控内置 WebSocket 代理使用 noVNC，浏览器无需安装 VNC 客户端</CardDescription></div><div class="flex gap-2"><Button :disabled="vncLoading" @click="loadVNC">{{ vncLoading ? '连接中...' : consoleOpen ? '重连 VNC' : '连接 VNC' }}</Button><Button variant="outline" @click="openConsoleWindow">新窗口打开</Button><Button v-if="consoleOpen" variant="outline" @click="disconnectVNC">断开</Button><Badge v-if="vncConnected" variant="outline">已连接</Badge><Badge v-else-if="consoleOpen" variant="outline">未连接</Badge></div></div></CardHeader>
        <CardContent>
          <div v-if="consoleOpen" ref="vncTarget" class="h-[420px] w-full overflow-hidden rounded-md bg-black" />
          <div v-else-if="vnc?.available" class="space-y-3"><div class="flex flex-wrap items-center gap-2"><code class="rounded border bg-muted px-3 py-2 text-sm">{{ vnc.url }}</code><Button variant="outline" size="sm" @click="copy(vnc.url || '')">复制</Button></div><p class="text-xs text-muted-foreground">主机：{{ vnc.host }}，端口：{{ vnc.port }}，显示：{{ vnc.display }}。也可以使用桌面 VNC 客户端连接。</p></div>
          <p v-else class="text-sm text-muted-foreground">{{ vnc?.message || '尚未获取 VNC 信息。QEMU 实例创建时自动启用 VNC；容器实例需要宿主安装 xvfb、x11vnc、xterm。' }}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div class="flex items-center justify-between gap-3"><div><CardTitle>操作日志</CardTitle><CardDescription>创建、电源、网络配置和错误记录</CardDescription></div><Button variant="outline" size="sm" :disabled="logsLoading" @click="loadLogs">{{ logsLoading ? '刷新中...' : '刷新日志' }}</Button></div></CardHeader>
        <CardContent>
          <div v-if="operationLogs.length" class="overflow-x-auto rounded-md border">
            <table class="w-full text-sm"><thead><tr class="border-b text-left"><th class="px-3 py-2">时间</th><th class="px-3 py-2">操作</th><th class="px-3 py-2">阶段</th><th class="px-3 py-2">状态</th><th class="px-3 py-2">说明</th></tr></thead><tbody><tr v-for="log in operationLogs" :key="log.id" class="border-b last:border-0"><td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{{ formatDateTime(log.created_at) }}</td><td class="px-3 py-2">{{ log.action }}</td><td class="px-3 py-2">{{ log.stage }}</td><td class="px-3 py-2"><Badge :variant="log.status === 'failed' ? 'destructive' : log.status === 'success' ? 'default' : 'outline' as any">{{ log.status }}</Badge></td><td class="max-w-md px-3 py-2 break-words">{{ log.error || log.message || '-' }}</td></tr></tbody></table>
          </div>
          <p v-else class="text-sm text-muted-foreground">暂无操作日志。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>电源操作</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2"><Label>选择操作</Label><div class="flex flex-wrap gap-2"><Select :modelValue="''" @update:modelValue="(v:any)=> { if(v) power(v) }"><SelectTrigger class="w-64"><SelectValue placeholder="选择电源操作" /></SelectTrigger><SelectContent><SelectItem value="start" :disabled="inst.status==='running'">开机{{ inst.status==='running' ? '（已运行）' : '' }}</SelectItem><SelectItem value="stop" :disabled="inst.status!=='running'">关机{{ inst.status!=='running' ? '（未运行）' : '' }}</SelectItem><SelectItem value="restart" :disabled="inst.status!=='running'">重启</SelectItem><SelectItem value="hard_start" :disabled="inst.status==='running'">强制开机</SelectItem><SelectItem value="hard_stop" :disabled="inst.status!=='running'">强制关机</SelectItem><SelectItem value="hard_restart" :disabled="inst.status!=='running'">强制重启</SelectItem></SelectContent></Select><Button size="sm" variant="outline" :disabled="!!actionLoading" @click="refreshStatus">刷新状态</Button></div><p class="text-xs text-muted-foreground">不可用选项为灰色且无法选择。</p></div>
          <div class="flex flex-wrap items-end gap-2"><div class="grid gap-1"><Label>重装镜像</Label><Select :modelValue="reinstallImage" @update:modelValue="(v:any)=> reinstallImage=v"><SelectTrigger class="w-64"><SelectValue placeholder="选择镜像" /></SelectTrigger><SelectContent><SelectItem v-for="img in images" :key="String(img.id)" :value="String(img.id)">{{ img.name }}（{{ img.driver }}）</SelectItem></SelectContent></Select></div><Button variant="destructive" size="sm" :disabled="!!actionLoading || !reinstallImage" @click="power('reinstall')">重装</Button></div>
          <div class="border-t pt-2"><Button variant="destructive" size="sm" @click="del">删除实例</Button></div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
