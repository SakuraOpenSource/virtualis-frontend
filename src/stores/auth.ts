import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type CaptchaAnswer } from '@/lib/endpoints'
import type { User } from '@/lib/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const resolved = ref(false)
  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value != null)

  async function restore() {
    if (resolved.value) return user.value
    try { user.value = await authApi.me() }
    catch { user.value = null }
    finally { resolved.value = true }
    return user.value
  }

  async function login(identifier: string, password: string, captcha: CaptchaAnswer = {}) {
    user.value = await authApi.login(identifier, password, captcha)
    resolved.value = true
    return user.value
  }

  async function logout() {
    try { await authApi.logout() } finally { clear() }
  }

  function clear() { user.value = null; resolved.value = true }

  async function refresh() {
    try { user.value = await authApi.me() } catch { user.value = null }
    return user.value
  }

  function setUser(v: User | null) { user.value = v; resolved.value = true }

  return { user, resolved, isLoggedIn, isAdmin, restore, login, logout, clear, refresh, setUser }
})
