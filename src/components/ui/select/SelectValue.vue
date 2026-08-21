<script setup lang="ts">
import { SelectValue as RekaValue, type SelectValueProps } from 'reka-ui'
defineProps<SelectValueProps>()
</script>
<template><RekaValue v-bind="$props"><slot /></RekaValue></template>
