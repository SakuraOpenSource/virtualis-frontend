<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { VirtualisInstance } from '@/lib/types'
import { virtualisApi } from '@/lib/endpoints'
import { errorMessage } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from './ConfirmDialog.vue'
import ErrorAlert from './ErrorAlert.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
const props = defineProps<{ open: boolean; instance: VirtualisInstance; disabled?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'busy-change': [label: string]; updated: [instance: VirtualisInstance]; settled: [] }>()
const error = ref(''), busy = ref(false), confirming = ref(false)
const toast = useToast()
const locked = computed(() => busy.value || !!props.disabled)
const form = reactive({ cpu: 1, memory: 1024, disk: 20, bandwidth: 0, traffic: 0 })
const minimumDisk = computed(() => props.instance.spec.disk_gb)
watch(() => props.open, value => { if (value) { error.value = ''; Object.assign(form, { cpu: props.instance.spec.cpu_milli ? props.instance.spec.cpu_milli / 1000 : props.instance.spec.cpu, memory: props.instance.spec.memory_mb, disk: props.instance.spec.disk_gb, bandwidth: props.instance.network?.bandwidth_mbps ?? 0, traffic: props.instance.network?.traffic_gb ?? 0 }) } }, { immediate: true })
function validate() {
  if (props.instance.status !== 'stopped') return '请先关机再调整规格。'
  if (!Number.isFinite(Number(form.cpu)) || form.cpu < 0.1 || form.cpu > 1024) return 'CPU 需在 0.1–1024 核之间。'
  if (!Number.isInteger(Number(form.memory)) || form.memory < 128) return '内存须为至少 128 MB 的整数。'
  if (!Number.isInteger(Number(form.disk)) || form.disk < minimumDisk.value) return '不能缩小磁盘；架构也不能更改。'
  if (![form.bandwidth, form.traffic].every(value => Number.isInteger(Number(value)) && value >= 0) || form.traffic > 102400) return '带宽和流量必须为非负整数，流量不得超过 102400 GB。'
  return ''
}
function review() {
  if (locked.value) return
  error.value = validate()
  if (!error.value) confirming.value = true
}
function close(value: boolean) { if (!busy.value) emit('update:open', value) }
async function resize() {
  if (locked.value) return
  error.value = validate()
  if (error.value) return
  busy.value = true; emit('busy-change', '调整规格')
  try {
    const cpu = Number(form.cpu), cpuMilli = Number.isInteger(cpu) ? 0 : Math.round(cpu * 1000)
    const updated = await virtualisApi.resize(props.instance.id, { spec: { ...props.instance.spec, cpu: Math.ceil(cpu), cpu_milli: cpuMilli, memory_mb: Number(form.memory), disk_gb: Number(form.disk) }, network: { ...props.instance.network, mode: props.instance.network?.mode || 'nat', bandwidth_mbps: Number(form.bandwidth), traffic_gb: Number(form.traffic) } })
    emit('updated', updated); toast.success('规格已更新，实例保持关机'); confirming.value = false; emit('update:open', false)
  } catch (e) { error.value = errorMessage(e); toast.error(error.value) }
  finally { busy.value = false; emit('busy-change', ''); emit('settled') }
}
</script>
<template>
  <Dialog :open="open" @update:open="close">
    <DialogContent @escape-key-down="(event: KeyboardEvent) => { if (busy) event.preventDefault() }" @interact-outside="(event: CustomEvent) => { if (busy) event.preventDefault() }"><DialogHeader><DialogTitle>调整实例规格</DialogTitle><DialogDescription>须先关机，不重装系统或重设密码。磁盘只支持扩容；文件系统可能仍需在客户机中扩展。</DialogDescription></DialogHeader>
      <ErrorAlert :message="error" />
      <form data-testid="resize-form" class="space-y-4" @submit.prevent="review">
        <fieldset :disabled="locked" class="grid gap-4 sm:grid-cols-2">
          <label class="space-y-2 text-sm">CPU（核）<Input v-model.number="form.cpu" data-testid="resize-cpu" type="number" min="0.1" max="1024" step="0.1" required /></label>
          <label class="space-y-2 text-sm">内存 MB<Input v-model.number="form.memory" data-testid="resize-memory" type="number" min="128" step="1" required /></label>
          <label class="space-y-2 text-sm">磁盘 GB<Input v-model.number="form.disk" data-testid="resize-disk" type="number" :min="minimumDisk" step="1" required /></label>
          <div class="space-y-2 text-sm">架构<p class="rounded-md border bg-muted/30 p-2">{{ instance.spec.arch || '保持当前架构' }}</p></div>
          <label class="space-y-2 text-sm">带宽 Mbps（0 为不限）<Input v-model.number="form.bandwidth" data-testid="resize-bandwidth" type="number" min="0" step="1" /></label>
          <label class="space-y-2 text-sm">月流量 GB（0 为不限）<Input v-model.number="form.traffic" data-testid="resize-traffic" type="number" min="0" max="102400" step="1" /></label>
        </fieldset>
        <DialogFooter><Button variant="outline" type="button" :disabled="busy" @click="close(false)">取消</Button><Button type="submit" :disabled="locked || instance.status !== 'stopped'">{{ busy ? '调整中…' : '预览变更' }}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <ConfirmDialog :open="confirming" :busy="busy" danger title="确认调整规格" :description="`CPU ${form.cpu} 核 / 内存 ${form.memory} MB / 磁盘 ${form.disk} GB；带宽 ${form.bandwidth} Mbps、流量 ${form.traffic} GB（0 为不限）。不更改架构或其他网络参数，执行后保持关机。磁盘扩容不可撤销，请先备份。`" @update:open="value => { if (!busy) confirming = value }" @confirm="resize" />
</template>
