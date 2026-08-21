<script setup lang="ts">
import { DialogContent as RekaContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
    <RekaContent :class="cn('fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg', $props.class)">
      <slot />
    </RekaContent>
  </DialogPortal>
</template>
