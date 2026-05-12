<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query, where,
  doc, updateDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'
import { useNegocio } from '../composables/useNegocio'
import PoweredByEasyOrder from '../components/branding/PoweredByEasyOrder.vue'

interface LineaPedido {
  productoId: string
  nombre: string
  cantidad: number
  notas: string
}

interface Comanda {
  id: string
  mesaNumero: number
  mesaId: string
  zona: string
  estado: 'en_cocina' | 'listo'
  fechaHora: Timestamp
  lineas: LineaPedido[]
  estadoLineas?: Record<string, boolean>
}

const { logout, currentUser, localId } = useAuth()
const { config: negocio, iniciar: iniciarNegocio, detener: detenerNegocio } = useNegocio()

const comandas = ref<Comanda[]>([])
const nuevasIds = ref<Set<string>>(new Set())
const horaActual = ref(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))

let audioContext: AudioContext | null = null
let unsubscribe: (() => void) | null = null
let clockInterval: ReturnType<typeof setInterval> | null = null

// COMPUTED

const enCocina = computed(() => comandas.value.filter(c => c.estado === 'en_cocina'))
const listas   = computed(() => comandas.value.filter(c => c.estado === 'listo'))

// AUDIO

const inicializarAudio = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
}

const reproducirSonido = () => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const osc1 = audioContext.createOscillator()
    const osc2 = audioContext.createOscillator()
    const gain = audioContext.createGain()

    osc1.connect(gain); osc2.connect(gain)
    gain.connect(audioContext.destination)

    osc1.frequency.setValueAtTime(660, audioContext.currentTime)
    osc1.frequency.exponentialRampToValueAtTime(330, audioContext.currentTime + 0.4)
    osc2.frequency.setValueAtTime(880, audioContext.currentTime)
    osc2.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.4)

    osc1.type = 'sine'; osc2.type = 'sine'

    gain.gain.setValueAtTime(0, audioContext.currentTime)
    gain.gain.linearRampToValueAtTime(0.35, audioContext.currentTime + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.0)

    osc1.start(audioContext.currentTime); osc2.start(audioContext.currentTime)
    osc1.stop(audioContext.currentTime + 1.0); osc2.stop(audioContext.currentTime + 1.0)
  } catch (e) {
    console.warn('Audio no disponible:', e)
  }
}

// FIRESTORE

onMounted(() => {
  clockInterval = setInterval(() => {
    horaActual.value = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }, 1000)

  if (!localId.value) return

  iniciarNegocio(localId.value)

  const q = query(
    collection(db, `locales/${localId.value}/comandas`),
    where('estado', 'in', ['en_cocina', 'listo'])
  )

  const idsConocidas = new Set<string>()

  unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const id = change.doc.id
        if (idsConocidas.size > 0) {
          reproducirSonido()
          nuevasIds.value = new Set([...nuevasIds.value, id])
          setTimeout(() => {
            nuevasIds.value = new Set([...nuevasIds.value].filter(i => i !== id))
          }, 3000)
        }
        idsConocidas.add(id)
      }
    })

    comandas.value = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Comanda[]
  })
})

onUnmounted(() => {
  unsubscribe?.()
  if (clockInterval) clearInterval(clockInterval)
  audioContext?.close()
  detenerNegocio()
})

// ACCIONES

const toggleLinea = async (comanda: Comanda, index: number) => {
  if (!localId.value) return

  const estadoLineas: Record<string, boolean> = { ...(comanda.estadoLineas ?? {}) }
  estadoLineas[index] = !estadoLineas[index]

  const lineasListas = comanda.lineas.every((_, i) => estadoLineas[i] === true)
  const nuevoEstado = lineasListas ? 'listo' : 'en_cocina'

  await updateDoc(doc(db, `locales/${localId.value}/comandas`, comanda.id), {
    estadoLineas,
    estado: nuevoEstado
  })
}

const marcarTodaLista = async (comanda: Comanda) => {
  if (!localId.value) return
  const estadoLineas: Record<string, boolean> = {}
  comanda.lineas.forEach((_, i) => { estadoLineas[i] = true })
  await updateDoc(doc(db, `locales/${localId.value}/comandas`, comanda.id), {
    estadoLineas,
    estado: 'listo'
  })
}

const minutosEspera = (fecha: Timestamp): number => {
  if (!fecha?.toDate) return 0
  return Math.floor((Date.now() - fecha.toDate().getTime()) / 60000)
}

const lineaEstaLista = (comanda: Comanda, index: number): boolean => {
  return comanda.estadoLineas?.[index] === true
}
</script>

