<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="mb-6 flex items-start justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="text-sm text-muted-foreground mt-1">{{ description }}</p>
    </div>
    <div><slot name="actions" /></div>
  </div>
</template>
