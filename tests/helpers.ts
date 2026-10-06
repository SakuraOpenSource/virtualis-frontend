import { vi } from 'vitest'
import { defineComponent, h } from 'vue'

export const instance = {
  id: 4, name: 'sample', agent_id: 1, driver: 'qemu', type: 'vm', status: 'stopped',
  spec: { cpu: 2, memory_mb: 1024, disk_gb: 20, arch: 'x86_64' },
  network: { mode: 'nat', bandwidth_mbps: 50, traffic_gb: 100 },
  created_at: '2026-10-05T00:00:00Z', updated_at: '2026-10-05T00:00:00Z',
}
export const slot = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()) } })
export const button = defineComponent({ inheritAttrs: true, setup(_, { slots }) { return () => h('button', slots.default?.()) } })
export const globals = {
  mocks: { $t: (v: string) => v },
  stubs: { RouterLink: slot },
}
export function mockRoute() {
  return { useRoute: () => ({ params: { id: '4' }, query: {}, path: '/admin/instances/4' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), RouterLink: slot }
}
export function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (v: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
