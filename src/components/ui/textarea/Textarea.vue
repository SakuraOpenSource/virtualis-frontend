<script setup lang="ts">
import { cn } from '@/lib/utils'
defineProps<{ class?: string; modelValue?: string; placeholder?: string; rows?: number }>()
defineEmits<{ (e:'update:modelValue', v:string):void }>()
</script>
<template>
  <textarea :value="modelValue" :placeholder="placeholder" :rows="rows ?? 3" :class="cn('flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', $props.class)" @input="(e: Event) => $emit('update:modelValue', (e.target as HTMLTextAreaElement).value)" />
</template>
