import { describe, expect, it } from 'vitest'
import { router } from '@/router'
import zh from '@/locales/zh-CN'
import { http } from '@/lib/api'
import { securityGroupApi } from '@/lib/endpoints'

describe('security group API and navigation contract', () => {
  it('routes the admin console to functional reusable security group management with Chinese labels', async () => {
    const route = router.resolve('/admin/security-groups')
    expect(route.name).toBe('security-groups')
    expect(route.meta.requiresAuth).toBe(true)
    expect((zh.nav as any).securityGroups).toBe('安全组')
    expect((zh as any).securityGroups.title).toBe('安全组管理')
  })
  it('uses exact admin CRUD/rules and instance binding endpoints and normalizes a null list', async () => {
    const requests: any[] = []
    http.defaults.adapter = async config => { requests.push(config); return { data: { items: null }, status: 200, statusText: 'OK', headers: {}, config } }
    expect(await securityGroupApi.list()).toEqual([])
    const payload = { name: 'web', description: '', ingress_policy: 'drop' as const, egress_policy: 'accept' as const }
    await securityGroupApi.create(payload); await securityGroupApi.get(7); await securityGroupApi.update(7, payload); await securityGroupApi.rules(7, []); await securityGroupApi.remove(7)
    await securityGroupApi.binding(4); await securityGroupApi.bind(4, [])
    expect(requests.map(r => [r.method, r.url])).toEqual([
      ['get', '/admin/security-groups'], ['post', '/admin/security-groups'], ['get', '/admin/security-groups/7'], ['patch', '/admin/security-groups/7'], ['put', '/admin/security-groups/7/rules'], ['delete', '/admin/security-groups/7'], ['get', '/instances/4/security-groups'], ['put', '/instances/4/security-groups'],
    ])
    expect(JSON.parse(requests[4].data)).toEqual({ rules: [] })
    expect(JSON.parse(requests[7].data)).toEqual({ security_group_ids: [] })
  })
})
