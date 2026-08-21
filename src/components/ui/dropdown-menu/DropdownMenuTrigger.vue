<script setup lang="ts">
import { DropdownMenuTrigger as RekaTrigger, type DropdownMenuTriggerProps } from 'reka-ui'
defineProps<DropdownMenuTriggerProps>()
</script>
<template><RekaTrigger v-bind="$props"><slot /></RekaTrigger></template>
