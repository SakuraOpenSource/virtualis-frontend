import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { http } from '@/lib/api'
import { instance, globals, mockRoute } from './helpers'
import InstanceDetailView from '@/views/admin/InstanceDetailView.vue'
import SecurityGroupPanel from '@/components/app/SecurityGroupPanel.vue'
import FirewallPanel from '@/components/app/FirewallPanel.vue'

vi.mock('vue-router', () => mockRoute())
vi.mock('@novnc/novnc', () => ({ default: class {} }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
afterEach(() => vi.useRealTimers())

describe('instance detail layout', () => {
  it('integrates group binding in the existing network tab and refreshes effective rules after local firewall changes', async () => {
    let bindingReads = 0
    http.defaults.adapter = async config => {
      if (config.url === '/instances/4/security-groups') bindingReads++
      const data = config.url === '/instances/4' ? instance : config.url === '/instances/4/security-groups' ? { security_group_ids: [], groups: [], effective_rules: [], firewall_policy: { ingress: 'drop', egress: 'accept' } } : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: globals }); await flushPromises()
    await wrapper.findAll('[role="tab"]')[1]!.trigger('mousedown', { button: 0 }); await flushPromises()
    expect(wrapper.findComponent(SecurityGroupPanel).exists()).toBe(true)
    expect(wrapper.get('[data-testid="effective-policy"]').text()).toContain('入站：丢弃')
    const before = bindingReads
    wrapper.getComponent(FirewallPanel).vm.$emit('settled'); await flushPromises()
    expect(bindingReads).toBeGreaterThan(before)
    wrapper.unmount()
  })
  it('edits dedicated routed/bridge controls without replacing desired CIDR with observed runtime /32', async () => {
    const requests: any[] = [], dedicated = { ...instance, network: { mode: 'dedicated', dedicated_mode: 'routed', bridge: 'eth0', ipv4: '198.51.100.20/24', gateway: '198.51.100.1', dns: ['1.1.1.1'], bandwidth_mbps: 50, traffic_gb: 100 } }
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.url === '/instances/4' ? dedicated : config.url === '/admin/agents/1/network' ? { ipv4_count: 1, interfaces: [{ name: 'eth0', kind: 'physical', state: 'up' }, { name: 'br0', kind: 'bridge', state: 'up' }] } : config.url === '/instances/4/network/configure' ? { instance: dedicated, operation_id: 'network-1' } : config.url === '/instances/4/network' ? { network: { reachable: true, interfaces: [{ ipv4: ['198.51.100.20/32'] }] } } : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: globals }); await flushPromises()
    const vm = wrapper.vm as any
    await vm.checkNetwork(); await flushPromises()
    expect(vm.networkForm.ipv4).toBe('198.51.100.20/24')
    await wrapper.findAll('[role="tab"]')[1]!.trigger('mousedown', { button: 0 }); await flushPromises()
    await wrapper.get('[data-testid="detail-dedicated-mode"]').setValue('bridge')
    await wrapper.get('[data-testid="detail-dedicated-interface"]').setValue('br0')
    await vm.doConfigureNetwork(); await flushPromises()
    const payload = JSON.parse(requests.find(r => r.url === '/instances/4/network/configure').data)
    expect(payload.network).toEqual({ ...dedicated.network, dedicated_mode: 'bridge', bridge: 'br0' })
    wrapper.unmount()
  })
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

  it('requires an explicit confirmation before the destructive reinstall request', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      // Include an image list so the reinstall select has an option to pick,
      // and answer the power call with a full instance shape.
      const data = config.method === 'post' && config.url === '/instances/4/power' ? instance
        : config.url === '/instances/4' ? instance
        : config.url === '/images' ? { items: [{ id: 2, name: 'debian-12', driver: 'qemu' }] }
        : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: { ...globals, stubs: { DialogContent: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.reinstallImage = '2'
    await nextTick()
    await wrapper.findAll('button').find(b => b.text() === '重装')!.trigger('click')
    await flushPromises()
    // The click must only open the confirmation dialog, not hit the API yet.
    expect(requests.some(r => r.method === 'post' && r.url === '/instances/4/power')).toBe(false)
    expect(vm.confirmReinstallOpen).toBe(true)
    const dialog = wrapper.findAllComponents({ name: 'ConfirmDialog' }).at(-1)!
    expect(dialog.props('title')).toBe('confirm.reinstallTitle')
    // The $t mock echoes keys; assert the dialog is wired to the reinstall
    // keys whose zh-CN copy spells out the unrecoverable disk wipe.
    expect(dialog.props('description')).toBe('confirm.reinstallDesc')
    await dialog.findAll('button').find(b => b.text() === 'common.confirm')!.trigger('click')
    await flushPromises()
    expect(vm.confirmReinstallOpen).toBe(false)
    const reinstall = requests.find(r => r.method === 'post' && r.url === '/instances/4/power')
    expect(JSON.parse(reinstall.data)).toEqual({ action: 'reinstall', image_id: 2 })
    wrapper.unmount()
  })

  it('reloads the instance when the route id changes instead of keeping the old record', async () => {
    const { setRouteId } = await import('./helpers')
    const requests: any[] = []
    const other = { ...instance, id: 7, name: 'other-instance' }
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.url === '/instances/7' ? other : config.url === '/instances/4' ? instance : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    expect(wrapper.text()).toContain('sample')
    // Detail -> detail navigation reuses this component instance; the view
    // must switch to the new record rather than showing stale data.
    setRouteId('7')
    await flushPromises()
    expect(requests.some(r => r.url === '/instances/7')).toBe(true)
    expect((wrapper.vm as any).inst.name).toBe('other-instance')
    expect(wrapper.text()).toContain('other-instance')
    wrapper.unmount()
    setRouteId('4')
  })

  it('unlocks after a successful power response even when no busy token is present (VIR-CORE-05)', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      // New backend contract: success response omits busy_* entirely.
      const data = config.method === 'post' && config.url === '/instances/4/power' ? { ...instance, status: 'running' } : config.url === '/instances/4' ? instance : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstanceDetailView, { global: globals })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.power('start')
    await flushPromises()
    expect(requests.some(r => r.method === 'post' && r.url === '/instances/4/power')).toBe(true)
    expect(vm.inst.busy_operation).toBeUndefined()
    expect(wrapper.find('[data-testid="operation-busy"]').exists()).toBe(false)

    // Legacy shape: success payload still embeds the already-released token;
    // the UI must not stay busy on it either.
    http.defaults.adapter = async config => {
      const data = config.method === 'post' && config.url === '/instances/4/power' ? { ...instance, status: 'stopped', busy_operation: 'op-done', busy_action: 'stop' } : config.url === '/instances/4' ? instance : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    await vm.power('stop')
    await flushPromises()
    expect(vm.inst.busy_operation).toBeUndefined()
    expect(wrapper.find('[data-testid="operation-busy"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
