<script setup lang="ts">
import { Label as RekaLabel } from 'reka-ui'
import { cn } from '@/lib/utils'
defineProps<{ class?: string; for?: string }>()
</script>
<template>
  <RekaLabel :for="$props.for" :class="cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', $props.class)"><slot /></RekaLabel>
</template>
