import { ref } from 'vue'

export type ToastItem = { id: number; message: string; kind: 'success' | 'error' | 'info' }

const toasts = ref<ToastItem[]>([])
let nextId = 1

export function useToast() {
  function show(message: string, kind: ToastItem['kind'] = 'info') {
    const id = nextId++
    toasts.value.push({ id, message, kind })
    setTimeout(() => dismiss(id), 3000)
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  function success(m: string) { show(m, 'success') }
  function error(m: string) { show(m, 'error') }
  return { toasts, show, dismiss, success, error }
}

export function useGlobalToast() { return useToast() }
export { toasts as globalToasts }
