<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import {
  collection, query, where, getDocs,
  doc, setDoc, updateDoc
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { login } = useAuth()

// Paso 1: el empleado introduce su código de invitación
// Paso 2: rellena sus datos personales y contraseña
const paso = ref<1 | 2>(1)

const codigoInvitacion = ref('')
const isVerificando = ref(false)
const errorCodigo = ref('')

// Datos de la invitación recuperados de Firestore
const invitacionId = ref('')
const invitacionData = ref<{
  email: string
  rol: 'admin' | 'camarero' | 'cocinero'
  localId: string
  localNombre: string
} | null>(null)

// Formulario paso 2
const nombre = ref('')
const password = ref('')
const passwordConfirm = ref('')
const showPassword = ref(false)
const isRegistrando = ref(false)
const errorRegistro = ref('')

/**
 * PASO 1: Verificamos el código de invitación en Firestore.
 * Buscamos en /invitaciones un documento con ese código
 * que esté en estado 'pendiente'.
 */
const verificarCodigo = async () => {
  if (!codigoInvitacion.value.trim()) return
  isVerificando.value = true
  errorCodigo.value = ''

  try {
    // Consultamos la colección invitaciones buscando el código exacto
    const q = query(
      collection(db, 'invitaciones'),
      where('codigo', '==', codigoInvitacion.value.trim().toUpperCase()),
      where('estado', '==', 'pendiente')
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      errorCodigo.value = 'Código inválido o ya utilizado. Contacta con tu administrador.'
      return
    }

    // Guardamos los datos de la invitación para usarlos en el paso 2
    const docSnap = snapshot.docs[0]
    invitacionId.value = docSnap.id
    invitacionData.value = docSnap.data() as typeof invitacionData.value

    // Avanzamos al paso 2
    paso.value = 2

  } catch (error) {
    console.error(error)
    errorCodigo.value = 'Error al verificar el código. Comprueba tu conexión.'
  } finally {
    isVerificando.value = false
  }
}

/**
 * PASO 2: Creamos la cuenta del empleado.
 * 1. Creamos el usuario en Firebase Auth con el email de la invitación
 * 2. Creamos su perfil en /usuarios/{uid}
 * 3. Marcamos la invitación como 'usada' para que no se pueda reutilizar
 * 4. Iniciamos sesión automáticamente y redirigimos a su panel
 */
const completarRegistro = async () => {
  if (!invitacionData.value) return
  if (!nombre.value.trim()) return (errorRegistro.value = 'El nombre es obligatorio.')
  if (password.value.length < 6) return (errorRegistro.value = 'La contraseña debe tener al menos 6 caracteres.')
  if (password.value !== passwordConfirm.value) return (errorRegistro.value = 'Las contraseñas no coinciden.')

  isRegistrando.value = true
  errorRegistro.value = ''

  try {
    // 1. Creamos el usuario en Firebase Auth
    const credential = await createUserWithEmailAndPassword(
      auth,
      invitacionData.value.email,
      password.value
    )

    // 2. Creamos su perfil en Firestore /usuarios/{uid}
    //    Vinculamos al local mediante localId (arquitectura multitenant)
    await setDoc(doc(db, 'usuarios', credential.user.uid), {
      nombre: nombre.value.trim(),
      email: invitacionData.value.email,
      rol: invitacionData.value.rol,
      localId: invitacionData.value.localId,
      activo: true,
      creadoEn: new Date()
    })

    // 3. Marcamos la invitación como usada — no se puede reutilizar
    await updateDoc(doc(db, 'invitaciones', invitacionId.value), {
      estado: 'usada',
      usadoPor: credential.user.uid,
      usadoEn: new Date()
    })

    // 4. Iniciamos sesión con el composable para que el estado global
    //    se actualice correctamente (userRole, localId, etc.)
    await login(invitacionData.value.email, password.value)

    // 5. Redirigimos según el rol asignado en la invitación
    const rol = invitacionData.value.rol
    if (rol === 'admin') router.replace('/admin')
    else if (rol === 'cocinero') router.replace('/kitchen')
    else router.replace('/tables')

  } catch (error: any) {
    const firebaseErrors: Record<string, string> = {
      'auth/email-already-in-use': 'Este email ya tiene una cuenta. Inicia sesión directamente.',
      'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
      'auth/network-request-failed': 'Sin conexión. Comprueba tu red.'
    }
    errorRegistro.value = firebaseErrors[error.code] ?? 'Error inesperado. Inténtalo de nuevo.'
  } finally {
    isRegistrando.value = false
  }
}
</script>

<template>
  <div class="register-layout">
    <div class="brand-section">
      <div class="mesh-blob blob-1"></div>
      <div class="mesh-blob blob-2"></div>

      <div class="brand-content">
        <h1 class="logo-text">EasyOrder</h1>
        <p class="subtitle">Activa tu cuenta de empleado</p>

        <div class="steps-visual">
          <div class="step" :class="{ active: paso === 1, done: paso > 1 }">
            <div class="step-circle">{{ paso > 1 ? '✓' : '1' }}</div>
            <span>Código</span>
          </div>
          <div class="step-line" :class="{ done: paso > 1 }"></div>
          <div class="step" :class="{ active: paso === 2 }">
            <div class="step-circle">2</div>
            <span>Tu cuenta</span>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="bg-shape shape-purple"></div>
      <div class="bg-shape shape-blue"></div>

      <div class="register-card premium-glass">

        <!-- ── PASO 1: Código de invitación ── -->
        <div v-if="paso === 1">
          <div class="card-header">
            <h2>Código de Invitación</h2>
            <p class="form-subtitle">
              Tu administrador te habrá proporcionado un código de 8 caracteres
            </p>
          </div>

          <div class="input-group">
            <label>Código de invitación</label>
            <input
              class="codigo-input"
              v-model="codigoInvitacion"
              placeholder="Ej: AB12CD34"
              maxlength="8"
              @keyup.enter="verificarCodigo"
              style="text-transform: uppercase; letter-spacing: 4px; font-size: 1.2rem; text-align: center;"
            >
          </div>

          <div v-if="errorCodigo" class="error-msg">{{ errorCodigo }}</div>

          <button class="btn-primary" @click="verificarCodigo" :disabled="isVerificando || !codigoInvitacion.trim()">
            <span v-if="!isVerificando">Verificar código</span>
            <div v-else class="spinner"></div>
          </button>

          <div class="back-link">
            <router-link to="/" class="forgot-link">← Volver al inicio de sesión</router-link>
          </div>
        </div>

        <!-- ── PASO 2: Datos personales ── -->
        <div v-if="paso === 2 && invitacionData">
          <div class="card-header">
            <h2>Crea tu cuenta</h2>
            <p class="form-subtitle">Invitación para <strong>{{ invitacionData.localNombre }}</strong></p>
          </div>

          <!-- Info de la invitación — solo lectura -->
          <div class="invitacion-info">
            <div class="info-row">
              <span class="info-label">Email asignado</span>
              <span class="info-value">{{ invitacionData.email }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Rol</span>
              <span class="rol-badge" :class="invitacionData.rol">{{ invitacionData.rol }}</span>
            </div>
          </div>

          <div class="input-group">
            <label>Tu nombre completo</label>
            <input v-model="nombre" placeholder="Ej: María García" @keyup.enter="completarRegistro">
          </div>

          <div class="input-group">
            <label>Contraseña</label>
            <div class="password-wrapper">
              <input
                :type="showPassword ? 'text' : 'password'"
                v-model="password"
                placeholder="Mínimo 6 caracteres"
              >
              <button type="button" class="btn-toggle-password" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
          </div>

          <div class="input-group">
            <label>Confirmar contraseña</label>
            <input
              :type="showPassword ? 'text' : 'password'"
              v-model="passwordConfirm"
              placeholder="Repite tu contraseña"
              @keyup.enter="completarRegistro"
            >
          </div>

          <div v-if="errorRegistro" class="error-msg">{{ errorRegistro }}</div>

          <button class="btn-primary" @click="completarRegistro" :disabled="isRegistrando">
            <span v-if="!isRegistrando">Activar mi cuenta</span>
            <div v-else class="spinner"></div>
          </button>

          <div class="back-link">
            <button class="link-btn" @click="paso = 1">← Cambiar código</button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

* {
  box-sizing: border-box;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.register-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
}

/* ── BRAND SECTION (igual que Login) ── */
.brand-section {
  flex: 1.2;
  background: #4f46e5;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  color: white;
}

.mesh-blob {
  position: absolute;
  filter: blur(90px);
  border-radius: 50%;
  animation: pulseBlob 10s infinite alternate ease-in-out;
}

.blob-1 {
  top: -10%; left: -10%;
  width: 50vw; height: 50vw;
  background: #6366f1;
}

.blob-2 {
  bottom: -20%; right: -10%;
  width: 60vw; height: 60vw;
  background: #3b82f6;
  animation-delay: -5s;
}

.brand-content {
  position: relative;
  z-index: 10;
  text-align: center;
  max-width: 400px;
}

.logo-text {
  font-size: 3.8rem;
  font-weight: 800;
  letter-spacing: -1.5px;
  margin: 0 0 10px 0;
  text-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.subtitle {
  font-size: 1.1rem;
  color: rgba(255,255,255,0.85);
  margin-bottom: 50px;
}

/* ── INDICADOR DE PASOS ── */
.steps-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-top: 20px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.5);
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.3s;
}

.step.active { color: white; }
.step.done   { color: #a5f3fc; }

.step-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
  border: 2px solid rgba(255,255,255,0.3);
  transition: all 0.3s;
}

.step.active .step-circle {
  background: white;
  color: #4f46e5;
  border-color: white;
}

.step.done .step-circle {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.step-line {
  width: 60px;
  height: 2px;
  background: rgba(255,255,255,0.2);
  margin: 0 8px;
  margin-bottom: 24px;
  transition: background 0.3s;
}

.step-line.done { background: #22c55e; }

/* ── FORM SECTION ── */
.form-section {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f1f5f9;
  overflow: hidden;
}

.bg-shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  z-index: 1;
  opacity: 0.5;
}

.shape-purple {
  width: 300px; height: 300px;
  background: #c084fc;
  top: 10%; right: 10%;
  animation: pulseBlob 8s infinite alternate;
}

.shape-blue {
  width: 350px; height: 350px;
  background: #60a5fa;
  bottom: 10%; left: 10%;
  animation: pulseBlob 12s infinite alternate-reverse;
}

.premium-glass {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 440px;
  padding: 45px;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.8);
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1);
}

