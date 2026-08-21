<script setup lang="ts">
import ToastHost from '@/components/app/ToastHost.vue'
import { useThemeStore } from '@/stores/theme'
useThemeStore()
</script>
<template>
  <RouterView />
  <ToastHost />
</template>
