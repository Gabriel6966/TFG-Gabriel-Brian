import { ref, watch } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export interface ConfigNegocio {
  nombreNegocio: string
  logoUrl: string
  colorAcento: string
}

const CONFIG_INICIAL: ConfigNegocio = {
  nombreNegocio: '',
  logoUrl: '',
  colorAcento: '#4f46e5'
}

// Estado global compartido entre todas las vistas
const config = ref<ConfigNegocio>({ ...CONFIG_INICIAL })

// Propaga el color del negocio como variable CSS global. Cualquier estilo que
// use `var(--color-acento)` reacciona automáticamente al cambio sin necesidad
// de bindings inline.
if (typeof document !== 'undefined') {
  watch(
    () => config.value.colorAcento,
    (val) => {
      document.documentElement.style.setProperty('--color-acento', val || '#4f46e5')
    },
    { immediate: true }
  )
}

let unsubscribeConfig: (() => void) | null = null

export function useNegocio() {
  const iniciar = (id: string) => {
    if (unsubscribeConfig) unsubscribeConfig()
    // Al cambiar de local, reseteamos para no mostrar el branding del local
    // anterior durante los ms que tarda en llegar el primer snapshot.
    config.value = { ...CONFIG_INICIAL }
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
    config.value = { ...CONFIG_INICIAL }
  }

  return { config, iniciar, detener }
}