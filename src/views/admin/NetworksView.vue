<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { agentApi, networkApi } from '@/lib/endpoints'
import type { IPPoolOverview, IPPoolEntry, VPC, VirtualisAgent } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import PageHeader from '@/components/app/PageHeader.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

const toast = useToast()
const agents = ref<VirtualisAgent[]>([])
const agentID = ref('')
const tab = ref('vpc')
const loading = ref(false), busy = ref(false), error = ref('')
const vpcs = ref<VPC[]>([]), pool = ref<IPPoolOverview | null>(null)
const defaults = reactive({gateway:'', prefix:24, dns:'', interface:'', note:''})
const vpcForm = reactive({name:'', driver:'incus', subnet:'10.100.0.0/24', gateway:'10.100.0.1', dhcp_start:'', dhcp_end:'', nat:true, dns:'', note:''})
const addresses = ref(''), skipped = ref<{ip:string; reason:string}[]>([])
const pending = ref<{type:'vpc'|'ip'; id:number}|null>(null)
const editing = ref<IPPoolEntry | null>(null)
let request = 0
async function load() {
  const current = ++request
  if (!agentID.value) { vpcs.value=[]; pool.value=null; return }
  loading.value=true; error.value=''
  try {
    const [networks, overview] = await Promise.all([networkApi.vpcs(Number(agentID.value)), networkApi.pool(Number(agentID.value))])
    if (current !== request) return
    vpcs.value=networks; pool.value=overview
    Object.assign(defaults, {...overview, dns:(overview.dns ?? []).join(',')})
  } catch(e) { if (current === request) error.value=errorMessage(e) } finally { if (current === request) loading.value=false }
}
async function savePool() {
  busy.value=true
  try { await networkApi.savePool(Number(agentID.value), {...defaults, prefix:Number(defaults.prefix), dns:defaults.dns.split(',').map(s=>s.trim()).filter(Boolean)}); toast.success('默认网络参数已保存'); await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
async function addIPs() {
  busy.value=true
  try { const result=await networkApi.addIPs(Number(agentID.value), addresses.value.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean)); skipped.value=result.skipped; toast.success(`已添加 ${result.created} 个地址`); addresses.value=''; await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
async function createVPC() {
  busy.value=true
  try { await networkApi.createVPC({...vpcForm, agent_id:Number(agentID.value), dns:vpcForm.dns.split(',').map(s=>s.trim()).filter(Boolean)}); toast.success('VPC 已创建'); vpcForm.name=''; await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
async function remove() {
  if (!pending.value) return
  busy.value=true
  try { if(pending.value.type==='vpc') await networkApi.deleteVPC(pending.value.id); else await networkApi.deleteIP(pending.value.id); pending.value=null; toast.success('已删除'); await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
async function toggleIP(entry:IPPoolEntry) {
  busy.value=true
  try { await networkApi.updateIP(entry.id,{status:entry.status==='disabled'?'free':'disabled'}); await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
async function saveIP() {
  if (!editing.value) return
  busy.value=true
  try { const {id,gateway,prefix,note}=editing.value; await networkApi.updateIP(id,{gateway,prefix:Number(prefix),note}); editing.value=null; await load() } catch(e) { toast.error(errorMessage(e)) } finally { busy.value=false }
}
watch(agentID,load)
onMounted(async()=>{try { agents.value=await agentApi.list(); agentID.value=String(agents.value[0]?.id ?? '') } catch(e) { error.value=errorMessage(e) }})
</script>
<template>
  <div class="space-y-5">
    <PageHeader title="VPC 与独立 IP 池" description="按节点管理私有网络和地址分配，创建实例时自动带入网络参数" />
    <div class="flex flex-wrap items-center gap-3">
      <label class="text-sm" for="network-agent">被控节点</label><select id="network-agent" v-model="agentID" class="rounded-md border bg-background px-3 py-2 text-sm"><option v-for="agent in agents" :key="agent.id" :value="String(agent.id)">{{ agent.display_name || agent.name }}</option></select>
      <div class="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="网络类型"><Button :variant="tab==='vpc'?'default':'ghost'" role="tab" :aria-selected="tab==='vpc'" @click="tab='vpc'">VPC 网络</Button><Button :variant="tab==='ip'?'default':'ghost'" role="tab" :aria-selected="tab==='ip'" @click="tab='ip'">独立 IP 池</Button></div>
    </div>
    <ErrorAlert :message="error" /><LoadingBlock v-if="loading" />
    <p v-if="!agents.length" class="rounded-lg border p-8 text-center text-muted-foreground">先添加被控节点，再配置网络。</p>
    <div v-else-if="!loading && tab==='vpc'" class="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <Card><CardHeader><CardTitle>创建私有网络</CardTitle></CardHeader><CardContent>
        <form class="grid gap-4 sm:grid-cols-3" @submit.prevent="createVPC">
          <label class="space-y-2 text-sm">名称<Input v-model="vpcForm.name" required pattern="[a-z][a-z0-9-]{1,14}" placeholder="private-net" /></label>
          <label class="space-y-2 text-sm">驱动<select v-model="vpcForm.driver" class="block h-10 w-full rounded-md border bg-background px-3"><option value="incus">Incus</option><option value="qemu">QEMU</option></select></label>
          <label class="space-y-2 text-sm">子网（/16–/29）<Input v-model="vpcForm.subnet" required /></label>
          <label class="space-y-2 text-sm">网关<Input v-model="vpcForm.gateway" required /></label>
          <label class="space-y-2 text-sm">DHCP 起始地址<Input v-model="vpcForm.dhcp_start" placeholder="留空自动生成" /></label>
          <label class="space-y-2 text-sm">DHCP 结束地址<Input v-model="vpcForm.dhcp_end" placeholder="留空自动生成" /></label>
          <label class="space-y-2 text-sm">DNS（逗号分隔）<Input v-model="vpcForm.dns" placeholder="1.1.1.1,8.8.8.8" /></label>
          <label class="space-y-2 text-sm">备注<Input v-model="vpcForm.note" /></label>
          <div class="flex items-end gap-4"><label class="flex items-center gap-2 text-sm"><input v-model="vpcForm.nat" type="checkbox" class="size-4 accent-primary" />启用 NAT 出口</label><Button type="submit" :disabled="busy || !agentID">{{busy?'处理中…':'创建 VPC'}}</Button></div>
        </form>
      </CardContent></Card>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Card v-for="vpc in vpcs" :key="vpc.id" class="transition-shadow hover:shadow-md"><CardHeader><CardTitle class="flex items-center justify-between">{{vpc.name}}<Badge variant="outline">{{vpc.driver}}</Badge></CardTitle></CardHeader><CardContent class="space-y-3 text-sm"><div class="font-mono">{{vpc.subnet}}</div><p>网关 {{vpc.gateway}} · {{vpc.nat?'NAT 出口':'隔离网络'}}</p><p class="text-muted-foreground">DHCP {{vpc.dhcp_start}} – {{vpc.dhcp_end}}</p><div class="flex items-center justify-between"><span>{{vpc.instance_count ?? 0}} 个实例</span><Button variant="destructive" size="sm" :disabled="busy || !!vpc.instance_count" @click="pending={type:'vpc',id:vpc.id}">删除</Button></div><p v-if="vpc.note" class="text-muted-foreground">{{vpc.note}}</p></CardContent></Card></div>
      <p v-if="!vpcs.length" class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">该节点尚无 VPC 网络。</p>
    </div>
    <div v-else-if="!loading && pool" class="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4"><Card v-for="stat in [{label:'全部地址',value:pool.total},{label:'可分配',value:pool.free},{label:'已分配',value:pool.assigned},{label:'已停用',value:pool.disabled}]" :key="stat.label"><CardContent class="p-4"><p class="text-xs text-muted-foreground">{{stat.label}}</p><p class="mt-2 text-2xl font-semibold tabular-nums">{{stat.value}}</p></CardContent></Card></div>
      <Card><CardHeader><CardTitle>默认网络参数</CardTitle></CardHeader><CardContent><form class="grid gap-4 sm:grid-cols-3" @submit.prevent="savePool"><label class="space-y-2 text-sm">网关<Input v-model="defaults.gateway" /></label><label class="space-y-2 text-sm">子网前缀<input v-model.number="defaults.prefix" type="number" min="1" max="32" class="block h-10 w-full rounded-md border bg-background px-3" /></label><label class="space-y-2 text-sm">挂载网卡/网桥<Input v-model="defaults.interface" placeholder="自动选择" /></label><label class="space-y-2 text-sm">DNS（逗号分隔）<Input v-model="defaults.dns" /></label><label class="space-y-2 text-sm">备注<Input v-model="defaults.note" /></label><Button type="submit" class="self-end" :disabled="busy">保存默认参数</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>批量导入地址</CardTitle></CardHeader><CardContent class="space-y-3"><label for="ip-import" class="text-sm text-muted-foreground">每行一个 IPv4 或同一 /24 内的范围，例如 192.0.2.10-192.0.2.20</label><textarea id="ip-import" v-model="addresses" class="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-sm" /><Button :disabled="busy || !addresses.trim()" @click="addIPs">导入地址</Button><p v-for="(item,index) in skipped" :key="index" class="text-sm text-amber-600">{{item.ip}}：{{item.reason}}</p></CardContent></Card>
      <Card><CardContent class="overflow-auto p-0"><table class="w-full text-sm"><thead class="border-b bg-muted/30"><tr><th class="p-3 text-left">地址</th><th class="p-3 text-left">状态</th><th class="p-3 text-left">实例</th><th class="p-3 text-left">备注</th><th class="p-3 text-right">操作</th></tr></thead><tbody><tr v-for="entry in pool.entries" :key="entry.id" class="border-b transition-colors hover:bg-muted/30"><td class="p-3 font-mono">{{entry.ip}}</td><td class="p-3"><Badge :variant="entry.status==='free'?'default':'secondary'">{{entry.status==='free'?'可分配':entry.status==='assigned'?'已分配':'停用'}}</Badge></td><td class="p-3"><RouterLink v-if="entry.instance_id" :to="`/admin/instances/${entry.instance_id}`" class="text-primary hover:underline">{{entry.instance_name || '#'+entry.instance_id}}</RouterLink><span v-else>—</span></td><td class="p-3">{{entry.note || '—'}}</td><td class="p-3"><div class="flex justify-end gap-2"><Button variant="outline" size="sm" :disabled="busy || entry.status==='assigned'" @click="editing={...entry}">编辑</Button><Button variant="outline" size="sm" :disabled="busy || entry.status==='assigned'" @click="toggleIP(entry)">{{entry.status==='disabled'?'启用':'停用'}}</Button><Button variant="destructive" size="sm" :disabled="busy || entry.status==='assigned'" @click="pending={type:'ip',id:entry.id}">删除</Button></div></td></tr><tr v-if="!pool.entries.length"><td colspan="5" class="p-8 text-center text-muted-foreground">地址池为空，先导入地址。</td></tr></tbody></table></CardContent></Card>
    </div>
    <Dialog :open="!!editing" @update:open="v=>{if(!v) editing=null}"><DialogContent><DialogHeader><DialogTitle>编辑 {{editing?.ip}}</DialogTitle><DialogDescription>条目参数优先于地址池默认参数，前缀填 0 则继承。</DialogDescription></DialogHeader><div v-if="editing" class="space-y-3"><label class="space-y-2 text-sm">网关<Input v-model="editing.gateway" /></label><label class="space-y-2 text-sm">前缀<input v-model.number="editing.prefix" type="number" min="0" max="32" class="block h-10 w-full rounded-md border bg-background px-3" /></label><label class="space-y-2 text-sm">备注<Input v-model="editing.note" /></label></div><DialogFooter><Button :disabled="busy" @click="saveIP">保存</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog :open="!!pending" @update:open="v=>{if(!v) pending=null}" title="确认删除" description="请确认要删除所选网络或 IP 地址。" danger @confirm="remove" />
  </div>
</template>
