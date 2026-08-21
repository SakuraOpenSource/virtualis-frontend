<script setup lang="ts">
import { useSiteStore } from '@/stores/site'
const site = useSiteStore()
</script>
<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b bg-card">
      <div class="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <span class="font-semibold">{{ site.siteName }}</span>
      </div>
    </header>
    <main class="flex-1 bg-muted/30"><RouterView /></main>
  </div>
</template>
