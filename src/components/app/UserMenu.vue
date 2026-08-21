<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-vue-next'
const auth = useAuthStore()
const router = useRouter()
async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>
<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="gap-2">
        <User class="h-4 w-4" /> {{ auth.user?.username ?? '管理员' }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="router.push({ name: 'account' })">账号设置</DropdownMenuItem>
      <DropdownMenuItem @select="logout"><LogOut class="h-4 w-4 mr-2" />退出登录</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
