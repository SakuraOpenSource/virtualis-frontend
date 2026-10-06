<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { networkApi } from '@/lib/endpoints'
import type { FirewallInput, FirewallRule } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmDialog from './ConfirmDialog.vue'
import ErrorAlert from './ErrorAlert.vue'
const props=defineProps<{instanceId:number; disabled?:boolean}>()
const emit=defineEmits<{ 'busy-change':[label:string]; settled:[] }>()
const toast=useToast(), rules=ref<FirewallRule[]>([]), busy=ref(false), error=ref('')
const locked=computed(()=>busy.value || !!props.disabled)
const editing=ref<number|null>(null), pending=ref<number|null>(null)
const initial:FirewallInput={direction:'in',action:'accept',protocol:'tcp',port_start:22,port_end:22,cidr:'',priority:100,enabled:true,remark:''}
const form=reactive({...initial})
async function load(){try{rules.value=await networkApi.firewall(props.instanceId); error.value=''}catch(e){error.value=errorMessage(e)}}
async function save(){if(locked.value)return;busy.value=true;emit('busy-change','保存防火墙');try{if(editing.value) await networkApi.updateFirewall(editing.value,form); else await networkApi.createFirewall(props.instanceId,form); toast.success('规则已保存'); editing.value=null; Object.assign(form,initial)}catch(e){toast.error(errorMessage(e))}finally{await load();busy.value=false;emit('busy-change','');emit('settled')}}
async function toggle(rule:FirewallRule){if(locked.value)return;busy.value=true;emit('busy-change','更新防火墙');try{await networkApi.updateFirewall(rule.id,{...rule,enabled:!rule.enabled})}catch(e){toast.error(errorMessage(e))}finally{await load();busy.value=false;emit('busy-change','');emit('settled')}}
async function remove(){if(!pending.value || locked.value)return;busy.value=true;emit('busy-change','删除防火墙');try{await networkApi.deleteFirewall(pending.value);pending.value=null}catch(e){toast.error(errorMessage(e))}finally{await load();busy.value=false;emit('busy-change','');emit('settled')}}
watch(()=>props.instanceId,()=>{rules.value=[];editing.value=null;pending.value=null;void load()},{immediate:true})
</script>
<template>
  <Card class="animate-in fade-in-0 duration-200"><CardHeader><CardTitle>实例防火墙</CardTitle><CardDescription>优先级越小越先匹配；未匹配的流量放行。运行中即时应用，关机时保存到下次开机。</CardDescription></CardHeader><CardContent class="space-y-4">
    <ErrorAlert :message="error" />
    <form @submit.prevent="save"><fieldset :disabled="locked" class="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <label class="space-y-1 text-sm">方向<select v-model="form.direction" class="block h-10 w-full rounded-md border bg-background px-3"><option value="in">入站</option><option value="out">出站</option></select></label>
      <label class="space-y-1 text-sm">动作<select v-model="form.action" class="block h-10 w-full rounded-md border bg-background px-3"><option value="accept">允许</option><option value="drop">丢弃</option></select></label>
      <label class="space-y-1 text-sm">协议<select v-model="form.protocol" class="block h-10 w-full rounded-md border bg-background px-3" @change="()=>{if(!['tcp','udp'].includes(form.protocol)){form.port_start=0;form.port_end=0}}"><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option><option value="any">全部</option></select></label>
      <label class="space-y-1 text-sm">来源 / 目标 CIDR<Input v-model="form.cidr" placeholder="留空表示任意 IPv4" /></label>
      <label class="space-y-1 text-sm">起始端口（0 为全部）<input v-model.number="form.port_start" type="number" min="0" max="65535" :disabled="!['tcp','udp'].includes(form.protocol)" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">结束端口<input v-model.number="form.port_end" type="number" min="0" max="65535" :disabled="!['tcp','udp'].includes(form.protocol)" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">优先级<input v-model.number="form.priority" type="number" min="0" max="65535" class="block h-10 w-full rounded-md border bg-background px-3" /></label>
      <label class="space-y-1 text-sm">备注<Input v-model="form.remark" /></label>
      <div class="flex items-center gap-3 sm:col-span-3 lg:col-span-4"><label class="flex items-center gap-2 text-sm"><input type="checkbox" v-model="form.enabled" class="size-4 accent-primary" />启用</label><Button type="submit" :disabled="locked">{{editing?'保存规则':'添加规则'}}</Button><Button v-if="editing" variant="ghost" type="button" @click="editing=null; Object.assign(form,initial)">取消编辑</Button></div>
    </fieldset></form>
    <div class="overflow-auto"><table class="w-full text-sm"><thead class="border-b"><tr><th class="p-2 text-left">优先级</th><th class="p-2 text-left">方向 / 动作</th><th class="p-2 text-left">协议 / 端口</th><th class="p-2 text-left">CIDR</th><th class="p-2 text-left">备注</th><th class="p-2 text-right">操作</th></tr></thead><tbody><tr v-for="rule in rules" :key="rule.id" class="border-b transition-colors hover:bg-muted/30" :class="{'opacity-50':!rule.enabled}"><td class="p-2">{{rule.priority}}</td><td class="p-2">{{rule.direction==='in'?'入站':'出站'}} / {{rule.action==='drop'?'丢弃':'允许'}}</td><td class="p-2">{{rule.protocol.toUpperCase()}} · {{rule.port_start?`${rule.port_start}–${rule.port_end}`:'全部'}}</td><td class="p-2 font-mono">{{rule.cidr || '任意 IPv4'}}</td><td class="p-2">{{rule.remark || '—'}}</td><td class="p-2"><div class="flex justify-end gap-2"><Button variant="outline" size="sm" :disabled="locked" @click="editing=rule.id;Object.assign(form,rule)">编辑</Button><Button variant="outline" size="sm" :disabled="locked" @click="toggle(rule)">{{rule.enabled?'停用':'启用'}}</Button><Button variant="destructive" size="sm" :disabled="locked" @click="pending=rule.id">删除</Button></div></td></tr><tr v-if="!rules.length"><td colspan="6" class="p-6 text-center text-muted-foreground">暂未配置规则，允许全部流量。</td></tr></tbody></table></div>
    <ConfirmDialog :busy="locked" :open="!!pending" @update:open="v=>{if(!v)pending=null}" title="删除防火墙规则" description="确认删除此规则？运行中实例的规则会立即更新。" danger @confirm="remove" />
  </CardContent></Card>
</template>
