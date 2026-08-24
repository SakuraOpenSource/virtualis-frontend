<script setup lang="ts">
import { ref, watch } from 'vue'
import { SelectRoot, type SelectRootProps, type SelectRootEmits } from 'reka-ui'

defineOptions({ inheritAttrs: false })
const props = defineProps<SelectRootProps<string>>()
const emit = defineEmits<SelectRootEmits>()
const open = ref(props.open ?? false)

watch(() => props.open, (value) => {
  if (value !== undefined) open.value = value
})

function updateOpen(value: boolean) {
  open.value = value
  emit('update:open', value)
}
</script>
<template>
  <SelectRoot v-bind="{ ...props, ...$attrs }" :open="open" @update:modelValue="(v) => emit('update:modelValue', v)" @update:open="updateOpen">
    <slot />
  </SelectRoot>
</template>
