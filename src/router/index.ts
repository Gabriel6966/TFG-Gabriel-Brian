// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const vistas = import.meta.glob('../views/*.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Login',
      component: vistas['../views/LoginView.vue'],
      // Si ya estás autenticado, el login te redirige a tu panel
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

// Navigation Guard global: se ejecuta antes de CADA cambio de ruta
router.beforeEach((to) => {
  const { currentUser, userRole } = useAuth()

  // Ruta protegida y no hay sesión → al login
  if (to.meta.requiresAuth && !currentUser.value) {
    return { name: 'Login' }
  }

  // Ruta de invitado (login) pero ya hay sesión → redirigir según rol
  if (to.meta.requiresGuest && currentUser.value) {
    return redirectByRole(userRole.value)
  }

  // Ruta con roles definidos: verificamos que el usuario tenga permiso
  if (to.meta.roles && userRole.value) {
    const rolesPermitidos = to.meta.roles as string[]
    if (!rolesPermitidos.includes(userRole.value)) {
      // Redirigimos a su panel correcto si intenta acceder a uno ajeno
      return redirectByRole(userRole.value)
    }
  }
})

// Función auxiliar: devuelve la ruta correcta según el rol
function redirectByRole(role: string | null) {
  if (role === 'admin') return { name: 'Admin' }
  if (role === 'cocinero') return { name: 'Kitchen' }
  return { name: 'Tables' } // camarero por defecto
}

export default router