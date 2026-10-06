import { describe, expect, it } from 'vitest'
import { http } from '@/lib/api'
import * as endpoints from '@/lib/endpoints'

function transport(response: unknown = {}) {
  const requests: any[] = []
  http.defaults.adapter = async config => {
    requests.push(config)
    return { data: response, status: 200, statusText: 'OK', headers: {}, config }
  }
  return requests
}

describe('recovery HTTP contract', () => {
  it('lists bare items and performs create/restore/delete with long-task timeouts', async () => {
    const api = (endpoints as any).recoveryApi
    expect(api, 'recovery API must exist').toBeDefined()
    const row = { id: 8, instance_id: 4, name: 'before-update', size_bytes: 0 }
    const requests = transport({ items: [row] })
    expect(await api.snapshots(4)).toEqual([row])
    expect(await api.backups(4)).toEqual([row])
    await api.createSnapshot(4, { name: 'before-update', remark: 'safe point' })
    await api.restoreSnapshot(4, 8)
    await api.deleteSnapshot(4, 8)
    await api.createBackup(4, { name: 'offsite' })
    await api.restoreBackup(4, 8)
    await api.deleteBackup(4, 8)
    expect(requests.map(r => [r.method, r.url])).toEqual([
      ['get', '/instances/4/snapshots'], ['get', '/instances/4/backups'],
      ['post', '/instances/4/snapshots'], ['post', '/instances/4/snapshots/8/restore'],
      ['delete', '/instances/4/snapshots/8'], ['post', '/instances/4/backups'],
      ['post', '/instances/4/backups/8/restore'], ['delete', '/instances/4/backups/8'],
    ])
    for (const request of requests.slice(2)) expect(request.timeout).toBe(7200000)
    expect(JSON.parse(requests[2].data)).toEqual({ name: 'before-update', remark: 'safe point' })
    expect(api.backupDownloadUrl(4, 8)).toBe('/api/instances/4/backups/8/download')
  })
})
