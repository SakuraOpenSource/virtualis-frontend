<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { virtualisApi } from '@/lib/endpoints'
import type { VirtualisInstance } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { useToast } from '@/composables/useToast'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import Pager from '@/components/app/Pager.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const toast = useToast()
const items = ref<VirtualisInstance[]>([])
const page = ref(1), pageSize = 20, total = ref(0)
const loading = ref(false), busy = ref(false), error = ref('')
const pending = ref<{ action: 'restore' | 'purge'; instance: VirtualisInstance } | null>(null)
let request = 0
async function load() {
  const current = ++request
  loading.value = true; error.value = ''
  try {
    const result = await virtualisApi.trash({ page: page.value, page_size: pageSize })
    if (current !== request) return
    items.value = result.items ?? []; total.value = result.total
    if (page.value > 1 && !items.value.length) { page.value--; await load() }
  } catch (e) { if (current === request) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}
async function confirm() {
  const target = pending.value
  if (!target || busy.value) return
  busy.value = true; error.value = ''
  try {
    if (target.action === 'restore') await virtualisApi.restoreTrash(target.instance.id)
    else await virtualisApi.purgeTrash(target.instance.id)
    toast.success(target.action === 'restore' ? '实例已恢复为关机状态' : '实例已永久删除')
    pending.value = null
    await load()
  } catch (e) { error.value = errorMessage(e); toast.error(error.value) }
  finally { busy.value = false }
}
onMounted(load)
onBeforeUnmount(() => { request++ })
</script>
<template>
  <div class="space-y-5">
    <PageHeader title="回收站" description="关机保留实例及 IP、NAT、防火墙与恢复点；恢复不会自动开机">
      <template #actions><Button variant="outline" :disabled="busy || loading" @click="load">刷新</Button></template>
    </PageHeader>
    <p class="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">实例在服务端设定的保留期限内可恢复。请以每条记录的计划清理时间为准；永久删除将释放 IP 并删除运行时、快照和备份，无法撤销。</p>
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <Card v-else><CardContent class="overflow-x-auto p-0">
      <table class="w-full text-sm"><thead class="border-b bg-muted/30"><tr><th class="p-4 text-left">实例</th><th class="p-4 text-left">节点</th><th class="p-4 text-left">移入时间</th><th class="p-4 text-left">计划清理时间</th><th class="p-4 text-right">操作</th></tr></thead>
        <tbody><tr v-for="item in items" :key="item.id" class="border-b last:border-0"><td class="p-4"><p class="font-medium">#{{ item.id }} · {{ item.name }}</p><p class="text-xs text-muted-foreground">{{ item.driver }} · {{ item.spec.disk_gb }} GB</p></td><td class="p-4">{{ item.agent?.display_name || item.agent?.name || `#${item.agent_id}` }}</td><td class="p-4 whitespace-nowrap">{{ formatDateTime(item.trashed_at || '') }}</td><td class="p-4 whitespace-nowrap">{{ item.purge_after ? formatDateTime(item.purge_after) : '未安排自动清理' }}</td><td class="p-4"><div class="flex justify-end gap-2"><Button variant="outline" size="sm" :disabled="busy" @click="pending = { action: 'restore', instance: item }">恢复</Button><Button variant="destructive" size="sm" :disabled="busy" @click="pending = { action: 'purge', instance: item }">永久删除</Button></div></td></tr>
          <tr v-if="!items.length"><td colspan="5" class="p-12 text-center text-muted-foreground">回收站为空。被移入回收站的实例将在此保留。</td></tr>
        </tbody></table>
    </CardContent></Card>
    <Pager :page="page" :page-size="pageSize" :total="total" :disabled="busy || loading" @update:page="v => { if (!busy) { page = v; load() } }" />
    <ConfirmDialog :open="!!pending" :busy="busy" :danger="pending?.action === 'purge'" :title="`${pending?.action === 'restore' ? '恢复' : '永久删除'}实例 #${pending?.instance.id || ''}`" :description="pending?.action === 'restore' ? '恢复后实例保持关机状态，仍使用原节点和网络资源。确认恢复？' : '此操作会永久删除实例及所有恢复点，并释放 IP 和端口。数据无法找回，确认继续？'" @update:open="v => { if (!v && !busy) pending = null }" @confirm="confirm" />
  </div>
</template>
