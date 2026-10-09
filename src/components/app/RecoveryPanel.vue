<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { recoveryApi } from '@/lib/endpoints'
import type { Backup, Snapshot, VirtualisInstance } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { formatBytes, formatDateTime } from '@/lib/utils'
import { useToast } from '@/composables/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import ConfirmDialog from './ConfirmDialog.vue'
import ErrorAlert from './ErrorAlert.vue'
import LoadingBlock from './LoadingBlock.vue'

const props = defineProps<{ instance: VirtualisInstance; disabled?: boolean }>()
const emit = defineEmits<{ 'busy-change': [label: string]; settled: []; updated: [instance: VirtualisInstance] }>()
const toast = useToast()
const snapshots = ref<Snapshot[]>([])
const backups = ref<Backup[]>([])
const snapshotName = ref(''), snapshotRemark = ref('')
const backupName = ref(''), backupRemark = ref('')
const loading = ref(false), busy = ref(''), error = ref('')
const pending = ref<{ kind: 'snapshot' | 'backup'; action: 'restore' | 'delete' | 'download'; row: Snapshot | Backup } | null>(null)
const stopped = computed(() => props.instance.status === 'stopped')
const locked = computed(() => !!busy.value || !!props.disabled || !!props.instance.busy_operation)

/**
 * The Master persists recovery points as `available` (see service/recovery.go
 * and service/backup.go); older frontend fixtures used `ready`. Accept both so
 * a usable archive is never rendered disabled behind a frontend-only value.
 */
function usable(status: string) {
  return status === 'available' || status === 'ready'
}
function incompatible(kind: 'snapshot' | 'backup', row: Snapshot | Backup) {
  return kind === 'snapshot' ? !!row.agent_id && row.agent_id !== props.instance.agent_id : 'driver' in row && row.driver !== props.instance.driver
}
let request = 0

async function load() {
  const current = ++request, id = props.instance.id
  loading.value = true
  try {
    const results = await Promise.all([recoveryApi.snapshots(id), recoveryApi.backups(id)])
    if (current !== request) return
    snapshots.value = results[0]; backups.value = results[1]
  } catch (e) { if (current === request) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}

async function run(label: string, operation: () => Promise<unknown>) {
  if (locked.value) return
  error.value = ''; busy.value = label; emit('busy-change', label)
  try {
    const result = await operation()
    if (result && typeof result === 'object' && 'spec' in result) emit('updated', result as VirtualisInstance)
    toast.success(`${label}完成`)
    pending.value = null
  } catch (e) { error.value = errorMessage(e); toast.error(error.value) }
  finally {
    await load()
    busy.value = ''; emit('busy-change', ''); emit('settled')
  }
}

async function create(kind: 'snapshot' | 'backup') {
  const name = (kind === 'snapshot' ? snapshotName.value : backupName.value).trim()
  const remark = (kind === 'snapshot' ? snapshotRemark.value : backupRemark.value).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) { error.value = '名称需为 1–64 位字母、数字、下划线或连字符，首位为字母或数字。'; return }
  if (!stopped.value && (kind === 'backup' || props.instance.driver === 'qemu')) { error.value = '请先关机再执行此操作。'; return }
  await run(kind === 'snapshot' ? '创建快照' : '创建备份', async () => {
    const payload = { name, ...(remark ? { remark } : {}) }
    if (kind === 'snapshot') { await recoveryApi.createSnapshot(props.instance.id, payload); snapshotName.value = ''; snapshotRemark.value = '' }
    else { await recoveryApi.createBackup(props.instance.id, payload); backupName.value = ''; backupRemark.value = '' }
  })
}

const confirmTitle = computed(() => pending.value ? `${pending.value.action === 'restore' ? '恢复' : pending.value.action === 'delete' ? '删除' : '下载'}${pending.value.kind === 'snapshot' ? '快照' : '备份'}「${pending.value.row.name}」` : '')
const confirmDescription = computed(() => pending.value?.action === 'restore'
  ? '实例必须已关机。恢复将覆盖当前系统数据，不会重设密码；请先创建备份。此操作可能持续较长时间，可在日志页查看服务端记录。'
  : pending.value?.action === 'delete' ? '删除后不可撤销；当前实例的数据不会因此恢复或回滚。'
  : '备份包含完整系统数据，可能包含敏感信息。请将下载的归档保存在安全位置。下载由浏览器处理，不显示虚构进度。')

async function confirm() {
  const item = pending.value
  if (!item || locked.value) return
  if (item.action === 'download') {
    const anchor = document.createElement('a')
    anchor.href = recoveryApi.backupDownloadUrl(props.instance.id, item.row.id)
    anchor.download = ''; anchor.rel = 'noopener'; anchor.click()
    pending.value = null
    return
  }
  if (item.action === 'restore' && !stopped.value) { error.value = '请先关机再恢复。'; return }
  if (item.action === 'restore' && (!usable(item.row.status) || incompatible(item.kind, item.row))) { error.value = '恢复点未就绪或来源节点 / 驱动不兼容。'; return }
  await run(confirmTitle.value, () => item.kind === 'snapshot'
    ? item.action === 'restore' ? recoveryApi.restoreSnapshot(props.instance.id, item.row.id) : recoveryApi.deleteSnapshot(props.instance.id, item.row.id)
    : item.action === 'restore' ? recoveryApi.restoreBackup(props.instance.id, item.row.id) : recoveryApi.deleteBackup(props.instance.id, item.row.id))
}

