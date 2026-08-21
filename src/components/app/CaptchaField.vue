<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { captchaApi } from '@/lib/endpoints'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const props = defineProps<{ modelValue: string; captchaId: string }>()
const emit = defineEmits<{ (e:'update:modelValue', v:string):void; (e:'update:captchaId', v:string):void }>()
const image = ref<string>('')
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const ch = await captchaApi.issue()
    image.value = ch.image
    emit('update:captchaId', ch.id)
  } catch {} finally { loading.value = false }
}
onMounted(refresh)
</script>
<template>
  <div class="space-y-2">
    <Label>验证码</Label>
    <div class="flex gap-2">
      <Input :modelValue="props.modelValue" placeholder="输入图形验证码" @update:modelValue="(v:string) => emit('update:modelValue', v)" class="flex-1" />
      <button type="button" class="h-9 w-28 rounded-md border bg-muted overflow-hidden flex items-center justify-center" @click="refresh" :disabled="loading">
        <img v-if="image" :src="image" alt="captcha" class="h-full w-full object-cover" />
        <span v-else class="text-xs text-muted-foreground">加载中</span>
      </button>
      <Button type="button" variant="outline" size="sm" @click="refresh">换一张</Button>
    </div>
  </div>
</template>
