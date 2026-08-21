<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
defineProps<{ message?: string }>()
</script>
<template>
  <Alert v-if="message" variant="destructive" class="text-sm">{{ message }}</Alert>
</template>
