<script setup lang="ts">
import {ref} from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

//variables del fromu
const email=ref('')
const password=ref('')
const rememberMe=ref(false)
const isLoading=ref(false)
const errorMsg=ref('')

//Funcion del login simulada
const handleLogin=async()=>{
  isLoading.value=true
  errorMsg.value=''

  setTimeout(()=>{
    isLoading.value=false
    //logida del email
    const userEmail=email.value.toLowerCase()
    if(userEmail.includes('admin')){
      router.push('/admin')
    }else if(userEmail.includes('cocin')){
      router.push('/kitchen')
    }else{
      router.push('/tables')
    }
  },1000)
}

//logica para acceso rapido
const selectRole = (role: string) => {
  if (role === 'admin') {
    router.push('/admin') // Panel de control del jefe
  } else if (role === 'camarero') {
    router.push('/tables') // La pantalla de mesas que ya tienes hecha
  } else if (role === 'cocinero') {
    router.push('/kitchen') // La pantalla de comandas de la cocina
  }
}
</script>

<template>
  <div class="login-layout">
    <div class="brand-section">
      <div class="glow-orb orb-1"></div>
      <div class="glow-orb orb-2"></div>

      <div class="brand-content">
        <h1 class="logo-text">EasyOrder</h1>
        <p class="subtitle">Gestion inteligente de pedidos en tiempo real</p>
        
        <div class="mockup-container">
          <div class="tablet-mockup">
            <div class="mockup-screen">
              <div class="mockup-header"></div>
              <div class="mockup-grid">
                <div class="mockup-card green"></div>
                <div class="mockup-card red"></div>
                <div class="mockup-card green"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="login-card glass-effect">
        <h2>Acceso al Sistema</h2>
        <p class="form-subtitle">Ingresa tus credenciales para continuar</p>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="input-group">
            <label>Email</label>
            <input
            type="email"
            v-model="email"
            placeholder="admin@easyorder.com"
            required
            >
          </div>
          <div class="input-group">
            <label>Contraseña</label>
            <input
            type="password"
            v-model="password"
            placeholder="******"
            required
            >
          </div>
          <div class="form-extras">
            <label class="checkbox-container">
              <input 
              type="checkbox"
              v-model="rememberMe"
              >
              <span class="checkmark"></span>
              Recordarme
            </label>
            <a href="#" class="forgot-link">¿Olvidaste tu contraseña?</a>
          </div>
          <button type="submit" class="btn-primary" :disabled="isLoading">
            <span v-if="!isLoading">Iniciar sesion</span>
            <div v-else class="spinner"></div>
          </button>
        </form>
        <div class="demo-section">
          <p class="demo-title">Acceso rapidos</p>
          <div class="demo-buttons">
            <button class="btn-demo admin" @click="selectRole('admin')">⚙️ Admin</button>
            <button class="btn-demo camarero" @click="selectRole('camarero')">📝 Camarero</button>
            <button class="btn-demo cocinero" @click="selectRole('cocinero')">👨‍🍳 Cocina</button> 
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

.login-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #0F172A;
}

.brand-section {
  flex: 1;
  background: linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px;
  color: white;
  overflow: hidden;
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: 0;
  animation: float 8s ease-in-out infinite;
}
.orb-1 { width: 400px; height: 400px; background: #818CF8; top: 10%; left: 10%; opacity: 0.6; }
.orb-2 { width: 500px; height: 500px; background: #A78BFA; bottom: -10%; right: -10%; opacity: 0.4; animation-delay: -4s; }

.brand-content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 500px;
}

.logo-text { font-size: 3.5rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 10px; }
.subtitle { font-size: 1.2rem; opacity: 0.9; margin-bottom: 50px; font-weight: 300; }

.tablet-mockup {
  width: 100%; height: 250px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px; padding: 15px;
  backdrop-filter: blur(10px);
  transform: perspective(1000px) rotateX(10deg) rotateY(-10deg) scale(0.9);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  transition: transform 0.5s ease;
}
.tablet-mockup:hover { transform: perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1); }
.mockup-screen {
  background: #0F172A; height: 100%; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 10px;
}
.mockup-header { height: 20px; background: rgba(255,255,255,0.1); border-radius: 6px;}
.mockup-grid { display: flex; gap: 10px; flex: 1;}
.mockup-card { flex: 1; border-radius: 6px; background: rgba(255,255,255,0.05); }
.mockup-card.green { background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.5); }
.mockup-card.red { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); }

.form-section {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #F8FAFC;
  padding: 20px;
}

.glass-effect {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15);
}

.login-card { width: 100%; max-width: 440px; padding: 40px; }
h2 { font-size: 2rem; color: #0F172A; margin-bottom: 5px; font-weight: 700; }
.form-subtitle { color: #64748B; margin-bottom: 30px; font-size: 0.95rem; }

.input-group { margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; }
.input-group label { font-size: 0.9rem; font-weight: 600; color: #334155; }
.input-group input {
  padding: 14px 16px; background: #F1F5F9; border: 1px solid transparent;
  border-radius: 12px; font-size: 1rem; color: #0F172A; transition: all 0.2s ease; outline: none;
}
.input-group input:focus {
  background: #FFFFFF; border-color: #6366F1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}

.form-extras { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; font-size: 0.9rem; }
.forgot-link { color: #6366F1; text-decoration: none; font-weight: 600; transition: color 0.2s; }
.forgot-link:hover { color: #4F46E5; }

.btn-primary {
  width: 100%; padding: 16px; background: linear-gradient(to right, #6366F1, #4F46E5);
  color: white; border: none; border-radius: 12px; font-size: 1.05rem; font-weight: 600;
  cursor: pointer; transition: all 0.3s ease; display: flex; justify-content: center; align-items: center; height: 54px;
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4); }

.demo-section { margin-top: 35px; border-top: 1px solid #E2E8F0; padding-top: 20px; text-align: center; }
.demo-title { font-size: 0.85rem; color: #64748B; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
.demo-buttons { display: flex; gap: 10px; justify-content: center; }
.btn-demo {
  padding: 10px 15px; border: 1px solid #E2E8F0; border-radius: 8px; background: white;
  font-size: 0.85rem; font-weight: 600; color: #334155; cursor: pointer; transition: all 0.2s ease;
}
.btn-demo:hover { background: #F8FAFC; transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }


@keyframes float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-20px) scale(1.05); }
}
.spinner {
  width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3);
  border-radius: 50%; border-top-color: white; animation: spin 1s ease-in-out infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }


@media (max-width: 768px) {
  .login-layout { flex-direction: column; }
  .brand-section { flex: 0.3; padding: 20px; }
  .tablet-mockup { display: none; }
  .logo-text { font-size: 2.5rem; }
  .form-section { flex: 0.7; border-top-left-radius: 30px; border-top-right-radius: 30px; margin-top: -20px; z-index: 10; }
  .login-card { padding: 20px; box-shadow: none; border: none; background: transparent; }
}
</style>