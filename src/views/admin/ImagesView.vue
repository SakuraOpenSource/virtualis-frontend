<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { VirtualisImage } from '@/lib/types'
import PageHeader from '@/components/app/PageHeader.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import ErrorAlert from '@/components/app/ErrorAlert.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatDateTime, formatBytes } from '@/lib/utils'

const toast = useToast()
const loading = ref(false)
const error = ref('')
const images = ref<VirtualisImage[]>([])
const show = ref(false)
const creating = ref(false)
const formName = ref('')
const formDriver = ref('qemu')
const formType = ref<'disk' | 'iso'>('disk')
const formArch = ref('')
const formOsType = ref('')
const formOsVersion = ref('')
const fileRef = ref<File | null>(null)

const qemuPresets = [
  { name: 'Debian-12.0_x64', display_name: 'Debian 12 (bookworm)', os_type: 'debian', os_version: '12', arch: 'x86_64' },
  { name: 'Debian-11.1-x64', display_name: 'Debian 11 (bullseye)', os_type: 'debian', os_version: '11', arch: 'x86_64' },
  { name: 'Debian-10.3.3-x64', display_name: 'Debian 10 (buster)', os_type: 'debian', os_version: '10', arch: 'x86_64' },
  { name: 'Ubuntu-24.04.1-x64', display_name: 'Ubuntu 24.04 LTS', os_type: 'ubuntu', os_version: '24.04', arch: 'x86_64' },
  { name: 'Ubuntu-22.04-x64', display_name: 'Ubuntu 22.04 LTS', os_type: 'ubuntu', os_version: '22.04', arch: 'x86_64' },
  { name: 'Ubuntu-20.04.1-x64', display_name: 'Ubuntu 20.04 LTS', os_type: 'ubuntu', os_version: '20.04', arch: 'x86_64' },
  { name: 'Ubuntu-18.04-x64', display_name: 'Ubuntu 18.04 LTS', os_type: 'ubuntu', os_version: '18.04', arch: 'x86_64' },
  { name: 'CentOS-9-Stream-x64', display_name: 'CentOS Stream 9', os_type: 'centos', os_version: '9', arch: 'x86_64' },
  { name: 'AlmaLinux-9.2-x64', display_name: 'AlmaLinux 9.2', os_type: 'almalinux', os_version: '9.2', arch: 'x86_64' },
  { name: 'openEuler-24.03-LTS', display_name: 'openEuler 24.03 LTS', os_type: 'openeuler', os_version: '24.03', arch: 'x86_64' },
].map(it => ({ ...it, url: `https://mirror.cloud.idcsmart.com/cloud/images/init-images/${it.name}.qcow2` }))

const nextLevel = computed(() => incusLevels.value.find(l => l.next)?.key || '')

const driverOptions = [
  { value: 'qemu', label: 'qemu' },
  { value: 'incus', label: 'incus' },
]

const typeOptions: Array<{ value: 'disk' | 'iso'; label: string; desc: string }> = [
  { value: 'disk', label: '磁盘镜像', desc: 'qcow2 / raw / tar.gz 等' },
  { value: 'iso', label: 'ISO 镜像', desc: '用于安装或光驱挂载' },
]

const canSubmit = computed(() => !!fileRef.value && !!formDriver.value)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  fileRef.value = input.files?.[0] ?? null
  if (fileRef.value && !formName.value.trim()) {
    formName.value = fileRef.value.name.replace(/\.[^.]+$/, '')
  }
  if (fileRef.value && fileRef.value.name.toLowerCase().endsWith('.iso')) {
    formType.value = 'iso'
  }
}

async function load() {
  loading.value=true; error.value=''
  try { images.value = await virtualisApi.images() } catch (e) { error.value=errorMessage(e) } finally { loading.value=false }
}

