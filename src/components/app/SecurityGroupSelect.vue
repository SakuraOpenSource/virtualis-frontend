<script setup lang="ts">
import type { SecurityGroup } from '@/lib/types'
const props = defineProps<{ items: SecurityGroup[]; modelValue: number[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [ids: number[]] }>()
function toggle(id: number, checked: boolean) {
  if (props.disabled || (checked && props.modelValue.length >= 16)) return
  emit('update:modelValue', checked ? [...new Set([...props.modelValue, id])] : props.modelValue.filter(value => value !== id))
}
</script>
<template>
  <fieldset :disabled="disabled" class="space-y-2">
    <legend class="mb-2 text-sm font-medium">安全组（最多 16 个）</legend>
    <label v-for="group in items" :key="group.id" class="flex items-start gap-2 rounded border p-3 text-sm">
      <input :data-testid="`security-group-${group.id}`" type="checkbox" :checked="modelValue.includes(group.id)" :disabled="disabled || (!modelValue.includes(group.id) && modelValue.length >= 16)" class="mt-0.5 size-4 accent-primary" @change="toggle(group.id, ($event.target as HTMLInputElement).checked)" />
      <span><strong>{{ group.name }}</strong> · {{ group.description }}<span class="block text-xs text-muted-foreground">默认入站：{{ group.ingress_policy === 'drop' ? '丢弃' : '允许' }} / 出站：{{ group.egress_policy === 'drop' ? '丢弃' : '允许' }}</span></span>
    </label>
    <p v-if="!items.length" class="text-sm text-muted-foreground">暂无可用安全组，请在安全组管理页创建。</p>
    <p class="text-xs text-muted-foreground">多个安全组合并时，默认策略按方向以丢弃优先。未绑定时保留原有实例防火墙语义。</p>
  </fieldset>
</template>
