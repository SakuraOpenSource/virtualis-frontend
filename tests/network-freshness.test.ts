import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import InstancesView from '@/views/admin/InstancesView.vue'
import { http } from '@/lib/api'
import { deferred, globals, slot } from './helpers'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))

describe('create network freshness', () => {
  it('ignores an older host-network response after switching nodes', async () => {
    const old = deferred<any>(), fresh = deferred<any>()
    http.defaults.adapter = async config => ({ data: config.url === '/admin/agents/1/network' ? await old.promise : config.url === '/admin/agents/2/network' ? await fresh.promise : { items: [], total: 0 }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstancesView, { global: { ...globals, stubs: { DialogContent: slot, RouterLink: slot } } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.showCreate = true
    vm.formAgentId = '1'
    await flushPromises()
    vm.formAgentId = '2'
    await flushPromises()
    fresh.resolve({ interfaces: [{ name: 'br-new', kind: 'bridge' }], ipv4_count: 2 })
    await flushPromises()
    old.resolve({ interfaces: [{ name: 'eth-old', kind: 'physical' }], ipv4_count: 1 })
    await flushPromises()
    expect(vm.hostIPv4Count).toBe(2)
    expect(vm.hostIfaces.map((v: any) => v.name)).toEqual(['br-new'])
    wrapper.unmount()
  })

  it('reloads network metadata when reopening create on the same node after reset', async () => {
    let hostRequests = 0
    http.defaults.adapter = async config => {
      const data = config.url?.endsWith('/network') ? (hostRequests++, { interfaces: [{ name: 'br-new', kind: 'bridge' }], ipv4_count: 2 }) : { items: [], total: 0 }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstancesView, { global: { ...globals, stubs: { DialogContent: slot, RouterLink: slot } } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.showCreate = true; vm.formAgentId = '1'; vm.formName = 'safe-create'
    await flushPromises()
    await vm.create()
    const beforeReopen = hostRequests
    vm.showCreate = true
    await flushPromises()
    expect(hostRequests).toBeGreaterThan(beforeReopen)
    expect(vm.hostIPv4Count).toBe(2)
    wrapper.unmount()
  })
})
