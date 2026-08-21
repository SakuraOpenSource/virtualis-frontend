<script setup lang="ts">
import { DropdownMenuItem as RekaItem } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string; disabled?: boolean }>()
</script>
<template><RekaItem :disabled="disabled" :class="cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground', $props.class)"><slot /></RekaItem></template>
