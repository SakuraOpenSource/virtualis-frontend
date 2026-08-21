<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import { errorMessage } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import CaptchaField from '@/components/app/CaptchaField.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const site = useSiteStore()
const identifier = ref('')
const password = ref('')
const captchaCode = ref('')
const captchaId = ref('')
const loading = ref(false)
const error = ref('')

const needCaptcha = computed(() => false)

onMounted(async () => { try { await site.load(true) } catch {} })

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(identifier.value, password.value, captchaId.value ? { captcha_id: captchaId.value, captcha_code: captchaCode.value } : {})
    const redirect = (route.query.redirect as string) || '/admin/instances'
    router.push(redirect)
  } catch (e) { error.value = errorMessage(e) } finally { loading.value=false }
}
</script>
<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>{{ site.siteName }} 管理后台</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <ErrorAlert :message="error" />
        <div class="grid gap-2"><Label>用户名 / 邮箱</Label><Input v-model="identifier" placeholder="admin" /></div>
        <div class="grid gap-2"><Label>密码</Label><Input v-model="password" type="password" /></div>
        <CaptchaField v-if="needCaptcha" v-model="captchaCode" v-model:captchaId="captchaId" />
        <Button class="w-full" :disabled="loading" @click="submit">{{ loading ? '登录中...' : '登录' }}</Button>
      </CardContent>
    </Card>
  </div>
</template>
