<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>
<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
    <h1 class="text-4xl font-bold">404</h1>
    <p class="text-muted-foreground">页面不存在</p>
    <Button as-child><RouterLink to="/">返回首页</RouterLink></Button>
  </div>
</template>
