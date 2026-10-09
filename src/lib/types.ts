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
  captcha?: { login: boolean }
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
  default_network_interface: string
}

export type BatchAction = 'start' | 'stop' | 'restart' | 'delete'
export interface BatchResult { ok: number[]; failed: { id: number; reason: string }[] }

export interface Snapshot {
  id: number
  instance_id: number
  agent_id: number
  name: string
  remark: string
  size_bytes: number
  status: string
  error?: string
  created_at: string
}

export interface Backup extends Snapshot {
  driver: string
  checksum: string
  format?: string
}

export interface InstanceOperationLog {
  id: number
  instance_id: number
  operation_id: string
  action: string
  stage: string
  status: string
  message: string
  error?: string
  created_at: string
  updated_at: string
}

export interface InstanceSpec {
   cpu: number
   /** CPU milli-core quota (500 means 0.5 vCPU); 0/absent means unset (whole-core mode). */
   cpu_milli?: number
   memory_mb: number
   disk_gb: number
   arch?: string
}

export interface NetworkConfig {
  mode: 'nat' | 'bridge' | 'none' | string
  dedicated_mode?: 'auto' | 'routed' | 'bridge'
  bridge?: string
  mac?: string
  ipv4?: string
  gateway?: string
  dns?: string[]
  bandwidth_mbps?: number
  /** Monthly traffic quota in GB; 0 or absent means unlimited. */
  traffic_gb?: number
}

/** NAT port forwarding: agent host_port -> instance guest_port. */
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
  busy_operation?: string
  busy_action?: string
  busy_since?: string | null
  trashed_at?: string | null
  purge_after?: string | null
  image_id?: number | null
  image?: VirtualisImage | null
  agent_id?: number | null
  agent?: VirtualisAgent | null
  max_nat_mappings?: number
  nat_mappings?: NATMapping[]
	 vpc_id?: number | null
	 vpc?: VPC | null
	 firewall_rules?: FirewallRule[]
  security_group_ids?: number[]
  security_groups?: SecurityGroup[]
  firewall_policy?: FirewallPolicy | null
  ssh_password?: string
  ip?: string
  observed_ip?: string
  ssh_ready?: boolean
  network_error?: string
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
  /** Accumulated traffic this billing cycle (rx+tx bytes); absent when the agent cannot meter. */
  traffic_used_bytes?: number
  /** Whether the traffic quota is exceeded (agent-side network enforcement state). */
  traffic_quota_exceeded?: boolean
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

export interface VPC {
  id: number; agent_id: number; name: string; driver: string; subnet: string; gateway: string
  dhcp_start: string; dhcp_end: string; nat: boolean; dns: string[]; note: string; instance_count?: number
}
export interface VPCInput {
  agent_id: number; name: string; driver: string; subnet: string; gateway: string
  dhcp_start?: string; dhcp_end?: string; nat: boolean; dns?: string[]; note?: string
}
export interface FirewallInput {
  direction: string; action: string; protocol: string; port_start: number; port_end: number
  cidr: string; priority: number; enabled: boolean; remark: string
}
export interface FirewallRule extends FirewallInput { id: number; instance_id: number; agent_id: number }
export interface FirewallPolicy { ingress: 'accept' | 'drop'; egress: 'accept' | 'drop' }
export interface SecurityGroupInput {
  name: string
  description: string
  ingress_policy: FirewallPolicy['ingress']
  egress_policy: FirewallPolicy['egress']
}
export interface SecurityGroup extends SecurityGroupInput { id: number; rules: FirewallInput[] }
export interface InstanceSecurityGroups {
  security_group_ids: number[]
  groups: SecurityGroup[]
  effective_rules: FirewallInput[]
  firewall_policy: FirewallPolicy | null
}
export interface FreeIPEntry { id: number; ip: string; cidr: string; gateway: string; dns: string[]; interface: string; note: string }
export interface IPPoolEntry { id: number; ip: string; gateway: string; prefix: number; status: string; note: string; instance_id?: number | null; instance_name?: string }
export interface IPPoolInput { gateway: string; prefix: number; dns: string[]; interface: string; note: string }
export interface IPPoolOverview extends IPPoolInput { agent_id: number; agent_name: string; total: number; free: number; assigned: number; disabled: number; entries: IPPoolEntry[] }

/** Agent host interface, used to pick a dedicated-IP attach target. */
export interface HostInterface {
  name: string
  kind: string
  state: string
  mac?: string
  ipv4?: string[]
  ipv6?: string[]
}

/** Agent host network summary; dedicated-IP readiness depends on usable interfaces and a free IP pool, not on host address count. */
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
  /** Catalog of scopes the backend accepts; absent while list stays read-only. */
  scopes?: APIScope[] | null
}

export interface APIKeyCreated {
  key: APIKey
  secret: string
}

/**
 * Backend create contract: requested scopes and optional expiry are honored
 * (PLG-F03). Fields stay optional so a legacy backend that ignores them still
 * round-trips; the UI degrades gracefully when they are absent.
 */
export interface APIKeyInput {
  name?: string
  scopes?: APIScope[]
  expires_in_days?: number
}
