import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SecurityGroupsView from '@/views/admin/SecurityGroupsView.vue'
import FirewallPanel from '@/components/app/FirewallPanel.vue'
import { http } from '@/lib/api'
import { deferred, globals, slot } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const group = { id: 7, name: 'web', description: '网站', ingress_policy: 'drop', egress_policy: 'accept', rules: [] }
describe('security group administration', () => {
  it('manages group rules using the shared editor and atomic rules replacement', async () => {
    const existing = { direction: 'in', action: 'accept', protocol: 'tcp', port_start: 443, port_end: 443, cidr: '', priority: 10, enabled: true, remark: 'https' }
    let rules = [existing]; const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      if (config.method === 'put') rules = JSON.parse(config.data).rules
      return { data: config.url === '/admin/security-groups' ? { items: [{ ...group, rules }] } : { ...group, rules }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupsView, { global: { ...globals, stubs: { DialogContent: slot } } }); await flushPromises()
    await wrapper.get('[data-testid="rules-group-7"]').trigger('click'); await flushPromises()
    const panel = wrapper.getComponent(FirewallPanel)
    const vm = panel.vm as any
    Object.assign(vm.form, { direction: 'out', action: 'drop', protocol: 'udp', port_start: 53, port_end: 53, cidr: '198.51.100.0/24', priority: 5, enabled: false, remark: 'dns' })
    await panel.get('form').trigger('submit'); await flushPromises()
    const body = JSON.parse(requests.find(r => r.method === 'put').data)
    expect(body.rules).toEqual([existing, { direction: 'out', action: 'drop', protocol: 'udp', port_start: 53, port_end: 53, cidr: '198.51.100.0/24', priority: 5, enabled: false, remark: 'dns' }])
    expect(requests.find(r => r.method === 'put').url).toBe('/admin/security-groups/7/rules')
    expect(panel.text()).toContain('dns')
    expect(requests.some(r => r.url === '/instances/0/firewall')).toBe(false)
    wrapper.unmount()
  })
  it('creates a reusable group with explicit safe defaults and reads the list back', async () => {
    const requests: any[] = []; let created = false
    http.defaults.adapter = async config => {
      requests.push(config)
      if (config.method === 'post') created = true
      return { data: config.method === 'post' ? group : { items: created ? [group] : [] }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupsView, { global: { ...globals, stubs: { DialogContent: slot } } })
    await flushPromises()
    await wrapper.get('[data-testid="new-group"]').trigger('click')
    await wrapper.get('[name="group-name"]').setValue('web')
    await wrapper.get('[name="group-description"]').setValue('网站')
    await wrapper.get('[data-testid="group-form"]').trigger('submit'); await flushPromises()
    expect(JSON.parse(requests.find(r => r.method === 'post').data)).toEqual({ name: 'web', description: '网站', ingress_policy: 'drop', egress_policy: 'accept' })
    expect(wrapper.get('[data-testid="group-list"]').text()).toContain('web')
    expect(requests.filter(r => r.method === 'get' && r.url === '/admin/security-groups')).toHaveLength(2)
    wrapper.unmount()
  })
  it('edits defaults without sending rules and reports bound-group deletion conflicts', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      if (config.method === 'delete') throw { response: { status: 409, data: { code: 'CONFLICT', message: '安全组仍被实例绑定' } }, config }
      return { data: config.method === 'patch' ? group : { items: [group] }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupsView, { global: { ...globals, stubs: { DialogContent: slot } } }); await flushPromises()
    await wrapper.get('[data-testid="edit-group-7"]').trigger('click')
    await wrapper.get('[name="egress-policy"]').setValue('drop')
    await wrapper.get('[data-testid="group-form"]').trigger('submit'); await flushPromises()
    expect(JSON.parse(requests.find(r => r.method === 'patch').data)).toEqual({ name: 'web', description: '网站', ingress_policy: 'drop', egress_policy: 'drop' })
    await wrapper.get('[data-testid="delete-group-7"]').trigger('click'); await (wrapper.vm as any).remove(); await flushPromises()
    expect(wrapper.text()).toContain('安全组仍被实例绑定')
    expect(wrapper.get('[data-testid="group-list"]').text()).toContain('web')
    wrapper.unmount()
  })
  it('retains a failed create draft, blocks duplicate writes and ignores stale list loads', async () => {
    const write = deferred<any>(), old = deferred<any>(); let reads = 0, writes = 0
    http.defaults.adapter = async config => {
      if (config.method === 'post') { writes++; await write.promise }
      const data = config.method === 'get' && ++reads === 1 ? await old.promise : { items: [group] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupsView, { global: { ...globals, stubs: { DialogContent: slot } } }); await flushPromises()
    const vm = wrapper.vm as any
    await vm.load(); old.resolve({ items: [] }); await flushPromises()
    expect(wrapper.get('[data-testid="group-list"]').text()).toContain('web')
    await wrapper.get('[data-testid="new-group"]').trigger('click')
    await wrapper.get('[name="group-name"]').setValue('draft')
    const pending = vm.save(); await flushPromises(); await vm.save()
    expect(writes).toBe(1)
    expect(wrapper.get('[data-testid="group-form"] fieldset').attributes('disabled')).toBeDefined()
    write.reject({ response: { status: 500, data: { message: '应用失败，请重试' } } }); await pending; await flushPromises()
    expect(wrapper.text()).toContain('应用失败，请重试')
    expect((wrapper.get('[name="group-name"]').element as HTMLInputElement).value).toBe('draft')
    wrapper.unmount()
  })
})
