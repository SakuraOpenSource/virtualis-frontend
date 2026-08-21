<script setup lang="ts">
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template><th :class="cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground', $props.class)"><slot /></th></template>
