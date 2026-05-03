// src/composables/useAuth.ts
import { ref } from 'vue'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import router from '../router'

// Estado global reactivo compartido entre componentes
const currentUser = ref<User | null>(null)
const userRole = ref<'admin' | 'camarero' | 'cocinero' | null>(null)
const authReady = ref(false) // true cuando Firebase ha terminado de verificar la sesión

/**
 * Composable central de autenticación.
 * Encapsula toda la lógica de Firebase Auth para que las vistas
 * no tengan que saber cómo funciona Firebase por dentro.
 */
export function useAuth() {

  /**
   * Inicia sesión y consulta el rol del usuario en Firestore.
   * Lanza un error si las credenciales son incorrectas,
   * que la vista captura para mostrar feedback al usuario.
   */
  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password)

    // Buscamos el documento del usuario en la colección 'usuarios'
    // para saber qué rol tiene asignado
    const userDoc = await getDoc(doc(db, 'usuarios', credential.user.uid))
    if (userDoc.exists()) {
      userRole.value = userDoc.data().rol
    }

    return userRole.value
  }

  /**
   * Cierra la sesión y limpia el estado local
   */
  const logout = async () => {
  await signOut(auth)
  currentUser.value = null
  userRole.value = null
  // Usamos replace para que tampoco se pueda volver atrás tras cerrar sesión
  router.replace('/')
}

  /**
   * Listener persistente: Firebase notifica automáticamente
   * si hay una sesión activa al recargar la página.
   * Lo llamamos UNA sola vez desde main.ts
   */
  const initAuthListener = () => {
    onAuthStateChanged(auth, async (user) => {
      currentUser.value = user

      if (user) {
        // Si hay sesión activa, recargamos el rol desde Firestore
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
        if (userDoc.exists()) {
          userRole.value = userDoc.data().rol
        }
      } else {
        userRole.value = null
      }

      // Marcamos que Firebase ya resolvió el estado inicial
      authReady.value = true
    })
  }

  return { currentUser, userRole, authReady, login, logout, initAuthListener }
}