<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiKeyApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { APIKey, APIScope } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const error = ref('')
const keys = ref<APIKey[]>([])
const scopes = ref<APIScope[]>([])
const show = ref(false)
const creating = ref(false)
const formName = ref('')
const formScopes = ref<Record<string, boolean>>({})
const formDays = ref(0)
const createdSecret = ref('')

async function load() {
  loading.value=true; error.value=''
  try {
    const data = await apiKeyApi.list()
    keys.value = (data.items ?? []) as APIKey[]
    scopes.value = (data.scopes ?? []) as APIScope[]
    // init scope checkboxes
    for (const s of scopes.value) if (!(s in formScopes.value)) formScopes.value[s]=false
  } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function create() {
  const selected = Object.entries(formScopes.value).filter(([,v])=>v).map(([k])=>k) as APIScope[]
  if (!formName.value.trim()) { toast.error('请输入名称'); return }
  if (selected.length===0) { toast.error('请选择至少一个权限'); return }
  creating.value=true
  try {
    const res = await apiKeyApi.create({ name: formName.value.trim(), scopes: selected, expires_in_days: formDays.value })
    createdSecret.value = res.secret
    toast.success('密钥创建成功，请妥善保存明文')
    show.value=false
    formName.value=''; formScopes.value={}; formDays.value=0
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function revoke(id: number) {
  if (!confirm('确认吊销该密钥？')) return
  try { await apiKeyApi.revoke(id); toast.success('已吊销'); await load() } catch (e) { toast.error(errorMessage(e)) }
}

onMounted(load)
</script>
<template>
  <div>
    <PageHeader title="API 密钥" description="用于开放接口访问，权限: instance:read/write, image:read/write" />
    <div class="flex justify-end mb-4"><Button @click="show=true">创建密钥</Button></div>
    <ErrorAlert :message="error" />
    <div v-if="createdSecret" class="mb-4 rounded-md border bg-amber-50 p-3 text-sm">
      <div class="font-medium">新密钥明文（仅显示一次）:</div>
      <code class="break-all bg-white px-2 py-1 rounded border mt-1 block">{{ createdSecret }}</code>
      <Button variant="outline" size="sm" class="mt-2" @click="createdSecret=''">我已保存</Button>
    </div>
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30">
            <tr>
              <th class="h-10 px-4 text-left font-medium">ID</th>
              <th class="h-10 px-4 text-left font-medium">名称</th>
              <th class="h-10 px-4 text-left font-medium">前缀</th>
              <th class="h-10 px-4 text-left font-medium">权限</th>
              <th class="h-10 px-4 text-left font-medium">状态</th>
              <th class="h-10 px-4 text-left font-medium">过期</th>
              <th class="h-10 px-4 text-left font-medium">最后使用</th>
              <th class="h-10 px-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="k in keys" :key="k.id" class="border-b hover:bg-muted/20">
              <td class="px-4 py-2">{{ k.id }}</td>
              <td class="px-4 py-2">{{ k.name }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ k.prefix }}</td>
              <td class="px-4 py-2"><div class="flex flex-wrap gap-1"><Badge v-for="s in (k.scopes ?? [])" :key="s" variant="outline" class="text-xs">{{ s }}</Badge></div></td>
              <td class="px-4 py-2"><Badge :variant="k.status==='active' ? 'default' as any : 'destructive' as any">{{ k.status }}</Badge></td>
              <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(k.expires_at) }}</td>
              <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(k.last_used_at) }}</td>
              <td class="px-4 py-2 text-right"><Button v-if="k.status==='active'" variant="destructive" size="sm" @click="revoke(k.id)">吊销</Button></td>
            </tr>
            <tr v-if="keys.length===0"><td colspan="8" class="text-center py-8 text-muted-foreground">暂无密钥</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>

    <Dialog :open="show" @update:open="(v:boolean)=> show=v">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建 API 密钥</DialogTitle>
          <DialogDescription>明文仅在创建时显示一次</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="my-key" /></div>
          <div class="grid gap-2">
            <Label>权限</Label>
            <div class="flex flex-wrap gap-3">
              <label v-for="s in scopes" :key="s" class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" :checked="!!formScopes[s]" @change="(e: Event)=> formScopes[s]=(e.target as HTMLInputElement).checked" />
                {{ s }}
              </label>
            </div>
          </div>
          <div class="grid gap-2"><Label>有效期 (天，0=永不过期)</Label><Input :modelValue="String(formDays)" @update:modelValue="(v:string)=> formDays=parseInt(v)||0" type="number" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="show=false">取消</Button>
          <Button :disabled="creating" @click="create">{{ creating ? '创建中...' : '创建' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
