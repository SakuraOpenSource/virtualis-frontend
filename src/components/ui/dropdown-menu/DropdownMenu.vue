<script setup lang="ts">
import { DropdownMenuRoot, type DropdownMenuRootProps, type DropdownMenuRootEmits } from 'reka-ui'
const props = defineProps<DropdownMenuRootProps>()
const emit = defineEmits<DropdownMenuRootEmits>()
</script>
<template><DropdownMenuRoot v-bind="props" @update:open="(v) => emit('update:open', v)"><slot /></DropdownMenuRoot></template>
