<script setup lang="ts">
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'
const router = useRouter()
onMounted(() => router.replace({ name: 'instances' }))
</script>
<template><div class="p-8 text-sm text-muted-foreground">跳转至实例列表...</div></template>
