<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  busy?: boolean
}>(), {
  danger: false,
  busy: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useI18n()
const cancelLabel = computed(() => props.cancelText || t('common.cancel'))
const confirmLabel = computed(() => props.confirmText || t('common.confirm'))

function onOpenChange(value: boolean) {
  if (!props.busy) emit('update:open', value)
}

function onConfirm() {
  if (!props.busy) emit('confirm')
}
</script>
<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ props.title }}</DialogTitle>
        <DialogDescription>{{ props.description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" :disabled="props.busy" @click="onOpenChange(false)">{{ cancelLabel }}</Button>
        <Button :variant="props.danger ? 'destructive' : 'default'" :disabled="props.busy" @click="onConfirm">{{ props.busy ? '处理中…' : confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