async function upload() {
  if (!fileRef.value) { toast.error('请选择镜像文件'); return }
  if (!formDriver.value) { toast.error('请选择驱动'); return }
  if (formType.value === 'iso' && formDriver.value === 'incus') {
    toast.error('容器不支持 ISO 镜像，请选择磁盘镜像或切换驱动')
    return
  }
  creating.value=true
  try {
    await virtualisApi.uploadImage(fileRef.value, {
      name: formName.value.trim() || undefined as any,
      driver: formDriver.value,
      type: formType.value,
      arch: formArch.value.trim() || undefined as any,
      os_type: formOsType.value.trim() || undefined as any,
      os_version: formOsVersion.value.trim() || undefined as any,
    })
    toast.success('镜像上传成功（已存放在主控，创建实例时会自动分发到被控）')
    show.value=false
    formName.value=''; formArch.value=''; formOsType.value=''; formOsVersion.value=''; fileRef.value=null
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function del(id: number) {
  if (!confirm('确认删除该镜像？被实例引用时无法删除。')) return
  try { await virtualisApi.deleteImage(id); toast.success('已删除'); await load() } catch (e) { toast.error(errorMessage(e)) }
}

// ===== 镜像下载（预设源）=====
const showDownload = ref(false)
const downloading = ref(false)
const dlDriver = ref('qemu')
const dlUrl = ref('')
const dlName = ref('')
const dlExtraUrl = ref('')
// Incus 逐级浏览：distro → release → arch → variant → 构建
const dlDistro = ref('')
const dlRelease = ref('')
const dlArch = ref('')
const dlVariant = ref('')
const dlItems = ref<Array<{ name: string; display_name?: string; url?: string; extra_url?: string; os_type?: string; os_version?: string; arch?: string; note?: string }>>([])
const dlBrowsing = ref(false)

const incusLevels = computed(() => [
  { key: 'distro', value: dlDistro.value, label: '发行版', next: !dlDistro.value },
  { key: 'release', value: dlRelease.value, label: '版本', next: !!dlDistro.value && !dlRelease.value },
  { key: 'arch', value: dlArch.value, label: '架构', next: !!dlRelease.value && !dlArch.value },
  { key: 'variant', value: dlVariant.value, label: '变体', next: !!dlArch.value && !dlVariant.value },
] as Array<{ key: string; value: string; label: string; next: boolean }>)

async function browseIncus(level: string, value: string) {
  if (level === 'distro') { dlDistro.value = value; dlRelease.value = ''; dlArch.value = ''; dlVariant.value = '' }
  if (level === 'release') { dlRelease.value = value; dlArch.value = ''; dlVariant.value = '' }
  if (level === 'arch') { dlArch.value = value; dlVariant.value = '' }
  if (level === 'variant') { dlVariant.value = value }
  dlBrowsing.value = true
  dlItems.value = []
  try {
    const data = await virtualisApi.imagePresets({
      driver: 'incus',
      distro: dlDistro.value || undefined,
      release: dlRelease.value || undefined,
      arch: dlArch.value || undefined,
      variant: dlVariant.value || undefined,
    })
    dlItems.value = data.items ?? []
  } catch (e) { toast.error(errorMessage(e)) } finally { dlBrowsing.value = false }
}

function resetDownload() {
  dlDriver.value = 'qemu'; dlUrl.value = ''; dlName.value = ''; dlExtraUrl.value = ''
  dlDistro.value = ''; dlRelease.value = ''; dlArch.value = ''; dlVariant.value = ''; dlItems.value = []
}

async function downloadPreset(item: { name?: string; url?: string; extra_url?: string; os_type?: string; os_version?: string; arch?: string }) {
  if (!item.url || !item.name) return
  downloading.value = true
  try {
    await virtualisApi.downloadImage({
      name: item.name, driver: dlDriver.value, type: 'disk', url: item.url,
      extra_url: item.extra_url || undefined,
      os_type: item.os_type || undefined, os_version: item.os_version || undefined, arch: item.arch || undefined,
    })
    toast.success('已开始后台下载，状态可在列表中查看（downloading → available）')
    showDownload.value = false
    resetDownload()
    await load()
    scheduleRefresh()
  } catch (e) { toast.error(errorMessage(e)) } finally { downloading.value = false }
}

async function downloadCustom() {
  if (!dlUrl.value.trim().startsWith('http')) { toast.error('请填写有效的下载地址'); return }
  if (!dlName.value.trim()) { toast.error('请填写镜像名称'); return }
  downloading.value = true
  try {
    await virtualisApi.downloadImage({
      name: dlName.value.trim(), driver: dlDriver.value,
      type: dlUrl.value.trim().toLowerCase().endsWith('.iso') ? 'iso' : 'disk',
      url: dlUrl.value.trim(), extra_url: dlExtraUrl.value.trim() || undefined,
    })
    toast.success('已开始后台下载')
    showDownload.value = false
    resetDownload()
    await load()
    scheduleRefresh()
  } catch (e) { toast.error(errorMessage(e)) } finally { downloading.value = false }
}

// 有 downloading/error 状态的镜像时每 5 秒刷新一次列表。
let refreshTimer: number | null = null
function scheduleRefresh() {
  if (refreshTimer !== null) return
  refreshTimer = window.setInterval(async () => {
    if (!images.value.some(i => i.status === 'downloading')) {
      if (refreshTimer !== null) { clearInterval(refreshTimer); refreshTimer = null }
      return
    }
    try { await load() } catch {}
  }, 5000)
}

onMounted(() => {
  load()
  scheduleRefresh()
})
</script>
<template>
  <div>
    <PageHeader title="镜像" description="上传到主控的镜像文件会在创建实例时分发到目标被控节点" />
    <div class="flex justify-end mb-4 gap-2">
      <Button variant="outline" @click="showDownload = true; resetDownload()">下载镜像</Button>
      <Button @click="show=true">上传镜像</Button>
    </div>
    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-auto">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30">
            <tr>
              <th class="h-10 px-4 text-left font-medium">ID</th>
              <th class="h-10 px-4 text-left font-medium">名称</th>
              <th class="h-10 px-4 text-left font-medium">类型</th>
              <th class="h-10 px-4 text-left font-medium">驱动</th>
              <th class="h-10 px-4 text-left font-medium">文件</th>
              <th class="h-10 px-4 text-left font-medium">大小</th>
              <th class="h-10 px-4 text-left font-medium">状态</th>
              <th class="h-10 px-4 text-left font-medium">创建时间</th>
              <th class="h-10 px-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="img in images" :key="img.id" class="border-b hover:bg-muted/20">
              <td class="px-4 py-2">{{ img.id }}</td>
              <td class="px-4 py-2 font-medium">{{ img.name }}<div v-if="img.display_name" class="text-xs text-muted-foreground">{{ img.display_name }}</div></td>
              <td class="px-4 py-2"><Badge :variant="img.type==='iso'?'secondary':'outline'">{{ img.type === 'iso' ? 'ISO' : '磁盘' }}</Badge></td>
              <td class="px-4 py-2"><Badge variant="outline">{{ img.driver }}</Badge></td>
              <td class="px-4 py-2 max-w-[220px] truncate" :title="img.original_name || img.file_path">{{ img.original_name || img.file_path }}</td>
              <td class="px-4 py-2">{{ img.size_bytes ? formatBytes(img.size_bytes) : '-' }}</td>
              <td class="px-4 py-2"><Badge>{{ img.status }}</Badge></td>
              <td class="px-4 py-2 text-muted-foreground">{{ formatDateTime(img.created_at) }}</td>
              <td class="px-4 py-2 text-right"><div class="flex justify-end gap-2"><a :href="virtualisApi.imageDownloadUrl(img.id)" class="text-xs underline">下载</a><Button variant="destructive" size="sm" @click="del(img.id)">删除</Button></div></td>
            </tr>
            <tr v-if="images.length===0"><td colspan="9" class="text-center py-8 text-muted-foreground">暂无镜像，请点击“上传镜像”添加（支持任意驱动与 ISO）</td></tr>
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>

    <Dialog :open="show" @update:open="(v:boolean)=> show=v">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>上传镜像</DialogTitle>
          <DialogDescription>选择镜像文件、目标驱动和类型，文件会保存在主控并在需要时同步到被控</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>镜像文件 *</Label><Input type="file" @change="onFile" accept=".iso,.qcow2,.img,.raw,.tar.gz,.gz,.zip,.vmdk,.vdi" /></div>
          <div class="grid gap-2"><Label>名称</Label><Input v-model="formName" placeholder="ubuntu-22.04（可选，默认取文件名）" /></div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label>驱动 *</Label>
              <Select v-model="formDriver">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in driverOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <Label>类型 *</Label>
              <Select v-model="formType as any">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}（{{ opt.desc }}）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="grid gap-2"><Label>架构</Label><Input v-model="formArch" placeholder="x86_64 / arm64" /></div>
            <div class="grid gap-2"><Label>系统</Label><Input v-model="formOsType" placeholder="ubuntu" /></div>
            <div class="grid gap-2"><Label>版本</Label><Input v-model="formOsVersion" placeholder="22.04" /></div>
          </div>
          <p class="text-xs text-muted-foreground">ISO 仅可配合 qemu / incus 使用；选择磁盘镜像时可用于任意驱动。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="show=false">取消</Button>
          <Button :disabled="creating || !canSubmit" @click="upload">{{ creating ? '上传中...' : '上传' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="showDownload" @update:open="(v:boolean)=> showDownload=v">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>下载镜像</DialogTitle>
          <DialogDescription>从预设源或自定义 URL 下载镜像到主控；QEMU 预设来自魔方云官方镜像站，Incus 预设来自清华大学 LXC 镜像源</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2">
            <Label>驱动 *</Label>
            <Select v-model="dlDriver" @update:model-value="resetDownload()">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qemu">qemu（魔方云预设）</SelectItem>
                <SelectItem value="incus">incus（清华源）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="dlDriver === 'qemu'">
            <div class="rounded-md border">
              <div class="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">魔方云官方 qcow2 镜像（点击下载）</div>
              <div class="max-h-56 overflow-y-auto p-1">
                <button v-for="item in qemuPresets" :key="item.name" class="flex w-full items-center justify-between rounded px-3 py-1.5 text-sm hover:bg-muted" :disabled="downloading" @click="downloadPreset(item)">
                  <span>{{ item.display_name }}</span>
                  <span class="text-xs text-muted-foreground">{{ item.name }}.qcow2</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="flex flex-wrap gap-2 text-xs">
              <template v-for="lv in incusLevels" :key="lv.key">
                <Badge v-if="lv.value" variant="outline">{{ lv.label }}: {{ lv.value }}</Badge>
              </template>
            </div>
            <div class="rounded-md border">
              <div class="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {{ dlVariant ? '找到最新构建，选择要下载的镜像' : incusLevels.find(l => l.next) ? '选择' + incusLevels.find(l => l.next)?.label : '加载中…' }}
              </div>
              <div class="max-h-56 overflow-y-auto p-1">
                <p v-if="dlBrowsing" class="px-3 py-2 text-sm text-muted-foreground">加载中…</p>
                <template v-else>
                  <button v-for="item in dlItems" :key="item.name" class="flex w-full items-center justify-between rounded px-3 py-1.5 text-sm hover:bg-muted" :disabled="downloading" @click="!dlVariant ? browseIncus(nextLevel, item.name) : downloadPreset(item)">
                    <span>{{ item.display_name || item.name }}</span>
                    <span v-if="item.note" class="text-xs text-muted-foreground">{{ item.note }}</span>
                  </button>
                  <p v-if="!dlBrowsing && dlItems.length === 0" class="px-3 py-2 text-sm text-muted-foreground">暂无可选项</p>
                </template>
              </div>
            </div>
            <p v-if="dlDistro" class="text-xs text-muted-foreground">
              已选：{{ [dlDistro, dlRelease, dlArch, dlVariant].filter(Boolean).join(' / ') }}
              <button class="underline ml-2" @click="resetDownload(); dlDriver='incus'">重新选择</button>
            </p>
          </template>

          <div class="space-y-2 border-t pt-4">
            <p class="text-sm font-medium">自定义 URL</p>
            <div class="grid gap-2"><Label>镜像地址</Label><Input v-model="dlUrl" placeholder="https://... /path.qcow2 或 rootfs.tar.xz" /></div>
            <div class="grid gap-2" v-if="dlDriver === 'incus'"><Label>元数据地址（incus.tar.xz，分割镜像需要）</Label><Input v-model="dlExtraUrl" placeholder="https://.../incus.tar.xz" /></div>
            <div class="grid gap-2"><Label>名称</Label><Input v-model="dlName" placeholder="my-image" /></div>
            <Button class="w-full" :disabled="downloading" @click="downloadCustom">{{ downloading ? '提交中...' : '下载' }}</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showDownload=false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
