// src/composables/useAuth.ts
import { ref } from 'vue'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence, // NUEVO
  browserLocalPersistence, // NUEVO
  browserSessionPersistence, // NUEVO
  type User
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import router from '../router'

const currentUser = ref<User | null>(null)
const userRole = ref<'admin' | 'camarero' | 'cocinero' | null>(null)
const userName = ref<string | null>(null)
const localId = ref<string | null>(null)
const authReady = ref(false)

export function useAuth() {

  // NUEVO: Añadimos el parámetro rememberMe (por defecto false)
  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      // 🛑 NUEVO: Configuramos la persistencia ANTES de iniciar sesión
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence
      await setPersistence(auth, persistenceType)

      const credential = await signInWithEmailAndPassword(auth, email, password)
      const userDoc = await getDoc(doc(db, 'usuarios', credential.user.uid))
      
      if (userDoc.exists()) {
        const userData = userDoc.data()

        if (userData.activo === false) {
          await signOut(auth) 
          throw new Error('🚫 Esta cuenta ha sido desactivada por el administrador.')
        }

        userRole.value = userData.rol
        userName.value = userData.nombre ?? null
        localId.value = userData.localId
        return userRole.value
      } else {
        await signOut(auth)
        throw new Error('Usuario no encontrado en la base de datos.')
      }

    } catch (error: any) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        throw new Error('Correo o contraseña incorrectos.')
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Demasiados intentos fallidos. Inténtalo más tarde.')
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('El formato del correo electrónico no es válido.')
      }
      throw error 
    }
  }

  const logout = async () => {
    await signOut(auth)
    currentUser.value = null
    userRole.value = null
    userName.value = null
    localId.value = null
    router.replace('/')
  }

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new Error('No hay ninguna cuenta registrada con este correo.')
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('El formato del correo no es válido.')
      } else if (error.code === 'auth/missing-email') {
        throw new Error('Por favor, escribe tu correo electrónico.')
      }
      throw new Error('No se pudo enviar el correo de recuperación.')
    }
  }

  const initAuthListener = () => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            if (userData.activo === false) {
              await signOut(auth)
              return
            }
            currentUser.value = user
            userRole.value = userData.rol
            userName.value = userData.nombre ?? null
            localId.value = userData.localId
          } else {
            await signOut(auth)
          }
        } else {
          currentUser.value = null
          userRole.value = null
          userName.value = null
          localId.value = null
        }
      } catch (error) {
        // Si Firestore falla (offline, permisos), no podemos confiar en la sesión
        // pero tampoco podemos dejar la app sin montarse: limpiamos estado y
        // dejamos que el router redirija al login.
        console.error('Error al sincronizar perfil de usuario:', error)
        currentUser.value = null
        userRole.value = null
        userName.value = null
        localId.value = null
      } finally {
        authReady.value = true
      }
    })
  }

  return { currentUser, userRole, userName, localId, authReady, login, logout, resetPassword, initAuthListener }
}