<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { collection, onSnapshot, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'

// --- Interfaces TypeScript ---
// Definimos la forma exacta de los datos que vienen de Firestore.
// Esto le dice a TypeScript qué campos existen y de qué tipo son,
// evitando errores en tiempo de desarrollo.
interface Plato {
  nombre: string
  cantidad: number
  notas: string
}

interface Comanda {
  id: string
  mesaNumero: number
  estado: 'pendiente' | 'en_preparacion' | 'listo'
  fechaHora: Timestamp
  lineas: Plato[]
}

const { logout, currentUser } = useAuth()

const comandas = ref<Comanda[]>([])
const horaActual = ref(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))

// Separamos las comandas en dos columnas por estado.
// computed() recalcula automáticamente cuando cambia comandas.value
const pendientes = computed(() =>
  comandas.value.filter(c => c.estado === 'pendiente')
)
const enPreparacion = computed(() =>
  comandas.value.filter(c => c.estado === 'en_preparacion')
)

let unsubscribe: (() => void) | null = null
let clockInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Reloj en tiempo real en la top bar
  clockInterval = setInterval(() => {
    horaActual.value = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit'
    })
  }, 1000)

  // Escuchamos SOLO las comandas activas (pendiente o en_preparacion).
  // Usamos 'in' de Firestore para filtrar por dos valores a la vez.
  // Las comandas en estado 'listo' nunca llegan al cliente → mejor rendimiento.
  const q = query(
    collection(db, 'comandas'),
    where('estado', 'in', ['pendiente', 'en_preparacion'])
  )

  unsubscribe = onSnapshot(q, (snapshot) => {
    comandas.value = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Comanda[]
  })
})

// Limpieza al salir: cancelamos el listener y el intervalo del reloj
onUnmounted(() => {
  unsubscribe?.()
  if (clockInterval) clearInterval(clockInterval)
})

// Calcula cuántos minutos lleva la comanda esperando
// para mostrar una alerta visual si lleva demasiado tiempo
const minutosEspera = (fecha: Timestamp): number => {
  if (!fecha?.toDate) return 0
  return Math.floor((Date.now() - fecha.toDate().getTime()) / 60000)
}

// Avanza el estado de una comanda en Firestore.
// onSnapshot detectará el cambio y actualizará la UI automáticamente.
const avanzarEstado = async (comanda: Comanda) => {
  const nuevoEstado = comanda.estado === 'pendiente' ? 'en_preparacion' : 'listo'
  try {
    await updateDoc(doc(db, 'comandas', comanda.id), { estado: nuevoEstado })
  } catch (error) {
    console.error('Error al actualizar estado de comanda:', error)
    alert('No se pudo actualizar el estado. Comprueba tu conexión.')
  }
}
</script>