.card-header { margin-bottom: 28px; }

h2 {
  font-size: 1.8rem;
  color: #0f172a;
  margin: 0 0 8px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.form-subtitle { color: #64748b; margin: 0; font-size: 0.95rem; }

/* ── INFO DE INVITACIÓN ── */
.invitacion-info {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.88rem;
}

.info-label { color: #64748b; font-weight: 500; }
.info-value { color: #0f172a; font-weight: 600; }

.rol-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  text-transform: capitalize;
}

.rol-badge.admin    { background: #ede9fe; color: #6d28d9; }
.rol-badge.camarero { background: #dbeafe; color: #1d4ed8; }
.rol-badge.cocinero { background: #fef3c7; color: #b45309; }

/* ── INPUTS ── */
.input-group {
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.input-group input,
.codigo-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255,255,255,0.8);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  transition: all 0.2s ease;
  outline: none;
}

.input-group input:focus,
.codigo-input:focus {
  background: white;
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99,102,241,0.1);
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper input { padding-right: 80px; }

.btn-toggle-password {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.2s;
}

.btn-toggle-password:hover { color: #4f46e5; }

/* ── BOTONES ── */
.btn-primary {
  width: 100%;
  height: 52px;
  background: #0f172a;
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(15,23,42,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(15,23,42,0.3);
  background: #1e293b;
}

.btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }

.back-link {
  text-align: center;
  margin-top: 20px;
}

.forgot-link {
  color: #6366f1;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.88rem;
  transition: color 0.2s;
}

.forgot-link:hover { color: #4338ca; }

.link-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;
}

.link-btn:hover { color: #4338ca; }

/* ── ERROR ── */
.error-msg {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 0.88rem;
  font-weight: 500;
  margin-bottom: 16px;
  text-align: center;
}

/* ── SPINNER ── */
.spinner {
  width: 20px; height: 20px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@keyframes pulseBlob {
  0%   { transform: scale(1) translate(0, 0); }
  100% { transform: scale(1.1) translate(20px, 20px); }
}

@media (max-width: 900px) {
  .register-layout { flex-direction: column; }
  .brand-section { flex: 0.4; padding: 40px 20px; }
  .form-section { flex: 0.6; }
  .premium-glass {
    background: white;
    backdrop-filter: none;
    border: none;
    box-shadow: none;
    border-radius: 30px 30px 0 0;
    margin-top: -30px;
    max-height: calc(100vh - 40%);
    overflow-y: auto;
  }
}
</style>