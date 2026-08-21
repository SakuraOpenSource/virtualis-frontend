<script setup lang="ts">
import { DialogTitle as RekaTitle } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string }>()
</script>
<template><RekaTitle :class="cn('text-lg font-semibold', $props.class)"><slot /></RekaTitle></template>
