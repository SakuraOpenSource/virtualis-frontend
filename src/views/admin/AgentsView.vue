<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Copy, Plus, Trash2, Check, Download } from 'lucide-vue-next'

import ErrorAlert from '@/components/app/ErrorAlert.vue'
import LoadingBlock from '@/components/app/LoadingBlock.vue'
import PageHeader from '@/components/app/PageHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/lib/api'
import { agentApi } from '@/lib/endpoints'
import type { AgentDownload, VirtualisAgent } from '@/lib/types'

const toast = useToast()
const items = ref<VirtualisAgent[]>([])
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const creating = ref(false)
const formName = ref('')
const joinCmd = ref('')
const curlCmd = ref('')
const downloads = ref<AgentDownload[]>([])
const copied = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await agentApi.list()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!formName.value.trim()) {
    toast.error('请输入节点名称')
    return
  }
  creating.value = true
  try {
    const data = await agentApi.create({ name: formName.value.trim() })
    joinCmd.value = data.join_cmd
    curlCmd.value = data.curl_cmd
    downloads.value = data.downloads ?? []
    showCreate.value = true
    toast.success('被控已创建，请下载对应平台安装包并接入')
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    creating.value = false
  }
}

async function remove(id: number) {
  if (!confirm('确认删除该被控？删除后它的 token 将立即失效。')) return
  try {
    await agentApi.remove(id)
    toast.success('已删除')
    await load()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
    toast.success('已复制')
    setTimeout(() => copied.value = false, 1500)
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

function platformName(item: AgentDownload) {
  const names: Record<string, string> = { linux: 'Linux', darwin: 'macOS', windows: 'Windows' }
  return `${names[item.os] ?? item.os} / ${item.arch}`
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="被控节点" description="实例只会在已接入的被控节点上创建和运行，主控不执行虚拟化命令。">
      <template #actions><Button @click="showCreate=true"><Plus />添加被控</Button></template>
    </PageHeader>

    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />
    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead><TableHead>地址</TableHead><TableHead>驱动</TableHead><TableHead>平台</TableHead><TableHead>状态</TableHead><TableHead>版本</TableHead><TableHead class="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableEmpty v-if="!items.length" :colspan="7">暂无被控，请点击“添加被控”获取安装包和接入指令</TableEmpty>
              <TableRow v-for="it in items" :key="it.id">
                <TableCell class="font-medium">{{ it.display_name || it.name }}</TableCell>
                <TableCell class="font-mono text-xs">{{ it.endpoint || it.ip || '等待接入' }}</TableCell>
                <TableCell><div class="flex flex-wrap gap-1"><Badge v-for="driver in (it.drivers ?? [])" :key="driver" variant="outline">{{ driver }}</Badge><span v-if="!it.drivers?.length" class="text-muted-foreground">-</span></div></TableCell>
                <TableCell>{{ it.os || '-' }} / {{ it.arch || '-' }}</TableCell>
                <TableCell><Badge :variant="it.status==='online'?'default':it.status==='offline'?'secondary':'outline'">{{ it.status }}</Badge></TableCell>
                <TableCell class="text-muted-foreground text-xs">{{ it.version || '-' }}</TableCell>
                <TableCell class="text-right"><Button variant="destructive" size="sm" @click="remove(it.id)"><Trash2 />删除</Button></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Dialog :open="showCreate" @update:open="(v:boolean)=> showCreate=v">
      <DialogContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle>添加被控</DialogTitle>
          <DialogDescription>安装包由主控直接提供。将对应平台的包下载到被控后，用下面的接入命令启动。</DialogDescription>
        </DialogHeader>
        <div class="space-y-5">
          <div class="grid gap-2"><Label>被控名称</Label><Input v-model="formName" placeholder="node-01" /></div>
          <Button :disabled="creating" @click="create">{{ creating ? '生成中...' : '生成接入信息' }}</Button>

          <div v-if="downloads.length" class="rounded-md border p-4">
            <div class="mb-3 text-sm font-medium">从主控下载被控安装包</div>
            <div class="grid gap-2 sm:grid-cols-2">
              <a v-for="item in downloads" :key="`${item.os}-${item.arch}`" :href="item.url" class="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-muted/50" download>
                <span>{{ platformName(item) }}</span><Download class="h-4 w-4" />
              </a>
            </div>
            <p class="mt-3 text-xs text-muted-foreground">这些文件由主控构建目录中的 agent-packages 提供，下载地址不会跳转到第三方站点。</p>
          </div>

          <div v-if="joinCmd" class="space-y-3">
            <div class="space-y-2">
              <Label>直接启动已下载的被控</Label>
              <div class="flex gap-2"><Input :modelValue="joinCmd" readonly class="font-mono text-xs" /><Button variant="outline" size="sm" @click="copyText(joinCmd)"><Copy v-if="!copied" /><Check v-else />复制</Button></div>
            </div>
            <div class="space-y-2">
              <Label>Linux/macOS 一键下载并接入</Label>
              <div class="flex gap-2"><Input :modelValue="curlCmd" readonly class="font-mono text-xs" /><Button variant="outline" size="sm" @click="copyText(curlCmd)"><Copy />复制</Button></div>
              <p class="text-xs text-muted-foreground">脚本会从当前主控下载匹配的 Linux/macOS 被控包；如果被控在 NAT 后，请在命令中补充 --advertise http://被控地址:8081。</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
