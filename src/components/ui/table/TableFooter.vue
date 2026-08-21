<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
</script>

<template>
  <tfoot :class="cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', props.class)">
    <slot />
  </tfoot>
</template>
