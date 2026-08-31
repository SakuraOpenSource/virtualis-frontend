<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi, agentApi, virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import type { VirtualisDriver, VirtualisAgent, HostInterface } from '@/lib/types'

const toast = useToast()
const loading = ref(false)
const saving = ref('')
const error = ref('')

// site
const siteName = ref('')
const siteDesc = ref('')

// virtualis
const vDriver = ref('auto')
const vCpu = ref(2)
const vMem = ref(1024)
const vDisk = ref(20)
const vArch = ref('x86_64')
const vAllowReinstall = ref(true)
const vAutoRefresh = ref(true)
const vDefaultNIC = ref('')
const drivers = ref<VirtualisDriver[]>([])
const agents = ref<VirtualisAgent[]>([])
const selectedAgent = ref('')
const hostIfaces = ref<HostInterface[]>([])
const hostNetworkLoading = ref(false)

const driverNames = ['auto', 'incus', 'qemu']

function driverAvailable(name: string) {
  if (name === 'auto') return drivers.value.some((driver) => driver.available)
  return drivers.value.find((driver) => driver.name === name)?.available === true
}

function driverLabel(name: string) {
  if (!driverAvailable(name)) return `${name}（未安装）`
  return name === 'auto' ? 'auto（自动选择可用）' : name
}

// captcha
const capLogin = ref(false)
const capRegister = ref(false)

async function loadAgentNetwork() {
  hostIfaces.value = []
  if (!selectedAgent.value) return
  hostNetworkLoading.value = true
  try {
    const summary = await agentApi.hostNetwork(Number(selectedAgent.value))
    hostIfaces.value = summary.interfaces ?? []
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    hostNetworkLoading.value = false
  }
}

async function loadAll() {
  loading.value=true
  error.value=''
  try {
    const [site, virt, cap, driverList, agentList] = await Promise.all([adminApi.site(), adminApi.virtualis(), adminApi.captcha(), virtualisApi.drivers(), agentApi.list()])
    siteName.value = site.name
    siteDesc.value = site.description
    vDriver.value = virt.default_driver
    vCpu.value = virt.default_cpu
    vMem.value = virt.default_memory
    vDisk.value = virt.default_disk
    vArch.value = virt.default_arch
    vAllowReinstall.value = virt.allow_reinstall
    vAutoRefresh.value = virt.auto_refresh
    drivers.value = driverList
    agents.value = agentList
    vDefaultNIC.value = virt.default_network_interface || ''
    selectedAgent.value = agentList[0] ? String(agentList[0].id) : ''
    await loadAgentNetwork()
    capLogin.value = cap.login_enabled
    capRegister.value = cap.register_enabled
  } catch (e) { error.value = errorMessage(e) } finally { loading.value=false }
}

async function saveSite() {
  saving.value='site'
  try { await adminApi.updateSite({ name: siteName.value, description: siteDesc.value }); toast.success('站点设置已保存') } catch (e) { toast.error(errorMessage(e)) } finally { saving.value='' }
}
async function saveVirt() {
  saving.value='virt'
  try {
    await adminApi.updateVirtualis({ default_driver: vDriver.value, default_cpu: vCpu.value, default_memory: vMem.value, default_disk: vDisk.value, default_arch: vArch.value, allow_reinstall: vAllowReinstall.value, auto_refresh: vAutoRefresh.value, default_network_interface: vDefaultNIC.value })
    toast.success('虚拟化设置已保存')
  } catch (e) { toast.error(errorMessage(e)) } finally { saving.value='' }
}
async function saveCaptcha() {
  saving.value='captcha'
  try { await adminApi.updateCaptcha({ login_enabled: capLogin.value, register_enabled: capRegister.value }); toast.success('验证码设置已保存') } catch (e) { toast.error(errorMessage(e)) } finally { saving.value='' }
}