<template>
  <div class="cocina-layout" @click="inicializarAudio">

    <!-- TOP BAR -->
    <header class="top-bar">
      <div class="top-bar-left">
        <img
          v-if="negocio.logoUrl"
          :src="negocio.logoUrl"
          class="negocio-logo"
          alt="Logo"
        />
        <div
          v-else
          class="negocio-logo-placeholder"
          :style="{ background: negocio.colorAcento || '#4f46e5' }"
        >
          {{ negocio.nombreNegocio?.charAt(0) || 'E' }}
        </div>

        <h1 class="dashboard-title">{{ negocio.nombreNegocio || 'Cocina' }}</h1>
      </div>

      <div class="top-bar-center">
        <div class="stats">
          <div class="stat-item">
            <span class="stat-number" :style="{ color: '#f59e0b' }">{{ enCocina.length }}</span>
            <span class="stat-label">En cocina</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number" :style="{ color: '#22c55e' }">{{ listas.length }}</span>
            <span class="stat-label">Listos</span>
          </div>
        </div>
      </div>

      <div class="top-bar-right">
        <span class="clock">{{ horaActual }}</span>
        <span class="user-name">{{ currentUser?.email?.split('@')[0] }}</span>
        <PoweredByEasyOrder tone="dark" compact />
        <button class="btn-logout" @click="logout">Salir</button>
      </div>
    </header>

    <!-- BOARD -->
    <main class="kitchen-board">

      <!-- Seccion EN COCINA -->
      <section class="board-section">
        <div class="section-header">
          <span class="section-icon">COC</span>
          <h2>En Cocina</h2>
          <span class="section-badge cocina-badge">{{ enCocina.length }}</span>
        </div>

        <div v-if="enCocina.length === 0" class="empty-state">
          <span class="empty-icon">OK</span>
          <p>Sin pedidos pendientes</p>
        </div>

        <div class="tickets-grid">
          <article
            v-for="comanda in enCocina"
            :key="comanda.id"
            class="ticket"
            :class="{
              'ticket-nueva': nuevasIds.has(comanda.id),
              'ticket-urgente': minutosEspera(comanda.fechaHora) >= 10
            }"
          >
            <!-- Cabecera ticket -->
            <div class="ticket-head">
              <div class="ticket-mesa">
                <span class="mesa-num">Mesa {{ comanda.mesaNumero }}</span>
                <span class="mesa-zona">{{ comanda.zona }}</span>
              </div>
              <div class="ticket-meta">
                <span
                  class="ticket-tiempo"
                  :class="{ urgente: minutosEspera(comanda.fechaHora) >= 10 }"
                >
                  Tiempo {{ minutosEspera(comanda.fechaHora) }}min
                </span>
              </div>
            </div>

            <!-- Lineas del pedido -->
            <ul class="lineas-list">
              <li
                v-for="(linea, idx) in comanda.lineas"
                :key="idx"
                class="linea-item"
                :class="{ 'linea-lista': lineaEstaLista(comanda, idx) }"
                @click="toggleLinea(comanda, idx)"
              >
                <span class="linea-check">
                  {{ lineaEstaLista(comanda, idx) ? 'OK' : 'o' }}
                </span>
                <span class="linea-qty">{{ linea.cantidad }}x</span>
                <div class="linea-info">
                  <span class="linea-nombre">{{ linea.nombre }}</span>
                  <span v-if="linea.notas" class="linea-nota">Nota: {{ linea.notas }}</span>
                </div>
              </li>
            </ul>

            <!-- Boton marcar todo listo -->
            <button class="btn-todo-listo" @click="marcarTodaLista(comanda)">
              Todo listo
            </button>
          </article>
        </div>
      </section>

      <!-- Seccion LISTOS -->
      <section class="board-section board-section-listo">
        <div class="section-header">
          <span class="section-icon">LISTO</span>
          <h2>Listos para servir</h2>
          <span class="section-badge listo-badge">{{ listas.length }}</span>
        </div>

        <div v-if="listas.length === 0" class="empty-state">
          <span class="empty-icon">LISTO</span>
          <p>Nada listo todavia</p>
        </div>

        <div class="tickets-grid">
          <article
            v-for="comanda in listas"
            :key="comanda.id"
            class="ticket ticket-listo"
          >
            <div class="ticket-head">
              <div class="ticket-mesa">
                <span class="mesa-num">Mesa {{ comanda.mesaNumero }}</span>
                <span class="mesa-zona">{{ comanda.zona }}</span>
              </div>
              <span class="listo-badge-small">OK LISTO</span>
            </div>
            <ul class="lineas-list">
              <li
                v-for="(linea, idx) in comanda.lineas"
                :key="idx"
                class="linea-item linea-lista"
              >
                <span class="linea-check">OK</span>
                <span class="linea-qty">{{ linea.cantidad }}x</span>
                <span class="linea-nombre">{{ linea.nombre }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }

.cocina-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
}

/* TOP BAR */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 64px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
  gap: 20px;
}

.top-bar-left { display: flex; align-items: center; gap: 12px; }

/* Logo del negocio */
.negocio-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
  border-radius: 8px;
  background: white;
  flex-shrink: 0;
}

.negocio-logo-placeholder {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 800;
  font-size: 1rem;
  flex-shrink: 0;
  transition: background 0.3s;
}

