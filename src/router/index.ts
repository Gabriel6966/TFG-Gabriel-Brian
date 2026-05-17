import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { useAuth } from '../composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresGuest?: boolean
    roles?: string[]
  }
}

const vistas = import.meta.glob('../views/*.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Login',
      component: vistas['../views/LoginView.vue'],
      meta: { requiresGuest: true }
    },
    {
      path: '/register',
      name: 'Register',
      component: vistas['../views/RegisterView.vue'],
      meta: { requiresGuest: true }
    },
    {
      path: '/tables',
      name: 'Tables',
      component: vistas['../views/MesasView.vue'],
      // Separación estricta de roles: cada vista admite un único rol.
      meta: { requiresAuth: true, roles: ['camarero'] }
    },
    {
      path: '/admin',
      name: 'Admin',
      component: vistas['../views/AdminView.vue'],
      meta: { requiresAuth: true, roles: ['admin'] }
    },
    {
      path: '/kitchen',
      name: 'Kitchen',
      component: vistas['../views/CocinaView.vue'],
      meta: { requiresAuth: true, roles: ['cocinero'] }
    }
  ]
})

// Extraemos las variables de nuestro composable
const { currentUser, userRole, authReady } = useAuth()

/**
 * Pausa la ejecución del router hasta que Firebase confirme si hay una
 * sesión activa guardada. Evita el parpadeo de redirección al login.
 */
const waitForAuthReady = () => {
  return new Promise<void>((resolve) => {
    // Si ya está listo (porque navegamos sin recargar), pasamos al instante
    if (authReady.value) {
      resolve()
    } else {
      // Si no, nos quedamos vigilando hasta que Firebase termine
      const unwatch = watch(authReady, (isReady) => {
        if (isReady) {
          unwatch() // Dejamos de vigilar para no consumir memoria
          resolve() // Damos luz verde al router
        }
      })
    }
  })
}

// Convertimos el beforeEach en asíncrono (async)
router.beforeEach(async (to) => {
  // El router espera aquí a que Firebase confirme la sesión.
  await waitForAuthReady()

  // A partir de aquí, el router ya actúa con la información real de la sesión
  if (to.meta.requiresAuth && !currentUser.value) {
    return { name: 'Login' }
  }

  // Solo redirigimos desde rutas de invitado si tenemos auth Y rol válido.
  // Sin esto un user autenticado sin perfil quedaría rebotando entre Login
  // (requiresGuest) y Tables (default de redirectByRole).
  if (to.meta.requiresGuest && currentUser.value && userRole.value) {
    return redirectByRole(userRole.value)
  }

  // Si la ruta requiere roles, exigimos rol válido + permitido. Sin rol → Login.
  if (to.meta.roles) {
    const rolesPermitidos = to.meta.roles as string[]
    if (!userRole.value || !rolesPermitidos.includes(userRole.value)) {
      return redirectByRole(userRole.value)
    }
  }
})

function redirectByRole(role: string | null) {
  if (role === 'admin')    return { name: 'Admin' }
  if (role === 'cocinero') return { name: 'Kitchen' }
  if (role === 'camarero') return { name: 'Tables' }
  // Sin rol: lo mandamos a Login (no a Tables, que requiere rol y crashearía).
  return { name: 'Login' }
}

export default router