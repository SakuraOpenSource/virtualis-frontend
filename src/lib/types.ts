export interface Page<T> {
  items: T[] | null
  total: number
  page: number
  page_size: number
}

export type UserRole = 'admin'
export type UserStatus = 'active' | 'disabled'

export interface User {
  id: number
  username: string
  email: string
  role: string
  status: string
  created_at: string
  updated_at: string
}

export interface Bootstrap {
  installed: boolean
  site_name: string
  site_description: string
  captcha?: { login: boolean; register: boolean; charset: string }
}

export interface CaptchaChallenge {
  id: string
  image: string
  expires_in: number
}

export interface DatabaseConfig {
  driver: 'sqlite' | 'mysql' | 'postgres'
  path?: string
  host?: string
  port?: number
  user?: string
  password?: string
  name?: string
}

export interface InstallRequest {
  database: DatabaseConfig
  site_name: string
  site_description: string
  admin_username: string
  admin_email: string
  admin_password: string
}

export interface CaptchaSettings {
  login_enabled: boolean
  register_enabled: boolean
}

export interface SiteSettings {
  name: string
  description: string
}

export interface VirtualisSettings {
  default_driver: string
  default_cpu: number
  default_memory: number
  default_disk: number
  default_arch: string
  allow_reinstall: boolean
  auto_refresh: boolean
}

export interface InstanceSpec {
  cpu: number
  memory_mb: number
  disk_gb: number
  arch?: string
}

export interface NetworkConfig {
  mode: 'nat' | 'bridge' | 'none' | string
  bridge?: string
  mac?: string
  ipv4?: string
  gateway?: string
  dns?: string[]
  bandwidth_mbps?: number
}

/** NAT 端口转发：被控主机 host_port → 实例 guest_port。 */
export interface NATMapping {
  id?: number
  instance_id?: number
  protocol: string
  host_port: number
  guest_port: number
  remark?: string
  auto?: boolean
}

export interface VirtualisInstance {
  id: number
  name: string
  display_name?: string
  driver: string
  type: 'container' | 'vm' | string
  spec: InstanceSpec
  network?: NetworkConfig
  status: string
  image_id?: number | null
  image?: VirtualisImage | null
  agent_id?: number | null
  agent?: VirtualisAgent | null
  max_nat_mappings?: number
  nat_mappings?: NATMapping[]
  ssh_password?: string
  created_at: string
  updated_at: string
}

export interface InstanceMetrics {
  cpu_percent: number
  memory_used_mb: number
  memory_total_mb: number
  network_rx_bytes: number
  network_tx_bytes: number
  bandwidth_rx_bps: number
  bandwidth_tx_bps: number
  collected_at: string
}

export interface NetworkInterface {
  name: string
  mac?: string
  state?: string
  ipv4?: string[]
  ipv6?: string[]
  rx_bytes: number
  tx_bytes: number
}

export interface NetworkStatus {
  reachable: boolean
  latency_ms: number
  interfaces: NetworkInterface[]
  error?: string
  checked_at: string
}

export interface VNCInfo {
  available: boolean
  protocol?: string
  host?: string
  port?: number
  display?: string
  url?: string
  web_url?: string
  message?: string
}

export interface VirtualisImage {
  id: number
  name: string
  display_name?: string
  driver: string
  type: 'disk' | 'iso' | string
  os_type?: string
  os_version?: string
  arch?: string
  original_name?: string
  mime_type?: string
  file_path: string
  size_bytes: number
  checksum?: string
  status: string
  created_at: string
  updated_at: string
}

export interface VirtualisDriver {
  name: string
  available: boolean
  error?: string
}

/** 被控主机网卡，供独立 IP 模式选择挂载目标。 */
export interface HostInterface {
  name: string
  kind: string
  state: string
  mac?: string
  ipv4?: string[]
  ipv6?: string[]
}

/** 被控主机网络汇总。ipv4_count >= 2 时独立 IP 模式可用。 */
export interface HostNetworkSummary {
  interfaces: HostInterface[]
  ipv4_count: number
}

export interface VirtualisAgent {
  id: number
  name: string
  display_name?: string
  status: 'pending' | 'online' | 'offline' | string
  ip: string
  endpoint: string
  driver: string
  drivers: string[] | null
  os?: string
  arch?: string
  version?: string
  last_seen_at?: string | null
  created_at: string
}

export interface AgentDownload {
  os: string
  arch: string
  url: string
}

export type APIKeyStatus = 'active' | 'revoked'
export type APIScope = 'instance:read' | 'instance:write' | 'image:read' | 'image:write'

export interface APIKey {
  id: number
  user_id: number
  name: string
  prefix: string
  scopes: APIScope[] | null
  status: APIKeyStatus
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface APIKeyList {
  items: APIKey[] | null
  scopes: APIScope[]
}

export interface APIKeyCreated {
  key: APIKey
  secret: string
}

export interface APIKeyInput { name?: string }
