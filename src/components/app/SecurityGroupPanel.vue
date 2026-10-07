<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { securityGroupApi } from '@/lib/endpoints'
import type { InstanceSecurityGroups, SecurityGroup } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import SecurityGroupSelect from './SecurityGroupSelect.vue'
import ErrorAlert from './ErrorAlert.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
const props = defineProps<{ instanceId: number; disabled?: boolean; refreshKey?: number }>()
const emit = defineEmits<{ 'busy-change': [label: string]; settled: []; updated: [binding: InstanceSecurityGroups] }>()
const groups = ref<SecurityGroup[]>([]), selected = ref<number[]>([]), binding = ref<InstanceSecurityGroups | null>(null)
const loading = ref(false), busy = ref(false), error = ref(''), ready = ref(false)
const locked = computed(() => !!props.disabled || loading.value || busy.value || !ready.value)
const choices = computed(() => [...groups.value, ...(binding.value?.groups ?? []).filter(group => !groups.value.some(row => row.id === group.id))])
let request = 0, disposed = false
async function load() {
  const current = ++request, id = props.instanceId
  loading.value = true; ready.value = false; binding.value = null; error.value = ''
  const results = await Promise.allSettled([securityGroupApi.list(), securityGroupApi.binding(id)])
  if (current !== request || disposed) return
  if (results[0].status === 'fulfilled') groups.value = results[0].value
  if (results[1].status === 'fulfilled') {
    binding.value = results[1].value; selected.value = [...(results[1].value.security_group_ids ?? [])]
    emit('updated', results[1].value)
  } else binding.value = null
  const failures = results.filter(result => result.status === 'rejected')
  error.value = failures.map(result => errorMessage(result.reason)).join('；')
  ready.value = !failures.length; loading.value = false
}
async function save() {
  if (locked.value) return
  const id = props.instanceId, current = ++request, ids = [...new Set(selected.value)]
  if (ids.length > 16) { error.value = '每个实例最多绑定 16 个安全组'; return }
  busy.value = true; binding.value = null; error.value = ''; emit('busy-change', '保存安全组')
  try {
    await securityGroupApi.bind(id, ids)
    const fresh = await securityGroupApi.binding(id)
    if (current !== request || disposed) return
    binding.value = fresh; selected.value = [...(fresh.security_group_ids ?? [])]; emit('updated', fresh)
  } catch (e) { if (current === request && !disposed) { error.value = errorMessage(e); ready.value = false; binding.value = null } }
  finally { if (!disposed) { busy.value = false; emit('busy-change', ''); emit('settled') } }
}
watch(() => [props.instanceId, props.refreshKey], () => { binding.value = null; groups.value = []; selected.value = []; void load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++request })
</script>
<template>
  <Card><CardHeader><CardTitle>{{ $t('securityGroups.binding') }}</CardTitle><CardDescription>绑定安全组和本地规则共同执行。显示主控返回的有效结果，不在浏览器猜测合并策略。</CardDescription></CardHeader><CardContent class="space-y-4">
    <ErrorAlert :message="error" />
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">加载安全组中…</p>
    <form @submit.prevent="save" class="space-y-3"><SecurityGroupSelect v-model="selected" :items="choices" :disabled="locked" /><Button type="submit" data-testid="save-binding" :disabled="locked">{{ busy ? '保存中…' : '保存安全组绑定' }}</Button><Button type="button" variant="outline" :disabled="busy || loading || disabled" @click="load">刷新安全组</Button></form>
    <template v-if="binding">
      <div class="rounded border p-3 text-sm"><h3 class="font-medium">已绑定安全组</h3><p>{{ binding.groups?.map(group => group.name).join('、') || '未绑定' }}</p></div>
      <div data-testid="effective-policy" class="rounded border p-3 text-sm"><h3 class="font-medium">有效默认策略</h3><p v-if="binding.firewall_policy">入站：{{ binding.firewall_policy.ingress === 'drop' ? '丢弃' : '允许' }} / 出站：{{ binding.firewall_policy.egress === 'drop' ? '丢弃' : '允许' }}</p><p v-else>未设置策略，保留旧版实例防火墙语义（无隐式丢弃）。</p></div>
      <div data-testid="effective-rules" class="overflow-auto"><h3 class="mb-2 text-sm font-medium">有效规则（本地 + 安全组）</h3><table class="w-full text-sm"><thead><tr class="border-b text-left"><th class="p-2">优先级</th><th class="p-2">方向 / 动作</th><th class="p-2">协议 / 端口</th><th class="p-2">CIDR / 备注</th></tr></thead><tbody><tr v-for="(rule, index) in binding.effective_rules" :key="index" class="border-b"><td class="p-2">{{ rule.priority }}</td><td class="p-2">{{ rule.direction === 'in' ? '入站' : '出站' }} / {{ rule.action === 'drop' ? '丢弃' : '允许' }}</td><td class="p-2">{{ rule.protocol.toUpperCase() }} / {{ rule.port_start ? `${rule.port_start}–${rule.port_end}` : '全部' }}</td><td class="p-2">{{ rule.cidr || '任意 IPv4' }} · {{ rule.remark || '—' }}</td></tr></tbody></table><p v-if="!binding.effective_rules?.length" class="text-sm text-muted-foreground">暂无有效规则；未匹配流量遵循上述默认策略。</p></div>
    </template>
    <p v-else-if="!loading" class="text-sm text-muted-foreground">有效防火墙状态未确认，请刷新后再操作。</p>
  </CardContent></Card>
</template>
