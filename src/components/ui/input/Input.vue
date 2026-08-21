<script setup lang="ts">
import { cn } from '@/lib/utils'
defineProps<{ class?: string; modelValue?: string | number; placeholder?: string; type?: string; disabled?: boolean }>()
defineEmits<{ (e:'update:modelValue', v:string):void }>()
</script>
<template>
  <input
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="cn('flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', $props.class)"
    @input="(e: Event) => $emit('update:modelValue', (e.target as HTMLInputElement).value)"
  />
</template>
