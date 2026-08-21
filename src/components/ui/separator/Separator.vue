<script setup lang="ts">
import { Separator as RekaSeparator } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ orientation?: 'horizontal'|'vertical'; class?: string }>()
</script>
<template>
  <RekaSeparator :orientation="orientation ?? 'horizontal'" :class="cn('shrink-0 bg-border', orientation==='vertical' ? 'h-full w-px' : 'h-px w-full', $props.class)" />
</template>
