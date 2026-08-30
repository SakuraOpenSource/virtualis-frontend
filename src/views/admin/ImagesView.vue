<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { VirtualisImage } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime, formatBytes } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const error = ref('')
const images = ref<VirtualisImage[]>([])
const show = ref(false)
const creating = ref(false)
const formName = ref('')
const formDriver = ref('qemu')
const formType = ref<'disk' | 'iso'>('disk')
const formArch = ref('')
const formOsType = ref('')
const formOsVersion = ref('')
const fileRef = ref<File | null>(null)

const driverOptions = [
  { value: 'qemu', label: 'qemu' },
  { value: 'incus', label: 'incus' },
]

const typeOptions: Array<{ value: 'disk' | 'iso'; label: string; desc: string }> = [
  { value: 'disk', label: '磁盘镜像', desc: 'qcow2 / raw / tar.gz 等' },
  { value: 'iso', label: 'ISO 镜像', desc: '用于安装或光驱挂载' },
]

const canSubmit = computed(() => !!fileRef.value && !!formDriver.value)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  fileRef.value = input.files?.[0] ?? null
  if (fileRef.value && !formName.value.trim()) {
    formName.value = fileRef.value.name.replace(/\.[^.]+$/, '')
  }
  if (fileRef.value && fileRef.value.name.toLowerCase().endsWith('.iso')) {
    formType.value = 'iso'
  }
}

async function load() {
  loading.value=true; error.value=''
  try { images.value = await virtualisApi.images() } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function upload() {
  if (!fileRef.value) { toast.error('请选择镜像文件'); return }
  if (!formDriver.value) { toast.error('请选择驱动'); return }
  if (formType.value === 'iso' && formDriver.value === 'incus') {
    toast.error('容器不支持 ISO 镜像，请选择磁盘镜像或切换驱动')
    return
  }
  creating.value=true
  try {
    await virtualisApi.uploadImage(fileRef.value, {
      name: formName.value.trim() || undefined as any,
      driver: formDriver.value,
      type: formType.value,
      arch: formArch.value.trim() || undefined as any,
      os_type: formOsType.value.trim() || undefined as any,
      os_version: formOsVersion.value.trim() || undefined as any,
    })
    toast.success('镜像上传成功（已存放在主控，创建实例时会自动分发到被控）')
    show.value=false
    formName.value=''; formArch.value=''; formOsType.value=''; formOsVersion.value=''; fileRef.value=null
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function del(id: number) {
  if (!confirm('确认删除该镜像？被实例引用时无法删除。')) return
  try { await virtualisApi.deleteImage(id); toast.success('已删除'); await load() } catch (e) { toast.error(errorMessage(e)) }
}

onMounted(load)
</script>
<template>
  <div>
    <PageHeader title="镜像" description="上传到主控的镜像文件会在创建实例时分发到目标被控节点" />
    <div class="flex justify-end mb-4"><Button @click="show=true">上传镜像</Button></div>
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
              <th class="h-10 px-4 text-left font-medium">类型</th>
              <th class="h-10 px-4 text-left font-medium">驱动</th>
              <th class="h-10 px-4 text-left font-medium">文件</th>
              <th class="h-10 px-4 text-left font-medium">大小</th>
              <th class="h-10 px-4 text-left font-medium">状态</th>
              <th class="h-10 px-4 text-left font-medium">创建时间</th>
              <th class="h-10 px-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="img in images" :key="img.id" class="border-b hover:bg-muted/20">
              <td class="px-4 py-2">{{ img.id }}</td>
              <td class="px-4 py-2 font-medium">{{ img.name }}<div v-if="img.display_name" class="text-xs text-muted-foreground">{{ img.display_name }}</div></td>
              <td class="px-4 py-2"><Badge :variant="img.type==='iso'?'secondary':'outline'">{{ img.type === 'iso' ? 'ISO' : '磁盘' }}</Badge></td>
              <td class="px-4 py-2"><Badge variant="outline">{{ img.driver }}</Badge></td>
              <td class="px-4 py-2 max-w-[220px] truncate" :title="img.original_name || img.file_path">{{ img.original_name || img.file_path }}</td>
              <td class="px-4 py-2">{{ img.size_bytes ? formatBytes(img.size_bytes) : '-' }}</td>
              <td class="px-4 py-2"><Badge>{{ img.status }}</Badge></td>
              <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(img.created_at) }}</td>
              <td class="px-4 py-2 text-right"><div class="flex justify-end gap-2"><a :href="virtualisApi.imageDownloadUrl(img.id)" class="text-xs underline">下载</a><Button variant="destructive" size="sm" @click="del(img.id)">删除</Button></div></td>
            </tr>
            <tr v-if="images.length===0"><td colspan="9" class="text-center py-8 text-muted-foreground">暂无镜像，请点击“上传镜像”添加（支持任意驱动与 ISO）</td></tr>
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>

    <Dialog :open="show" @update:open="(v:boolean)=> show=v">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>上传镜像</DialogTitle>
          <DialogDescription>选择镜像文件、目标驱动和类型，文件会保存在主控并在需要时同步到被控</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>镜像文件 *</Label><Input type="file" @change="onFile" accept=".iso,.qcow2,.img,.raw,.tar.gz,.gz,.zip,.vmdk,.vdi" /></div>
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="ubuntu-22.04（可选，默认取文件名）" /></div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label>驱动 *</Label>
              <Select v-model="formDriver">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in driverOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>类型 *</Label>
              <Select v-model="formType as any">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}（{{ opt.desc }}）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="grid gap-2"><Label>架构</Label><Input v-model="formArch" placeholder="x86_64 / arm64" /></div>
            <div class="grid gap-2"><Label>系统</Label><Input v-model="formOsType" placeholder="ubuntu" /></div>
            <div class="grid gap-2"><Label>版本</Label><Input v-model="formOsVersion" placeholder="22.04" /></div>
          </div>
          <p class="text-xs text-muted-foreground">ISO 仅可配合 qemu / incus 使用；选择磁盘镜像时可用于任意驱动。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="show=false">取消</Button>
          <Button :disabled="creating || !canSubmit" @click="upload">{{ creating ? '上传中...' : '上传' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
