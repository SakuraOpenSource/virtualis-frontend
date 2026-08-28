import { http } from './api'
import type {
  Bootstrap, CaptchaChallenge, CaptchaSettings, SiteSettings, VirtualisSettings,
  Page, User, VirtualisInstance, VirtualisImage, VirtualisDriver, InstanceMetrics, NetworkStatus, VNCInfo, NetworkConfig,
  VirtualisAgent, AgentDownload, APIKeyList, APIKeyCreated, APIKeyInput, DatabaseConfig, InstallRequest,
  HostNetworkSummary
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
  async createInstance(payload: { name: string; agent_id: number; driver?: string; type?: string; spec: { cpu: number; memory_mb: number; disk_gb: number; arch?: string }; network?: NetworkConfig; image_id?: number | null }) {
    const { data } = await http.post<VirtualisInstance>('/instances', payload)
    return data
  },
  async deleteInstance(id: number) { await http.delete(`/instances/${id}`) },
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
  async deleteImage(id: number) { await http.delete(`/images/${id}`) },
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
