import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MigrationDialog from '@/components/app/MigrationDialog.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { http } from '@/lib/api'
import { deferred, globals, instance, slot } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const agents = [{ id: 2, name: 'target', status: 'online', drivers: ['qemu'], arch: 'amd64' }, { id: 3, name: 'other', status: 'online', drivers: ['qemu'], arch: 'amd64' }]
const global = { ...globals, stubs: { DialogContent: slot } }

describe('migration network and confirmation', () => {
  it('requires a target pool address and blocks network-mode changes that would lose NAT mappings', async () => {
    http.defaults.adapter = async config => ({ data: config.url === '/admin/agents' ? { items: agents } : config.url?.endsWith('/network') ? { interfaces: [], ipv4_count: 2 } : { items: [] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(MigrationDialog, { props: { open: true, instance }, global })
    await flushPromises()
    await wrapper.find('[data-testid="migration-target"]').setValue('2')
    await wrapper.find('[data-testid="migration-mode"]').setValue('dedicated'); await flushPromises()
    expect(wrapper.find('[data-testid="migration-review"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ instance: { ...instance, nat_mappings: [{ id: 1, protocol: 'tcp', host_port: 2022, guest_port: 22 }] } })
    await wrapper.find('[data-testid="migration-mode"]').setValue('none'); await flushPromises()
    expect(wrapper.find('[data-testid="migration-review"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('NAT 映射')
    wrapper.unmount()
  })

  it('selects target pool metadata, confirms and locks until the real migration settles', async () => {
    const requests: any[] = [], gate = deferred<any>()
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.url === '/admin/agents' ? { items: agents } : config.url === '/ip-pools/2/free' ? { items: [{ id: 12, cidr: '192.0.2.12/24', gateway: '192.0.2.1', dns: ['1.1.1.1'], interface: 'br2' }] } : config.url?.endsWith('/network') ? { ipv4_count: 2, interfaces: [{ name: 'br2', kind: 'bridge' }] } : config.url?.endsWith('/migrate') ? await gate.promise : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(MigrationDialog, { props: { open: false, instance }, global })
    await wrapper.setProps({ open: true }); await flushPromises()
    await wrapper.find('[data-testid="migration-target"]').setValue('2'); await flushPromises()
    expect(wrapper.find('[data-testid="migration-mode"]').exists()).toBe(true)
    await wrapper.find('[data-testid="migration-mode"]').setValue('dedicated'); await flushPromises()
    await wrapper.find('[data-testid="migration-ip"]').setValue('12'); await flushPromises()
    expect((wrapper.find('[data-testid="migration-ipv4"]').element as HTMLInputElement).value).toBe('192.0.2.12/24')
    await wrapper.find('[data-testid="migration-review"]').trigger('click')
    expect(requests.some(r => r.url?.endsWith('/migrate'))).toBe(false)
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
    expect(JSON.parse(requests.find(r => r.url?.endsWith('/migrate')).data)).toMatchObject({ target_agent_id: 2, ip_pool_entry_id: 12, network: { mode: 'dedicated', ipv4: '192.0.2.12/24', bridge: 'br2', gateway: '192.0.2.1', dns: ['1.1.1.1'], bandwidth_mbps: 50, traffic_gb: 100 } })
    expect(wrapper.find('[data-testid="migration-target"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toMatch(/\d+%/)
    gate.resolve({ ...instance, agent_id: 2 }); await flushPromises()
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ agent_id: 2 })
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })
})
