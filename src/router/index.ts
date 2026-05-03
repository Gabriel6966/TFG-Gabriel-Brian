// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue' // NUEVO: Importamos watch para vigilar a Firebase
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
      meta: { requiresAuth: true, roles: ['camarero', 'admin'] }
    },
    {
      path: '/menu/:id',
      name: 'Menu',
      component: vistas['../views/MenuView.vue'],
      meta: { requiresAuth: true, roles: ['camarero', 'admin'] }
    },
    {
      path: '/checkout',
      name: 'Checkout',
      component: vistas['../views/CheckoutView.vue'],
      meta: { requiresAuth: true, roles: ['camarero', 'admin'] }
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
      meta: { requiresAuth: true, roles: ['cocinero', 'admin'] }
    }
  ]
})

// Extraemos las variables de nuestro composable
const { currentUser, userRole, authReady } = useAuth()

/**
 * NUEVO: Esta promesa pausa la ejecución del router hasta que 
 * Firebase confirme si el usuario tiene una sesión activa guardada o no.
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
  // 🛑 El router se detiene aquí hasta que Firebase cargue
  await waitForAuthReady()

  // A partir de aquí, el router ya actúa con la información real de la sesión
  if (to.meta.requiresAuth && !currentUser.value) {
    return { name: 'Login' }
  }

  if (to.meta.requiresGuest && currentUser.value) {
    return redirectByRole(userRole.value)
  }

  if (to.meta.roles && userRole.value) {
    const rolesPermitidos = to.meta.roles as string[]
    if (!rolesPermitidos.includes(userRole.value)) {
      return redirectByRole(userRole.value)
    }
  }
})

function redirectByRole(role: string | null) {
  if (role === 'admin') return { name: 'Admin' }
  if (role === 'cocinero') return { name: 'Kitchen' }
  return { name: 'Tables' }
}

export default router