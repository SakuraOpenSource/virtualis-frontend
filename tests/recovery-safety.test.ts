import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecoveryPanel from '@/components/app/RecoveryPanel.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { http } from '@/lib/api'
import { instance, globals, slot, deferred } from './helpers'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))
const global = { ...globals, stubs: { DialogContent: slot } }

describe('recovery safety', () => {
  it('shows source metadata and prevents restoring incompatible or fenced recovery records', async () => {
    // Master persists recovery points as `available` (not the legacy `ready`);
    // the panel must render real backend state without a frontend-only alias.
    http.defaults.adapter = async config => ({ data: { items: config.url?.endsWith('snapshots') ? [{ id: 8, agent_id: 9, name: 'old-node', size_bytes: 0, status: 'available', error: 'source missing' }] : [{ id: 10, agent_id: 1, driver: 'incus', name: 'different-driver', size_bytes: 20, status: 'available', checksum: 'abc123' }] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(RecoveryPanel, { props: { instance }, global }); await flushPromises()
    expect(wrapper.text()).toContain('节点 #9')
    expect(wrapper.text()).toContain('incus')
    expect(wrapper.text()).toContain('source missing')
    expect(wrapper.text()).toContain('available')
    expect(wrapper.findAll('button').filter(b => b.text() === '恢复').every(b => b.attributes('disabled') !== undefined)).toBe(true)
    await wrapper.setProps({ instance: { ...instance, busy_operation: 'fence-1', busy_action: 'restore' } })
    expect(wrapper.find('[data-testid="snapshot-name"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps restore and backup download usable for the Master `available` status and the legacy `ready` alias', async () => {
    http.defaults.adapter = async config => ({ data: { items: config.url?.endsWith('snapshots') ? [{ id: 8, agent_id: 1, name: 'fresh-snap', size_bytes: 10, status: 'available' }] : [{ id: 11, agent_id: 1, driver: 'qemu', name: 'fresh-backup', size_bytes: 20, status: 'ready', checksum: 'aa' }] }, status: 200, statusText: 'OK', headers: {}, config })
    const wrapper = mount(RecoveryPanel, { props: { instance }, global }); await flushPromises()
    // instance fixture is stopped and same agent/driver, so both rows must be actionable
    const restoreButtons = wrapper.findAll('button').filter(b => b.text() === '恢复')
    expect(restoreButtons).toHaveLength(2)
    expect(restoreButtons.every(b => b.attributes('disabled') === undefined)).toBe(true)
    expect(wrapper.findAll('button').find(b => b.text() === '下载')?.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('confirms restore, locks its confirmation and form until the real request settles', async () => {
    const gate = deferred<any>()
    const requests: any[] = []
    http.defaults.adapter = async config => {
      requests.push(config)
      const data = config.method === 'post' ? await gate.promise : config.url?.endsWith('snapshots') ? { items: [{ id: 8, name: 'before-update', size_bytes: 0, status: 'ready' }] } : { items: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const wrapper = mount(RecoveryPanel, { props: { instance }, global })
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '恢复')!.trigger('click')
    expect(requests.filter(r => r.method === 'post')).toHaveLength(0)
    const dialog = wrapper.findComponent(ConfirmDialog)
    await dialog.findAll('button').find(b => b.text() === 'common.confirm')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="snapshot-name"]').attributes('disabled')).toBeDefined()
    expect(dialog.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.text()).not.toMatch(/\d+%/)
    gate.resolve(instance)
    await flushPromises()
    expect(wrapper.emitted('updated')?.[0]).toEqual([instance])
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })

  it('prevents closing or confirming a busy destructive dialog', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, title: 'restore', description: 'overwrite', busy: true }, global })
    for (const button of wrapper.findAll('button')) await button.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(wrapper.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true)
    wrapper.unmount()
  })
})
