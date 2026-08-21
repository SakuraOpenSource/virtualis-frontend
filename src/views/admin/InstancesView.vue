<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { VirtualisInstance, VirtualisImage, VirtualisDriver } from '@/lib/types'
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

// create form
const formName = ref('')
const formDriver = ref('mock')
const formCpu = ref(2)
const formMem = ref(1024)
const formDisk = ref(20)
const formImageId = ref<string>('')

const drivers = ref<VirtualisDriver[]>([])
const images = ref<VirtualisImage[]>([])

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
}

async function create() {
  if (!formName.value.trim()) { toast.error('请输入名称'); return }
  creating.value = true
  try {
    await virtualisApi.createInstance({
      name: formName.value.trim(),
      driver: formDriver.value,
      spec: { cpu: formCpu.value, memory_mb: formMem.value, disk_gb: formDisk.value },
      image_id: formImageId.value ? parseInt(formImageId.value) : null,
    })
    toast.success('实例创建成功')
    showCreate.value = false
    formName.value=''; formImageId.value=''
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function removeItem(id: number) {
  if (!confirm('确认删除该实例？')) return
  try { await virtualisApi.deleteInstance(id); toast.success('已删除'); await load() } catch (e) { toast.error(errorMessage(e)) }
}

function statusVariant(s: string) {
  if (s==='running') return 'default'
  if (s==='stopped') return 'secondary'
  if (s==='error') return 'destructive'
  return 'outline'
}

onMounted(async () => { await load(); await loadMeta() })
</script>
<template>
  <div>
    <PageHeader title="实例" description="管理虚拟机 / 容器实例">
      <template #actions>
        <Button @click="showCreate=true">创建实例</Button>
      </template>
    </PageHeader>
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
              <tr v-if="instances.length===0"><td colspan="8" class="text-center py-8 text-muted-foreground">暂无实例</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <Pager :page="page" :pageSize="pageSize" :total="total" @update:page="(v:number)=>{ page=v; load() }" />

    <Dialog :open="showCreate" @update:open="(v:boolean)=> showCreate=v">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建实例</DialogTitle>
          <DialogDescription>选择镜像与规格，驱动可在设置中配置默认值</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="my-vm-01" /></div>
          <div class="grid gap-2">
            <Label>驱动</Label>
            <Select :modelValue="formDriver" @update:modelValue="(v:any)=> formDriver=v">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">mock</SelectItem>
                <SelectItem value="qemu">qemu</SelectItem>
                <SelectItem value="lxc">lxc</SelectItem>
                <SelectItem value="incus">incus</SelectItem>
                <SelectItem value="kvm">kvm</SelectItem>
              </SelectContent>
            </Select>
            <div v-if="drivers.length" class="text-xs text-muted-foreground">
              可用驱动: <span v-for="d in drivers" :key="d.name" :class="['mr-2', d.available ? 'text-green-600' : 'text-muted-foreground']">{{ d.name }}{{ d.available ? '' : '(不可用)' }}</span>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="grid gap-2"><Label>CPU (核)</Label><Input :modelValue="String(formCpu)" @update:modelValue="(v:any)=> formCpu=parseInt(v)||1" type="number" /></div>
            <div class="grid gap-2"><Label>内存 MB</Label><Input :modelValue="String(formMem)" @update:modelValue="(v:any)=> formMem=parseInt(v)||128" type="number" /></div>
            <div class="grid gap-2"><Label>磁盘 GB</Label><Input :modelValue="String(formDisk)" @update:modelValue="(v:any)=> formDisk=parseInt(v)||5" type="number" /></div>
          </div>
          <div class="grid gap-2">
            <Label>镜像</Label>
            <Select :modelValue="formImageId" @update:modelValue="(v:any)=> formImageId=v">
              <SelectTrigger><SelectValue placeholder="选择镜像 (可选)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">无</SelectItem>
                <SelectItem v-for="img in images" :key="String(img.id)" :value="String(img.id)">{{ img.name }} ({{ img.driver }})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreate=false">取消</Button>
          <Button :disabled="creating" @click="create">{{ creating ? '创建中...' : '创建' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
