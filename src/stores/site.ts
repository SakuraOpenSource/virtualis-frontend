import { ref } from 'vue'
import { defineStore } from 'pinia'
import { siteApi } from '@/lib/endpoints'
import type { Bootstrap } from '@/lib/types'

export const useSiteStore = defineStore('site', () => {
  const installed = ref(false)
  const siteName = ref('Virtualis')
  const siteDescription = ref('')
  const loaded = ref(false)

  function apply(data: Bootstrap) {
    installed.value = data.installed
    if (data.site_name) siteName.value = data.site_name
    siteDescription.value = data.site_description ?? ''
    loaded.value = true
    document.title = siteName.value
  }

  async function load(force = false) {
    if (loaded.value && !force) return
    const data = await siteApi.bootstrap()
    apply(data)
  }

  function markInstalled(name: string, desc: string) {
    installed.value = true
    siteName.value = name || 'Virtualis'
    siteDescription.value = desc
    loaded.value = true
    document.title = siteName.value
  }

  return { installed, siteName, siteDescription, loaded, load, apply, markInstalled }
})
