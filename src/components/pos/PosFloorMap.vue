<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'

interface ReservaInfo { id: string; estado: string; nombre: string; hora: string; personas: number; minutos: number }

const props = defineProps<{
  zona: string
  tables: any[]
  mesaSeleccionada: number | null
  isEditable?: boolean
  localId?: string
  zonaId?: string
  mesasConReservaProxima?: Set<string>
  mesasReservaInminente?: Set<string>
  reservasInfoPorMesa?: Map<string, ReservaInfo>
}>()

const formatoMinutos = (mins: number) => {
  if (mins < 0) return `hace ${Math.abs(mins)} min`
  if (mins < 60) return `en ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `en ${h}h` : `en ${h}h ${m}min`
}

const emit = defineEmits<{
  (e: 'select-table', table: any): void
  (e: 'update-position', id: string, x: number, y: number): void
  (e: 'cobrar-mesa', id: string): void
  (e: 'comenzar-pedido', table: any): void
  (e: 'confirmar-reserva-y-pedido', payload: { reservaId: string; mesaId: string }): void
}>()

// ELEMENTOS DECORATIVOS

interface ElementoDecorativo {
  id: string
  tipo: string
  x: number
  y: number
  w?: number
  h?: number
}

const elementos = ref<ElementoDecorativo[]>([])
let unsubscribeElementos: (() => void) | null = null

const CATALOGO: Record<string, { svgPath: string, w: number, h: number }> = {
  'barra': {
    svgPath: `
      <rect x="5" y="35" width="90" height="30" rx="4" fill="#92400e"/>
      <rect x="5" y="35" width="90" height="8" rx="4" fill="#b45309"/>
      <rect x="8" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="20" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="32" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="44" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="56" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="68" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="80" y="55" width="6" height="8" rx="2" fill="#78350f"/>
    `, w: 140, h: 44
  },
  'barra-vertical': {
    svgPath: `
      <rect x="35" y="5" width="30" height="90" rx="4" fill="#92400e"/>
      <rect x="35" y="5" width="30" height="8" rx="4" fill="#b45309"/>
      <rect x="55" y="8"  width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="20" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="32" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="44" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="56" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="68" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="80" width="8" height="6" rx="2" fill="#78350f"/>
    `, w: 44, h: 140
  },
  'puerta': {
    svgPath: `
      <rect x="10" y="20" width="80" height="75" rx="3" fill="#94a3b8"/>
      <path d="M10 20 Q50 5 90 20" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
      <rect x="15" y="25" width="70" height="65" rx="2" fill="#e2e8f0"/>
      <circle cx="72" cy="58" r="4" fill="#64748b"/>
      <line x1="50" y1="25" x2="50" y2="90" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="50" y="15" text-anchor="middle" font-size="10" fill="#475569" font-weight="bold">ENTRADA</text>
    `, w: 58, h: 58
  },
  'banos': {
    svgPath: `
      <rect x="5" y="5" width="90" height="90" rx="8" fill="#bfdbfe"/>
      <rect x="5" y="5" width="90" height="90" rx="8" fill="none" stroke="#3b82f6" stroke-width="3"/>
      <text x="50" y="45" text-anchor="middle" font-size="22" fill="#1d4ed8" font-weight="900">WC</text>
      <circle cx="32" cy="68" r="8" fill="none" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="32" y1="60" x2="32" y2="52" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="26" y1="65" x2="38" y2="65" stroke="#1d4ed8" stroke-width="2"/>
      <circle cx="68" cy="68" r="8" fill="none" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="68" y1="60" x2="68" y2="52" stroke="#1d4ed8" stroke-width="2"/>
      <path d="M62 65 Q68 72 74 65" fill="none" stroke="#1d4ed8" stroke-width="2"/>
    `, w: 58, h: 58
  },
  'caja': {
    svgPath: `
      <rect x="10" y="25" width="80" height="60" rx="6" fill="#1e293b"/>
      <rect x="15" y="30" width="70" height="30" rx="4" fill="#334155"/>
      <rect x="20" y="35" width="60" height="20" rx="3" fill="#0f172a"/>
      <rect x="25" y="38" width="10" height="6" rx="1" fill="#22c55e"/>
      <rect x="38" y="38" width="10" height="6" rx="1" fill="#64748b"/>
      <rect x="51" y="38" width="10" height="6" rx="1" fill="#64748b"/>
      <rect x="64" y="38" width="6"  height="6" rx="1" fill="#ef4444"/>
      <rect x="30" y="65" width="40" height="12" rx="3" fill="#0f172a"/>
      <rect x="42" y="68" width="16" height="6"  rx="2" fill="#334155"/>
      <text x="50" y="22" text-anchor="middle" font-size="9" fill="#64748b" font-weight="bold">CAJA</text>
    `, w: 58, h: 58
  },
  'planta': {
    svgPath: `
      <ellipse cx="50" cy="55" rx="30" ry="25" fill="#15803d"/>
      <ellipse cx="35" cy="45" rx="20" ry="18" fill="#16a34a"/>
      <ellipse cx="65" cy="42" rx="22" ry="16" fill="#16a34a"/>
      <ellipse cx="50" cy="35" rx="18" ry="15" fill="#22c55e"/>
      <rect x="44" y="72" width="12" height="20" rx="3" fill="#854d0e"/>
      <ellipse cx="50" cy="72" rx="18" ry="6" fill="#166534"/>
    `, w: 52, h: 52
  },
  'tabique': {
    svgPath: `
      <rect x="5" y="40" width="90" height="20" rx="3" fill="#475569"/>
      <line x1="15" y1="40" x2="15" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="25" y1="40" x2="25" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="35" y1="40" x2="35" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="45" y1="40" x2="45" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="55" y1="40" x2="55" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="65" y1="40" x2="65" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="75" y1="40" x2="75" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="85" y1="40" x2="85" y2="60" stroke="#334155" stroke-width="1"/>
    `, w: 140, h: 32
  },
  'tabique-vertical': {
    svgPath: `
      <rect x="40" y="5" width="20" height="90" rx="3" fill="#475569"/>
      <line x1="40" y1="15" x2="60" y2="15" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="25" x2="60" y2="25" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="35" x2="60" y2="35" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="45" x2="60" y2="45" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="55" x2="60" y2="55" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="65" x2="60" y2="65" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="75" x2="60" y2="75" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="85" x2="60" y2="85" stroke="#334155" stroke-width="1"/>
    `, w: 32, h: 140
  },
  'mostrador': {
    svgPath: `
      <rect x="5" y="30" width="90" height="45" rx="5" fill="#d97706"/>
      <rect x="5" y="30" width="90" height="12" rx="5" fill="#f59e0b"/>
      <rect x="10" y="46" width="80" height="25" rx="3" fill="#b45309"/>
      <rect x="15" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>
      <rect x="40" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>
      <rect x="65" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>
    `, w: 120, h: 48
  },
  'ventana': {
    svgPath: `
      <rect x="5" y="25" width="90" height="50" rx="3" fill="#bae6fd"/>
      <rect x="5" y="25" width="90" height="50" rx="3" fill="none" stroke="#0284c7" stroke-width="4"/>
      <line x1="50" y1="25" x2="50" y2="75" stroke="#0284c7" stroke-width="3"/>
      <line x1="5"  y1="50" x2="95" y2="50" stroke="#0284c7" stroke-width="3"/>
      <rect x="8" y="28" width="38" height="20" rx="1" fill="white" opacity="0.4"/>
    `, w: 72, h: 40
  },
  'escalera': {
    svgPath: `
      <rect x="5" y="5" width="90" height="90" rx="4" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>
      <rect x="5"  y="5"  width="90" height="14" rx="2" fill="#cbd5e1"/>
      <rect x="5"  y="19" width="77" height="14" fill="#e2e8f0"/>
      <rect x="5"  y="33" width="64" height="14" fill="#cbd5e1"/>
      <rect x="5"  y="47" width="51" height="14" fill="#e2e8f0"/>
      <rect x="5"  y="61" width="38" height="14" fill="#cbd5e1"/>
      <rect x="5"  y="75" width="25" height="14" fill="#e2e8f0"/>
    `, w: 70, h: 70
  },
  'tv': {
    svgPath: `
      <rect x="5" y="15" width="90" height="60" rx="4" fill="#0f172a"/>
      <rect x="10" y="20" width="80" height="50" rx="2" fill="#1e293b"/>
      <rect x="12" y="22" width="76" height="46" rx="1" fill="#334155"/>
      <rect x="38" y="75" width="24" height="8" rx="2" fill="#0f172a"/>
      <rect x="28" y="83" width="44" height="4" rx="2" fill="#0f172a"/>
      <circle cx="85" cy="68" r="3" fill="#22c55e"/>
    `, w: 80, h: 55
  }
}

watch(() => props.zonaId, (newId) => {
  if (newId && props.localId) cargarElementos(newId)
}, { immediate: true })

const cargarElementos = (zonaId: string) => {
  if (unsubscribeElementos) unsubscribeElementos()
  if (!props.localId) return
  const q = query(
    collection(db, `locales/${props.localId}/elementosDecor`),
    where('zonaId', '==', zonaId)
  )
  unsubscribeElementos = onSnapshot(q, (snap) => {
    elementos.value = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ElementoDecorativo[]
  })
}

// Spread reactivo: en móvil mapeamos el rango real de X de las mesas al
// rango [6, 94] del viewport. Usamos `matchMedia` (más fiable que
// `innerWidth` en DevTools y al rotar pantalla).
const isMobileView = ref(false)
let mediaQuery: MediaQueryList | null = null
const onMediaChange = (e: MediaQueryListEvent) => { isMobileView.value = e.matches }

const xRange = ref<{ min: number; max: number }>({ min: 50, max: 50 })

const spreadX = (x: number) => {
  if (!isMobileView.value) return x
  const { min, max } = xRange.value
  if (max - min < 5) {
    return Math.max(4, Math.min(96, 50 + (x - 50) * 1.7))
  }
  return 6 + ((x - min) / (max - min)) * 88
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    mediaQuery = window.matchMedia('(max-width: 780px)')
    isMobileView.value = mediaQuery.matches
    mediaQuery.addEventListener('change', onMediaChange)
  }
})

const getElementoStyle = (el: ElementoDecorativo) => {
  const cat = CATALOGO[el.tipo as keyof typeof CATALOGO]
  return {
    left: `${spreadX(el.x)}%`,
    top: `${el.y}%`,
    transform: 'translate(-50%, -50%)',
    width:  `${el.w ?? cat?.w ?? 60}px`,
    height: `${el.h ?? cat?.h ?? 60}px`,
    pointerEvents: 'none' as const
  }
}

onUnmounted(() => {
  unsubscribeElementos?.()
  mediaQuery?.removeEventListener('change', onMediaChange)
})

// LOGICA DE DRAG

const mapRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const draggedTableId = ref<string | null>(null)
const localPositions = ref<Record<string, { x: number, y: number }>>({})

// Recalcula el rango X (min/max) cuando cambian mesas o elementos. Lo usa
// spreadX para mapear las posiciones al ancho completo del viewport móvil.
const recalcRange = () => {
  const xs: number[] = []
  for (const t of props.tables) {
    const x = localPositions.value[t.id]?.x ?? t.x
    if (typeof x === 'number') xs.push(x)
  }
  for (const el of elementos.value) {
    if (typeof el.x === 'number') xs.push(el.x)
  }
  if (xs.length > 0) {
    xRange.value = { min: Math.min(...xs), max: Math.max(...xs) }
  }
}

watch([() => props.tables, elementos, localPositions], recalcRange, { deep: true, immediate: true })

const calcularPosicionInicial = (index: number) => {
  const cols = 4
  const row = Math.floor(index / cols)
  const col = index % cols
  return { x: 12 + (col * 25), y: 35 + (row * 22) }
}

watch(() => props.tables, (newTables) => {
  newTables.forEach((t, i) => {
    if (!isDragging.value) {
      localPositions.value[t.id] = {
        x: t.x !== undefined ? t.x : calcularPosicionInicial(i).x,
        y: t.y !== undefined ? t.y : calcularPosicionInicial(i).y
      }
    }
  })
}, { immediate: true, deep: true })

const getTableStyle = (table: any) => {
  const pos = localPositions.value[table.id]
  if (!pos) return { left: '50%', top: '50%' }
  return { left: `${spreadX(pos.x)}%`, top: `${pos.y}%` }
}

const startDrag = (event: MouseEvent, table: any) => {
  emit('select-table', table)
  if (!props.isEditable) return
  if (event.button !== 0) return
  isDragging.value = true
  draggedTableId.value = table.id
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (event: MouseEvent) => {
  if (!isDragging.value || !mapRef.value || !draggedTableId.value) return
  const rect = mapRef.value.getBoundingClientRect()
  let newX = ((event.clientX - rect.left) / rect.width) * 100
  let newY = ((event.clientY - rect.top) / rect.height) * 100
  newX = Math.max(5, Math.min(newX, 95))
  newY = Math.max(5, Math.min(newY, 95))
  localPositions.value[draggedTableId.value] = { x: newX, y: newY }
}

const stopDrag = () => {
  if (draggedTableId.value) {
    const pos = localPositions.value[draggedTableId.value]
    emit('update-position', draggedTableId.value, pos.x, pos.y)
  }
  isDragging.value = false
  draggedTableId.value = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<template>
  <div class="floor-map-wrapper" @click="emit('select-table', null)">
    <div ref="mapRef" class="floor-surface" @click.stop="emit('select-table', null)">

      <!-- Cuadricula de fondo -->
      <div class="map-grid"></div>

      <!-- Elementos decorativos: solo lectura -->
      <div
        v-for="el in elementos"
        :key="el.id"
        class="elemento-decor"
        :style="getElementoStyle(el)"
      >
        <!-- DESPUES -->
<svg
  viewBox="0 0 100 100"
  preserveAspectRatio="none"
  class="elemento-svg"
  v-html="CATALOGO[el.tipo as keyof typeof CATALOGO]?.svgPath"
/>
      </div>

      <!-- Mesas -->
      <div
        v-for="table in tables"
        :key="table.id"
        class="table-node"
        :class="[
          table.status,
          { 'selected': mesaSeleccionada === table.nr },
          { 'dragging': draggedTableId === table.id },
          { 'editable': isEditable },
          { 'has-reservation': mesasConReservaProxima?.has(table.id) }
        ]"
        :style="getTableStyle(table)"
        @mousedown.stop="startDrag($event, table)"
        @click.stop
      >
        <div class="table-body">
          <span
            v-if="mesasConReservaProxima?.has(table.id)"
            class="t-reserva-badge"
            :title="reservasInfoPorMesa?.get(table.id) ? `${reservasInfoPorMesa.get(table.id)!.nombre} · ${reservasInfoPorMesa.get(table.id)!.hora} · ${reservasInfoPorMesa.get(table.id)!.personas} personas` : 'Reserva próxima'"
          >📅</span>
          <span class="t-number">{{ table.nr }}</span>
          <div class="t-pax">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            {{ table.capacity }}
          </div>
        </div>

        <div class="chair top"></div>
        <div class="chair bottom"></div>
        <div class="chair left"></div>
        <div class="chair right"></div>

        <transition name="fade-scale">
          <div v-if="mesaSeleccionada === table.nr" class="floating-card" @mousedown.stop @click.stop>
            <div class="fc-header">
              <div class="fc-title-group">
                <h4>Mesa {{ table.nr }}</h4>
              </div>
              <span class="fc-badge" :class="table.status">
                {{ table.status === 'available' ? 'Libre' : 'En Servicio' }}
              </span>
            </div>
            <div class="fc-details" style="text-align: center;">
              <div v-if="reservasInfoPorMesa?.get(table.id)" class="fc-reserva-info">
                <span class="fc-reserva-line">
                  📅 <strong>{{ reservasInfoPorMesa.get(table.id)!.nombre }}</strong>
                </span>
                <span class="fc-reserva-line">
                  {{ reservasInfoPorMesa.get(table.id)!.hora }} · {{ reservasInfoPorMesa.get(table.id)!.personas }} personas · {{ formatoMinutos(reservasInfoPorMesa.get(table.id)!.minutos) }}
                </span>
              </div>
              <p v-else class="fc-mensaje">
                Anade productos para preparar la comanda.
              </p>
              <button
                v-if="table.status !== 'available'"
                class="btn-cobro-rapido"
                @click.stop="emit('cobrar-mesa', table.id)"
              >
                Cobrar y liberar
              </button>
              <button
                v-if="mesasReservaInminente?.has(table.id) && reservasInfoPorMesa?.get(table.id)?.estado === 'pendiente'"
                class="btn-atender-mesa"
                @click.stop="emit('confirmar-reserva-y-pedido', { reservaId: reservasInfoPorMesa.get(table.id)!.id, mesaId: table.id })"
              >
                ✓ Atender reserva y tomar pedido
              </button>
              <button
                v-else
                class="btn-comenzar-pedido"
                @click.stop="emit('comenzar-pedido', table)"
              >
                Comenzar pedido
              </button>
            </div>
            <div class="fc-arrow"></div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.floor-map-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 40px rgba(0,0,0,0.05);
}

.floor-surface {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f8fafc;
}

.map-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, #e2e8f0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e8f0 1px, transparent 1px);
  background-size: 40px 40px;
  background-color: #f8fafc;
  pointer-events: none;
}

.elemento-decor {
  position: absolute;
  pointer-events: none;
  z-index: 5;
}

.elemento-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.table-node {
  position: absolute;
  width: 90px;
  height: 90px;
  border-radius: 16px;
  transform: translate(-50%, -50%);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 10;
  cursor: pointer;
}

.table-node.editable  { cursor: grab; }
.table-node.dragging  { cursor: grabbing; transform: translate(-50%, -50%) scale(1.15); z-index: 1000; opacity: 0.9; }
.table-node:hover:not(.dragging)  { transform: translate(-50%, -50%) scale(1.05); z-index: 20; }
.table-node.selected:not(.dragging) { transform: translate(-50%, -50%) scale(1.1); z-index: 30; }

.table-body {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  box-shadow:
    0 14px 28px rgba(15, 23, 42, 0.18),
    0 4px 8px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    inset 0 -2px 6px rgba(0, 0, 0, 0.12);
  z-index: 2;
  border: 2px solid transparent;
  pointer-events: none;
}

.available .table-body  { background: linear-gradient(160deg, #22c55e, #15803d); }
.occupied .table-body   { background: linear-gradient(160deg, #ef4444, #b91c1c); }
.preparing .table-body  { background: linear-gradient(160deg, #f59e0b, #b45309); }
.reserved .table-body   { background: linear-gradient(160deg, #94a3b8, #475569); }

.selected .table-body {
  border-color: white;
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--color-acento, #4f46e5) 65%, transparent),
    0 18px 36px rgba(15, 23, 42, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.t-number { font-size: 1.8rem; font-weight: 800; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.t-pax    { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; margin-top: 6px; opacity: 0.9; }

.t-reserva-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7, #6d28d9);
  color: white;
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(109, 40, 217, 0.45), 0 0 0 2px white;
  z-index: 3;
  animation: reservaPulse 2.5s ease-in-out infinite;
}

@keyframes reservaPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.has-reservation .table-body {
  box-shadow:
    0 14px 28px rgba(15, 23, 42, 0.18),
    0 0 0 2px rgba(168, 85, 247, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.chair {
  position: absolute;
  background: rgba(0,0,0,0.6);
  border-radius: 20px;
  z-index: 1;
  transition: all 0.3s;
  pointer-events: none;
}

.table-node.available .chair { background: #14532d; }
.table-node.occupied .chair  { background: #7f1d1d; }

.chair.top    { top: -8px;    left: 20px;  right: 20px;  height: 12px; }
.chair.bottom { bottom: -8px; left: 20px;  right: 20px;  height: 12px; }
.chair.left   { left: -8px;   top: 20px;   bottom: 20px; width: 12px;  }
.chair.right  { right: -8px;  top: 20px;   bottom: 20px; width: 12px;  }

.table-node:hover:not(.dragging) .chair.top    { top: -12px;    }
.table-node:hover:not(.dragging) .chair.bottom { bottom: -12px; }
.table-node:hover:not(.dragging) .chair.left   { left: -12px;   }
.table-node:hover:not(.dragging) .chair.right  { right: -12px;  }

.floating-card {
  position: absolute;
  left: 110%;
  top: 50%;
  transform: translateY(-50%);
  width: 230px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 16px;
  padding: 16px;
  box-shadow:
    0 20px 50px rgba(15, 23, 42, 0.18),
    0 4px 12px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  cursor: default;
  z-index: 100;
}

.fc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.fc-title-group { display: flex; align-items: center; gap: 6px; }
.fc-title-group h4 { margin: 0; font-size: 1rem; color: #0f172a; }

.fc-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  text-transform: uppercase;
}

.fc-badge.available { background: #dcfce7; color: #16a34a; }
.fc-badge.occupied, .fc-badge.preparing { background: #fee2e2; color: #dc2626; }

.fc-details { display: flex; flex-direction: column; gap: 8px; }

.fc-arrow {
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: white;
  border-left: 1px solid rgba(0,0,0,0.05);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.fade-scale-enter-active, .fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-scale-enter-from, .fade-scale-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.9);
}

.fc-mensaje {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

.btn-cobro-rapido {
  width: 100%;
  background: linear-gradient(135deg, #22c55e, #15803d);
  color: white;
  border: none;
  padding: 11px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  box-shadow: 0 8px 18px rgba(22, 163, 74, 0.28);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cobro-rapido:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(22, 163, 74, 0.38);
}

.btn-comenzar-pedido {
  width: 100%;
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 70%, #000));
  color: white;
  border: none;
  padding: 11px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 0.9rem;
  box-shadow: var(--shadow-glow);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-comenzar-pedido:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--color-acento, #4f46e5) 40%, transparent);
}

.btn-atender-mesa {
  width: 100%;
  background: linear-gradient(135deg, #a855f7, #6d28d9);
  color: white;
  border: none;
  padding: 11px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.18s;
  box-shadow: 0 8px 18px rgba(109, 40, 217, 0.32);
  line-height: 1.2;
}
.btn-atender-mesa:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(109, 40, 217, 0.42);
}

.reserva-bloqueada {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: linear-gradient(135deg, #faf5ff, #ede9fe);
  border: 1px dashed #c4b5fd;
  border-radius: 10px;
  color: #6d28d9;
  display: flex;
  align-items: center;
  gap: 10px;
}
.reserva-bloqueada-icono {
  font-size: 1.2rem;
  flex-shrink: 0;
}
.reserva-bloqueada-texto {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  text-align: left;
  line-height: 1.25;
}
.reserva-bloqueada-texto strong {
  font-size: 0.78rem;
  font-weight: 800;
  color: #6d28d9;
}
.reserva-bloqueada-texto small {
  font-size: 0.7rem;
  font-weight: 600;
  color: #7c3aed;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.fc-reserva-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #faf5ff, #ede9fe);
  border: 1px dashed #c4b5fd;
  border-radius: 10px;
  margin-bottom: 10px;
  text-align: left;
}
.fc-reserva-line {
  font-size: 0.78rem;
  color: #6d28d9;
  line-height: 1.3;
  word-break: break-word;
}
.fc-reserva-line strong { font-weight: 800; }

/* ── RESPONSIVE MÓVIL ──
   En móvil:
   1. El contenedor del plano mantiene aspect-ratio 4:3 (forma "tablet")
      para que las posiciones porcentuales conserven la disposición que
      diseñó el admin, en lugar de aplastarse a un vertical raro.
   2. Mesas/sillas/badges encogen explícitamente para que entren.
   3. Los elementos decorativos (que tienen width/height en px fijos en el
      style inline) se reducen también con scale en CSS.
   4. El popup flotante se ancla fijo abajo, a tamaño legible, fuera del
      escalado del plano.
*/
@media (max-width: 780px) {
  /* `zoom` reduce el plano y TODO su contenido uniformemente manteniendo
     las proporciones exactas que tiene en escritorio. */
  .floor-map-wrapper { overflow: hidden; }
  .floor-surface { zoom: 0.62; }

  /* Popup fuera del scaling */
  .floating-card {
    position: fixed;
    left: 50% !important;
    top: auto !important;
    bottom: 16px !important;
    transform: translateX(-50%) !important;
    width: min(340px, 92vw);
  }
}

@media (max-width: 480px) {
  .floor-surface { zoom: 0.5; }
}
</style>
