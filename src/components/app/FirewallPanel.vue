<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { networkApi, securityGroupApi } from '@/lib/endpoints'
import type { FirewallInput, FirewallPolicy } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmDialog from './ConfirmDialog.vue'
import ErrorAlert from './ErrorAlert.vue'
const props=defineProps<{instanceId:number; securityGroupId?:number; policy?:FirewallPolicy|null; disabled?:boolean}>()
const emit=defineEmits<{ 'busy-change':[label:string]; settled:[] }>()
type EditorRule = FirewallInput & { id?: number }
const toast=useToast(), rules=ref<EditorRule[]>([]), busy=ref(false), loading=ref(false), error=ref(''), ready=ref(false)
const locked=computed(()=>busy.value || loading.value || !ready.value || !!props.disabled)
const editing=ref<number|null>(null), pending=ref<number|null>(null)
const initial:FirewallInput={direction:'in',action:'accept',protocol:'tcp',port_start:22,port_end:22,cidr:'',priority:100,enabled:true,remark:''}
const form=reactive({...initial})
let request = 0, disposed = false
function input(rule: FirewallInput): FirewallInput {
  return { direction: rule.direction, action: rule.action, protocol: rule.protocol, port_start: rule.port_start, port_end: rule.port_end, cidr: rule.cidr, priority: rule.priority, enabled: rule.enabled, remark: rule.remark }
}
async function load() {
  const current = ++request; loading.value = true; error.value = ''; ready.value = false
  try {
    const rows = props.securityGroupId ? (await securityGroupApi.get(props.securityGroupId)).rules ?? [] : await networkApi.firewall(props.instanceId)
    if (current !== request || disposed) return
    rules.value = rows; ready.value = true
  } catch (e) { if (current === request && !disposed) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}
async function mutate(action: () => Promise<unknown>, reset: () => void) {
  if (locked.value) return
  busy.value = true; ++request; error.value = ''; emit('busy-change','保存防火墙')
  try { await action(); if (!disposed) { reset(); toast.success('规则已保存') } }
  catch (e) { if (!disposed) { error.value = errorMessage(e); toast.error(error.value) } }
  finally { if (!disposed) { const failure = error.value; await load(); if (failure) error.value = failure; busy.value = false; emit('busy-change',''); emit('settled') } }
}
async function save() {
  if (locked.value) return
  if (props.securityGroupId && editing.value === null && rules.value.length >= 256) { error.value = '每个安全组最多 256 条规则'; return }
  const payload = input(form)
  await mutate(() => {
    if (props.securityGroupId) {
      const next = rules.value.map(input)
      if (editing.value === null) next.push(payload); else next[editing.value] = payload
      return securityGroupApi.rules(props.securityGroupId, next)
    }
    return editing.value === null ? networkApi.createFirewall(props.instanceId, payload) : networkApi.updateFirewall(rules.value[editing.value]!.id!, payload)
  }, () => { editing.value = null; Object.assign(form, initial) })
}
async function toggle(index: number) {
  const rule = rules.value[index]; if (!rule) return
  await mutate(() => props.securityGroupId ? securityGroupApi.rules(props.securityGroupId, rules.value.map((item, i) => input(i === index ? { ...item, enabled: !item.enabled } : item))) : networkApi.updateFirewall(rule.id!, { ...input(rule), enabled: !rule.enabled }), () => {})
}
async function remove() {
  const index = pending.value; if (index === null) return
  await mutate(() => props.securityGroupId ? securityGroupApi.rules(props.securityGroupId, rules.value.filter((_, i) => i !== index).map(input)) : networkApi.deleteFirewall(rules.value[index]!.id!), () => { pending.value = null; editing.value = null })
}
watch(()=>[props.instanceId, props.securityGroupId],()=>{rules.value=[];editing.value=null;pending.value=null; Object.assign(form, initial); void load()},{immediate:true})
onBeforeUnmount(() => { disposed = true; ++request })
</script>
<template>
  <Card class="animate-in fade-in-0 duration-200"><CardHeader><CardTitle>{{ securityGroupId ? '安全组规则' : '实例防火墙' }}</CardTitle><CardDescription>优先级越小越先匹配。{{ securityGroupId ? '默认行为由安全组入站 / 出站策略决定，修改影响所有绑定实例。' : '本地规则与安全组合并执行，未匹配流量遵循有效默认策略；无策略时保留旧版语义。' }}运行中即时应用，关机时保存到下次开机。</CardDescription></CardHeader><CardContent class="space-y-4">
    <ErrorAlert :message="error" />
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">加载规则中…</p>
    <Button variant="outline" size="sm" :disabled="busy || loading || disabled" @click="load">刷新规则</Button>
    <form @submit.prevent="save"><fieldset :disabled="locked" class="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <label class="space-y-1 text-sm">方向<select v-model="form.direction" class="block h-10 w-full rounded-md border bg-background px-3"><option value="in">入站</option><option value="out">出站</option></select></label>
      <label class="space-y-1 text-sm">动作<select v-model="form.action" class="block h-10 w-full rounded-md border bg-background px-3"><option value="accept">允许</option><option value="drop">丢弃</option></select></label>
      <label class="space-y-1 text-sm">协议<select v-model="form.protocol" class="block h-10 w-full rounded-md border bg-background px-3" @change="()=>{if(!['tcp','udp'].includes(form.protocol)){form.port_start=0;form.port_end=0}}"><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option><option value="any">全部</option></select></label>
      <label class="space-y-1 text-sm">来源 / 目标 CIDR<Input v-model="form.cidr" placeholder="留空表示任意 IPv4" /></label>
      <label class="space-y-1 text-sm">起始端口（0 为全部）<input v-model.number="form.port_start" type="number" min="0" max="65535" :disabled="!['tcp','udp'].includes(form.protocol)" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">结束端口<input v-model.number="form.port_end" type="number" min="0" max="65535" :disabled="!['tcp','udp'].includes(form.protocol)" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">优先级<input v-model.number="form.priority" type="number" min="0" max="65535" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">备注<Input v-model="form.remark" /></label>
      <div class="flex items-center gap-3 sm:col-span-3 lg:col-span-4"><label class="flex items-center gap-2 text-sm"><input type="checkbox" v-model="form.enabled" class="size-4 accent-primary" />启用</label><Button type="submit" :disabled="locked">{{editing !== null?'保存规则':'添加规则'}}</Button><Button v-if="editing !== null" variant="ghost" type="button" @click="editing=null; Object.assign(form,initial)">取消编辑</Button></div>
    </fieldset></form>
    <div class="overflow-auto"><table class="w-full text-sm"><thead class="border-b"><tr><th class="p-2 text-left">优先级</th><th class="p-2 text-left">方向 / 动作</th><th class="p-2 text-left">协议 / 端口</th><th class="p-2 text-left">CIDR</th><th class="p-2 text-left">备注</th><th class="p-2 text-right">操作</th></tr></thead><tbody><tr v-for="(rule, index) in rules" :key="rule.id ?? index" class="border-b transition-colors hover:bg-muted/30" :class="{'opacity-50':!rule.enabled}"><td class="p-2">{{rule.priority}}</td><td class="p-2">{{rule.direction==='in'?'入站':'出站'}} / {{rule.action==='drop'?'丢弃':'允许'}}</td><td class="p-2">{{rule.protocol.toUpperCase()}} · {{rule.port_start?`${rule.port_start}–${rule.port_end}`:'全部'}}</td><td class="p-2 font-mono">{{rule.cidr || '任意 IPv4'}}</td><td class="p-2">{{rule.remark || '—'}}</td><td class="p-2"><div class="flex justify-end gap-2"><Button variant="outline" size="sm" :disabled="locked" @click="editing=index;Object.assign(form,input(rule))">编辑</Button><Button variant="outline" size="sm" :disabled="locked" @click="toggle(index)">{{rule.enabled?'停用':'启用'}}</Button><Button variant="destructive" size="sm" :disabled="locked" @click="pending=index">删除</Button></div></td></tr><tr v-if="!rules.length"><td colspan="6" class="p-6 text-center text-muted-foreground">暂无本地规则；流量仍受有效默认策略与安全组约束。</td></tr></tbody></table></div>
    <ConfirmDialog :busy="locked" :open="pending !== null" @update:open="v=>{if(!v)pending=null}" title="删除防火墙规则" description="确认删除此规则？运行中实例的规则会立即更新。" danger @confirm="remove" />
  </CardContent></Card>
</template>
