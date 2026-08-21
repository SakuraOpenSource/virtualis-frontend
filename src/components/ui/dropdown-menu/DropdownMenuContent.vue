<script setup lang="ts">
import { DropdownMenuContent as RekaContent, DropdownMenuPortal } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template>
  <DropdownMenuPortal>
    <RekaContent :class="cn('z-50 min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md', $props.class)"><slot /></RekaContent>
  </DropdownMenuPortal>
</template>
