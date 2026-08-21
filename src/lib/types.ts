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
}

export interface VirtualisInstance {
  id: number
  name: string
  driver: string
  spec: InstanceSpec
  status: string
  image_id?: number | null
  image?: VirtualisImage | null
  created_at: string
  updated_at: string
}

export interface VirtualisImage {
  id: number
  name: string
  driver: string
  file_path: string
  size: number
  checksum: string
  status: string
  created_at: string
  updated_at: string
}

export interface VirtualisDriver {
  name: string
  available: boolean
  error?: string
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

export interface APIKeyInput {
  name: string
  scopes: APIScope[]
  expires_in_days: number
}
