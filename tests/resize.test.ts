import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ResizeDialog from '@/components/app/ResizeDialog.vue'
import ConfirmDialog from '@/components/app/ConfirmDialog.vue'
import { http } from '@/lib/api'
import { deferred, globals, instance, slot } from './helpers'
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (v: string) => v }) }))

describe('resize confirmation and persistence', () => {
  it('confirms fractional CPU and zero limits while preserving the full existing network', async () => {
    const gate = deferred<any>(), requests: any[] = []
    http.defaults.adapter = async config => { requests.push(config); return { data: await gate.promise, status: 200, statusText: 'OK', headers: {}, config } }
    const original = { ...instance, network: { ...instance.network, ipv4: '10.0.0.4/24', gateway: '10.0.0.1', dns: ['1.1.1.1'], bridge: 'source-net' } }
    const wrapper = mount(ResizeDialog, { props: { open: true, instance: original }, global: { ...globals, stubs: { DialogContent: slot } } })
    await wrapper.find('[data-testid="resize-cpu"]').setValue('0.5')
    await wrapper.find('[data-testid="resize-memory"]').setValue('2048')
    await wrapper.find('[data-testid="resize-disk"]').setValue('30')
    await wrapper.find('[data-testid="resize-bandwidth"]').setValue('0')
    await wrapper.find('[data-testid="resize-traffic"]').setValue('0')
    await wrapper.find('[data-testid="resize-form"]').trigger('submit'); await flushPromises()
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(true)
    expect(requests).toHaveLength(0)
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises()
    expect(JSON.parse(requests[0].data)).toEqual({ spec: { cpu: 1, cpu_milli: 500, memory_mb: 2048, disk_gb: 30, arch: 'x86_64' }, network: { ...original.network, bandwidth_mbps: 0, traffic_gb: 0 } })
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
    gate.resolve({ ...original, spec: { ...original.spec, disk_gb: 30 } }); await flushPromises()
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ spec: { disk_gb: 30 } })
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })
})
