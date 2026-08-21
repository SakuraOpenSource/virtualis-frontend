<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{ colspan?: number; class?: string }>()
</script>

<template>
  <tr>
    <td
      :colspan="props.colspan ?? 1"
      :class="cn('text-muted-foreground py-10 text-center text-sm', props.class)"
    >
      <slot />
    </td>
  </tr>
</template>
