<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import { useRoute, useRouter } from 'vue-router'
import RFB from '@novnc/novnc'
import { agentApi, virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { HostInterface, InstanceMetrics, NATMapping, NetworkStatus, VNCInfo, VirtualisImage, VirtualisInstance, InstanceOperationLog, NetworkConfig } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import FirewallPanel from '@/components/app/FirewallPanel.vue'
import SecurityGroupPanel from '@/components/app/SecurityGroupPanel.vue'
import RecoveryPanel from '@/components/app/RecoveryPanel.vue'
import MigrationDialog from '@/components/app/MigrationDialog.vue'
import ResizeDialog from '@/components/app/ResizeDialog.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cpuLabel, formatBytes, formatDateTime } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// The route param must stay reactive: navigating detail -> detail reuses this
// component instance (same route record), so a one-time constant would keep
// showing the previous instance.
const id = computed(() => Number(route.params.id))
const activeTab = ref('overview')
const inst = ref<VirtualisInstance | null>(null)
const loading = ref(false)
const error = ref('')
const actionLoading = ref('')
const recoveryBusy = ref('')
const taskBusy = ref('')
const migrationOpen = ref(false)
const resizeOpen = ref(false)
const busyLabel = computed(() => recoveryBusy.value || taskBusy.value || actionLoading.value || (configureBusy.value ? '配置网络' : passwordBusy.value ? '重置密码' : natBusy.value ? 'NAT 操作' : '') || (inst.value?.busy_operation ? `服务端 ${inst.value.busy_action || '操作'}（${inst.value.busy_operation}）` : ''))
const busy = computed(() => !!busyLabel.value)
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
let logsTimer: ReturnType<typeof setInterval> | undefined

// NAT mappings and SSH password management.
const natMappings = ref<NATMapping[]>([])
const natForm = ref({ protocol: 'tcp', guest_port: '', host_port: '', remark: '' })
const natBusy = ref(false)
const showPassword = ref(false)
const passwordBusy = ref(false)
const configureBusy = ref(false)
const operationLogs = ref<InstanceOperationLog[]>([])
const logsLoading = ref(false)
const networkForm = ref<NetworkConfig>({ mode: 'nat' })
const securityGroupRefresh = ref(0)
const hostInterfaces = ref<HostInterface[]>([]), hostLoading = ref(false), hostError = ref('')
let hostRequest = 0
async function loadHostInterfaces() {
  const current = ++hostRequest, agentID = inst.value?.agent_id
  hostInterfaces.value = []; hostError.value = ''; hostLoading.value = false
  if (!agentID || networkForm.value.mode !== 'dedicated') return
  hostLoading.value = true
  try {
    const summary = await agentApi.hostNetwork(agentID)
    if (current === hostRequest && !disposed) hostInterfaces.value = (summary.interfaces ?? []).filter(iface => ['bridge', 'physical', 'vlan'].includes(iface.kind) && iface.state?.toLowerCase() !== 'down')
  } catch (e) { if (current === hostRequest && !disposed) hostError.value = errorMessage(e) }
  finally { if (current === hostRequest) hostLoading.value = false }
}
watch(() => [inst.value?.agent_id, networkForm.value.mode], loadHostInterfaces)
// Confirm dialogs: native confirm() has been migrated to ConfirmDialog.
const confirmNatOpen = ref(false)
const pendingNatId = ref<number | null>(null)
const confirmPasswordOpen = ref(false)
const confirmNetworkOpen = ref(false)
const confirmDeleteOpen = ref(false)
// Reinstall wipes the disk (Delete+Create on the agent); same two-step
// confirmation pattern as the other destructive actions.
const confirmReinstallOpen = ref(false)
let generation = 0, logsRequest = 0, disposed = false
watch(busy, () => { generation++ }, { flush: 'sync' })
watch(() => inst.value?.agent_id, () => { generation++; network.value = null; metrics.value = null }, { flush: 'sync' })

const sshMapping = computed(() => natMappings.value.find(m => m.guest_port === 22 && m.protocol === 'tcp') ?? null)
const sshHost = computed(() => inst.value?.agent?.ip || inst.value?.agent?.endpoint?.replace(/^https?:\/\//, '').replace(/:\d+$/, '') || '')
const sshCommand = computed(() => sshMapping.value && sshHost.value ? `ssh root@${sshHost.value} -p ${sshMapping.value.host_port}` : '')

async function loadNAT() {
  const current = generation
  try {
    const fresh = await virtualisApi.instance(id.value)
    if (current !== generation || disposed) return
    inst.value = fresh
    natMappings.value = fresh.nat_mappings ?? []
  } catch { /* detail load failure is already surfaced by the main flow */ }
}

async function addNAT() {
  if (busy.value) return
  const guestPort = parseInt(natForm.value.guest_port)
  if (!guestPort || guestPort < 1 || guestPort > 65535) { toast.error('请填写实例端口（1-65535）'); return }
  natBusy.value = true
  try {
    await virtualisApi.createNATMapping(id.value, {
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
  if (!mappingId) return
  pendingNatId.value = mappingId
  confirmNatOpen.value = true
}

async function doRemoveNAT() {
  if (busy.value) return
  if (!pendingNatId.value) return
  confirmNatOpen.value = false
  natBusy.value = true
  try {
    await virtualisApi.deleteNATMapping(id.value, pendingNatId.value)
    toast.success('映射已删除')
    await loadNAT()
  } catch (e) { toast.error(errorMessage(e)) } finally { natBusy.value = false }
}

function rotatePassword() {
  confirmPasswordOpen.value = true
}

async function doRotatePassword() {
  if (busy.value) return
  confirmPasswordOpen.value = false
  const password = generatePassword()
  passwordBusy.value = true
  try {
    const updated = await virtualisApi.setPassword(id.value, password)
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

/** Traffic progress: an absent quota means unlimited; the 102400GB ceiling matches the backend NetworkConfig validation. */
const trafficProgress = computed(() => {
  const quotaGB = inst.value?.network?.traffic_gb ?? 0
  const used = metrics.value?.traffic_used_bytes
  if (quotaGB <= 0) return { unlimited: true as const }
  const quotaBytes = quotaGB * 1024 ** 3
  const usedBytes = Math.max(0, used ?? 0)
  const percent = Math.min(100, usedBytes / quotaBytes * 100)
  return { unlimited: false as const, quotaGB, usedBytes, percent, exceeded: usedBytes >= quotaBytes }
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
  try { inst.value = await virtualisApi.instance(id.value); if (inst.value.network) networkForm.value = { ...inst.value.network } } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function loadImages() {
  try { images.value = await virtualisApi.images() } catch {}
}

async function refreshTelemetry(showToast = false) {
  if (!inst.value || busy.value || telemetryLoading.value) return
  const current = generation
  telemetryLoading.value = true
  const results = await Promise.allSettled([virtualisApi.metrics(id.value), virtualisApi.network(id.value)])
  telemetryLoading.value = false
  if (current !== generation || disposed) return
  if (results[0].status === 'fulfilled') metrics.value = results[0].value
  if (results[1].status === 'fulfilled') network.value = results[1].value
  telemetryLoading.value = false
  if (showToast) toast.success('实例状态已刷新')
}

async function checkNetwork() {
  if (busy.value || networkLoading.value) return
  const current = generation
  networkLoading.value = true
  try {
    const result = await virtualisApi.network(id.value)
    if (current !== generation || disposed) return
    network.value = result
    const observed = network.value.interfaces?.flatMap((item) => item.ipv4 ?? []).find((item) => item && item !== '127.0.0.1')
    if (inst.value && observed) {
      inst.value.observed_ip = observed.split('/')[0]
      inst.value.ip = inst.value.observed_ip
    }
    toast.success(network.value.reachable ? '网络检测通过' : '网络检测未通过')
  } catch (e) { if (current === generation && !disposed) toast.error(errorMessage(e)) } finally { networkLoading.value = false }
}

async function loadLogs() {
  const current = ++logsRequest
  logsLoading.value = true
  try {
    const page = await virtualisApi.operationLogs(id.value, { page: 1, page_size: 50 })
    if (current !== logsRequest || disposed) return
    operationLogs.value = page.items ?? []
  } catch (e) { if (current === logsRequest && !disposed) toast.error(errorMessage(e)) } finally { if (current === logsRequest) logsLoading.value = false }
}
async function refreshAfterTask() {
  generation++
  securityGroupRefresh.value++
  try {
    const updated = await virtualisApi.instance(id.value)
    if (disposed) return
    inst.value = updated
    natMappings.value = updated.nat_mappings ?? []
    networkForm.value = { ...updated.network, mode: updated.network?.mode || 'nat' }
  } catch (e) { if (!disposed) error.value = errorMessage(e) }
  await loadLogs()
}

function configureNetwork() {
  confirmNetworkOpen.value = true
}

async function doConfigureNetwork() {
  if (busy.value) return
  if (networkForm.value.mode === 'dedicated') {
    if (hostLoading.value || hostError.value) { toast.error(hostError.value || '上联信息加载中，请稍候'); return }
    if (networkForm.value.dedicated_mode === 'bridge' && !hostInterfaces.value.some(iface => iface.name === networkForm.value.bridge && iface.kind === 'bridge')) { toast.error('bridge 必须选择已存在的 Linux 网桥'); return }
  }
  confirmNetworkOpen.value = false
  configureBusy.value = true
  try {
    const result = await virtualisApi.configureNetwork(id.value, networkForm.value)
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
    vnc.value = await virtualisApi.vnc(id.value)
    if (!vnc.value.available) {
      toast.error(vnc.value.message || '当前实例没有 VNC')
      return
    }
    rfb?.disconnect()
    rfb = null
    consoleOpen.value = true
    await nextTick()
    if (!vncTarget.value) return
    const webURL = vnc.value.web_url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/instances/${id.value}/vnc/ws`
    // resizeSession must stay off: QEMU answers VGA SetDesktopSize requests
    // with "Invalid screen layout" and then stops rendering, which looks
    // like a connection failure.
    rfb = new RFB(vncTarget.value, webURL)
    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.viewOnly = false
    rfb.addEventListener('connect', () => { vncConnected.value = true; toast.success('VNC 已连接，黑屏时在画面内点击或按键唤醒') })
    rfb.addEventListener('disconnect', (e) => {
      vncConnected.value = false
      const detail = (e as CustomEvent).detail || {}
      // Log the disconnect reason to console: clean=false within seconds is
      // usually a browser refresh/manual reconnect; handshake-phase errors
      // need cross-checking here against the master/agent journals.
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

/** Fullscreen console: opens an independent window connection (embedded one is kept). */
function openConsoleWindow() {
  window.open(`/admin/instances/${id.value}/console`, '_blank', 'width=1280,height=820')
}

async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); toast.success('已复制') } catch { toast.error('复制失败，请手动复制') }
}

async function power(action: string) {
  if (busy.value) return
  actionLoading.value=action
  try {
    const imgId = action==='reinstall' && reinstallImage.value ? parseInt(reinstallImage.value) : undefined
    const updated = await virtualisApi.power(id.value, action, imgId as any)
    // VIR-CORE-05 guard: a success response may no longer carry the released
    // busy token, and legacy responses carry an already-released one. In both
    // cases the server-side fence is gone, so treat the operation as settled
    // here rather than trusting a stale token embedded in this payload.
    inst.value = normalizeSettled(updated)
    toast.success(`执行 ${action} 成功`)
    await refreshTelemetry()
  } catch (e) {
    toast.error(errorMessage(e))
    // On failure the persisted fence may have been retained server-side;
    // re-read the authoritative detail instead of assuming it was released.
    if (action !== 'status') await load()
  } finally { actionLoading.value='' }
}

/**
 * VIR-CORE-05: successful power/restore responses used to embed the busy
 * token captured before the deferred SQL release, leaving the UI stuck on a
 * phantom busy state. The backend now omits the token on success; to stay
 * compatible with both shapes we do not depend on the token field being
 * present — a success response means the fence is released, so any busy_*
 * fields carried by the payload are cleared here.
 */
function normalizeSettled(instance: VirtualisInstance): VirtualisInstance {
  return instance.busy_operation ? { ...instance, busy_operation: undefined, busy_action: undefined, busy_since: undefined } : instance
}

/** Task dialogs (recovery/resize/migration) hand back the instance too; run
 *  them through the same settled-state normalization as power responses. */
function applyUpdated(next: VirtualisInstance) {
  inst.value = normalizeSettled(next)
}

async function refreshStatus() {
  if (busy.value) return
  actionLoading.value='status'
  try {
    inst.value = await virtualisApi.status(id.value)
    await refreshTelemetry()
    toast.success('状态已刷新')
  } catch (e) { toast.error(errorMessage(e)) } finally { actionLoading.value='' }
}

function del() {
  confirmDeleteOpen.value = true
}

async function doDelete() {
  if (busy.value) return
  confirmDeleteOpen.value = false
  try { await virtualisApi.deleteInstance(id.value); toast.success('已删除'); router.push({ name: 'instances' }) } catch (e) { toast.error(errorMessage(e)) }
}

// F3: reinstall destroys the disk (agent-side Delete + Create); route it
// through the same two-step ConfirmDialog as delete/migrate/restore instead
// of firing directly from the button.
function reinstall() {
  if (!reinstallImage.value) return
  confirmReinstallOpen.value = true
}

async function doReinstall() {
  confirmReinstallOpen.value = false
  await power('reinstall')
}

// F4: detail -> detail navigation reuses this component instance (same route
// record), so reset every per-instance state and reload when the id changes.
watch(() => route.params.id, async (next, prev) => {
  const nextId = Number(next)
  if (!Number.isFinite(nextId) || nextId === Number(prev)) return
  generation++
  disconnectVNC()
  // Do not null out inst here: load() flips loading=true which swaps the
  // detail area to LoadingBlock immediately, while the dialogs mounted via
  // v-if="inst" would otherwise re-render against a cleared record.
  metrics.value = null
  network.value = null
  vnc.value = null
  natMappings.value = []
  operationLogs.value = []
  networkForm.value = { mode: 'nat' }
  activeTab.value = 'overview'
  securityGroupRefresh.value++
  error.value = ''
  await load()
  await Promise.all([loadImages(), refreshTelemetry(), loadLogs()])
  await loadNAT()
})

onMounted(async () => {
  await load()
  await Promise.all([loadImages(), refreshTelemetry(), loadLogs()])
  telemetryTimer = setInterval(() => refreshTelemetry(), 10000)
  logsTimer = setInterval(() => { if (busy.value || activeTab.value === 'logs') void loadLogs() }, 3000)
  await loadNAT()
})

onBeforeUnmount(() => {
  disposed = true; generation++; logsRequest++; hostRequest++
  if (telemetryTimer) clearInterval(telemetryTimer)
  if (logsTimer) clearInterval(logsTimer)
  disconnectVNC()
})
</script>

<template>
  <div>
    <PageHeader :title="inst ? `实例 #${inst.id} - ${inst.name}` : '实例详情'" description="被控资源、网络检测、VNC 与电源操作">
      <template #actions>
        <Button data-testid="open-resize" variant="outline" :disabled="busy || !inst || inst.status !== 'stopped'" @click="resizeOpen = true">调整规格</Button>
        <Button data-testid="open-migration" variant="outline" :disabled="busy || !inst || inst.status !== 'stopped'" @click="migrationOpen = true">跨节点迁移</Button>
        <Button variant="outline" @click="router.push({ name: 'instances' })">返回列表</Button>
      </template>
    </PageHeader>
    <ErrorAlert :message="error" />
    <div v-if="busy" data-testid="operation-busy" role="status" class="mb-5 rounded-lg border bg-muted/40 p-4 text-sm">{{ busyLabel }}执行中。请勿重复提交或关闭页面。<Button size="sm" variant="link" @click="activeTab = 'logs'">查看操作日志</Button></div>
    <LoadingBlock v-if="loading" />
    <div v-else-if="inst" class="space-y-6">
      <TabsRoot v-model="activeTab" class="space-y-5">
        <TabsList class="detail-tabs" aria-label="实例详情">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="network">网络与防火墙</TabsTrigger>
          <TabsTrigger value="recovery">快照与备份</TabsTrigger>
          <TabsTrigger value="logs">操作日志</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" class="space-y-6 tab-panel">
      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><span class="text-muted-foreground">ID：</span>{{ inst.id }}</div>
          <div><span class="text-muted-foreground">名称：</span>{{ inst.name }}</div>
          <div><span class="text-muted-foreground">类型：</span>{{ inst.type === 'vm' ? '虚拟机' : '容器' }}</div>
          <div><span class="text-muted-foreground">被控：</span>{{ inst.agent?.display_name || inst.agent?.name || '-' }}</div>
          <div><span class="text-muted-foreground">驱动：</span><Badge variant="outline">{{ inst.driver }}</Badge></div>
          <div><span class="text-muted-foreground">状态：</span><Badge>{{ statusLabel(inst.status) }}</Badge></div>
          <div><span class="text-muted-foreground">规格：</span>{{ cpuLabel(inst.spec.cpu, inst.spec.cpu_milli) }} / {{ inst.spec.memory_mb }}MB / {{ inst.spec.disk_gb }}GB</div>
          <div><span class="text-muted-foreground">镜像：</span>{{ inst.image?.name ?? inst.image_id ?? '-' }}</div>
          <div><span class="text-muted-foreground">网络：</span>{{ inst.network?.mode || 'nat' }}{{ inst.network?.bridge ? ` / ${inst.network.bridge}` : '' }}</div>
          <div><span class="text-muted-foreground">配置 IPv4：</span>{{ inst.network?.ipv4 || inst.ip || '-' }}</div>
          <div><span class="text-muted-foreground">观测 IPv4：</span>{{ inst.observed_ip || '-' }}</div>
          <div><span class="text-muted-foreground">SSH：</span><Badge :variant="inst.ssh_ready ? 'default' : 'outline'">{{ inst.ssh_ready ? '已就绪' : '未确认' }}</Badge></div>
          <div v-if="inst.network_error" class="text-destructive sm:col-span-2 lg:col-span-3"><span class="text-muted-foreground">网络错误：</span>{{ inst.network_error }}</div>
          <div><span class="text-muted-foreground">创建：</span>{{ formatDateTime(inst.created_at) }}</div>
          <div><span class="text-muted-foreground">更新：</span>{{ formatDateTime(inst.updated_at) }}</div>
        </CardContent>
      </Card>

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
              <div v-if="trafficProgress.unlimited">
                <div class="mb-1 flex justify-between"><span>流量</span><span class="text-muted-foreground">无限制</span></div>
                <div v-if="metrics?.traffic_used_bytes != null" class="text-xs text-muted-foreground">已用 {{ formatBytes(metrics.traffic_used_bytes) }}</div>
              </div>
              <div v-else>
                <div class="mb-1 flex justify-between">
                  <span>流量</span>
                  <span :class="trafficProgress.exceeded ? 'font-medium text-destructive' : ''">{{ formatBytes(trafficProgress.usedBytes) }} / {{ trafficProgress.quotaGB }} GB</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full transition-all" :class="trafficProgress.exceeded ? 'bg-destructive' : 'bg-primary'" :style="{ width: `${trafficProgress.percent}%` }" /></div>
                <div v-if="trafficProgress.exceeded || metrics?.traffic_quota_exceeded" class="mt-1 text-xs text-destructive">流量配额已超限，实例网络已被节点暂停</div>
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
        <CardHeader><div class="flex items-center justify-between gap-3"><div><CardTitle>VNC 连接</CardTitle><CardDescription>通过主控内置 WebSocket 代理使用 noVNC，浏览器无需安装 VNC 客户端</CardDescription></div><div class="flex gap-2"><Button :disabled="vncLoading" @click="loadVNC">{{ vncLoading ? '连接中...' : consoleOpen ? '重连 VNC' : '连接 VNC' }}</Button><Button variant="outline" @click="openConsoleWindow">新窗口打开</Button><Button v-if="consoleOpen" variant="outline" @click="disconnectVNC">断开</Button><Badge v-if="vncConnected" variant="outline">已连接</Badge><Badge v-else-if="consoleOpen" variant="outline">未连接</Badge></div></div></CardHeader>
        <CardContent>
          <div v-if="consoleOpen" ref="vncTarget" class="h-[420px] w-full overflow-hidden rounded-md bg-black" />
          <div v-else-if="vnc?.available" class="space-y-3"><div class="flex flex-wrap items-center gap-2"><code class="rounded border bg-muted px-3 py-2 text-sm">{{ vnc.url }}</code><Button variant="outline" size="sm" @click="copy(vnc.url || '')">复制</Button></div><p class="text-xs text-muted-foreground">主机：{{ vnc.host }}，端口：{{ vnc.port }}，显示：{{ vnc.display }}。也可以使用桌面 VNC 客户端连接。</p></div>
          <p v-else class="text-sm text-muted-foreground">{{ vnc?.message || '尚未获取 VNC 信息。QEMU 实例创建时自动启用 VNC；容器实例需要宿主安装 xvfb、x11vnc、xterm。' }}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>电源操作</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2"><Label>选择操作</Label><div class="flex flex-wrap gap-2"><Select :modelValue="''" :disabled="busy" @update:modelValue="(v:any)=> { if(v) power(v) }"><SelectTrigger class="w-64"><SelectValue placeholder="选择电源操作" /></SelectTrigger><SelectContent><SelectItem value="start" :disabled="inst.status==='running'">开机{{ inst.status==='running' ? '（已运行）' : '' }}</SelectItem><SelectItem value="stop" :disabled="inst.status!=='running'">关机{{ inst.status!=='running' ? '（未运行）' : '' }}</SelectItem><SelectItem value="restart" :disabled="inst.status!=='running'">重启</SelectItem><SelectItem value="hard_start" :disabled="inst.status==='running'">强制开机</SelectItem><SelectItem value="hard_stop" :disabled="inst.status!=='running'">强制关机</SelectItem><SelectItem value="hard_restart" :disabled="inst.status!=='running'">强制重启</SelectItem></SelectContent></Select><Button size="sm" variant="outline" :disabled="busy" @click="refreshStatus">刷新状态</Button></div><p class="text-xs text-muted-foreground">不可用选项为灰色且无法选择。</p></div>
          <div class="flex flex-wrap items-end gap-2"><div class="grid gap-1"><Label>重装镜像</Label><Select :modelValue="reinstallImage" @update:modelValue="(v:any)=> reinstallImage=v"><SelectTrigger class="w-64"><SelectValue placeholder="选择镜像" /></SelectTrigger><SelectContent><SelectItem v-for="img in images" :key="String(img.id)" :value="String(img.id)">{{ img.name }}（{{ img.driver }}）</SelectItem></SelectContent></Select></div><Button variant="destructive" size="sm" :disabled="busy || !reinstallImage" @click="reinstall">重装</Button></div>
          <div class="border-t pt-2"><Button variant="destructive" size="sm" :disabled="busy" @click="del">移入回收站</Button></div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="network" class="space-y-6 tab-panel">
      <Card v-if="networkForm.mode === 'dedicated'"><CardHeader><CardTitle>独立 IP 网络配置</CardTitle><CardDescription>保留分配时的 IPv4 / CIDR；routed 客户机运行时使用 /32 和链路本地网关，不回写期望配置。</CardDescription></CardHeader><CardContent class="space-y-4">
        <ErrorAlert :message="hostError" /><p v-if="hostLoading" role="status" class="text-sm text-muted-foreground">加载上联信息中…</p>
        <fieldset :disabled="busy || hostLoading" class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">接入方式<select v-model="networkForm.dedicated_mode" data-testid="detail-dedicated-mode" class="block h-10 w-full rounded border bg-background px-3"><option :value="undefined">自动（兼容旧配置）</option><option value="auto">自动</option><option value="routed">路由（routed）</option><option value="bridge">已有 Linux 网桥（bridge）</option></select></label>
          <label class="space-y-1 text-sm">挂载接口<select v-model="networkForm.bridge" data-testid="detail-dedicated-interface" class="block h-10 w-full rounded border bg-background px-3"><option value="">自动选择</option><option v-if="networkForm.bridge && !hostInterfaces.some(iface => iface.name === networkForm.bridge)" :value="networkForm.bridge">{{ networkForm.bridge }}（未确认）</option><option v-for="iface in hostInterfaces" :key="iface.name" :value="iface.name" :disabled="networkForm.dedicated_mode === 'bridge' && iface.kind !== 'bridge'">{{ iface.name }} · {{ iface.kind }}</option></select></label>
          <label class="space-y-1 text-sm">期望 IPv4 / CIDR<Input v-model="networkForm.ipv4" data-testid="detail-desired-ipv4" /></label>
          <label class="space-y-1 text-sm">期望网关<Input v-model="networkForm.gateway" /></label>
          <label class="space-y-1 text-sm">DNS（逗号分隔）<Input :model-value="(networkForm.dns ?? []).join(',')" @update:model-value="value => networkForm.dns = String(value).split(',').map(value => value.trim()).filter(Boolean)" /></label>
        </fieldset><Button variant="outline" size="sm" :disabled="busy || hostLoading" @click="loadHostInterfaces">刷新上联信息</Button><p class="text-xs text-muted-foreground">物理上联 routed 不移动宿主接口或主 IP；bridge 必须选择已有 Linux 网桥。通过下方“配置网络”确认应用。</p>
      </CardContent></Card>
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
                <Button variant="outline" size="sm" :disabled="busy" @click="rotatePassword">重置密码</Button>
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
              <Button variant="ghost" size="sm" class="text-destructive" :disabled="busy" @click="removeNAT(m.id)">删除</Button>
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
              <Button type="submit" class="w-full" :disabled="busy">添加映射</Button>
            </div>
          </form>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <div class="flex items-center justify-between gap-3"><div><CardTitle>网络检测</CardTitle><CardDescription>检查被控节点可见的实例网卡与外部连通性</CardDescription></div><div class="flex gap-2"><Button variant="outline" size="sm" :disabled="networkLoading" @click="checkNetwork">{{ networkLoading ? '检测中...' : '检测网络' }}</Button><Button size="sm" :disabled="busy" @click="configureNetwork">{{ configureBusy ? '配置中...' : '配置网络' }}</Button></div></div>
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
          <SecurityGroupPanel :instance-id="id" :refresh-key="securityGroupRefresh" :disabled="busy" @busy-change="taskBusy = $event" @settled="loadLogs" />
          <FirewallPanel :instance-id="id" :disabled="busy" @busy-change="taskBusy = $event" @settled="refreshAfterTask" />
        </TabsContent>
        <TabsContent value="recovery" force-mount v-show="activeTab === 'recovery'" class="space-y-6 tab-panel">
          <RecoveryPanel :instance="inst" :disabled="!!taskBusy || !!actionLoading || configureBusy || passwordBusy || natBusy" @busy-change="recoveryBusy = $event" @updated="applyUpdated" @settled="refreshAfterTask" />
        </TabsContent>
        <TabsContent value="logs" class="space-y-6 tab-panel">
      <Card>
        <CardHeader><div class="flex items-center justify-between gap-3"><div><CardTitle>操作日志</CardTitle><CardDescription>创建、电源、网络配置和错误记录</CardDescription></div><Button variant="outline" size="sm" :disabled="logsLoading" @click="loadLogs">{{ logsLoading ? '刷新中...' : '刷新日志' }}</Button></div></CardHeader>
        <CardContent>
          <div v-if="operationLogs.length" class="overflow-x-auto rounded-md border">
            <table class="w-full text-sm"><thead><tr class="border-b text-left"><th class="px-3 py-2">时间</th><th class="px-3 py-2">操作</th><th class="px-3 py-2">阶段</th><th class="px-3 py-2">状态</th><th class="px-3 py-2">说明</th></tr></thead><tbody><tr v-for="log in operationLogs" :key="log.id" class="border-b last:border-0"><td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{{ formatDateTime(log.created_at) }}</td><td class="px-3 py-2">{{ log.action }}</td><td class="px-3 py-2">{{ log.stage }}</td><td class="px-3 py-2"><Badge :variant="log.status === 'failed' ? 'destructive' : log.status === 'success' ? 'default' : 'outline' as any">{{ log.status }}</Badge></td><td class="max-w-md px-3 py-2 break-words">{{ log.error || log.message || '-' }}</td></tr></tbody></table>
          </div>
          <p v-else class="text-sm text-muted-foreground">暂无操作日志。</p>
        </CardContent>
      </Card>

        </TabsContent>
      </TabsRoot>
    </div>
    <ResizeDialog v-if="inst" :open="resizeOpen" :instance="inst" :disabled="busy" @update:open="resizeOpen = $event" @busy-change="taskBusy = $event" @updated="applyUpdated" @settled="refreshAfterTask" />
    <MigrationDialog v-if="inst" :open="migrationOpen" :instance="inst" :disabled="busy" @update:open="migrationOpen = $event" @busy-change="taskBusy = $event" @updated="applyUpdated" @settled="refreshAfterTask" />
    <ConfirmDialog :open="confirmNatOpen" @update:open="(v:boolean)=> confirmNatOpen=v" :title="$t('confirm.deleteNatTitle')" :description="$t('confirm.deleteNatDesc')" danger @confirm="doRemoveNAT" />
    <ConfirmDialog :open="confirmPasswordOpen" @update:open="(v:boolean)=> confirmPasswordOpen=v" :title="$t('confirm.rotatePasswordTitle')" :description="$t('confirm.rotatePasswordDesc')" danger @confirm="doRotatePassword" />
    <ConfirmDialog :open="confirmNetworkOpen" @update:open="(v:boolean)=> confirmNetworkOpen=v" :title="$t('confirm.configureNetworkTitle')" :description="$t('confirm.configureNetworkDesc')" danger @confirm="doConfigureNetwork" />
    <ConfirmDialog :open="confirmDeleteOpen" @update:open="(v:boolean)=> confirmDeleteOpen=v" :title="$t('confirm.deleteInstanceTitle')" :description="$t('confirm.deleteInstanceDesc')" danger @confirm="doDelete" />
    <!-- Destructive reinstall: text spells out that the disk is wiped and cannot be recovered. -->
    <ConfirmDialog :open="confirmReinstallOpen" @update:open="(v:boolean)=> confirmReinstallOpen=v" :title="$t('confirm.reinstallTitle')" :description="$t('confirm.reinstallDesc')" danger @confirm="doReinstall" />
  </div>
</template>
