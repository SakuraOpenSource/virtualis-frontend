<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
const formPath = ref('')
const formSize = ref(0)
const formChecksum = ref('')

async function load() {
  loading.value=true; error.value=''
  try { images.value = await virtualisApi.images() } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function create() {
  if (!formName.value.trim() || !formPath.value.trim()) { toast.error('名称和路径必填'); return }
  creating.value=true
  try {
    await virtualisApi.createImage({ name: formName.value.trim(), driver: formDriver.value, file_path: formPath.value.trim(), size: formSize.value, checksum: formChecksum.value.trim() })
    toast.success('镜像创建成功')
    show.value=false
    formName.value=''; formPath.value=''; formChecksum.value=''; formSize.value=0
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
    <PageHeader title="镜像" description="管理虚拟机镜像" />
    <div class="flex justify-end mb-4"><Button @click="show=true">创建镜像</Button></div>
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30">
            <tr>
              <th class="h-10 px-4 text-left font-medium">ID</th>
              <th class="h-10 px-4 text-left font-medium">名称</th>
              <th class="h-10 px-4 text-left font-medium">驱动</th>
              <th class="h-10 px-4 text-left font-medium">路径</th>
              <th class="h-10 px-4 text-left font-medium">大小</th>
              <th class="h-10 px-4 text-left font-medium">状态</th>
              <th class="h-10 px-4 text-left font-medium">创建时间</th>
              <th class="h-10 px-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="img in images" :key="img.id" class="border-b hover:bg-muted/20">
              <td class="px-4 py-2">{{ img.id }}</td>
              <td class="px-4 py-2 font-medium">{{ img.name }}</td>
              <td class="px-4 py-2"><Badge variant="outline">{{ img.driver }}</Badge></td>
              <td class="px-4 py-2 max-w-[260px] truncate" :title="img.file_path">{{ img.file_path }}</td>
              <td class="px-4 py-2">{{ img.size ? formatBytes(img.size) : '-' }}</td>
              <td class="px-4 py-2"><Badge>{{ img.status }}</Badge></td>
              <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(img.created_at) }}</td>
              <td class="px-4 py-2 text-right"><Button variant="destructive" size="sm" @click="del(img.id)">删除</Button></td>
            </tr>
            <tr v-if="images.length===0"><td colspan="8" class="text-center py-8 text-muted-foreground">暂无镜像</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>

    <Dialog :open="show" @update:open="(v:boolean)=> show=v">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建镜像</DialogTitle>
          <DialogDescription>填写镜像信息，路径为服务端可访问的文件位置</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="ubuntu-22.04" /></div>
          <div class="grid gap-2">
            <Label>驱动</Label>
            <Select :modelValue="formDriver" @update:modelValue="(v:any)=> formDriver=v">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qemu">qemu</SelectItem>
                <SelectItem value="lxc">lxc</SelectItem>
                <SelectItem value="kvm">kvm</SelectItem>
                <SelectItem value="mock">mock</SelectItem>
                <SelectItem value="incus">incus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-2"><Label>文件路径</Label><Input v-model="formPath" placeholder="images/ubuntu-22.04.qcow2" /></div>
          <div class="grid gap-2"><Label>大小 (bytes, 可选)</Label><Input :modelValue="String(formSize)" @update:modelValue="(v:any)=> formSize=parseInt(v)||0" type="number" /></div>
          <div class="grid gap-2"><Label>校验和 (可选)</Label><Input v-model="formChecksum" placeholder="sha256..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="show=false">取消</Button>
          <Button :disabled="creating" @click="create">{{ creating ? '创建中...' : '创建' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
