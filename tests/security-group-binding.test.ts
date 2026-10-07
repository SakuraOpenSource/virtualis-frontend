import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SecurityGroupPanel from '@/components/app/SecurityGroupPanel.vue'
import { http } from '@/lib/api'
import { deferred, globals } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const rule = { direction: 'in', action: 'accept', protocol: 'tcp', port_start: 443, port_end: 443, cidr: '0.0.0.0/0', priority: 10, enabled: true, remark: 'https' }
const group = { id: 7, name: 'web', description: '网站', ingress_policy: 'drop', egress_policy: 'accept', rules: [rule] }
const effective = { security_group_ids: [7], groups: [group], effective_rules: [rule], firewall_policy: { ingress: 'drop', egress: 'accept' } }
describe('instance security group binding', () => {
  it('binds selected IDs and reads authoritative effective rules/defaults back', async () => {
    const requests: any[] = []; let bound = false
    http.defaults.adapter = async config => {
      requests.push(config)
      if (config.method === 'put') bound = true
      const data = config.url === '/admin/security-groups' ? { items: [group] } : bound ? effective : { security_group_ids: [], groups: [], effective_rules: [], firewall_policy: null }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupPanel, { props: { instanceId: 4 }, global: globals }); await flushPromises()
    await wrapper.get('[data-testid="security-group-7"]').setValue(true)
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const put = requests.find(r => r.method === 'put')
    expect(put.url).toBe('/instances/4/security-groups')
    expect(JSON.parse(put.data)).toEqual({ security_group_ids: [7] })
    expect(wrapper.get('[data-testid="effective-policy"]').text()).toContain('入站：丢弃')
    expect(wrapper.get('[data-testid="effective-rules"]').text()).toContain('443')
    expect(wrapper.text()).not.toContain('允许全部流量')
    expect(requests.filter(r => r.method === 'get' && r.url === '/instances/4/security-groups')).toHaveLength(2)
    expect(wrapper.emitted('busy-change')?.map(v => v[0])).toEqual(['保存安全组', ''])
    wrapper.unmount()
  })
  it('keeps a failed draft, locks duplicate writes and clears unconfirmed effective state', async () => {
    const write = deferred<any>(); let writes = 0
    http.defaults.adapter = async config => {
      if (config.method === 'put') { writes++; await write.promise }
      return { data: config.url === '/admin/security-groups' ? { items: [group] } : effective, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupPanel, { props: { instanceId: 4 }, global: globals }); await flushPromises()
    await wrapper.get('[data-testid="security-group-7"]').setValue(false)
    const vm = wrapper.vm as any, pending = vm.save(); await flushPromises(); await vm.save()
    expect(writes).toBe(1)
    expect(wrapper.get('[data-testid="save-binding"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="effective-policy"]').exists()).toBe(false)
    write.reject({ response: { status: 503, data: { message: '节点不支持安全组策略' } } }); await pending; await flushPromises()
    expect(wrapper.text()).toContain('节点不支持安全组策略')
    expect(vm.selected).toEqual([])
    expect(wrapper.find('[data-testid="effective-policy"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save-binding"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('blocks unsafe writes on failed reads, displays loading and ignores older instance responses', async () => {
    const old = deferred<any>(); let writes = 0
    http.defaults.adapter = async config => {
      if (config.method === 'put') writes++
      const data = config.url === '/admin/security-groups' ? { items: [group] } : config.url === '/instances/4/security-groups' ? await old.promise : effective
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(SecurityGroupPanel, { props: { instanceId: 4 }, global: globals }); await flushPromises()
    expect(wrapper.text()).toContain('加载安全组中')
    await (wrapper.vm as any).save(); expect(writes).toBe(0)
    await wrapper.setProps({ instanceId: 5 }); await flushPromises()
    old.resolve({ security_group_ids: [], groups: [], effective_rules: [], firewall_policy: null }); await flushPromises()
    expect(wrapper.get('[data-testid="effective-policy"]').text()).toContain('入站：丢弃')
    http.defaults.adapter = async config => { throw { response: { status: 500, data: { message: '读取失败' } }, config } }
    await (wrapper.vm as any).load(); await flushPromises()
    expect(wrapper.text()).toContain('读取失败')
    expect(wrapper.find('[data-testid="effective-policy"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save-binding"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
