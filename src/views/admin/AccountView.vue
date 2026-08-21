<script setup lang="ts">
import { ref } from 'vue'
import { authApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/app/PageHeader.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const toast = useToast()
const auth = useAuthStore()
const error = ref('')

const email = ref(auth.user?.email ?? '')
const emailPwd = ref('')
const savingEmail = ref(false)

const oldPwd = ref('')
const newPwd = ref('')
const savingPwd = ref(false)

async function saveEmail() {
  if (!email.value.trim() || !emailPwd.value) { toast.error('请填写邮箱与当前密码'); return }
  savingEmail.value=true; error.value=''
  try {
    const u = await authApi.updateEmail(emailPwd.value, email.value.trim())
    auth.setUser(u)
    toast.success('邮箱已更新')
    emailPwd.value=''
  } catch (e) { error.value=errorMessage(e); toast.error(error.value) } finally { savingEmail.value=false }
}

async function savePwd() {
  if (!oldPwd.value || !newPwd.value) { toast.error('请填写密码'); return }
  savingPwd.value=true; error.value=''
  try { await authApi.updatePassword(oldPwd.value, newPwd.value); toast.success('密码已更新'); oldPwd.value=''; newPwd.value='' } catch (e) { error.value=errorMessage(e); toast.error(error.value) } finally { savingPwd.value=false }
}
</script>
<template>
  <div class="space-y-6">
    <PageHeader title="账号" description="管理员账号设置" />
    <ErrorAlert :message="error" />
    <Card>
      <CardHeader>
        <CardTitle>当前账号</CardTitle>
        <CardDescription>{{ auth.user?.username }} · {{ auth.user?.role }}</CardDescription>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader><CardTitle>修改邮箱</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-2"><Label>新邮箱</Label><Input v-model="email" /></div>
        <div class="grid gap-2"><Label>当前密码（验证身份）</Label><Input v-model="emailPwd" type="password" /></div>
        <Button size="sm" :disabled="savingEmail" @click="saveEmail">{{ savingEmail ? '保存中...' : '保存邮箱' }}</Button>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>修改密码</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-2"><Label>当前密码</Label><Input v-model="oldPwd" type="password" /></div>
        <div class="grid gap-2"><Label>新密码</Label><Input v-model="newPwd" type="password" /></div>
        <Button size="sm" :disabled="savingPwd" @click="savePwd">{{ savingPwd ? '保存中...' : '更新密码' }}</Button>
      </CardContent>
    </Card>
  </div>
</template>