watch(() => props.instance.id, () => { snapshots.value = []; backups.value = []; error.value = ''; pending.value = null; void load() }, { immediate: true })
onBeforeUnmount(() => { request++ })
</script>
<template>
  <div class="space-y-5" :aria-busy="!!busy">
    <ErrorAlert :message="error" />
    <div v-if="busy" class="rounded-lg border bg-muted/40 p-4 text-sm" role="status">{{ busy }}执行中。未完成前请勿重复提交或关闭页面；实际阶段见操作日志。</div>
    <p class="rounded-lg border p-4 text-sm text-muted-foreground">QEMU 快照、所有备份导出和恢复均须关机。Incus 支持在线无状态快照；大小未知时不显示为 0 字节。恢复不会重设系统密码。</p>
    <LoadingBlock v-if="loading && !snapshots.length && !backups.length" />
    <Card v-for="kind in (['snapshot', 'backup'] as const)" :key="kind">
      <CardHeader><CardTitle>{{ kind === 'snapshot' ? '快照' : '备份' }}</CardTitle><CardDescription>{{ kind === 'snapshot' ? '节点上的恢复点；不是独立的离线归档。' : '主控保存的完整归档，可下载并恢复到当前实例。' }}</CardDescription></CardHeader>
      <CardContent class="space-y-4">
        <form :data-testid="`${kind}-form`" class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="create(kind)">
          <label class="space-y-1 text-sm">名称<Input v-if="kind === 'snapshot'" v-model="snapshotName" data-testid="snapshot-name" :disabled="locked" placeholder="before-update" required maxlength="64" /><Input v-else v-model="backupName" data-testid="backup-name" :disabled="locked" placeholder="weekly-backup" required maxlength="64" /></label>
          <label class="space-y-1 text-sm">备注<Input v-if="kind === 'snapshot'" v-model="snapshotRemark" :disabled="locked" /><Input v-else v-model="backupRemark" :disabled="locked" /></label>
          <Button type="submit" class="self-end" :disabled="locked || (!stopped && (kind === 'backup' || instance.driver === 'qemu'))">{{ kind === 'snapshot' ? '创建快照' : '创建备份' }}</Button>
        </form>
        <div class="overflow-x-auto rounded-md border">
          <table class="w-full text-sm"><thead class="border-b bg-muted/30"><tr><th class="p-3 text-left">名称 / 备注</th><th class="p-3 text-left">大小</th><th class="p-3 text-left">状态</th><th class="p-3 text-left">创建时间</th><th class="p-3 text-right">操作</th></tr></thead>
            <tbody><tr v-for="row in kind === 'snapshot' ? snapshots : backups" :key="row.id" class="border-b last:border-0"><td class="p-3"><p class="font-medium">{{ row.name }}</p><p class="text-xs text-muted-foreground">{{ row.remark }}</p><p class="mt-1 text-xs text-muted-foreground">来源节点 #{{ row.agent_id || '未知' }}<template v-if="'driver' in row"> · {{ (row as Backup).driver }}<span v-if="(row as Backup).format"> · {{ (row as Backup).format }}</span></template></p><p v-if="'checksum' in row && row.checksum" class="max-w-xs break-all font-mono text-xs text-muted-foreground">SHA-256 {{ row.checksum }}</p><p v-if="row.error" class="text-xs text-destructive">{{ row.error }}</p><p v-if="incompatible(kind, row)" class="text-xs text-amber-600">来源节点 / 驱动不兼容，不能恢复</p></td><td class="p-3 whitespace-nowrap">{{ row.size_bytes > 0 ? formatBytes(row.size_bytes) : '大小未知' }}</td><td class="p-3"><Badge variant="outline">{{ row.status }}</Badge></td><td class="p-3 whitespace-nowrap text-muted-foreground">{{ formatDateTime(row.created_at) }}</td><td class="p-3"><div class="flex justify-end gap-2"><Button v-if="kind === 'backup'" size="sm" variant="outline" :disabled="locked || !usable(row.status)" @click="pending = { kind, action: 'download', row }">下载</Button><Button size="sm" variant="outline" :disabled="locked || !stopped || !usable(row.status) || incompatible(kind, row)" @click="pending = { kind, action: 'restore', row }">恢复</Button><Button size="sm" variant="destructive" :disabled="locked" @click="pending = { kind, action: 'delete', row }">删除</Button></div></td></tr>
              <tr v-if="!(kind === 'snapshot' ? snapshots : backups).length"><td colspan="5" class="p-8 text-center text-muted-foreground">{{ loading ? '正在读取恢复点…' : `暂无${kind === 'snapshot' ? '快照' : '备份'}，创建后将在此显示。` }}</td></tr>
            </tbody></table>
        </div>
        <Button variant="ghost" size="sm" :disabled="locked || loading" @click="error = ''; load()">刷新{{ kind === 'snapshot' ? '快照' : '备份' }}</Button>
      </CardContent>
    </Card>
    <ConfirmDialog :open="!!pending" :title="confirmTitle" :description="confirmDescription" :danger="pending?.action !== 'download'" :busy="!!busy" @update:open="v => { if (!v && !busy) pending = null }" @confirm="confirm" />
  </div>
</template>
