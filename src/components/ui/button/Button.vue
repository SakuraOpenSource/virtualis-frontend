<script setup lang="ts">
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cn } from '@/lib/utils'
import { buttonVariants, type ButtonVariants } from '.'
const props = withDefaults(defineProps<PrimitiveProps & { variant?: ButtonVariants['variant']; size?: ButtonVariants['size']; class?: string }>(), { as: 'button' })
</script>
<template>
  <Primitive :as="props.as" :as-child="props.asChild" :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)">
    <slot />
  </Primitive>
</template>
