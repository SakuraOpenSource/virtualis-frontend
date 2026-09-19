<script setup lang="ts">
import {
  SwitchRoot,
  SwitchThumb,
  useForwardPropsEmits,
  type SwitchRootEmits,
  type SwitchRootProps,
} from 'reka-ui'

import { cn } from '@/lib/utils'

const props = defineProps<SwitchRootProps & { class?: string }>()
const emits = defineEmits<SwitchRootEmits>()

// 必须用 useForwardPropsEmits 转发 modelValue/update:modelValue：
// reka-ui 的 SwitchRoot 只认 modelValue，直接 v-bind props 再 emit 自定义的
// update:checked 事件永远不会触发（SwitchRoot 不发这个事件），开关就成了
// 只能看不能点的摆设 —— 设置页保存不了配置的根因即在此。
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SwitchRoot
    v-bind="forwarded"
    :class="
      cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
    />
  </SwitchRoot>
</template>
