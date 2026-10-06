import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { http } from '@/lib/api'
import { instance, globals, mockRoute } from './helpers'
import InstanceDetailView from '@/views/admin/InstanceDetailView.vue'

vi.mock('vue-router', () => mockRoute())
vi.mock('@novnc/novnc', () => ({ default: class {} }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
afterEach(() => vi.useRealTimers())

describe('instance detail layout', () => {
  it('contains a single root and four accessible working detail tabs', async () => {
    http.defaults.adapter = async config => ({ data: config.url === '/instances/4' ? instance : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    expect(wrapper.findAll('[role="tab"]').map(t => t.text())).toEqual(['概览', '网络与防火墙', '快照与备份', '操作日志'])
    expect(wrapper.element.nodeType).toBe(1)
    expect(wrapper.find('[role="tabpanel"]').text()).toContain('基本信息')
    wrapper.unmount()
  })

  it('offers a stopped-only migration dialog with compatible target nodes', async () => {
    http.defaults.adapter = async config => ({ data: config.url === '/instances/4' ? instance : config.url === '/admin/agents' ? { items: [
      { id: 1, name: 'source', status: 'online', drivers: ['qemu'], arch: 'amd64' },
      { id: 2, name: 'compatible', status: 'online', drivers: ['qemu'], arch: 'amd64' },
      { id: 3, name: 'wrong-arch', status: 'online', drivers: ['qemu'], arch: 'arm64' },
    ] } : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstanceDetailView, { global: { ...globals, stubs: { DialogContent: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    const launch = wrapper.find('[data-testid="open-migration"]')
    expect(launch.exists()).toBe(true)
    await launch.trigger('click')
    await flushPromises()
    const options = wrapper.findAll('[data-testid="migration-target"] option')
    expect(options.map(o => o.text()).join(' ')).toContain('compatible')
    expect(options.find(o => o.text().includes('wrong-arch'))?.attributes('disabled')).toBeDefined()
    expect(options.some(o => o.attributes('value') === '1')).toBe(false)
    wrapper.unmount()
  })

  it('opens resize with preserved limits and rejects disk shrinking before submitting', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => { requests.push(config); return { data: config.url === '/instances/4' ? instance : { items: [] }, status: 200, statusText: 'OK', headers: {}, config } }
    const wrapper = mount(InstanceDetailView, { global: { ...globals, stubs: { DialogContent: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    expect(wrapper.find('[data-testid="open-resize"]').exists()).toBe(true)
    await wrapper.find('[data-testid="open-resize"]').trigger('click'); await flushPromises()
    expect((wrapper.find('[data-testid="resize-bandwidth"]').element as HTMLInputElement).value).toBe('50')
    await wrapper.find('[data-testid="resize-disk"]').setValue('10')
    await wrapper.find('[data-testid="resize-form"]').trigger('submit'); await flushPromises()
    expect(wrapper.text()).toContain('不能缩小磁盘')
    expect(requests.some(r => r.method === 'patch')).toBe(false)
    wrapper.unmount()
  })

  it('honors the persisted server busy fence after reload and discards network responses from before a task', async () => {
    const gate = (await import('./helpers')).deferred<any>()
    http.defaults.adapter = async config => ({ data: config.url === '/instances/4' ? { ...instance, busy_operation: 'op-1', busy_action: 'migrate' } : config.url === '/instances/4/network' ? await gate.promise : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    expect(wrapper.find('[data-testid="open-migration"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="operation-busy"]').text()).toContain('migrate')
    gate.resolve({ network: { reachable: true, interfaces: [{ ipv4: ['192.0.2.99'] }] } }); await flushPromises()
    wrapper.unmount()
  })

  it('discards a network check response when a mutation starts before it completes', async () => {
    const gate = (await import('./helpers')).deferred<any>()
    let delayed = false
    http.defaults.adapter = async config => ({ data: config.url === '/instances/4' ? instance : config.url === '/instances/4/network' ? { network: delayed ? await gate.promise : { reachable: false, interfaces: [] } } : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstanceDetailView, { global: globals }); await flushPromises()
    delayed = true
    const vm = wrapper.vm as any
    const check = vm.checkNetwork(); await flushPromises()
    wrapper.findComponent({ name: 'RecoveryPanel' }).vm.$emit('busy-change', '恢复备份'); await flushPromises()
    gate.resolve({ reachable: true, interfaces: [{ ipv4: ['192.0.2.99'] }] })
    await check; await flushPromises()
    expect(vm.inst.observed_ip).toBeUndefined()
    expect(vm.network.reachable).toBe(false)
    wrapper.unmount()
  })

  it('loads recovery lists and creates a snapshot from the actual form', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.url === '/instances/4' ? instance :
        config.url === '/instances/4/snapshots' && config.method === 'get' ? { items: [{ id: 8, name: 'before-update', size_bytes: 0, status: 'ready' }] } : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[2]!.trigger('mousedown', { button: 0 })
    await flushPromises()
    expect(wrapper.text()).toContain('创建快照')
    expect(wrapper.text()).toContain('before-update')
    expect(wrapper.text()).toContain('大小未知')
    await wrapper.find('[data-testid="snapshot-name"]').setValue('safe-point')
    await wrapper.find('[data-testid="snapshot-form"]').trigger('submit')
    await flushPromises()
    const request = requests.find(r => r.method === 'post' && r.url === '/instances/4/snapshots')
    expect(JSON.parse(request.data)).toEqual({ name: 'safe-point' })
    wrapper.unmount()
  })

  it('locks power and polls persisted logs rather than reporting fake progress during recovery', async () => {
    let finish!: (value: any) => void
    const gate = new Promise(resolve => { finish = resolve })
    http.defaults.adapter = async config => ({ data: config.method === 'post' ? await gate : config.url === '/instances/4' ? instance : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    const panel = wrapper.findComponent({ name: 'RecoveryPanel' })
    panel.vm.$emit('busy-change', '创建备份')
    await flushPromises()
    const power = wrapper.findAll('[role="combobox"]').find(b => b.text().includes('选择电源'))
    expect(power?.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="operation-busy"]').text()).toContain('操作日志')
    panel.vm.$emit('busy-change', '')
    finish(instance)
    await flushPromises()
    wrapper.unmount()
  })
})
