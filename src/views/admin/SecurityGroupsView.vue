<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { securityGroupApi } from '@/lib/endpoints'
import type { SecurityGroup, SecurityGroupInput } from '@/lib/types'
import { errorMessage } from '@/lib/api'
import PageHeader from '@/components/app/PageHeader.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import FirewallPanel from '@/components/app/FirewallPanel.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const groups = ref<SecurityGroup[]>([]), loading = ref(false), busy = ref(false), error = ref(''), showForm = ref(false)
const defaults: SecurityGroupInput = { name: '', description: '', ingress_policy: 'drop', egress_policy: 'accept' }
const form = reactive({ ...defaults })
const editing = ref<number | null>(null), pending = ref<number | null>(null)
const rulesGroup = ref<number | null>(null)
let request = 0
async function load() {
  const current = ++request; loading.value = true; error.value = ''
  try { const rows = await securityGroupApi.list(); if (current === request) groups.value = rows }
  catch (e) { if (current === request) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}
function newGroup() { editing.value = null; Object.assign(form, defaults); showForm.value = true; error.value = '' }
function edit(group: SecurityGroup) {
  editing.value = group.id
  Object.assign(form, { name: group.name, description: group.description, ingress_policy: group.ingress_policy, egress_policy: group.egress_policy })
  showForm.value = true; error.value = ''
}
async function remove() {
  if (busy.value || pending.value === null) return
  busy.value = true; error.value = ''
  try { await securityGroupApi.remove(pending.value); pending.value = null; await load() }
  catch (e) { error.value = errorMessage(e) }
  finally { busy.value = false }
}
async function save() {
  if (busy.value || !form.name.trim()) return
  busy.value = true; error.value = ''
  try {
    const payload = { ...form, name: form.name.trim() }
    if (editing.value !== null) await securityGroupApi.update(editing.value, payload)
    else await securityGroupApi.create(payload)
    showForm.value = false; await load()
  }
  catch (e) { error.value = errorMessage(e) }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <div class="space-y-4">
    <PageHeader :title="$t('securityGroups.title')" description="复用规则与默认策略；修改将应用于所有绑定实例。"><template #actions><Button data-testid="new-group" :disabled="busy || loading" @click="newGroup">新建安全组</Button><Button variant="outline" :disabled="busy || loading" @click="load">刷新</Button></template></PageHeader>
    <ErrorAlert :message="error" />
    <Card v-if="showForm"><CardContent class="p-4"><form data-testid="group-form" @submit.prevent="save"><fieldset :disabled="busy" class="grid gap-3 sm:grid-cols-2">
      <label class="text-sm">名称<input v-model="form.name" name="group-name" required maxlength="128" class="block h-10 w-full rounded border bg-background px-3" /></label>
      <label class="text-sm">描述<input v-model="form.description" name="group-description" maxlength="1024" class="block h-10 w-full rounded border bg-background px-3" /></label>
      <label class="text-sm">入站默认策略<select v-model="form.ingress_policy" name="ingress-policy" class="block h-10 w-full rounded border bg-background px-3"><option value="drop">丢弃</option><option value="accept">允许</option></select></label>
      <label class="text-sm">出站默认策略<select v-model="form.egress_policy" name="egress-policy" class="block h-10 w-full rounded border bg-background px-3"><option value="accept">允许</option><option value="drop">丢弃</option></select></label>
      <div class="flex gap-2"><Button type="submit" :disabled="busy || !form.name.trim()">{{ busy ? '保存中…' : '保存安全组' }}</Button><Button type="button" variant="outline" :disabled="busy" @click="showForm = false">取消</Button></div>
    </fieldset></form></CardContent></Card>
    <LoadingBlock v-if="loading" />
    <Card v-else><CardContent data-testid="group-list" class="p-4 space-y-3"><div v-for="group in groups" :key="group.id" class="rounded border p-3 text-sm"><strong>{{ group.name }}</strong> · {{ group.description }}<p>入站：{{ group.ingress_policy === 'drop' ? '丢弃' : '允许' }} / 出站：{{ group.egress_policy === 'drop' ? '丢弃' : '允许' }}</p><div class="mt-3 flex gap-2"><Button :data-testid="`edit-group-${group.id}`" variant="outline" size="sm" :disabled="busy" @click="edit(group)">编辑</Button><Button :data-testid="`rules-group-${group.id}`" variant="outline" size="sm" :disabled="busy" @click="rulesGroup = group.id">管理规则</Button><Button :data-testid="`delete-group-${group.id}`" variant="destructive" size="sm" :disabled="busy" @click="pending = group.id">删除</Button></div></div><p v-if="!groups.length" class="text-muted-foreground">暂无安全组</p></CardContent></Card>
    <div v-if="rulesGroup !== null" class="space-y-3"><h2 class="font-medium">{{ groups.find(group => group.id === rulesGroup)?.name }} · 规则管理</h2><Button variant="ghost" :disabled="busy" @click="rulesGroup = null">关闭规则管理</Button><FirewallPanel :key="rulesGroup" :instance-id="0" :security-group-id="rulesGroup" :disabled="busy" @busy-change="busy = !!$event" @settled="load" /></div>
    <ConfirmDialog :open="pending !== null" :busy="busy" title="删除安全组" description="已绑定实例的安全组不能删除。确认删除？" danger @update:open="v => { if (!v && !busy) pending = null }" @confirm="remove" />
  </div>
</template>
