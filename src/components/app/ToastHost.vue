<script setup lang="ts">
import { globalToasts } from '@/composables/useToast'
</script>
<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
    <div v-for="t in globalToasts" :key="t.id" :class="['rounded-md px-4 py-2 text-sm shadow-lg border', t.kind==='success' ? 'bg-green-600 text-white border-green-700' : t.kind==='error' ? 'bg-destructive text-destructive-foreground' : 'bg-card border-border']">
      {{ t.message }}
    </div>
  </div>
</template>
