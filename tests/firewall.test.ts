import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FirewallPanel from '@/components/app/FirewallPanel.vue'
import { http } from '@/lib/api'
import { globals, slot } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
describe('firewall operation coordination', () => {
  it('blocks all mutations when the parent instance is busy', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => { requests.push(config); return { data: { items: [{ id: 1, direction: 'in', action: 'accept', protocol: 'tcp', port_start: 22, port_end: 22, priority: 100, enabled: true }] }, status: 200, statusText: 'OK', headers: {}, config } }
    const wrapper = mount(FirewallPanel, { props: { instanceId: 4, disabled: true } as any, global: { ...globals, stubs: { DialogContent: slot } } }); await flushPromises()
    expect(wrapper.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true)
    await wrapper.find('form').trigger('submit'); await flushPromises()
    expect(requests.filter(r => r.method !== 'get')).toHaveLength(0)
    wrapper.unmount()
  })
})
