import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import InstancesView from '@/views/admin/InstancesView.vue'
import { http } from '@/lib/api'
import { deferred, globals, slot } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const entry = { id: 9, ip: '198.51.100.20', cidr: '198.51.100.20/24', gateway: '198.51.100.1', dns: ['1.1.1.1'], interface: 'eth0', note: '' }
const group = { id: 7, name: 'web', description: '', ingress_policy: 'drop', egress_policy: 'accept', rules: [] }
function response(config: any, data: any) { return { data, config, status: 200, statusText: 'OK', headers: {} } }
async function setup(adapter?: any) {
  const writes: any[] = []
  http.defaults.adapter = adapter ?? (async config => {
    if (config.method === 'post') writes.push(JSON.parse(config.data))
    const data = config.url?.endsWith('/network') ? { ipv4_count: 1, interfaces: [{ name: 'eth0', kind: 'physical', state: 'up', ipv4: ['198.51.100.10/24'] }, { name: 'br0', kind: 'bridge', state: 'up' }] } : config.url === '/admin/security-groups' ? { items: [group] } : config.url?.endsWith('/free') ? { items: [entry] } : { items: [], total: 0 }
    return response(config, data)
  })
  const wrapper = mount(InstancesView, { global: { ...globals, stubs: { DialogContent: slot, RouterLink: slot } } }); await flushPromises()
  const vm = wrapper.vm as any
  vm.showCreate = true; vm.formAgentId = '1'; vm.formName = 'routed-guest'; vm.formNetworkMode = 'dedicated'
  await flushPromises()
  return { wrapper, vm, writes }
}
describe('dedicated creation contract', () => {
  it('surfaces metadata failures, blocks pending allocation and discards stale pool responses on node switches', async () => {
    const old = deferred<any>(), fresh = deferred<any>(); const requests: any[] = []
    const { wrapper, vm } = await setup(async (config: any) => {
      requests.push(config)
      if (config.url === '/admin/agents/2/network') throw { response: { status: 503, data: { message: '上联信息读取失败' } } }
      const data = config.url === '/ip-pools/1/free' ? await old.promise : config.url === '/ip-pools/2/free' ? await fresh.promise : config.url?.endsWith('/network') ? { interfaces: [{ name: 'eth0', kind: 'physical', state: 'up' }], ipv4_count: 1 } : { items: [], total: 0 }
      return response(config, data)
    })
    expect(wrapper.text()).toContain('加载网络选项中')
    await vm.create(); expect(requests.some(r => r.method === 'post')).toBe(false)
    vm.formAgentId = '2'; await flushPromises()
    fresh.reject({ response: { status: 500, data: { message: '空闲 IP 池读取失败' } } }); await flushPromises()
    old.resolve({ items: [entry] }); await flushPromises()
    expect(vm.freeIPs).toEqual([])
    expect(wrapper.text()).toContain('上联信息读取失败')
    expect(wrapper.text()).toContain('空闲 IP 池读取失败')
    await vm.create(); expect(requests.some(r => r.method === 'post')).toBe(false)
    wrapper.unmount()
  })
  it('refreshes the reusable group choices on reopening and never silently hides failed group reads', async () => {
    const { wrapper, vm } = await setup()
    vm.showCreate = false; await flushPromises()
    http.defaults.adapter = async config => {
      if (config.url === '/admin/security-groups') throw { response: { status: 500, data: { message: '安全组目录读取失败' } } }
      return response(config, { items: [], interfaces: [] })
    }
    vm.showCreate = true; await flushPromises()
    expect(wrapper.text()).toContain('安全组目录读取失败')
    expect(wrapper.find('[data-testid="security-group-7"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('permits routed creation on a one-address host and allocates automatically per create', async () => {
    const { wrapper, vm, writes } = await setup()
    expect(vm.dedicatedAvailable).toBe(true)
    expect(vm.formIPEntry).toBe('auto')
    expect(wrapper.text()).not.toContain('至少 2 个')
    await wrapper.get('[data-testid="security-group-7"]').setValue(true)
    await wrapper.get('[data-testid="dedicated-mode"]').setValue('routed')
    await vm.create(); await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0].network.mode).toBe('dedicated')
    expect(writes[0].network.dedicated_mode).toBe('routed')
    expect(writes[0].network.ipv4).toBeUndefined()
    expect(writes[0].ip_pool_entry_id).toBeUndefined()
    expect(writes[0].security_group_ids).toEqual([7])
    wrapper.unmount()
  })
  it('requires free pool readiness for auto allocation but preserves manual CIDR and explicit pool IDs', async () => {
    const { wrapper, vm, writes } = await setup()
    vm.freeIPs = []; await vm.create(); await flushPromises()
    expect(writes).toHaveLength(0)
    expect(wrapper.text()).toContain('没有空闲 IP 池地址')
    vm.formIPEntry = 'manual'; await flushPromises()
    vm.formIPv4 = entry.cidr; vm.formGateway = entry.gateway
    await vm.create(); await flushPromises()
    expect(writes[0].network.ipv4).toBe('198.51.100.20/24')
    expect(writes[0].ip_pool_entry_id).toBeUndefined()
    vm.showCreate = true; vm.formName = 'explicit'; vm.formNetworkMode = 'dedicated'; await flushPromises()
    vm.formIPEntry = '9'; await flushPromises(); await vm.create(); await flushPromises()
    expect(writes[1].ip_pool_entry_id).toBe(9)
    expect(writes[1].network.ipv4).toBe(entry.cidr)
    vm.showCreate = true; vm.formNetworkMode = 'dedicated'; await flushPromises()
    expect(vm.formIPEntry).toBe('auto')
    expect(vm.formIPv4).toBe('')
    wrapper.unmount()
  })
  it('rejects explicit bridge on a physical interface and guards duplicate/conflicting creates', async () => {
    const { wrapper, vm, writes } = await setup()
    vm.formDedicatedMode = 'bridge'; vm.formBridge = 'eth0'; await vm.create(); await flushPromises()
    expect(writes).toHaveLength(0)
    expect(wrapper.text()).toContain('bridge 必须选择已存在的 Linux 网桥')
    vm.formBridge = 'br0'
    const write = deferred<any>(); let attempts = 0
    http.defaults.adapter = async config => {
      if (config.method === 'post') { attempts++; await write.promise }
      return response(config, {})
    }
    const pending = vm.create(); await flushPromises(); await vm.create()
    expect(attempts).toBe(1)
    expect(wrapper.get('[data-testid="create-fields"]').attributes('disabled')).toBeDefined()
    write.reject({ response: { status: 409, data: { message: 'IP 池地址已被其他实例占用' } } }); await pending; await flushPromises()
    expect(vm.showCreate).toBe(true)
    expect(vm.formName).toBe('routed-guest')
    expect(wrapper.text()).toContain('IP 池地址已被其他实例占用')
    wrapper.unmount()
  })
})
