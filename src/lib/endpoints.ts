import { http } from './api'
import type {
  Bootstrap, CaptchaChallenge, CaptchaSettings, SiteSettings, VirtualisSettings,
  Page, User, VirtualisInstance, VirtualisImage, VirtualisDriver, InstanceMetrics, NetworkStatus, VNCInfo, NetworkConfig,
  VirtualisAgent, AgentDownload, APIKeyList, APIKeyCreated, APIKeyInput, DatabaseConfig, InstallRequest,
  HostNetworkSummary,
  NATMapping,
  InstanceOperationLog
  , BatchAction, BatchResult, Snapshot, Backup, VPC, VPCInput, FirewallRule, FirewallInput, FreeIPEntry, IPPoolOverview, IPPoolInput, IPPoolEntry
} from './types'

interface PageQuery { page?: number; page_size?: number }

export const siteApi = {
  async bootstrap() {
    const { data } = await http.get<Bootstrap>('/bootstrap')
    return data
  },
  async testDatabase(cfg: DatabaseConfig) {
    const { data } = await http.post<{ ok: boolean }>('/install/test-db', cfg)
    return data
  },
  async install(payload: InstallRequest) {
    const { data } = await http.post<{ ok: boolean; user?: User }>('/install', payload)
    return data
  },
}

export const captchaApi = {
  async issue() {
    const { data } = await http.get<CaptchaChallenge>('/captcha')
    return data
  },
}

export interface CaptchaAnswer { captcha_id?: string; captcha_code?: string }

export const authApi = {
  async login(identifier: string, password: string, captcha: CaptchaAnswer = {}) {
    const { data } = await http.post<{ user: User }>('/auth/login', { identifier, password, ...captcha })
    return data.user
  },
  async logout() { await http.post('/auth/logout') },
  async me() {
    const { data } = await http.get<{ user: User }>('/me')
    return data.user
  },
  async updateEmail(password: string, email: string) {
    const { data } = await http.patch<{ user: User }>('/me/email', { password, email })
    return data.user
  },
  async updatePassword(old_password: string, new_password: string) {
    await http.post('/me/password', { old_password, new_password })
  },
}

