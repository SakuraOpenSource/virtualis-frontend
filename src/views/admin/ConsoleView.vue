<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import RFB from '@novnc/novnc'
import { ExternalLink, Loader2 } from 'lucide-vue-next'

import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/lib/api'
import { virtualisApi } from '@/lib/endpoints'
import type { VNCInfo } from '@/lib/types'

const props = defineProps<{ id: string }>()

const toast = useToast()
const vncTarget = ref<HTMLElement | null>(null)
const connected = ref(false)
const connecting = ref(true)
const info = ref<VNCInfo | null>(null)
const instanceName = ref('')

let rfb: RFB | null = null

async function connect() {
  connecting.value = true
  try {
    const vnc = await virtualisApi.vnc(Number(props.id))
    info.value = vnc
    if (!vnc.available) {
      toast.error(vnc.message || '当前实例没有 VNC')
      connecting.value = false
      return
    }
    rfb?.disconnect()
    rfb = null
    await nextTick()
    if (!vncTarget.value) return
    const webURL = vnc.web_url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/instances/${props.id}/vnc/ws`
    // resizeSession 必须关：QEMU 对 VGA 的 SetDesktopSize 请求会回
    // "Invalid screen layout"，随后画面不再渲染。
    rfb = new RFB(vncTarget.value, webURL)
    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.addEventListener('connect', () => {
      connected.value = true
      connecting.value = false
    })
    rfb.addEventListener('disconnect', (e) => {
      connected.value = false
      const detail = (e as CustomEvent).detail || {}
      console.warn('[VNC] 断开', detail)
      toast.error(detail.clean ? 'VNC 连接已断开' : 'VNC 异常断开')
      connecting.value = false
    })
  } catch (e) {
    toast.error(errorMessage(e))
    connecting.value = false
  }
}

function openDetail() {
  window.open(`/admin/instances/${props.id}`, '_blank')
}

onMounted(async () => {
  // 标题栏显示实例名；失败不打断连接流程。
  try {
    const inst = await virtualisApi.instance(Number(props.id))
    instanceName.value = inst.name
  } catch {}
  document.title = `控制台 - 实例 #${props.id}`
  await connect()
})

onBeforeUnmount(() => {
  rfb?.disconnect()
  rfb = null
})
</script>

<template>
  <!-- 全屏控制台：卡片布局之外独立渲染，VNC 铺满视口。 -->
  <div class="flex h-screen w-screen flex-col bg-black">
    <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-foreground">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-medium">实例 #{{ id }}{{ instanceName ? ` · ${instanceName}` : '' }}</span>
        <span v-if="connected" class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">已连接</span>
        <span v-else-if="connecting" class="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 class="size-3 animate-spin" /> 连接中…
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
          @click="connect"
        >
          重连
        </button>
        <button
          class="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
          @click="openDetail"
        >
          <ExternalLink class="size-3" /> 详情页
        </button>
      </div>
    </div>
    <div class="relative min-h-0 flex-1">
      <div ref="vncTarget" class="absolute inset-0 bg-black" />
    </div>
  </div>
</template>
