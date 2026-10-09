<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiKeyApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { APIKey, APIScope } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const key = ref<APIKey | null>(null)
const createdSecret = ref('')
const confirmRevokeOpen = ref(false)
const active = computed(() => key.value?.status === 'active')

// PLG-F03: creation may request scopes and an expiry instead of always
// receiving every permission forever. The catalog comes from the list
// response; when the backend does not provide it the controls degrade to the
// legacy single site-key flow so both contract generations keep working.
const scopeCatalog = ref<APIScope[]>([])
const scopesEditable = computed(() => scopeCatalog.value.length > 0)
const SCOPE_LABELS: Record<string, string> = {
  'instance:read': '实例只读',
  'instance:write': '实例读写',
  'image:read': '镜像只读',
  'image:write': '镜像读写',
}
const form = ref<{ name: string; scopes: APIScope[]; expires_in_days: string }>({ name: '', scopes: [], expires_in_days: '' })
const expiryValid = computed(() => { const n = Number(form.value.expires_in_days); return form.value.expires_in_days === '' || (Number.isInteger(n) && n >= 1 && n <= 3650) })

function toggleScope(scope: APIScope) {
  const at = form.value.scopes.indexOf(scope)
  if (at >= 0) form.value.scopes.splice(at, 1)
  else form.value.scopes.push(scope)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    // Read-only: the list no longer mutates or revokes anything (PLG-F03).
    const data = await apiKeyApi.list()
    key.value = data.items?.[0] ?? null
    if (data.scopes?.length) scopeCatalog.value = data.scopes
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!expiryValid.value) return
  creating.value = true
  try {
    const days = Number(form.value.expires_in_days)
    const payload = {
      // Only send scope/expiry fields the backend contract supports; a legacy
      // backend ignores them, so the request stays wire-compatible.
      ...(scopesEditable.value ? { scopes: form.value.scopes.length ? form.value.scopes : scopeCatalog.value } : {}),
      ...(scopesEditable.value && form.value.expires_in_days !== '' ? { expires_in_days: days } : {}),
    }
    const result = await apiKeyApi.create(payload)
    key.value = result.key
    createdSecret.value = result.secret
    toast.success('API 密钥已生成，请立即保存明文')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

function revoke() {
  if (!key.value) return
  confirmRevokeOpen.value = true
}

async function doRevoke() {
  if (!key.value) return
  confirmRevokeOpen.value = false
  try {
    await apiKeyApi.revoke(key.value.id)
    toast.success('API 密钥已吊销')
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

function scopeText(row: APIKey) {
  // Legacy rows may carry null scopes; render what is actually granted.
  if (!row.scopes?.length) return '未返回权限信息'
  return row.scopes.map(s => SCOPE_LABELS[s] ?? s).join('、')
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="API 密钥" description="调用实例与镜像开放接口的凭据；明文仅在生成时显示一次。">
      <template #actions>
        <Button :disabled="active || creating" @click="create">{{ creating ? '生成中...' : active ? '已生成' : key ? '重新生成' : '生成密钥' }}</Button>
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

    <!-- Create form: scopes/expiry controls render only when the backend
         advertises its scope catalog; otherwise fall back to the legacy
         all-permissions site key without lying about what was granted. -->
    <Card v-if="!active">
      <CardContent class="space-y-4 p-6">
        <template v-if="scopesEditable">
          <div class="space-y-2">
            <Label>权限范围</Label>
            <div class="flex flex-wrap gap-2">
              <label v-for="scope in scopeCatalog" :key="scope" class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" :checked="form.scopes.includes(scope)" @change="toggleScope(scope)" />
                {{ SCOPE_LABELS[scope] ?? scope }}
              </label>
            </div>
            <p class="text-xs text-muted-foreground">不勾选任何项时按后端默认授权；实际生效范围以生成结果为准。</p>
          </div>
          <div class="grid gap-1">
            <Label>有效期（天，留空为永久）</Label>
            <Input v-model="form.expires_in_days" inputmode="numeric" placeholder="30" />
            <p v-if="!expiryValid" class="text-xs text-destructive">有效期为 1–3650 的整数天数。</p>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">当前后端使用全站单密钥模式：生成的密钥自动拥有实例与镜像的全部权限且永不过期。</p>
      </CardContent>
    </Card>

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
                <th class="h-10 px-4 text-left font-medium">过期时间</th>
                <th class="h-10 px-4 text-left font-medium">最后使用</th>
                <th class="h-10 px-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="key" class="border-b">
                <td class="px-4 py-3 font-medium">{{ key.name }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ key.prefix }}</td>
                <td class="px-4 py-3">{{ scopeText(key) }}</td>
                <td class="px-4 py-3"><Badge :variant="key.status === 'active' ? 'default' : 'destructive' as any">{{ key.status === 'active' ? '有效' : '已吊销' }}</Badge></td>
                <td class="px-4 py-3 text-muted-foreground">{{ key.expires_at ? formatDateTime(key.expires_at) : '永久' }}</td>
                <td class="px-4 py-3 text-muted-foreground">{{ formatDateTime(key.last_used_at) }}</td>
                <td class="px-4 py-3 text-right"><Button v-if="key.status === 'active'" variant="destructive" size="sm" @click="revoke">吊销</Button></td>
              </tr>
              <tr v-else><td colspan="7" class="py-10 text-center text-muted-foreground">尚未生成 API 密钥</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <ConfirmDialog :open="confirmRevokeOpen" @update:open="(v:boolean)=> confirmRevokeOpen=v" :title="$t('confirm.revokeApiKeyTitle')" :description="$t('confirm.revokeApiKeyDesc')" danger @confirm="doRevoke" />
  </div>
</template>
