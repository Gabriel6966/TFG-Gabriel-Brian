<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

// Dependiendo del rectángulo que pulsen, les mandamos a su zona de trabajo
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
  <div class="login-container">
    <div class="header">
      <h1 class="brand-title">EasyOrder</h1>
      <p class="subtitle">Selecciona tu perfil para acceder</p>
    </div>

    <main class="roles-grid">
      <button class="role-card admin" @click="selectRole('admin')">
        <span class="role-icon">⚙️</span>
        <h2 class="role-name">Administrador</h2>
        <p class="role-desc">Gestiona mesas, menú y estadísticas</p>
      </button>

      <button class="role-card camarero" @click="selectRole('camarero')">
        <span class="role-icon">📝</span>
        <h2 class="role-name">Camarero</h2>
        <p class="role-desc">Toma comandas y gestiona mesas</p>
      </button>

      <button class="role-card cocinero" @click="selectRole('cocinero')">
        <span class="role-icon">👨‍🍳</span>
        <h2 class="role-name">Cocinero</h2>
        <p class="role-desc">Visualiza y prepara los pedidos</p>
      </button>
    </main>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.brand-title {
  font-size: 2.5rem;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 10px 0;
}

.subtitle {
  color: #6b7280;
  font-size: 1.1rem;
  margin: 0;
}

.roles-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 400px;
}

.role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 25px 20px;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.role-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.role-card:active {
  transform: scale(0.98);
}

.role-icon {
  font-size: 3rem;
  margin-bottom: 10px;
}

.role-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 5px 0;
}

.role-desc {
  font-size: 0.9rem;
  color: #6b7280;
  margin: 0;
}

/* Toques de color sutiles para diferenciar */
.admin { border-bottom: 4px solid #4f46e5; }
.camarero { border-bottom: 4px solid #1b7a35; }
.cocinero { border-bottom: 4px solid #e09f3e; }
</style>