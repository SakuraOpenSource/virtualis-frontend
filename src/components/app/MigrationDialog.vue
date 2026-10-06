<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { agentApi, networkApi, virtualisApi } from '@/lib/endpoints'
import type { FreeIPEntry, HostInterface, NetworkConfig, VPC, VirtualisAgent, VirtualisInstance } from '@/lib/types'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from './ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DialogFooter } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/api'
import ErrorAlert from './ErrorAlert.vue'
import LoadingBlock from './LoadingBlock.vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const props = defineProps<{ open: boolean; instance: VirtualisInstance; disabled?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'busy-change': [label: string]; updated: [instance: VirtualisInstance]; settled: [] }>()
const toast = useToast()
const agents = ref<VirtualisAgent[]>([]), target = ref(''), loading = ref(false), error = ref('')
const mode = ref('nat'), ipEntry = ref('manual'), vpcId = ref(''), ipv4 = ref(''), gateway = ref(''), dns = ref(''), bridge = ref('')
const freeIPs = ref<FreeIPEntry[]>([]), vpcs = ref<VPC[]>([]), interfaces = ref<HostInterface[]>([])
const networkLoading = ref(false), networkReady = ref(false), busy = ref(false), confirming = ref(false)
const locked = computed(() => busy.value || !!props.disabled)
let request = 0, networkRequest = 0
function arch(value?: string) { return value === 'amd64' ? 'x86_64' : value === 'aarch64' ? 'arm64' : value }
function reason(agent: VirtualisAgent) {
  if (agent.status !== 'online') return '节点未在线'
  if (!(agent.drivers ?? []).includes(props.instance.driver)) return '驱动不匹配'
  if (!agent.arch || arch(agent.arch) !== arch(props.instance.spec.arch || props.instance.agent?.arch)) return '架构不匹配或未上报'
  return ''
}
const targets = computed(() => agents.value.filter(agent => agent.id !== props.instance.agent_id))
const targetAgent = computed(() => targets.value.find(agent => String(agent.id) === target.value))
const hostIPv4Count = ref(0)
const topologyError = computed(() => props.instance.nat_mappings?.length && mode.value !== 'nat' ? '存在 NAT 映射时只能迁移到 NAT 网络；请勿丢失端口映射。' : mode.value === 'dedicated' && networkReady.value && hostIPv4Count.value < 2 ? '目标节点至少需要两个宿主 IPv4 地址。' : '')
const valid = computed(() => props.instance.status === 'stopped' && !props.instance.busy_operation && !!targetAgent.value && !reason(targetAgent.value) && networkReady.value && !topologyError.value && (mode.value !== 'vpc' || vpcs.value.some(vpc => String(vpc.id) === vpcId.value)) && (mode.value !== 'dedicated' || freeIPs.value.some(ip => String(ip.id) === ipEntry.value)))
watch(() => props.open, async value => {
  const current = ++request
  ++networkRequest
  target.value = ''; mode.value = props.instance.network?.mode === 'dedicated' || props.instance.network?.mode === 'vpc' ? props.instance.network.mode : 'nat'
  error.value = ''; agents.value = []; confirming.value = false
  if (!value) return
  loading.value = true
  try { const items = await agentApi.list(); if (current === request) agents.value = items }
  catch (e) { if (current === request) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}, { immediate: true })
watch([target, mode], async () => {
  const current = ++networkRequest
  freeIPs.value = []; vpcs.value = []; interfaces.value = []
  ipEntry.value = 'manual'; vpcId.value = ''; ipv4.value = ''; gateway.value = ''; dns.value = ''; bridge.value = ''
  networkReady.value = false; networkLoading.value = false; error.value = ''
  if (!props.open || !targetAgent.value || reason(targetAgent.value)) return
  if (!['dedicated', 'vpc'].includes(mode.value)) { networkReady.value = true; return }
  networkLoading.value = true
  try {
    if (mode.value === 'dedicated') {
      const [ips, host] = await Promise.all([networkApi.freeIPs(Number(target.value)), agentApi.hostNetwork(Number(target.value))])
      if (current !== networkRequest) return
      freeIPs.value = ips; hostIPv4Count.value = host.ipv4_count ?? 0; interfaces.value = (host.interfaces ?? []).filter(item => ['bridge', 'physical', 'vlan'].includes(item.kind))
    } else {
      const items = await networkApi.vpcs(Number(target.value))
      if (current !== networkRequest) return
      vpcs.value = items.filter(vpc => vpc.driver === props.instance.driver && vpc.agent_id === Number(target.value))
    }
    networkReady.value = true
  } catch (e) { if (current === networkRequest) error.value = errorMessage(e) }
  finally { if (current === networkRequest) networkLoading.value = false }
})
watch(ipEntry, value => {
  const entry = freeIPs.value.find(ip => String(ip.id) === value)
  ipv4.value = entry?.cidr || ''; gateway.value = entry?.gateway || ''; dns.value = entry?.dns?.join(',') || ''; bridge.value = entry?.interface || ''
})
watch(vpcId, value => {
  const vpc = vpcs.value.find(item => String(item.id) === value)
  ipv4.value = ''; gateway.value = vpc?.gateway || ''; dns.value = vpc?.dns?.join(',') || ''; bridge.value = vpc?.name || ''
})
function close(value: boolean) { if (!busy.value) emit('update:open', value) }
async function migrate() {
  if (locked.value || !valid.value) return
  busy.value = true; error.value = ''; emit('busy-change', '跨节点迁移')
  const network: NetworkConfig = { mode: mode.value, bandwidth_mbps: props.instance.network?.bandwidth_mbps ?? 0, traffic_gb: props.instance.network?.traffic_gb ?? 0 }
  if (mode.value === 'dedicated' || mode.value === 'vpc') Object.assign(network, { ipv4: ipv4.value.trim(), gateway: gateway.value.trim(), dns: dns.value.split(',').map(value => value.trim()).filter(Boolean), bridge: bridge.value.trim() })
  try {
    const updated = await virtualisApi.migrate(props.instance.id, { target_agent_id: Number(target.value), network, ...(mode.value === 'vpc' ? { vpc_id: Number(vpcId.value) } : {}), ...(mode.value === 'dedicated' && ipEntry.value !== 'manual' ? { ip_pool_entry_id: Number(ipEntry.value) } : {}) })
    emit('updated', updated); toast.success('迁移完成，实例保持关机'); confirming.value = false; emit('update:open', false)
  } catch (e) { error.value = errorMessage(e); toast.error(error.value) }
  finally { busy.value = false; emit('busy-change', ''); emit('settled') }
}
onBeforeUnmount(() => { request++; networkRequest++ })
</script>
<template>
  <Dialog :open="open" @update:open="close">
    <DialogContent class="max-h-[88vh] max-w-2xl overflow-y-auto" @escape-key-down="(event: KeyboardEvent) => { if (busy) event.preventDefault() }" @interact-outside="(event: CustomEvent) => { if (busy) event.preventDefault() }">
      <DialogHeader><DialogTitle>跨节点迁移</DialogTitle><DialogDescription>实例必须关机，目标须在线且驱动和架构相同。迁移后保持关机；目标验证成功后才切换归属并清理源实例。</DialogDescription></DialogHeader>
      <ErrorAlert :message="error" /><LoadingBlock v-if="loading" />
      <ErrorAlert :message="topologyError" />
      <p v-if="busy" role="status" class="rounded-md border bg-muted/40 p-3 text-sm">迁移执行中，请勿关闭页面；实际阶段和失败恢复信息见操作日志。</p>
      <fieldset :disabled="locked" class="space-y-4">
        <label class="block space-y-2 text-sm">目标节点<select v-model="target" data-testid="migration-target" class="block h-10 w-full rounded-md border bg-background px-3" :disabled="loading || locked"><option value="">选择目标节点</option><option v-for="agent in targets" :key="agent.id" :value="String(agent.id)" :disabled="!!reason(agent)">{{ agent.display_name || agent.name }}{{ reason(agent) ? `（${reason(agent)}）` : '' }}</option></select></label>
        <label class="block space-y-2 text-sm">目标网络<select v-model="mode" data-testid="migration-mode" class="block h-10 w-full rounded-md border bg-background px-3"><option value="nat">NAT（在目标重新分配端口）</option><option value="dedicated">独立 IP（重新选择目标地址）</option><option value="vpc">目标 VPC</option><option value="none">禁用网卡</option></select></label>
        <LoadingBlock v-if="networkLoading" />
        <template v-if="mode === 'dedicated'">
          <label class="block space-y-2 text-sm">目标 IP 池<select v-model="ipEntry" data-testid="migration-ip" class="block h-10 w-full rounded-md border bg-background px-3"><option value="manual">请选择目标池地址（必选）</option><option v-for="ip in freeIPs" :key="ip.id" :value="String(ip.id)">{{ ip.cidr }} {{ ip.note }}</option></select></label>
          <label class="block space-y-2 text-sm">目标挂载接口<Input v-model="bridge" list="migration-interfaces" /><datalist id="migration-interfaces"><option v-for="item in interfaces" :key="item.name" :value="item.name" /></datalist></label>
        </template>
        <label v-if="mode === 'vpc'" class="block space-y-2 text-sm">目标 VPC<select v-model="vpcId" data-testid="migration-vpc" class="block h-10 w-full rounded-md border bg-background px-3"><option value="">选择同驱动的目标 VPC</option><option v-for="vpc in vpcs" :key="vpc.id" :value="String(vpc.id)">{{ vpc.name }} · {{ vpc.subnet }}</option></select></label>
        <div v-if="mode === 'dedicated' || mode === 'vpc'" class="grid gap-3 sm:grid-cols-3">
          <label class="space-y-2 text-sm">IPv4 / CIDR<Input v-model="ipv4" data-testid="migration-ipv4" :placeholder="mode === 'vpc' ? '留空使用 DHCP' : '192.0.2.12/24'" /></label>
          <label class="space-y-2 text-sm">网关<Input v-model="gateway" /></label><label class="space-y-2 text-sm">DNS（逗号分隔）<Input v-model="dns" /></label>
        </div>
      </fieldset>
      <p class="text-xs text-muted-foreground">不复制源节点的 IP、VPC 或 NAT 映射；带宽、流量配额和防火墙保留。失败时请核对操作日志中的源/目标清理状态，不要重复启动。</p>
      <DialogFooter><Button variant="outline" :disabled="busy" @click="close(false)">取消</Button><Button data-testid="migration-review" :disabled="locked || !valid || networkLoading" @click="confirming = true">确认迁移方案</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <ConfirmDialog :open="confirming" :busy="busy" danger title="确认跨节点迁移" :description="`迁移实例 #${instance.id} 到 ${targetAgent?.display_name || targetAgent?.name || ''}，网络 ${mode}。期间不可启动实例；归属切换成功后将删除源运行时，目标仍保持关机。请先备份并核对目标地址。`" @update:open="value => { if (!busy) confirming = value }" @confirm="migrate" />
</template>
