import { describe, expect, it } from 'vitest'
import { http } from '@/lib/api'
import { LONG_TASK_TIMEOUT, virtualisApi } from '@/lib/endpoints'
import { instance } from './helpers'

describe('placement and resize contract', () => {
  it('uses the synchronous migration endpoint and returns the bare Instance', async () => {
    let captured: any
    http.defaults.adapter = async config => { captured = config; return { data: instance, status: 200, statusText: 'OK', headers: {}, config } }
    expect(await (virtualisApi as any).migrate(4, { target_agent_id: 2, vpc_id: 8, network: { mode: 'vpc' } })).toEqual(instance)
    expect(captured.url).toBe('/instances/4/migrate')
    expect(captured.method).toBe('post')
    expect(captured.timeout).toBe(LONG_TASK_TIMEOUT)
    expect(JSON.parse(captured.data)).toEqual({ target_agent_id: 2, vpc_id: 8, network: { mode: 'vpc' } })
  })
  it('PATCHes complete intended spec and network limits without dropping zero values', async () => {
    let captured: any
    http.defaults.adapter = async config => { captured = config; return { data: instance, status: 200, statusText: 'OK', headers: {}, config } }
    const payload = { spec: { cpu: 1, cpu_milli: 500, memory_mb: 2048, disk_gb: 30, arch: 'x86_64' }, network: { ...instance.network, bandwidth_mbps: 0, traffic_gb: 0 } }
    expect(await (virtualisApi as any).resize(4, payload)).toEqual(instance)
    expect(captured.url).toBe('/instances/4/spec')
    expect(captured.method).toBe('patch')
    expect(captured.timeout).toBe(LONG_TASK_TIMEOUT)
    expect(JSON.parse(captured.data)).toEqual(payload)
  })
})
