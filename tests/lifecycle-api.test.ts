import { describe, expect, it } from 'vitest'
import { http } from '@/lib/api'
import { virtualisApi } from '@/lib/endpoints'

describe('recycle and batch HTTP contract', () => {
  it('uses trash endpoints and deduplicates batch IDs with per-entry results', async () => {
    const api = virtualisApi as any
    expect(api.trash).toBeTypeOf('function')
    const requests: any[] = []
    const results = { ok: [4], failed: [{ id: 7, reason: 'offline' }] }
    http.defaults.adapter = async config => { requests.push(config); return { data: config.url === '/instances/batch' ? results : { items: [], total: 0 }, status: 200, statusText: 'OK', headers: {}, config } }
    await api.trash({ page: 2, page_size: 20 })
    await api.restoreTrash(4)
    await api.purgeTrash(7)
    expect(await api.batch([4, 4, 7], 'stop')).toEqual(results)
    expect(requests.map(r => [r.method, r.url])).toEqual([['get', '/trash'], ['post', '/trash/4/restore'], ['delete', '/trash/7'], ['post', '/instances/batch']])
    expect(requests[0].params).toEqual({ page: 2, page_size: 20 })
    expect(JSON.parse(requests[3].data)).toEqual({ ids: [4, 7], action: 'stop' })
    expect(requests.slice(1).every(r => r.timeout === 7200000)).toBe(true)
  })
})
