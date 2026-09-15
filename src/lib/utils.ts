import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { hour12: false })
}

export function formatDate(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('zh-CN')
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let v = bytes / 1024
  let idx = 0
  while (v >= 1024 && idx < units.length - 1) { v/=1024; idx++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[idx]}`
}

/** 实例规格里的 CPU 展示：毫核非整千时显示小数核数（如 0.5C），否则按整核显示。 */
export function cpuLabel(cpu: number, cpuMilli?: number) {
  if (cpuMilli && cpuMilli > 0 && cpuMilli % 1000 !== 0) return `${cpuMilli / 1000}C`
  return `${cpu}C`
}
