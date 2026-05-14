import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

// Modo desarrollo: pedimos a App Check que imprima un token de debug en la consola.
// Hay que registrar ese token en Firebase Console → App Check → Manage debug tokens.
// Quitar antes de desplegar a producción (o protegerlo con flag de entorno).
if (import.meta.env.DEV) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)

// App Check (opcional): si está configurado el siteKey, se activa para que
// las peticiones a Firestore exijan venir de la app legítima.
// Para activarlo: Firebase Console → App Check → reCAPTCHA v3 → copiar siteKey
// al .env como VITE_RECAPTCHA_SITE_KEY.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (e) {
    console.warn('App Check no se pudo inicializar:', e)
  }
}

export const db = getFirestore(app)
export const auth = getAuth(app)
