<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Copy, Plus, Trash2, Check } from 'lucide-vue-next'

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
import { http } from '@/lib/api'

interface Agent { id: number; name: string; display_name: string; status: string; ip: string; driver: string; version: string; created_at: string }

const toast = useToast()
const items = ref<Agent[]>([])
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const creating = ref(false)
const formName = ref('')
const joinCmd = ref('')
const curlCmd = ref('')
const copied = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await http.get<{ items: Agent[] }>('/admin/agents')
    items.value = data.items ?? []
  } catch (e) { error.value = errorMessage(e) } finally { loading.value=false }
}

async function create() {
  if (!formName.value.trim()) { toast.error('请输入节点名称'); return }
  creating.value = true
  try {
    const { data } = await http.post<{ agent: Agent; join_cmd: string; curl_cmd: string }>('/admin/agents', { name: formName.value.trim() })
    joinCmd.value = data.join_cmd
    curlCmd.value = data.curl_cmd
    toast.success('被控已创建，请复制指令到被控机器执行')
    await load()
  } catch (e) { toast.error(errorMessage(e)) } finally { creating.value=false }
}

async function remove(id: number) {
  if (!confirm('确认删除该被控？')) return
  try { await http.delete(`/admin/agents/${id}`); toast.success('已删除'); await load() } catch (e) { toast.error(errorMessage(e)) }
}

async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); copied.value=true; toast.success('已复制'); setTimeout(()=>copied.value=false,1500) } catch { toast.error('复制失败，请手动复制') }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="被控节点" description="管理从主控下发的被控机器，被控仅含 Go 后端，通过一键指令接入">
      <template #actions><Button @click="showCreate=true"><Plus />添加被控</Button></template>
    </PageHeader>

    <ErrorAlert :message="error" />
    <LoadingBlock v-if="loading" />

    <Card v-else>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead><TableHead>名称</TableHead><TableHead>IP</TableHead><TableHead>驱动</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="!items.length" :colspan="7">暂无被控，请点击“添加被控”生成接入指令</TableEmpty>
            <TableRow v-for="it in items" :key="it.id">
              <TableCell>{{ it.id }}</TableCell>
              <TableCell class="font-mono">{{ it.name }}</TableCell>
              <TableCell>{{ it.ip || '-' }}</TableCell>
              <TableCell><Badge variant="outline">{{ it.driver || '-' }}</Badge></TableCell>
              <TableCell><Badge :variant="it.status==='online'?'default':it.status==='offline'?'secondary':'outline'">{{ it.status }}</Badge></TableCell>
              <TableCell class="text-muted-foreground text-xs">{{ it.created_at }}</TableCell>
              <TableCell class="text-right"><Button variant="destructive" size="sm" @click="remove(it.id)"><Trash2 />删除</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog :open="showCreate" @update:open="(v:boolean)=> showCreate=v">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加被控</DialogTitle>
          <DialogDescription>输入被控名称，生成一键接入指令，到被控机器上执行即可自动注册到主控</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid gap-2"><Label>被控名称</Label><Input v-model="formName" placeholder="node-01" /></div>
          <Button :disabled="creating" @click="create">{{ creating?'生成中...':'生成指令' }}</Button>

          <div v-if="joinCmd" class="space-y-3">
            <div class="space-y-2">
              <Label>方式一：直接运行（已安装 virtualis-agent）</Label>
              <div class="flex gap-2">
                <Input :modelValue="joinCmd" readonly class="font-mono text-xs" />
                <Button variant="outline" size="sm" @click="copyText(joinCmd)"><Copy v-if="!copied" /><Check v-else />复制</Button>
              </div>
            </div>
            <div class="space-y-2">
              <Label>方式二：一键远程安装（自动下载）</Label>
              <div class="flex gap-2">
                <Input :modelValue="curlCmd" readonly class="font-mono text-xs" />
                <Button variant="outline" size="sm" @click="copyText(curlCmd)"><Copy />复制</Button>
              </div>
              <p class="text-muted-foreground text-xs">在被控机器上以 root 执行上述指令，脚本会自动下载并启动 agent</p>
              <p class="text-muted-foreground text-xs">本地被控一键脚本（内置 5 选 1）：<code>virtualis-agent/install.sh</code>（1 仅Agent / 2 Incus+Agent / 3 LXC+Agent / 4 QEMU+Agent / 5 Mock+Agent）或 <code>virtualis/deploy/install-linux.sh --agent</code></p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