onMounted(loadAll)
</script>
<template>
  <div class="space-y-6">
    <PageHeader title="设置" description="系统与虚拟化综合配置" />
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />

    <template v-else>
      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
          <CardDescription>显示在标题栏与登录页的名称</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-2"><Label>站点名称</Label><Input v-model="siteName" /></div>
          <div class="grid gap-2"><Label>站点描述</Label><Textarea v-model="siteDesc" placeholder="可选" /></div>
          <Button size="sm" :disabled="saving==='site'" @click="saveSite">{{ saving==='site' ? '保存中...' : '保存站点' }}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>虚拟化默认</CardTitle>
          <CardDescription>创建实例时的默认规格与驱动</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label>默认驱动</Label>
              <Select v-model="vDriver">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="name in driverNames" :key="name" :value="name" :disabled="!driverAvailable(name)">{{ driverLabel(name) }}</SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">驱动安装在被控节点上，未安装的驱动不可选。</p>
            </div>
            <div class="grid gap-2">
              <Label>默认网卡</Label>
              <Select v-model="vDefaultNIC" :disabled="hostNetworkLoading || !hostIfaces.length">
                <SelectTrigger><SelectValue :placeholder="hostNetworkLoading ? '自动查找中...' : '自动选择'" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">自动选择（推荐）</SelectItem>
                  <SelectItem v-for="iface in hostIfaces" :key="iface.name" :value="iface.name">{{ iface.name }}（{{ iface.kind }}{{ iface.ipv4?.length ? ` · ${iface.ipv4.join(', ')}` : '' }}）</SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">只用于独立 IP 模式；检测节点：{{ agents.find((a) => String(a.id) === selectedAgent)?.display_name || agents.find((a) => String(a.id) === selectedAgent)?.name || '未选择' }}</p>
            </div>
            <div class="grid gap-2">
              <Label>默认架构</Label>
              <Select :modelValue="vArch" @update:modelValue="(v:any)=> vArch=v">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="x86_64">x86_64</SelectItem>
                  <SelectItem value="arm64">arm64</SelectItem>
                  <SelectItem value="aarch64">aarch64</SelectItem>
                  <SelectItem value="amd64">amd64</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="grid gap-2"><Label>默认 CPU</Label><Input :modelValue="String(vCpu)" @update:modelValue="(v:any)=> vCpu=parseInt(v)||1" type="number" /></div>
            <div class="grid gap-2"><Label>默认内存 MB</Label><Input :modelValue="String(vMem)" @update:modelValue="(v:any)=> vMem=parseInt(v)||128" type="number" /></div>
            <div class="grid gap-2"><Label>默认磁盘 GB</Label><Input :modelValue="String(vDisk)" @update:modelValue="(v:any)=> vDisk=parseInt(v)||5" type="number" /></div>
          </div>
          <div class="flex items-center justify-between rounded-md border p-3">
            <div><div class="text-sm font-medium">允许重装</div><div class="text-xs text-muted-foreground">关闭后重装接口将返回禁用</div></div>
            <Switch :checked="vAllowReinstall" @update:checked="(v:boolean)=> vAllowReinstall=v" />
          </div>
          <div class="flex items-center justify-between rounded-md border p-3">
            <div><div class="text-sm font-medium">自动刷新状态</div><div class="text-xs text-muted-foreground">列表页是否定期同步驱动状态</div></div>
            <Switch :checked="vAutoRefresh" @update:checked="(v:boolean)=> vAutoRefresh=v" />
          </div>
          <Button size="sm" :disabled="saving==='virt'" @click="saveVirt">{{ saving==='virt' ? '保存中...' : '保存虚拟化设置' }}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>验证码</CardTitle>
          <CardDescription>登录时是否需要图形验证码</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between rounded-md border p-3">
            <div class="text-sm font-medium">登录验证码</div>
            <Switch :checked="capLogin" @update:checked="(v:boolean)=> capLogin=v" />
          </div>
          <div class="flex items-center justify-between rounded-md border p-3">
            <div class="text-sm font-medium">注册验证码（保留）</div>
            <Switch :checked="capRegister" @update:checked="(v:boolean)=> capRegister=v" />
          </div>
          <Button size="sm" :disabled="saving==='captcha'" @click="saveCaptcha">{{ saving==='captcha' ? '保存中...' : '保存验证码设置' }}</Button>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
