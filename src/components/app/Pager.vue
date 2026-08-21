<script setup lang="ts">
import { Button } from '@/components/ui/button'
const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e:'update:page', v:number):void }>()
const totalPages = () => Math.max(1, Math.ceil(props.total / props.pageSize))
</script>
<template>
  <div v-if="total > pageSize" class="flex items-center justify-between mt-4 text-sm">
    <span class="text-muted-foreground">共 {{ total }} 条，第 {{ page }} / {{ totalPages() }} 页</span>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" :disabled="page<=1" @click="emit('update:page', page-1)">上一页</Button>
      <Button variant="outline" size="sm" :disabled="page>=totalPages()" @click="emit('update:page', page+1)">下一页</Button>
    </div>
  </div>
</template>
