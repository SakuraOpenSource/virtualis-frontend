<script setup lang="ts">
import { SelectRoot, type SelectRootProps, type SelectRootEmits } from 'reka-ui'
const props = defineProps<SelectRootProps<string>>()
const emit = defineEmits<SelectRootEmits>()
</script>
<template><SelectRoot v-bind="props" @update:modelValue="(v) => emit('update:modelValue', v)"><slot /></SelectRoot></template>
