<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { agentApi, virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { VirtualisAgent, VirtualisImage } from '@/lib/types'
import type { VirtualisDriver, VirtualisInstance } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import Pager from '@/components/app/Pager.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const error = ref('')
const instances = ref<VirtualisInstance[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showCreate = ref(false)
const creating = ref(false)

const formName = ref('')
const formAgentId = ref<string>('')
const formDriver = ref('auto')
const formType = ref<'container' | 'vm'>('container')
const formCpu = ref(2)
const formMem = ref(1024)
const formDisk = ref(20)
const formArch = ref('x86_64')
const formImageId = ref<string>('')

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
    { value: 'lxc', label: 'lxc' },
    { value: 'mock', label: 'mock' },
  ]
  if (!selectedAgent.value) return base.map(b => ({ ...b, disabled: true, hint: '请先选择被控节点' }))
  if (!availableDriversForAgent.value.length) return base.map(b => ({ ...b, disabled: b.value !== 'mock', hint: b.value === 'mock' ? undefined : '该节点未上报该驱动' }))
  return base.map(item => {
    if (item.value === 'auto') return { ...item, disabled: false }
    const ok = availableDriversForAgent.value.includes(item.value)
    return { ...item, disabled: !ok, hint: ok ? undefined : '未安装' }
  })
})

const filteredImages = computed(() => {
  if (!formDriver.value || formDriver.value === 'auto') return images.value
  return images.value.filter(img => img.driver === formDriver.value || img.driver === 'auto')
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await virtualisApi.instances({ page: page.value, page_size: pageSize.value })
    instances.value = (data.items ?? []) as VirtualisInstance[]
    total.value = data.total
  } catch (e) { error.value = errorMessage(e) } finally { loading.value=false }
}

async function loadMeta() {
  try { drivers.value = await virtualisApi.drivers() } catch {}
  try { images.value = await virtualisApi.images() } catch {}
  try { agents.value = await agentApi.list() } catch {}
}

watch(formAgentId, () => {
  if (!formAgentId.value) { formDriver.value = 'auto'; return }
  if (availableDriversForAgent.value.length && !availableDriversForAgent.value.includes(formDriver.value) && formDriver.value !== 'auto') {
    formDriver.value = 'auto'
  }
})

watch(filteredImages, () => {
  if (formImageId.value && !filteredImages.value.some(img => String(img.id) === formImageId.value)) {
    formImageId.value = ''
  }
})

async function create() {
  if (!formName.value.trim()) { toast.error('请输入名称'); return }
  if (!formAgentId.value) { toast.error('请选择被控节点（主控不负责创建实例）'); return }
  creating.value = true
  try {
    await virtualisApi.createInstance({
      name: formName.value.trim(),
      agent_id: parseInt(formAgentId.value),
      driver: formDriver.value,
      type: formType.value,
      spec: { cpu: formCpu.value, memory_mb: formMem.value, disk_gb: formDisk.value, arch: formArch.value },
      image_id: formImageId.value ? parseInt(formImageId.value) : null,
    })
    toast.success('实例已在被控节点上创建')
    showCreate.value = false
    formName.value=''; formImageId.value=''
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function removeItem(id: number) {
  if (!confirm('确认删除该实例？会同时在被控节点上销毁对应资源。')) return
  try { await virtualisApi.deleteInstance(id); toast.success('已删除'); await load() } catch (e) { toast.error(errorMessage(e)) }
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
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-auto">
          <table class="w-full text-sm">
            <thead class="border-b bg-muted/30">
              <tr>
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
                <td class="px-4 py-2">{{ it.id }}</td>
                <td class="px-4 py-2"><RouterLink :to="`/admin/instances/${it.id}`" class="text-primary hover:underline">{{ it.name }}</RouterLink></td>
                <td class="px-4 py-2"><Badge variant="outline">{{ formatAgent((it as any).agent) }}</Badge></td>
                <td class="px-4 py-2"><Badge variant="outline">{{ it.driver }}</Badge></td>
                <td class="px-4 py-2">{{ it.spec.cpu }}C / {{ it.spec.memory_mb }}MB / {{ it.spec.disk_gb }}GB</td>
                <td class="px-4 py-2">{{ it.image?.name ?? (it.image_id ?? '-') }}</td>
                <td class="px-4 py-2"><Badge :variant="statusVariant(it.status) as any">{{ it.status }}</Badge></td>
                <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(it.created_at) }}</td>
                <td class="px-4 py-2 text-right">
                  <div class="flex justify-end gap-2">
                    <Button variant="outline" size="sm" @click="$router.push(`/admin/instances/${it.id}`)">详情</Button>
                    <Button variant="destructive" size="sm" @click="removeItem(it.id)">删除</Button>
                  </div>
                </td>
              </tr>
              <tr v-if="instances.length===0"><td colspan="9" class="text-center py-8 text-muted-foreground">暂无实例</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <Pager :page="page" :pageSize="pageSize" :total="total" @update:page="(v:number)=>{ page=v; load() }" />

    <Dialog :open="showCreate" @update:open="(v:boolean)=> showCreate=v">
      <DialogContent class="max-w-2xl">
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
            <p v-else-if="!availableDriversForAgent.length" class="text-xs text-muted-foreground">该节点尚未上报可用驱动，仅可使用 mock。</p>
          </div>
          <div class="grid grid-cols-4 gap-3">
            <div class="grid gap-2"><Label>CPU</Label><Input :modelValue="String(formCpu)" @update:modelValue="(v:any)=> formCpu=parseInt(v)||1" type="number" /></div>
            <div class="grid gap-2"><Label>内存 MB</Label><Input :modelValue="String(formMem)" @update:modelValue="(v:any)=> formMem=parseInt(v)||128" type="number" /></div>
            <div class="grid gap-2"><Label>磁盘 GB</Label><Input :modelValue="String(formDisk)" @update:modelValue="(v:any)=> formDisk=parseInt(v)||5" type="number" /></div>
            <div class="grid gap-2"><Label>架构</Label><Select v-model="formArch"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="x86_64">x86_64</SelectItem><SelectItem value="arm64">arm64</SelectItem><SelectItem value="aarch64">aarch64</SelectItem></SelectContent></Select></div>
          </div>
          <div class="grid gap-2">
            <Label>镜像</Label>
            <Select v-model="formImageId">
              <SelectTrigger><SelectValue placeholder="选择镜像（可选，已按驱动过滤）" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">无</SelectItem>
                <SelectItem v-for="img in filteredImages" :key="String(img.id)" :value="String(img.id)">{{ img.name }}（{{ img.driver }} / {{ img.type }}）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreate=false">取消</Button>
          <Button :disabled="creating || !formAgentId" @click="create">{{ creating ? '创建中...' : '创建' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
