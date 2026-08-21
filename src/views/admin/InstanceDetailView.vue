<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { VirtualisInstance, VirtualisImage } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'

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

async function load() {
  loading.value=true
  error.value=''
  try { inst.value = await virtualisApi.instance(id) } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function loadImages() {
  try { images.value = await virtualisApi.images() } catch {}
}

async function power(action: string) {
  actionLoading.value=action
  try {
    const imgId = action==='reinstall' && reinstallImage.value ? parseInt(reinstallImage.value) : undefined
    const updated = await virtualisApi.power(id, action, imgId as any)
    inst.value = updated
    toast.success(`执行 ${action} 成功`)
  } catch (e) { toast.error(errorMessage(e)) } finally { actionLoading.value='' }
}

async function refreshStatus() {
  actionLoading.value='status'
  try { inst.value = await virtualisApi.status(id); toast.success('状态已刷新') } catch (e) { toast.error(errorMessage(e)) } finally { actionLoading.value='' }
}

async function del() {
  if (!confirm('确认删除？')) return
  try { await virtualisApi.deleteInstance(id); toast.success('已删除'); router.push({ name: 'instances' }) } catch (e) { toast.error(errorMessage(e)) }
}

onMounted(async () => { await load(); await loadImages() })
</script>
<template>
  <div>
    <PageHeader :title="inst ? `实例 #${inst.id} - ${inst.name}` : '实例详情'" description="电源操作与信息">
      <template #actions>
        <Button variant="outline" @click="router.push({ name: 'instances' })">返回列表</Button>
      </template>
    </PageHeader>
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <div v-else-if="inst" class="space-y-6">
      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent class="grid grid-cols-2 gap-4 text-sm">
          <div><span class="text-muted-foreground">ID:</span> {{ inst.id }}</div>
          <div><span class="text-muted-foreground">名称:</span> {{ inst.name }}</div>
          <div><span class="text-muted-foreground">驱动:</span> <Badge variant="outline">{{ inst.driver }}</Badge></div>
          <div><span class="text-muted-foreground">状态:</span> <Badge>{{ inst.status }}</Badge></div>
          <div><span class="text-muted-foreground">规格:</span> {{ inst.spec.cpu }}C / {{ inst.spec.memory_mb }}MB / {{ inst.spec.disk_gb }}GB</div>
          <div><span class="text-muted-foreground">镜像:</span> {{ inst.image?.name ?? inst.image_id ?? '-' }}</div>
          <div><span class="text-muted-foreground">创建:</span> {{ formatDateTime(inst.created_at) }}</div>
          <div><span class="text-muted-foreground">更新:</span> {{ formatDateTime(inst.updated_at) }}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>电源操作</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap gap-2">
            <Button size="sm" :disabled="!!actionLoading" @click="power('start')">{{ actionLoading==='start' ? '...' : '开机' }}</Button>
            <Button size="sm" variant="outline" :disabled="!!actionLoading" @click="power('stop')">{{ actionLoading==='stop' ? '...' : '关机' }}</Button>
            <Button size="sm" variant="outline" :disabled="!!actionLoading" @click="power('restart')">{{ actionLoading==='restart' ? '...' : '重启' }}</Button>
            <Button size="sm" variant="secondary" :disabled="!!actionLoading" @click="power('hard_start')">{{ actionLoading==='hard_start' ? '...' : '强制开机' }}</Button>
            <Button size="sm" variant="secondary" :disabled="!!actionLoading" @click="power('hard_stop')">{{ actionLoading==='hard_stop' ? '...' : '强制关机' }}</Button>
            <Button size="sm" variant="secondary" :disabled="!!actionLoading" @click="power('hard_restart')">{{ actionLoading==='hard_restart' ? '...' : '强制重启' }}</Button>
            <Button size="sm" variant="outline" :disabled="!!actionLoading" @click="refreshStatus">刷新状态</Button>
          </div>
          <div class="flex gap-2 items-end">
            <div class="grid gap-1">
              <Label>重装镜像</Label>
              <Select :modelValue="reinstallImage" @update:modelValue="(v:any)=> reinstallImage=v">
                <SelectTrigger class="w-64"><SelectValue placeholder="选择镜像" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="img in images" :key="String(img.id)" :value="String(img.id)">{{ img.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="destructive" size="sm" :disabled="!!actionLoading" @click="power('reinstall')">重装</Button>
          </div>
          <div class="pt-2 border-t">
            <Button variant="destructive" size="sm" @click="del">删除实例</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
