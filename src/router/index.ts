import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    installPage?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/install', name: 'install', component: () => import('@/views/InstallView.vue'), meta: { installPage: true } },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guestOnly: true } },
  {
    path: '/',
    redirect: '/admin/instances',
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/instances' },
      { path: 'instances', name: 'instances', component: () => import('@/views/admin/InstancesView.vue') },
      { path: 'instances/:id', name: 'instance-detail', component: () => import('@/views/admin/InstanceDetailView.vue'), props: true },
      { path: 'images', name: 'images', component: () => import('@/views/admin/ImagesView.vue') },
      { path: 'agents', name: 'agents', component: () => import('@/views/admin/AgentsView.vue') },
      { path: 'settings', name: 'settings', component: () => import('@/views/admin/SettingsView.vue') },
      { path: 'api-keys', name: 'api-keys', component: () => import('@/views/admin/ApiKeysView.vue') },
      { path: 'account', name: 'account', component: () => import('@/views/admin/AccountView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const site = useSiteStore()
  const auth = useAuthStore()
  try { await site.load() } catch { return true }
  if (!site.installed) {
    return to.meta.installPage ? true : { name: 'install' }
  }
  if (to.meta.installPage) return { name: 'instances' }

  const needs = to.meta.requiresAuth || to.meta.guestOnly
  if (needs) await auth.restore()

  if (to.meta.guestOnly && auth.isLoggedIn) return { name: 'instances' }
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