<template>
  <div class="cocina-layout">

    <!-- TOP BAR -->
    <header class="top-bar">
      <div class="top-bar-left">
        
        <h1 class="dashboard-title">Dashboard de Cocina</h1>
        <span class="brand-tag">EasyOrder</span>
      </div>

      <div class="top-bar-center">
        <div class="stats">
          <div class="stat-item">
            <span class="stat-number pendiente-color">{{ pendientes.length }}</span>
            <span class="stat-label">Pendientes</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number prep-color">{{ enPreparacion.length }}</span>
            <span class="stat-label">En cocina</span>
          </div>
        </div>
      </div>

      <div class="top-bar-right">
        <span class="clock">{{ horaActual }}</span>
        <div class="user-info">
          <span class="user-name">{{ currentUser?.email?.split('@')[0] }}</span>

        </div>
        <button class="btn-logout" @click="logout">Cerrar sesión</button>
      </div>
    </header>

    <!-- CUERPO PRINCIPAL: dos columnas -->
    <main class="kitchen-board">

      <!-- COLUMNA IZQUIERDA: Pendientes -->
      <section class="column column-pendiente">
        <div class="column-header">
          <span class="column-icon">🔔</span>
          <h2>Nuevos Pedidos</h2>
          <span class="column-badge pendiente-badge">{{ pendientes.length }}</span>
        </div>

        <div class="tickets-list">
          <!-- Estado vacío -->
          <div v-if="pendientes.length === 0" class="empty-state">
            <span class="empty-icon">✓</span>
            <p>Sin pedidos pendientes</p>
          </div>

          <!-- Ticket de comanda -->
          <article
            v-for="comanda in pendientes"
            :key="comanda.id"
            class="ticket ticket-pendiente"
            :class="{ 'ticket-urgente': minutosEspera(comanda.fechaHora) >= 10 }"
          >
            <div class="ticket-header">
              <div class="mesa-badge">Mesa {{ comanda.mesaNumero }}</div>
              <div class="ticket-meta">
                <span class="tiempo" :class="{ urgente: minutosEspera(comanda.fechaHora) >= 10 }">
                  ⏱ {{ minutosEspera(comanda.fechaHora) }} min
                </span>
              </div>
            </div>

            <ul class="platos-list">
              <li v-for="(plato, i) in comanda.lineas" :key="i" class="plato-item">
                <span class="plato-qty">{{ plato.cantidad }}x</span>
                <div class="plato-info">
                  <span class="plato-nombre">{{ plato.nombre }}</span>
                  <span v-if="plato.notas" class="plato-notas">⚠ {{ plato.notas }}</span>
                </div>
              </li>
            </ul>

            <button class="btn-accion btn-empezar" @click="avanzarEstado(comanda)">
              👨‍🍳 Empezar a preparar
            </button>
          </article>
        </div>
      </section>

      <!-- COLUMNA DERECHA: En preparación -->
      <section class="column column-prep">
        <div class="column-header">
          <span class="column-icon">🔥</span>
          <h2>En Preparación</h2>
          <span class="column-badge prep-badge">{{ enPreparacion.length }}</span>
        </div>

        <div class="tickets-list">
          <div v-if="enPreparacion.length === 0" class="empty-state">
            <span class="empty-icon">🍽</span>
            <p>Nada en los fogones</p>
          </div>

          <article
            v-for="comanda in enPreparacion"
            :key="comanda.id"
            class="ticket ticket-prep"
          >
            <div class="ticket-header">
              <div class="mesa-badge mesa-badge-prep">Mesa {{ comanda.mesaNumero }}</div>
              <div class="ticket-meta">
                <span class="tiempo" :class="{ urgente: minutosEspera(comanda.fechaHora) >= 15 }">
                  ⏱ {{ minutosEspera(comanda.fechaHora) }} min
                </span>
              </div>
            </div>

            <ul class="platos-list">
              <li v-for="(plato, i) in comanda.lineas" :key="i" class="plato-item">
                <span class="plato-qty">{{ plato.cantidad }}x</span>
                <div class="plato-info">
                  <span class="plato-nombre">{{ plato.nombre }}</span>
                  <span v-if="plato.notas" class="plato-notas">⚠ {{ plato.notas }}</span>
                </div>
              </li>
            </ul>

            <button class="btn-accion btn-listo" @click="avanzarEstado(comanda)">
              ✅ Marcar como Listo
            </button>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* ── RESET Y BASE ─────────────────────────────────────── */
* {
  box-sizing: border-box;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 0;
}

.cocina-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
}

/* ── TOP BAR ──────────────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 70px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
  gap: 20px;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.live-dot {
  width: 10px;
  height: 10px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 8px #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.3); }
}

.dashboard-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #f8fafc;
}

.brand-tag {
  background: #4f46e5;
  color: white;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.top-bar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.stats {
  display: flex;
  align-items: center;
  gap: 24px;
  background: #0f172a;
  padding: 10px 28px;
  border-radius: 40px;
  border: 1px solid #334155;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-number {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
}

.stat-label {
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: #334155;
}

.pendiente-color { color: #f59e0b; }
.prep-color      { color: #3b82f6; }

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.clock {
  font-size: 1.4rem;
  font-weight: 700;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
  text-transform: capitalize;
}

.user-role {
  font-size: 0.72rem;
  color: #64748b;
}

.btn-logout {
  padding: 8px 18px;
  background: transparent;
  border: 1px solid #475569;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

/* ── CUERPO PRINCIPAL ─────────────────────────────────── */
.kitchen-board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex: 1;
  overflow: hidden;
}

