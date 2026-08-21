import axios, { AxiosError, type AxiosInstance } from 'axios'

export interface ApiErrorBody { code: string; message: string }

export const ErrorCode = {
  BadRequest: 'BAD_REQUEST',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  NotInstalled: 'NOT_INSTALLED',
  Internal: 'INTERNAL',
} as const

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
  get isUnauthorized() { return this.status === 401 }
  get isNotInstalled() { return this.code === ErrorCode.NotInstalled }
}

function readCookie(name: string): string {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    const t = part.trim()
    if (t.startsWith(prefix)) return decodeURIComponent(t.slice(prefix.length))
  }
  return ''
}

const CSRF_COOKIE = 'virtualis_csrf'
const CSRF_HEADER = 'X-CSRF-Token'
const SAFE = new Set(['get','head','options'])

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((cfg) => {
  const m = (cfg.method ?? 'get').toLowerCase()
  if (!SAFE.has(m)) {
    const tok = readCookie(CSRF_COOKIE)
    if (tok) cfg.headers.set(CSRF_HEADER, tok)
  }
  return cfg
})

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError<ApiErrorBody>) => {
    if (!error.response) {
      return Promise.reject(new ApiError(ErrorCode.Internal, 'Network error', 0))
    }
    const { status, data } = error.response
    const code = data?.code ?? ErrorCode.Internal
    const msg = data?.message ?? 'Request failed'
    const isProbe = error.config?.url === '/me'
    if (status === 401 && !isProbe) onUnauthorized?.()
    return Promise.reject(new ApiError(code, msg, status))
  }
)

export function errorMessage(err: unknown, fallback='Operation failed'): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}