.dashboard-title { font-size: 1.1rem; font-weight: 700; color: #f8fafc; }

.top-bar-center { flex: 1; display: flex; justify-content: center; }

.stats {
  display: flex;
  align-items: center;
  gap: 20px;
  background: #0f172a;
  padding: 8px 24px;
  border-radius: 40px;
  border: 1px solid #334155;
}

.stat-item { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.stat-number { font-size: 1.4rem; font-weight: 800; line-height: 1; }
.stat-label  { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-divider { width: 1px; height: 28px; background: #334155; }

.top-bar-right { display: flex; align-items: center; gap: 14px; }

.clock {
  font-size: 1.2rem;
  font-weight: 700;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.user-name { font-size: 0.85rem; color: #e2e8f0; font-weight: 600; }

.btn-logout {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid #475569;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover { background: #ef4444; border-color: #ef4444; color: white; }

/* BOARD */
.kitchen-board {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px 24px;
  gap: 28px;
}

.kitchen-board::-webkit-scrollbar { width: 4px; }
.kitchen-board::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

/* SECCIONES */
.board-section { display: flex; flex-direction: column; gap: 14px; }
.board-section-listo { opacity: 0.75; }

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #1e293b;
}

.section-icon { font-size: 1.2rem; }

.section-header h2 {
  font-size: 1rem;
  font-weight: 700;
  color: #e2e8f0;
  flex: 1;
}

.section-badge {
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
}

.cocina-badge { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
.listo-badge  { background: rgba(34,197,94,0.15);  color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }

/* GRID DE TICKETS */
.tickets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

/* TICKET */
.ticket {
  background: #1e293b;
  border: 1px solid #334155;
  border-left: 4px solid #f59e0b;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s;
}

.ticket:hover { border-color: #475569; }

.ticket-listo {
  border-left-color: #22c55e;
  background: #0f1f14;
}

/* Flash nueva comanda */
@keyframes flashNueva {
  0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0); background: #1e293b; }
  20%  { box-shadow: 0 0 20px 4px rgba(245,158,11,0.5); background: #2d2010; }
  60%  { box-shadow: 0 0 20px 4px rgba(245,158,11,0.5); background: #2d2010; }
  100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); background: #1e293b; }
}

.ticket-nueva { animation: flashNueva 3s ease-out forwards; }

@keyframes flashUrgente {
  0%, 100% { box-shadow: none; }
  50%       { box-shadow: 0 0 12px rgba(239,68,68,0.3); }
}

.ticket-urgente { border-left-color: #ef4444; animation: flashUrgente 2s infinite; }

/* CABECERA TICKET */
.ticket-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 8px;
  border-bottom: 1px solid #334155;
}

.ticket-mesa { display: flex; flex-direction: column; gap: 2px; }
.mesa-num { font-weight: 800; font-size: 1rem; color: #f1f5f9; }
.mesa-zona { font-size: 0.72rem; color: #64748b; font-weight: 600; }

.ticket-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }

.ticket-tiempo { font-size: 0.75rem; color: #64748b; font-weight: 600; }
.ticket-tiempo.urgente { color: #ef4444; font-weight: 700; }

.listo-badge-small {
  background: #22c55e;
  color: white;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 20px;
}

/* LINEAS */
.lineas-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.linea-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
  background: rgba(255,255,255,0.03);
  border: 1px solid transparent;
  user-select: none;
}

.linea-item:hover {
  background: rgba(255,255,255,0.07);
  border-color: #334155;
}

.linea-lista {
  background: rgba(34,197,94,0.08) !important;
  border-color: rgba(34,197,94,0.2) !important;
  cursor: default;
}

.linea-check {
  font-size: 0.85rem;
  font-weight: 800;
  width: 16px;
  flex-shrink: 0;
  color: #64748b;
  margin-top: 1px;
}

.linea-lista .linea-check { color: #22c55e; }

.linea-qty {
  font-size: 0.82rem;
  font-weight: 700;
  color: #94a3b8;
  flex-shrink: 0;
}

.linea-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.linea-nombre {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.2;
}

.linea-lista .linea-nombre {
  color: #64748b;
  text-decoration: line-through;
}

.linea-nota {
  font-size: 0.72rem;
  color: #fbbf24;
  background: rgba(251,191,36,0.1);
  padding: 1px 6px;
  border-radius: 4px;
  border-left: 2px solid #fbbf24;
}

/* BOTON TODO LISTO */
.btn-todo-listo {
  width: 100%;
  padding: 8px;
  background: rgba(34,197,94,0.12);
  color: #22c55e;
  border: 1px solid rgba(34,197,94,0.25);
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 2px;
}

.btn-todo-listo:hover { background: #22c55e; color: #0f172a; }

/* ESTADO VACIO */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 30px;
  color: #475569;
}

.empty-icon { font-size: 2rem; }
.empty-state p { font-size: 0.9rem; }

/* RESPONSIVE */
@media (max-width: 768px) {
  .tickets-grid { grid-template-columns: 1fr; }
  .top-bar { flex-wrap: wrap; height: auto; padding: 12px 16px; }
  .top-bar-center { order: 3; width: 100%; }
}
</style>
