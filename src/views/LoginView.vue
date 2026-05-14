<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useNotify } from '../composables/useNotify'

const router = useRouter()
const { login, resetPassword } = useAuth()
const { toast } = useNotify()

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const isLoading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)
const logoShowcaseStyle = ref({
  '--logo-rotate-x': '16deg',
  '--logo-rotate-y': '-14deg',
  '--logo-shift-y': '0px',
  '--logo-scale': '0.94',
  '--logo-glow-x': '50%',
  '--logo-glow-y': '50%',
})

const resetLogoTilt = () => {
  logoShowcaseStyle.value = {
    '--logo-rotate-x': '16deg',
    '--logo-rotate-y': '-14deg',
    '--logo-shift-y': '0px',
    '--logo-scale': '0.94',
    '--logo-glow-x': '50%',
    '--logo-glow-y': '50%',
  }
}

const handleLogoMouseMove = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  const rect = target.getBoundingClientRect()
  const px = (event.clientX - rect.left) / rect.width
  const py = (event.clientY - rect.top) / rect.height
  const centeredX = px - 0.5
  const centeredY = py - 0.5

  logoShowcaseStyle.value = {
    '--logo-rotate-x': `${(-centeredY * 18).toFixed(2)}deg`,
    '--logo-rotate-y': `${(centeredX * 22).toFixed(2)}deg`,
    '--logo-shift-y': '-8px',
    '--logo-scale': '1',
    '--logo-glow-x': `${(px * 100).toFixed(2)}%`,
    '--logo-glow-y': `${(py * 100).toFixed(2)}%`,
  }
}

const handleLogin = async () => {
  isLoading.value = true
  errorMsg.value = ''

  try {
    // NUEVO: Le pasamos rememberMe.value como tercer parámetro
    const role = await login(email.value, password.value, rememberMe.value)

    if (role === 'admin') router.replace('/admin')
    else if (role === 'cocinero') router.replace('/kitchen')
    else router.replace('/tables')

  } catch (error: any) {
    errorMsg.value = error.message || 'Error al iniciar sesión. Inténtalo de nuevo.'
  } finally {
    isLoading.value = false
  }
}

const handleResetPassword = async () => {
  errorMsg.value = ''
  
  if (!email.value) {
    errorMsg.value = 'Por favor, escribe tu correo en el campo "Email" primero.'
    return
  }

  isLoading.value = true
  try {
    await resetPassword(email.value)
    toast.success('Correo enviado', `Revisa la bandeja de entrada de ${email.value} (y la carpeta de Spam).`)
  } catch (error: any) {
    errorMsg.value = error.message
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-layout">
    <div class="brand-section">
      <div class="mesh-blob blob-1"></div>
      <div class="mesh-blob blob-2"></div>
      <div class="mesh-blob blob-3"></div>

      <div class="brand-content">
        <div class="brand-mark">
          <img
            src="/Logotipo-Easy-Order.png"
            alt="EasyOrder"
            class="wordmark-image"
          >
        </div>
        <p class="subtitle">Gestión inteligente de pedidos en tiempo real</p>

        <div
          class="logo-showcase"
          :style="logoShowcaseStyle"
          @mousemove="handleLogoMouseMove"
          @mouseleave="resetLogoTilt"
        >
          <div class="showcase-glow"></div>
          <div class="showcase-orbit orbit-1"></div>
          <div class="showcase-orbit orbit-2"></div>
          <div class="logo-shell">
            <div class="logo-panel">
              <img
                src="/Isotipo-Easy-Order.png"
                alt="Logo EasyOrder"
                class="logo-icon-image"
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="bg-shape shape-purple"></div>
      <div class="bg-shape shape-blue"></div>

      <div class="login-card premium-glass">
        <div class="card-header">
          <h2>Acceso al Sistema</h2>
          <p class="form-subtitle">Ingresa tus credenciales para continuar</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="input-group">
            <label>Email</label>
            <div class="input-wrapper">
              <input type="email" v-model="email" placeholder="admin@easyorder.com" required>
            </div>
          </div>

          <div class="input-group">
            <label>Contraseña</label>
            <div class="input-wrapper password-wrapper">
              <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="••••••••" required>
              
              <button type="button" class="btn-toggle-password" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
          </div>

          <div class="form-extras">
            <label class="checkbox-container">
              <input type="checkbox" v-model="rememberMe">
              <span class="checkmark"></span>
              Recordarme
            </label>
            <a href="#" class="forgot-link" @click.prevent="handleResetPassword">¿Olvidaste tu contraseña?</a>
          </div>

          <div v-if="errorMsg" class="error-msg">
            {{ errorMsg }}
          </div>
          
          <button type="submit" class="btn-primary" :disabled="isLoading">
            <span v-if="!isLoading">Iniciar sesion</span>
            <div v-else class="spinner"></div>
          </button>

          <div class="register-link">
            ¿Tienes un código de invitación?
            <router-link to="/register" class="forgot-link">Regístrate aquí</router-link>
          </div>

        </form>
      
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

.login-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
}

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
  top: -10%;
  left: -10%;
  width: 50vw;
  height: 50vw;
  background: #6366f1;
}

.blob-2 {
  bottom: -20%;
  right: -10%;
  width: 60vw;
  height: 60vw;
  background: #3b82f6;
  animation-delay: -5s;
}

.blob-3 {
  top: 40%;
  left: 30%;
  width: 30vw;
  height: 30vw;
  background: #8b5cf6;
  opacity: 0.6;
  animation-duration: 15s;
}

.brand-content {
  position: relative;
  z-index: 10;
  text-align: center;
  max-width: 500px;
  width: 100%;
}

.brand-mark {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
  animation: floatBrand 6s ease-in-out infinite;
}

