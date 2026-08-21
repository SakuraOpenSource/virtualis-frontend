<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { siteApi } from '@/lib/endpoints'
import { useSiteStore } from '@/stores/site'
import { errorMessage } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

const router = useRouter()
const site = useSiteStore()
const loading = ref(false)
const error = ref('')
const dbDriver = ref<'sqlite'|'mysql'|'postgres'>('sqlite')
const dbPath = ref('./data/virtualis.db')
const dbHost = ref('127.0.0.1')
const dbPort = ref(3306)
const dbUser = ref('')
const dbPass = ref('')
const dbName = ref('virtualis')
watch(dbDriver, (v) => {
  if (v === 'postgres' && dbPort.value === 3306) dbPort.value = 5432
  if (v === 'mysql' && dbPort.value === 5432) dbPort.value = 3306
})
const siteName = ref('Virtualis')
const siteDesc = ref('')
const adminUser = ref('admin')
const adminEmail = ref('admin@example.com')
const adminPass = ref('')

async function testDb() {
  error.value = ''
  try {
    const cfg: any = { driver: dbDriver.value }
    if (dbDriver.value === 'sqlite') cfg.path = dbPath.value
    else { cfg.host=dbHost.value; cfg.port=dbPort.value; cfg.user=dbUser.value; cfg.password=dbPass.value; cfg.name=dbName.value }
    await siteApi.testDatabase(cfg)
    error.value = ''
    alert('数据库连接成功')
  } catch (e) { error.value = errorMessage(e) }
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const db: any = { driver: dbDriver.value }
    if (dbDriver.value==='sqlite') db.path=dbPath.value
    else { db.host=dbHost.value; db.port=dbPort.value; db.user=dbUser.value; db.password=dbPass.value; db.name=dbName.value }
    await siteApi.install({ database: db, site_name: siteName.value, site_description: siteDesc.value, admin_username: adminUser.value, admin_email: adminEmail.value, admin_password: adminPass.value })
    site.markInstalled(siteName.value, siteDesc.value)
    router.push({ name: 'login' })
  } catch (e) { error.value = errorMessage(e) } finally { loading.value=false }
}
</script>
<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>安装 Virtualis</CardTitle>
        <CardDescription>初始化数据库与管理员账号</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <ErrorAlert :message="error" />
        <div class="space-y-4">
          <h3 class="font-medium">数据库</h3>
          <div class="grid gap-2">
            <Label>驱动</Label>
            <Select :modelValue="dbDriver" @update:modelValue="(v:any) => dbDriver=v as any">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <template v-if="dbDriver==='sqlite'">
            <div class="grid gap-2"><Label>文件路径</Label><Input v-model="dbPath" /></div>
          </template>
          <template v-else>
            <div class="grid grid-cols-2 gap-4">
              <div class="grid gap-2"><Label>主机</Label><Input v-model="dbHost" /></div>
              <div class="grid gap-2"><Label>端口</Label><Input :modelValue="String(dbPort)" @update:modelValue="(v:any)=> dbPort=parseInt(v)||0" /></div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="grid gap-2"><Label>用户</Label><Input v-model="dbUser" /></div>
              <div class="grid gap-2"><Label>密码</Label><Input v-model="dbPass" type="password" /></div>
            </div>
            <div class="grid gap-2"><Label>库名</Label><Input v-model="dbName" /></div>
          </template>
          <Button variant="outline" size="sm" @click="testDb">测试连接</Button>
        </div>

        <div class="space-y-4">
          <h3 class="font-medium">站点</h3>
          <div class="grid gap-2"><Label>站点名称</Label><Input v-model="siteName" /></div>
          <div class="grid gap-2"><Label>站点描述</Label><Textarea v-model="siteDesc" placeholder="可选" /></div>
        </div>

        <div class="space-y-4">
          <h3 class="font-medium">管理员</h3>
          <div class="grid gap-2"><Label>用户名</Label><Input v-model="adminUser" /></div>
          <div class="grid gap-2"><Label>邮箱</Label><Input v-model="adminEmail" /></div>
          <div class="grid gap-2"><Label>密码</Label><Input v-model="adminPass" type="password" /></div>
        </div>

        <Button class="w-full" :disabled="loading" @click="submit">{{ loading ? '安装中...' : '开始安装' }}</Button>
      </CardContent>
    </Card>
  </div>
</template>
