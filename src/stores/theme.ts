import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

type Theme = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const saved = (localStorage.getItem('virtualis_theme') as Theme | null) ?? 'system'
  const theme = ref<Theme>(saved)

  function apply(val: Theme) {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = val === 'dark' || (val === 'system' && prefersDark)
    root.classList.toggle('dark', isDark)
  }

  apply(theme.value)
  watch(theme, (v) => {
    localStorage.setItem('virtualis_theme', v)
    apply(v)
  })

  // listen system changes when in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') apply('system')
  })

  function setTheme(v: Theme) { theme.value = v }

  return { theme, setTheme }
})