.wordmark-image {
  width: min(100%, 520px);
  display: block;
  transition: transform 0.45s ease, filter 0.45s ease;
  filter:
    drop-shadow(0 18px 40px rgba(15, 23, 42, 0.28))
    saturate(1.08);
}

.subtitle {
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 60px;
  font-weight: 400;
  letter-spacing: -0.2px;
}

.logo-showcase {
  position: relative;
  width: min(100%, 420px);
  margin: 0 auto;
  perspective: 1000px;
  cursor: pointer;
}

.showcase-glow {
  position: absolute;
  inset: 16% 10%;
  background:
    radial-gradient(circle at var(--logo-glow-x, 50%) var(--logo-glow-y, 50%), rgba(95, 224, 211, 0.44) 0%, rgba(251, 191, 92, 0.3) 36%, rgba(79, 70, 229, 0) 72%);
  filter: blur(20px);
  transform: translateZ(0);
  animation: pulseGlow 5.5s ease-in-out infinite;
  transition: background-position 0.18s ease;
}

.showcase-orbit {
  position: absolute;
  inset: 0;
  margin: auto;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.orbit-1 {
  width: 88%;
  height: 88%;
  animation: rotateOrbit 14s linear infinite;
}

.orbit-2 {
  width: 72%;
  height: 72%;
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.2);
  animation: rotateOrbit 10s linear infinite reverse;
}

.logo-shell {
  position: relative;
  padding: 12px;
  transform: rotateX(var(--logo-rotate-x, 16deg)) rotateY(var(--logo-rotate-y, -14deg)) translateY(var(--logo-shift-y, 0px)) scale(var(--logo-scale, 0.94));
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transform-style: preserve-3d;
}

.logo-showcase:hover .logo-shell {
  filter: drop-shadow(0 32px 44px rgba(15, 23, 42, 0.22));
}

.logo-showcase:hover .wordmark-image {
  transform: translateY(-4px) scale(1.015);
  filter:
    drop-shadow(0 24px 48px rgba(15, 23, 42, 0.34))
    saturate(1.12);
}

.logo-panel {
  position: relative;
  padding: 8px;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateZ(34px);
}

.logo-icon-image {
  position: relative;
  z-index: 1;
  width: min(100%, 250px);
  display: block;
  filter:
    drop-shadow(0 20px 30px rgba(15, 23, 42, 0.18))
    saturate(1.08);
  animation: floatLogo 4.8s ease-in-out infinite;
  transition: transform 0.35s ease, filter 0.35s ease;
}

.logo-showcase:hover .logo-icon-image {
  transform: scale(1.04);
  filter:
    drop-shadow(0 26px 44px rgba(15, 23, 42, 0.22))
    saturate(1.12);
}

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
  width: 300px;
  height: 300px;
  background: #c084fc;
  top: 10%;
  right: 10%;
  animation: pulseBlob 8s infinite alternate;
}

.shape-blue {
  width: 350px;
  height: 350px;
  background: #60a5fa;
  bottom: 10%;
  left: 10%;
  animation: pulseBlob 12s infinite alternate-reverse;
}

.premium-glass {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 420px;
  padding: 45px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow:
    0 10px 40px -10px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 1);
}

.card-header {
  margin-bottom: 35px;
  text-align: left;
}

h2 {
  font-size: 1.8rem;
  color: #0f172a;
  margin: 0 0 8px 0;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.form-subtitle {
  color: #64748b;
  margin: 0;
  font-size: 0.95rem;
}

.input-group {
  margin-bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.input-wrapper input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  transition: all 0.2s ease;
  outline: none;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
}

.input-wrapper input:focus {
  background: #ffffff;
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1), inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper input {
  padding-right: 80px;
}

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
  transition: color 0.2s ease;
}

.btn-toggle-password:hover {
  color: #4f46e5;
}

.form-extras {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  font-size: 0.85rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  cursor: pointer;
  font-weight: 500;
}

.forgot-link {
  color: #6366f1;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.2s;
}

.forgot-link:hover {
  color: #4338ca;
}

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
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.3);
  background: #1e293b;
}

.demo-divider {
  display: flex;
  align-items: center;
  margin: 30px 0 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.demo-divider::before,
.demo-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e2e8f0;
}

.demo-divider span {
  padding: 0 10px;
}

.demo-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.btn-demo {
  padding: 12px 0;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.btn-demo .emoji {
  font-size: 1.2rem;
}

.btn-demo:hover {
  background: #ffffff;
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

@keyframes pulseBlob {
  0% {
    transform: scale(1) translate(0, 0);
  }

  100% {
    transform: scale(1.1) translate(20px, 20px);
  }
}

@keyframes rotateOrbit {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes floatBrand {
  0%, 100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

@keyframes floatLogo {
  0%, 100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

@keyframes pulseGlow {
  0%, 100% {
    opacity: 0.85;
    transform: scale(0.96);
  }

  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .login-layout {
    flex-direction: column;
  }

  .brand-section {
    flex: 0.4;
    padding: 40px 20px;
  }

  .subtitle {
    margin-bottom: 30px;
  }

  .logo-showcase {
    width: min(100%, 320px);
  }

  .logo-panel {
    min-height: 220px;
    padding: 8px;
  }

  .logo-icon-image {
    width: min(100%, 180px);
  }

  .form-section {
    flex: 0.6;
  }

  .premium-glass {
    background: #ffffff;
    backdrop-filter: none;
    border: none;
    box-shadow: none;
    border-radius: 30px 30px 0 0;
    margin-top: -30px;
  }

  .register-link {
    text-align: center;
    margin-top: 20px;
    font-size: 0.85rem;
    color: #64748b;
  }
}
</style>
