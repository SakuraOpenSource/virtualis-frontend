<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import UserMenu from '@/components/app/UserMenu.vue'
import { Button } from '@/components/ui/button'
import { Server, HardDrive, Settings, KeyRound, User, Menu, Moon, Sun, Monitor, Network } from 'lucide-vue-next'

const site = useSiteStore()
const theme = useThemeStore()
const route = useRoute()
const collapsed = ref(false)

const nav = [
  { to: '/admin/instances', label: '实例', icon: Server, name: 'instances' },
  { to: '/admin/images', label: '镜像', icon: HardDrive, name: 'images' },
  { to: '/admin/agents', label: '被控节点', icon: Network, name: 'agents' },
  { to: '/admin/settings', label: '设置', icon: Settings, name: 'settings' },
  { to: '/admin/api-keys', label: 'API 密钥', icon: KeyRound, name: 'api-keys' },
  { to: '/admin/account', label: '账号', icon: User, name: 'account' },
]

function isActive(name: string) {
  return route.name === name || route.path.startsWith('/admin/' + name.split('-')[0])
}
</script>
<template>
  <div class="min-h-screen flex">
    <aside :class="['border-r bg-sidebar text-sidebar-foreground flex flex-col transition-all', collapsed ? 'w-14' : 'w-56']">
      <div class="h-14 flex items-center gap-2 px-3 border-b border-sidebar-border shrink-0">
        <div class="h-7 w-7 rounded bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold">V</div>
        <span v-if="!collapsed" class="font-semibold truncate">{{ site.siteName }}</span>
      </div>
      <nav class="flex-1 p-2 space-y-1 overflow-y-auto">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" :class="['flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors', isActive(item.name) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50']">
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="p-2 border-t border-sidebar-border flex items-center gap-1">
        <Button variant="ghost" size="icon" class="h-8 w-8" @click="collapsed = !collapsed"><Menu class="h-4 w-4" /></Button>
        <template v-if="!collapsed">
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="theme.setTheme('light')"><Sun class="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="theme.setTheme('dark')"><Moon class="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="theme.setTheme('system')"><Monitor class="h-4 w-4" /></Button>
        </template>
      </div>
    </aside>
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
        <div class="text-sm text-muted-foreground">Virtualis 控制台</div>
        <UserMenu />
      </header>
      <main class="flex-1 bg-muted/20 p-6 overflow-y-auto"><RouterView /></main>
    </div>
  </div>
</template>
