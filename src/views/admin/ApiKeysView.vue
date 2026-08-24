<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiKeyApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { APIKey } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const key = ref<APIKey | null>(null)
const createdSecret = ref('')
const active = computed(() => key.value?.status === 'active')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiKeyApi.list()
    key.value = data.items?.[0] ?? null
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  creating.value = true
  try {
    const result = await apiKeyApi.create()
    key.value = result.key
    createdSecret.value = result.secret
    toast.success('全站 API 密钥已生成，请立即保存明文')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

async function revoke() {
  if (!key.value || !confirm('确认吊销全站 API 密钥？吊销后所有 API 调用都会失效。')) return
  try {
    await apiKeyApi.revoke(key.value.id)
    toast.success('全站 API 密钥已吊销')
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(createdSecret.value)
    toast.success('已复制密钥')
  } catch {
    toast.error('复制失败，请手动保存')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="API 密钥" description="整个站点只有一个 API 密钥，自动拥有实例与镜像的全部权限。">
      <template #actions>
        <Button :disabled="active || creating" @click="create">{{ creating ? '生成中...' : active ? '已生成' : key ? '重新生成' : '生成站点密钥' }}</Button>
      </template>
    </PageHeader>

    <ErrorAlert :message="error" />
    <div v-if="createdSecret" class="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/20">
      <div class="font-medium">新密钥明文只显示这一次，请妥善保存：</div>
      <code class="mt-2 block break-all rounded border bg-background px-3 py-2">{{ createdSecret }}</code>
      <div class="mt-3 flex gap-2">
        <Button size="sm" @click="copySecret">复制密钥</Button>
        <Button variant="outline" size="sm" @click="createdSecret=''">我已保存</Button>
      </div>
    </div>

    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-auto">
          <table class="w-full text-sm">
            <thead class="border-b bg-muted/30">
              <tr>
                <th class="h-10 px-4 text-left font-medium">名称</th>
                <th class="h-10 px-4 text-left font-medium">前缀</th>
                <th class="h-10 px-4 text-left font-medium">权限</th>
                <th class="h-10 px-4 text-left font-medium">状态</th>
                <th class="h-10 px-4 text-left font-medium">最后使用</th>
                <th class="h-10 px-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="key" class="border-b">
                <td class="px-4 py-3 font-medium">{{ key.name }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ key.prefix }}</td>
                <td class="px-4 py-3">实例、镜像全部权限</td>
                <td class="px-4 py-3"><Badge :variant="key.status === 'active' ? 'default' : 'destructive' as any">{{ key.status === 'active' ? '有效' : '已吊销' }}</Badge></td>
                <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(key.last_used_at) }}</td>
                <td class="px-4 py-3 text-right"><Button v-if="key.status === 'active'" variant="destructive" size="sm" @click="revoke">吊销</Button></td>
              </tr>
              <tr v-else><td colspan="6" class="py-10 text-center text-muted-foreground">尚未生成站点 API 密钥</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
