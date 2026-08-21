<script setup lang="ts">
import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'
const variants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', {
  variants: { variant: { default: 'bg-primary text-primary-foreground', secondary: 'bg-secondary text-secondary-foreground', destructive: 'bg-destructive text-destructive-foreground', outline: 'border text-foreground' } },
  defaultVariants: { variant: 'default' },
})
defineProps<{ variant?: 'default'|'secondary'|'destructive'|'outline'; class?: string }>()
</script>
<template><span :class="cn(variants({ variant }), $props.class)"><slot /></span></template>
