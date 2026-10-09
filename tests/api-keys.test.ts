import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ApiKeysView from '@/views/admin/ApiKeysView.vue'
import { http } from '@/lib/api'
import { globals, slot } from './helpers'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const global = { ...globals, stubs: { DialogContent: slot } }

const now = '2026-10-08T00:00:00Z'

describe('api keys view contract', () => {
  it('renders the scope catalog and requests selected scopes/expiry on create, then shows what was granted', async () => {
    const requests: any[] = []
    const granted = {
      key: { id: 3, user_id: 1, name: 'Virtualis Site Key', prefix: 'lvs_ab12cd34', scopes: ['instance:read'], status: 'active', expires_at: '2026-11-07T00:00:00Z', last_used_at: null, created_at: now, updated_at: now },
      secret: 'lvs_plain-secret-value',
    }
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.method === 'post'
        ? granted
        // New contract: list is read-only and advertises the scope catalog.
        : { items: [], scopes: ['instance:read', 'instance:write', 'image:read', 'image:write'] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(ApiKeysView, { global }); await flushPromises()
    // Scope/expiry controls must appear once the catalog is known.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(4)
    const readCheckbox = wrapper.findAll('input[type="checkbox"]')[0]!
    await readCheckbox.setValue(true)
    await wrapper.get('input[inputmode="numeric"]').setValue('30')
    await wrapper.findAll('button').find(b => b.text().includes('生成密钥'))!.trigger('click')
    await flushPromises()
    const create = requests.find(r => r.method === 'post' && r.url === '/api-keys')
    expect(JSON.parse(create.data)).toEqual({ scopes: ['instance:read'], expires_in_days: 30 })
    // The table renders the actually granted scopes and expiry, not a hardcoded "all permissions".
    expect(wrapper.text()).toContain('实例只读')
    // formatDateTime renders in the local timezone; assert on the localized date shape.
    expect(wrapper.text()).toMatch(/2026\/11\/(0?7|0?8)/)
    wrapper.unmount()
  })

  it('degrades gracefully when the backend keeps the legacy read-only site-key contract', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      // Legacy shape: no scope catalog in the list response.
      const data = config.method === 'post'
        ? { key: { id: 1, user_id: 1, name: 'Virtualis Site Key', prefix: 'lvs_old', scopes: ['instance:read', 'instance:write', 'image:read', 'image:write'], status: 'active', expires_at: null, last_used_at: null, created_at: now, updated_at: now }, secret: 'lvs_legacy' }
        : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(ApiKeysView, { global }); await flushPromises()
    // No catalog -> no scope/expiry controls, and the create call sends no
    // scope/expiry fields the legacy backend would ignore anyway.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('全站单密钥模式')
    await wrapper.findAll('button').find(b => b.text().includes('生成密钥'))!.trigger('click')
    await flushPromises()
    const create = requests.find(r => r.method === 'post' && r.url === '/api-keys')
    expect(JSON.parse(create.data)).toEqual({})
    // Legacy rows with null scopes still render something meaningful.
    expect(wrapper.text()).toContain('实例只读')
    expect(wrapper.text()).toContain('永久')
    wrapper.unmount()
  })
})
