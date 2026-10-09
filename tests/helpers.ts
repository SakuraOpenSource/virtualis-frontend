import { vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

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
// The mocked route object is reactive so tests can flip route.params.id and
// exercise the detail -> detail remount path (component instance reuse).
const routeState = reactive({ params: { id: '4' } as Record<string, string>, query: {}, path: '/admin/instances/4' })
export function mockRoute() {
  return { useRoute: () => routeState, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), RouterLink: slot }
}
export function setRouteId(id: string) {
  routeState.params.id = id
  routeState.path = `/admin/instances/${id}`
}
export function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (v: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
