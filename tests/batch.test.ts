import { describe, expect, it, vi } from 'vitest'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
import { flushPromises, mount } from '@vue/test-utils'
import InstancesView from '@/views/admin/InstancesView.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { http } from '@/lib/api'
import { globals, instance, slot } from './helpers'

describe('current-page batch selection', () => {
  it('shows an explicit unknown outcome for each submitted id when the batch request fails', async () => {
    http.defaults.adapter = async config => {
      if (config.url === '/instances/batch') throw new Error('connection lost')
      return { data: config.url === '/instances' ? { items: [instance, { ...instance, id: 7 }], total: 2 } : { items: [] }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstancesView, { global: { ...globals, stubs: { RouterLink: slot, DialogContent: slot } } }); await flushPromises()
    await wrapper.find('[aria-label="选择本页全部实例"]').setValue(true)
    await wrapper.find('[data-testid="run-batch"]').trigger('click')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
    expect(wrapper.find('[data-testid="batch-results"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="batch-results"]').text()).toContain('#4')
    expect(wrapper.find('[data-testid="batch-results"]').text()).toContain('#7')
    expect(wrapper.find('[data-testid="batch-results"]').text()).toContain('执行状态未知')
    wrapper.unmount()
  })

  it('dedupes current-page selection, confirms, shows every result and clears after page change', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.url === '/instances' ? { items: config.params?.page === 2 ? [{ ...instance, id: 9 }] : [instance, { ...instance, id: 7, name: 'offline-vm' }], total: 21 } : config.url === '/instances/batch' ? { ok: [4], failed: [{ id: 7, reason: 'agent offline' }] } : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(InstancesView, { global: { ...globals, mocks: { $t: (v: string) => v }, stubs: { RouterLink: slot, DialogContent: slot } } })
    await flushPromises()
    expect(wrapper.find('[aria-label="选择本页全部实例"]').exists()).toBe(true)
    await wrapper.find('[aria-label="选择本页全部实例"]').setValue(true)
    expect(wrapper.text()).toContain('已选 2 项')
    await wrapper.find('[data-testid="batch-action"]').setValue('stop')
    await wrapper.find('[data-testid="run-batch"]').trigger('click')
    expect(requests.some(r => r.url === '/instances/batch')).toBe(false)
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm')
    await flushPromises()
    expect(JSON.parse(requests.find(r => r.url === '/instances/batch').data)).toEqual({ ids: [4, 7], action: 'stop' })
    expect(wrapper.find('[data-testid="batch-results"]').text()).toContain('#4')
    expect(wrapper.find('[data-testid="batch-results"]').text()).toContain('agent offline')
    await wrapper.find('[aria-label="选择实例 #4"]').setValue(true)
    await wrapper.findAll('button').find(b => b.text() === '下一页')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已选 0 项')
    wrapper.unmount()
  })
})
