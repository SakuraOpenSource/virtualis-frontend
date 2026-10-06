import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { http } from '@/lib/api'
import { instance, globals, slot } from './helpers'
import { createPinia } from 'pinia'
import { router } from '@/router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))

describe('trash route', () => {
  it('lists retention and confirms restore and permanent deletion', async () => {
    const route = router.getRoutes().find(r => r.name === 'trash')
    expect(route, 'trash needs a real route').toBeDefined()
    const component = await (route!.components!.default as any)()
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      return { data: config.method === 'get' ? { items: [{ ...instance, trashed_at: '2026-10-05T00:00:00Z', purge_after: '2026-11-04T00:00:00Z' }], total: 1 } : instance, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(component.default, { global: { ...globals, plugins: [createPinia()], stubs: { DialogContent: slot } } })
    await flushPromises()
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('保留')
    await wrapper.findAll('button').find(b => b.text() === '恢复')!.trigger('click')
    expect(requests.filter(r => r.method === 'post')).toHaveLength(0)
    await wrapper.findAll('button').find(b => b.text() === 'common.confirm')!.trigger('click')
    await flushPromises()
    expect(requests.some(r => r.method === 'post' && r.url === '/trash/4/restore')).toBe(true)
    await wrapper.findAll('button').find(b => b.text() === '永久删除')!.trigger('click')
    await wrapper.findAll('button').find(b => b.text() === 'common.confirm')!.trigger('click')
    await flushPromises()
    expect(requests.some(r => r.method === 'delete' && r.url === '/trash/4')).toBe(true)
    wrapper.unmount()
  })
})