/* ── COLUMNAS ─────────────────────────────────────────── */
.column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px;
  gap: 16px;
}

.column-pendiente {
  border-right: 1px solid #1e293b;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #1e293b;
  flex-shrink: 0;
}

.column-icon {
  font-size: 1.4rem;
}

.column-header h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #e2e8f0;
  flex: 1;
}

.column-badge {
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
}

.pendiente-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.prep-badge {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.tickets-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 4px;
}

/* Scrollbar personalizada — coherente con el tema oscuro */
.tickets-list::-webkit-scrollbar       { width: 4px; }
.tickets-list::-webkit-scrollbar-track { background: transparent; }
.tickets-list::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

/* ── ESTADO VACÍO ─────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  color: #475569;
}

.empty-icon {
  font-size: 2.5rem;
}

.empty-state p {
  font-size: 0.95rem;
}

/* ── TICKETS ──────────────────────────────────────────── */
.ticket {
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: transform 0.15s;
}

.ticket:hover {
  transform: translateY(-2px);
}

.ticket-pendiente {
  background: #1e293b;
  border: 1px solid #334155;
  border-left: 4px solid #f59e0b;
}

/* Alerta visual si lleva más de 10 min esperando */
.ticket-urgente {
  border-left-color: #ef4444;
  animation: alertPulse 2s infinite;
}

@keyframes alertPulse {
  0%, 100% { box-shadow: none; }
  50%       { box-shadow: 0 0 16px rgba(239, 68, 68, 0.25); }
}

.ticket-prep {
  background: #1e293b;
  border: 1px solid #334155;
  border-left: 4px solid #3b82f6;
}

/* ── CABECERA DEL TICKET ──────────────────────────────── */
.ticket-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mesa-badge {
  background: #f59e0b;
  color: #0f172a;
  font-weight: 800;
  font-size: 1rem;
  padding: 5px 14px;
  border-radius: 8px;
  letter-spacing: 0.3px;
}

.mesa-badge-prep {
  background: #3b82f6;
  color: white;
}

.tiempo {
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 600;
}

.tiempo.urgente {
  color: #ef4444;
  font-weight: 700;
}

/* ── LISTA DE PLATOS ──────────────────────────────────── */
.platos-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plato-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.plato-qty {
  background: #0f172a;
  color: #94a3b8;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 3px 8px;
  border-radius: 6px;
  min-width: 36px;
  text-align: center;
  flex-shrink: 0;
}

.plato-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.plato-nombre {
  font-size: 0.97rem;
  font-weight: 600;
  color: #e2e8f0;
}

/* Las notas destacan en amarillo para que no se pasen por alto */
.plato-notas {
  font-size: 0.78rem;
  color: #fbbf24;
  font-weight: 500;
  background: rgba(251, 191, 36, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  border-left: 2px solid #fbbf24;
}

/* ── BOTONES DE ACCIÓN ────────────────────────────────── */
.btn-accion {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.2px;
}

.btn-empezar {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.btn-empezar:hover {
  background: #f59e0b;
  color: #0f172a;
  transform: translateY(-1px);
}

.btn-listo {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.btn-listo:hover {
  background: #22c55e;
  color: #0f172a;
  transform: translateY(-1px);
}

/* ── RESPONSIVE ───────────────────────────────────────── */
@media (max-width: 768px) {
  .kitchen-board {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .column-pendiente {
    border-right: none;
    border-bottom: 1px solid #1e293b;
  }

  .top-bar {
    flex-wrap: wrap;
    height: auto;
    padding: 12px 16px;
  }

  .top-bar-center {
    order: 3;
    width: 100%;
  }
}
</style>