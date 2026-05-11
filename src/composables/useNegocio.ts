import { ref } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export interface ConfigNegocio {
  nombreNegocio: string
  logoUrl: string
  colorAcento: string
}

// Estado global compartido entre todas las vistas
const config = ref<ConfigNegocio>({
  nombreNegocio: '',
  logoUrl: '',
  colorAcento: '#4f46e5'
})

let unsubscribeConfig: (() => void) | null = null

export function useNegocio(localId?: string | null) {
  // Solo iniciamos el listener si tenemos localId y no hay uno activo ya
  if (localId && !unsubscribeConfig) {
    unsubscribeConfig = onSnapshot(
      doc(db, `locales/${localId}/config`, 'negocio'),
      (snap) => {
        if (snap.exists()) {
          config.value = snap.data() as ConfigNegocio
        }
      }
    )
  }

  const iniciar = (id: string) => {
    if (unsubscribeConfig) unsubscribeConfig()
    unsubscribeConfig = onSnapshot(
      doc(db, `locales/${id}/config`, 'negocio'),
      (snap) => {
        if (snap.exists()) {
          config.value = snap.data() as ConfigNegocio
        }
      }
    )
  }

  const detener = () => {
    unsubscribeConfig?.()
    unsubscribeConfig = null
  }

  return { config, iniciar, detener }
}