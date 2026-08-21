<script setup lang="ts">
import { DialogDescription as RekaDesc } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template><RekaDesc :class="cn('text-sm text-muted-foreground', $props.class)"><slot /></RekaDesc></template>
