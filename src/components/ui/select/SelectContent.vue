<script setup lang="ts">
import { SelectContent as RekaContent, SelectPortal, SelectViewport } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template>
  <SelectPortal>
    <RekaContent :class="cn('relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md', $props.class)">
      <SelectViewport class="p-1"><slot /></SelectViewport>
    </RekaContent>
  </SelectPortal>
</template>