export const virtualisApi = {
  /** 新增 NAT 端口映射；host_port 传 0 由主控自动分配。 */
  async createNATMapping(id: number, payload: { protocol: string; host_port?: number; guest_port: number; remark?: string }) {
    const { data } = await http.post<NATMapping>(`/instances/${id}/nat`, payload)
    return data
  },
  async deleteNATMapping(id: number, mappingId: number) {
    await http.delete(`/instances/${id}/nat/${mappingId}`)
  },
  /** 设置 root 密码；实例运行中会异步注入（QEMU 依赖 guest agent）。 */
  async setPassword(id: number, password: string) {
    const { data } = await http.post<VirtualisInstance>(`/instances/${id}/password`, { password })
    return data
  },
  async drivers() {
    const { data } = await http.get<{ items: VirtualisDriver[] }>('/drivers')
    return data.items ?? []
  },
  async instances(query: PageQuery = {}) {
    const { data } = await http.get<Page<VirtualisInstance>>('/instances', { params: query })
    return data
  },
  async instance(id: number) {
    const { data } = await http.get<VirtualisInstance>(`/instances/${id}`)
    return data
  },
  async createInstance(payload: { name: string; agent_id: number; driver?: string; type?: string; spec: { cpu: number; cpu_milli?: number; memory_mb: number; disk_gb: number; arch?: string }; network?: NetworkConfig; image_id?: number | null; max_nat_mappings?: number; auto_password?: boolean; ip_pool_entry_id?: number; vpc_id?: number }) {
    const { data } = await http.post<VirtualisInstance>('/instances', payload)
    return data
  },
  async migrate(id: number, payload: { target_agent_id: number; vpc_id?: number; ip_pool_entry_id?: number; network?: NetworkConfig }) {
    return (await http.post<VirtualisInstance>(`/instances/${id}/migrate`, payload, longTask)).data
  },
  async resize(id: number, payload: { spec: VirtualisInstance['spec']; network?: NetworkConfig }) {
    return (await http.patch<VirtualisInstance>(`/instances/${id}/spec`, payload, longTask)).data
  },
  async deleteInstance(id: number) { await http.delete(`/instances/${id}`, longTask) },
  async trash(query: PageQuery = {}) {
    return (await http.get<Page<VirtualisInstance>>('/trash', { params: query })).data
  },
  async restoreTrash(id: number) {
    return (await http.post<VirtualisInstance>(`/trash/${id}/restore`, {}, longTask)).data
  },
  async purgeTrash(id: number) { await http.delete(`/trash/${id}`, longTask) },
  async batch(ids: number[], action: BatchAction) {
    return (await http.post<BatchResult>('/instances/batch', { ids: [...new Set(ids)], action }, longTask)).data
  },
  async power(id: number, action: string, image_id?: number | null) {
    const body: Record<string, unknown> = { action }
    if (image_id != null) body.image_id = image_id
    const { data } = await http.post<VirtualisInstance>(`/instances/${id}/power`, body)
    return data
  },
  async status(id: number) {
    const { data } = await http.get<VirtualisInstance>(`/instances/${id}/status`)
    return data
  },
  async metrics(id: number) {
    const { data } = await http.get<{ metrics: InstanceMetrics }>(`/instances/${id}/metrics`)
    return data.metrics
  },
  async network(id: number) {
    const { data } = await http.get<{ network: NetworkStatus }>(`/instances/${id}/network`)
    return data.network
  },
  async configureNetwork(id: number, network?: NetworkConfig) {
    const { data } = await http.post<{ instance: VirtualisInstance; operation_id: string }>(
      `/instances/${id}/network/configure`,
      { network: network ?? {} },
    )
    return data
  },
  async operationLogs(id: number, query: PageQuery = {}) {
    const { data } = await http.get<Page<InstanceOperationLog>>(`/instances/${id}/logs`, { params: query })
    return data
  },
  async vnc(id: number) {
    const { data } = await http.get<{ vnc: VNCInfo }>(`/instances/${id}/vnc`)
    return data.vnc
  },
  async images() {
    const { data } = await http.get<{ items: VirtualisImage[] | null }>('/images')
    return data.items ?? []
  },
  async image(id: number) {
    const { data } = await http.get<VirtualisImage>(`/images/${id}`)
    return data
  },
  async createImage(payload: { name: string; driver: string; type?: string; file_path: string; size_bytes?: number; checksum?: string }) {
    const { data } = await http.post<VirtualisImage>('/images', payload)
    return data
  },
  async uploadImage(file: File, payload: { name?: string; driver: string; type: string; os_type?: string; os_version?: string; arch?: string }) {
    const form = new FormData()
    form.append('file', file)
    for (const [key, value] of Object.entries(payload)) if (value != null) form.append(key, value)
    const { data } = await http.post<VirtualisImage>('/images/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 })
    return data
  },
  imageDownloadUrl(id: number) { return `/api/images/${id}/download` },

  async imagePresets(params: { driver: string; distro?: string; release?: string; arch?: string; variant?: string }) {
    const qs = new URLSearchParams({ driver: params.driver })
    for (const k of ['distro', 'release', 'arch', 'variant'] as const) {
      if ((params as any)[k]) qs.set(k, (params as any)[k])
    }
    const { data } = await http.get<{ items?: Array<{ name: string; display_name?: string; url?: string; extra_url?: string; os_type?: string; os_version?: string; arch?: string; note?: string }>; build?: string }>(`/images/presets?${qs}`)
    return data
  },

  async downloadImage(payload: { name: string; driver: string; type: string; url: string; extra_url?: string; os_type?: string; os_version?: string; arch?: string }) {
    const { data } = await http.post<VirtualisImage>('/images/download', payload)
    return data
  },
  async deleteImage(id: number) { await http.delete(`/images/${id}`) },
}

// Recovery is synchronous; never cut an archive/restore request off at a short UI timeout.
export const LONG_TASK_TIMEOUT = 2 * 60 * 60 * 1000
const longTask = { timeout: LONG_TASK_TIMEOUT }
export const recoveryApi = {
  async snapshots(id: number) {
    return (await http.get<{ items: Snapshot[] | null }>(`/instances/${id}/snapshots`)).data.items ?? []
  },
  async backups(id: number) {
    return (await http.get<{ items: Backup[] | null }>(`/instances/${id}/backups`)).data.items ?? []
  },
  async createSnapshot(id: number, payload: { name: string; remark?: string }) {
    return (await http.post<Snapshot>(`/instances/${id}/snapshots`, payload, longTask)).data
  },
  async restoreSnapshot(id: number, sid: number) {
    return (await http.post<VirtualisInstance>(`/instances/${id}/snapshots/${sid}/restore`, {}, longTask)).data
  },
  async deleteSnapshot(id: number, sid: number) {
    await http.delete(`/instances/${id}/snapshots/${sid}`, longTask)
  },
  async createBackup(id: number, payload: { name: string; remark?: string }) {
    return (await http.post<Backup>(`/instances/${id}/backups`, payload, longTask)).data
  },
  async restoreBackup(id: number, bid: number) {
    return (await http.post<VirtualisInstance>(`/instances/${id}/backups/${bid}/restore`, {}, longTask)).data
  },
  async deleteBackup(id: number, bid: number) {
    await http.delete(`/instances/${id}/backups/${bid}`, longTask)
  },
  // Browser streams the authenticated attachment; do not buffer GiB in an Axios Blob.
  backupDownloadUrl(id: number, bid: number) { return `/api/instances/${id}/backups/${bid}/download` },
}

export const networkApi = {
  async vpcs(agent_id?: number) { return (await http.get<{items: VPC[]}>('/vpcs', {params: {agent_id}})).data.items ?? [] },
  async createVPC(payload: VPCInput) { return (await http.post<VPC>('/vpcs', payload)).data },
  async deleteVPC(id: number) { await http.delete(`/vpcs/${id}`) },
  async pool(agentID: number) { return (await http.get<IPPoolOverview>(`/admin/ip-pools/${agentID}`)).data },
  async savePool(agentID: number, payload: IPPoolInput) { return (await http.put<IPPoolOverview>(`/admin/ip-pools/${agentID}`, payload)).data },
  async addIPs(agentID: number, ips: string[]) { return (await http.post<{created: number; skipped: {ip: string; reason: string}[]}>(`/admin/ip-pools/${agentID}/entries`, {ips})).data },
  async updateIP(id: number, payload: Partial<Pick<IPPoolEntry, 'gateway'|'prefix'|'note'|'status'>>) { return (await http.patch<IPPoolEntry>(`/admin/ip-pool-entries/${id}`, payload)).data },
  async deleteIP(id: number) { await http.delete(`/admin/ip-pool-entries/${id}`) },
  async freeIPs(agentID: number) { return (await http.get<{items: FreeIPEntry[]}>(`/ip-pools/${agentID}/free`)).data.items ?? [] },
  async firewall(instanceID: number) { return (await http.get<{items: FirewallRule[]}>(`/instances/${instanceID}/firewall`)).data.items ?? [] },
  async createFirewall(instanceID: number, payload: FirewallInput) { return (await http.post<FirewallRule>(`/instances/${instanceID}/firewall`, payload)).data },
  async updateFirewall(id: number, payload: FirewallInput) { return (await http.patch<FirewallRule>(`/firewall/${id}`, payload)).data },
  async deleteFirewall(id: number) { await http.delete(`/firewall/${id}`) },
}

export const agentApi = {
  /** 被控主机网卡清单；独立 IP 模式的挂载接口与可用性判断数据源。 */
  async hostNetwork(id: number) {
    const { data } = await http.get<HostNetworkSummary>(`/admin/agents/${id}/network`)
    return data
  },
  async list() {
    const { data } = await http.get<{ items: VirtualisAgent[] }>('/admin/agents')
    return data.items ?? []
  },
  async create(payload: { name: string; display_name?: string }) {
    const { data } = await http.post<{ agent: VirtualisAgent; token: string; join_cmd: string; curl_cmd: string; downloads: AgentDownload[] }>('/admin/agents', payload)
    return data
  },
  async rotateToken(id: number) {
    const { data } = await http.post<{ agent: VirtualisAgent; token: string; join_cmd: string; curl_cmd: string; downloads: AgentDownload[] }>(`/admin/agents/${id}/rotate-token`)
    return data
  },
  async remove(id: number) { await http.delete(`/admin/agents/${id}`) },
}

export const apiKeyApi = {
  async list() {
    const { data } = await http.get<APIKeyList>('/api-keys')
    return data
  },
  async create(payload: APIKeyInput = {}) {
    const { data } = await http.post<APIKeyCreated>('/api-keys', payload)
    return data
  },
  async revoke(id: number) { await http.delete(`/api-keys/${id}`) },
}

export const adminApi = {
  async site() {
    const { data } = await http.get<SiteSettings>('/admin/settings')
    return data
  },
  async updateSite(payload: SiteSettings) {
    const { data } = await http.put<SiteSettings>('/admin/settings', payload)
    return data
  },
  async virtualis() {
    const { data } = await http.get<VirtualisSettings>('/admin/settings/virtualis')
    return data
  },
  async updateVirtualis(payload: VirtualisSettings) {
    const { data } = await http.put<VirtualisSettings>('/admin/settings/virtualis', payload)
    return data
  },
  async captcha() {
    const { data } = await http.get<CaptchaSettings>('/admin/settings/captcha')
    return data
  },
  async updateCaptcha(payload: CaptchaSettings) {
    const { data } = await http.put<CaptchaSettings>('/admin/settings/captcha', payload)
    return data
  },
}
