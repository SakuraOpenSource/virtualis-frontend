<script setup lang="ts">
import { cn } from '@/lib/utils'
defineProps<{ variant?: 'default'|'destructive'; class?: string }>()
</script>
<template>
  <div :class="cn('relative w-full rounded-lg border p-4', variant==='destructive' ? 'border-destructive/50 text-destructive bg-destructive/10' : 'bg-background text-foreground', $props.class)" role="alert">
    <slot />
  </div>
</template>
