<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useNegocio } from '../../composables/useNegocio'
import { useAuth } from '../../composables/useAuth'
import PoweredByEasyOrder from '../branding/PoweredByEasyOrder.vue'

const props = defineProps<{
  userEmail?: string
  localId?: string
  tables: any[]
  filtroActivo: string
  zonas?: any[]
  zonaActiva?: string
  comandasListasCount?: number
  hayAlgoListo?: boolean
  hayProductosCamarero?: boolean
  mesasReservaInminente?: Set<string>
  reservasActivasTotalHoy?: number
}>()

const emit = defineEmits(['logout', 'abrir-modal-factura', 'cambiar-filtro', 'cambiar-zona', 'abrir-modal-monitor', 'abrir-panel-camarero', 'abrir-modal-reserva', 'abrir-lista-reservas'])

const { config: negocio, iniciar, detener } = useNegocio()
const { userName, userRole } = useAuth()

const empleadoLabel = computed(() => {
  if (userName.value) return userName.value
  if (props.userEmail) return props.userEmail.split('@')[0]
  return userRole.value === 'admin' ? 'Admin' : userRole.value === 'cocinero' ? 'Cocinero' : 'Camarero'
})

const empleadoRol = computed(() => {
  switch (userRole.value) {
    case 'admin':    return 'Administrador'
    case 'cocinero': return 'Cocinero'
    default:         return 'Camarero'
  }
})

onMounted(() => {
  if (props.localId) iniciar(props.localId)
})

onUnmounted(() => detener())

// Mesas con reserva inminente (< 1h) cuentan como "reservadas", no como
// "disponibles" aunque su status sea 'available'.
const resumen = computed(() => {
  const reservaSet = props.mesasReservaInminente ?? new Set<string>()
  return {
    disponibles: props.tables.filter(t => t.status === 'available' && !reservaSet.has(t.id)).length,
    ocupadas:    props.tables.filter(t => t.status === 'occupied').length,
    preparacion: props.tables.filter(t => t.status === 'preparing').length,
    reservadas:  reservaSet.size
  }
})

const reservasRestantes = computed(() => {
  const total = props.reservasActivasTotalHoy ?? 0
  return Math.max(0, total - resumen.value.reservadas)
})

const secciones = computed(() => {
  if (!props.zonas) return []
  return props.zonas.map(z => ({
    nombre:  z.nombre,
    icon:    z.icono,
    cantidad: props.tables.filter(t => t.zona === z.nombre).length,
    activa:  props.zonaActiva === z.nombre
  }))
})

// Color de acento con fallback
const colorAcento = computed(() => negocio.value.colorAcento || '#4f46e5')
</script>

<template>
  <div class="sidebar-wrapper">

    <!-- BRAND -->
    <div class="user-profile">
      <div class="brand" :style="{ borderBottomColor: colorAcento }">
        <div class="brand-identity">
          <img
            v-if="negocio.logoUrl"
            :src="negocio.logoUrl"
            class="brand-logo"
            alt="Logo"
          />
          <div
            v-else
            class="brand-logo-placeholder"
            :style="{ background: colorAcento }"
          >
            {{ negocio.nombreNegocio?.charAt(0) || 'E' }}
          </div>

          <div class="brand-texts">
            <span class="brand-nombre">{{ negocio.nombreNegocio || 'EasyOrder' }}</span>
          </div>
        </div>
      </div>

      <!-- Info del empleado -->
      <div class="user-details">
        <div class="info">
          <span class="user-name">{{ empleadoLabel }}</span>
          <span class="role">{{ empleadoRol }}</span>
        </div>
        <button class="btn-logout" @click="emit('logout')">Cerrar<br>sesion</button>
      </div>
    </div>

    <div class="scrollable-content">

      <!-- RESUMEN -->
      <section class="sidebar-section">
        <h3 class="section-title">Resumen del servicio</h3>
        <div class="stats-grid">
          <div class="stat-card available">
            <span class="number">{{ resumen.disponibles }}</span>
            <span class="label">Disponibles</span>
          </div>
          <div class="stat-card occupied">
            <span class="number">{{ resumen.ocupadas }}</span>
            <span class="label">Ocupadas</span>
          </div>
          <div class="stat-card preparing">
            <span class="number">{{ resumen.preparacion }}</span>
            <span class="label">En Cocina</span>
          </div>
          <div class="stat-card reserved">
            <span class="number">{{ resumen.reservadas }}</span>
            <span class="label">Reservadas</span>
            <span v-if="reservasRestantes > 0" class="stat-extra">
              +{{ reservasRestantes }} más hoy
            </span>
          </div>
        </div>
      </section>

      <!-- SECCIONES / ZONAS -->
      <section class="sidebar-section">
        <h3 class="section-title">Secciones</h3>
        <div class="sections-list">
          <button
            v-for="sec in secciones"
            :key="sec.nombre"
            class="section-item"
            :class="{ active: sec.activa }"
            :style="sec.activa ? { background: `${colorAcento}18`, color: colorAcento } : {}"
            @click="emit('cambiar-zona', sec.nombre)"
          >
            <span class="sec-icon">{{ sec.icon }}</span>
            <span class="sec-name" :style="sec.activa ? { color: colorAcento } : {}">{{ sec.nombre }}</span>
            <span class="sec-count" :style="sec.activa ? { color: colorAcento, background: `${colorAcento}18` } : {}">
              {{ sec.cantidad }}
            </span>
          </button>
        </div>
      </section>

      <!-- FILTROS -->
      <section class="sidebar-section">
        <h3 class="section-title">Filtros rapidos</h3>
        <div class="filters-list">
          <button
            class="filter-pill"
            :class="{ active: filtroActivo === 'todas' }"
            :style="filtroActivo === 'todas' ? { borderColor: colorAcento, color: colorAcento, background: `${colorAcento}14` } : {}"
            @click="emit('cambiar-filtro', 'todas')"
          >
            <span class="indicator" :style="{ background: colorAcento }"></span>
            Todas las mesas
          </button>
          <button
            class="filter-pill"
            :class="{ active: filtroActivo === 'ocupadas' }"
            @click="emit('cambiar-filtro', 'ocupadas')"
          >
            <span class="indicator red"></span> Solo ocupadas
          </button>
          <button
            class="filter-pill"
            :class="{ active: filtroActivo === 'disponibles' }"
            @click="emit('cambiar-filtro', 'disponibles')"
          >
            <span class="indicator green"></span> Solo disponibles
          </button>
        </div>
      </section>

      <!-- ACCIONES -->
  <section class="sidebar-section action-section">
  <button
    class="btn-monitor-sidebar"
    :class="{ 'monitor-alerta': hayAlgoListo }"
    :style="{ background: `${colorAcento}15`, borderColor: `${colorAcento}40`, color: colorAcento }"
    @click="emit('abrir-modal-monitor')"
  >
    📺 Monitor de pedidos
    <span v-if="hayAlgoListo" class="badge-punto"></span>
  </button>

  <!-- Botón del panel de camarero (bebidas pendientes de servir) -->
  <button
    class="btn-camarero-sidebar"
    :class="{ 'camarero-alerta': hayProductosCamarero }"
    @click="emit('abrir-panel-camarero')"
  >
    🍺 Para servir
    <span v-if="hayProductosCamarero" class="badge-punto badge-punto-amarillo"></span>
  </button>

  <button class="btn-reserva-sidebar" @click="emit('abrir-modal-reserva')">
    📅 Nueva reserva
  </button>

  <button class="btn-reserva-sidebar btn-reserva-lista" @click="emit('abrir-lista-reservas')">
    📋 Ver reservas
  </button>

  <button class="btn-liberar-sidebar" @click="emit('abrir-modal-factura')">
    💳 Cobrar mesa
  </button>
</section>

    </div>

    <!-- POWERED BY -->
    <div class="sidebar-bottom">
      <PoweredByEasyOrder compact />
    </div>

  </div>
</template>

<style scoped>
.sidebar-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  background: white;
  box-shadow: 1px 0 0 var(--border, #e2e8f0), var(--shadow-sm);
  position: relative;
}

/* BRAND */
.user-profile {
  padding: 16px 20px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
  margin-bottom: 0;
}

.brand {
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-acento, #4f46e5);
  margin-bottom: 14px;
  transition: border-color 0.3s;
}

.brand-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.brand-logo-placeholder {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 800;
  font-size: 1.25rem;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 70%, #000));
  box-shadow: var(--shadow-glow);
  transition: background 0.3s, box-shadow 0.3s;
}

.brand-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-nombre {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* INFO EMPLEADO */
.user-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
}

.info { display: flex; flex-direction: column; gap: 4px; }

.user-name {
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.role {
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.local-badge {
  background: #fef08a;
  color: #854d0e;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-logout {
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.68rem;
  color: #64748b;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  line-height: 1.3;
}

.btn-logout:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

/* SCROLL CONTENT */
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.scrollable-content::-webkit-scrollbar { width: 3px; }
.scrollable-content::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }

.sidebar-section { margin-bottom: 16px; }

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

/* STATS */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.stat-card {
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 12px);
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.stat-card .number { font-size: 1.3rem; font-weight: 800; line-height: 1; margin-bottom: 2px; }
.stat-card .label  { font-size: 0.65rem; font-weight: 600; color: #64748b; }
.stat-card .stat-extra {
  display: block;
  margin-top: 3px;
  font-size: 0.58rem;
  font-weight: 700;
  color: #6d28d9;
  background: #ede9fe;
  padding: 1px 5px;
  border-radius: 5px;
  line-height: 1.2;
}

.stat-card.available .number { color: #16a34a; }
.stat-card.occupied  .number { color: #dc2626; }
.stat-card.preparing .number { color: #d97706; }
.stat-card.reserved  .number { color: #94a3b8; }

/* SECCIONES */
.sections-list { display: flex; flex-direction: column; gap: 4px; }

.section-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.section-item:hover { background: #f1f5f9; }

.sec-icon   { margin-right: 8px; font-size: 1rem; }
.sec-name   { flex: 1; text-align: left; font-size: 0.88rem; color: #475569; transition: color 0.2s; }
.sec-count  { font-size: 0.75rem; color: #94a3b8; font-weight: 600; background: #f1f5f9; padding: 2px 7px; border-radius: 20px; transition: all 0.2s; }

/* FILTROS */
.filters-list { display: flex; flex-direction: column; gap: 7px; }

.filter-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 0.83rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-pill:hover { border-color: #cbd5e1; }

/* Estado seleccionado para "Solo ocupadas" / "Solo disponibles".
   La pill "Todas" lleva su propio estilo inline con el color del negocio. */
.filter-pill.active:not([style]) {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
  box-shadow: inset 0 0 0 1px #cbd5e1;
}

.indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-acento, #4f46e5);
}

.indicator.red   { background: #dc2626; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2); }
.indicator.green { background: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2); }

/* ACCIONES */
.action-section {
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}

.btn-monitor-sidebar {
  width: 100%;
  padding: 9px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md, 10px);
  font-size: 0.85rem;
  font-weight: 700;
  color: #1d4ed8;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  margin-bottom: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.btn-monitor-sidebar:hover {
  filter: brightness(0.97);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-liberar-sidebar {
  width: 100%;
  padding: 10px 12px;
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 75%, #000));
  border: none;
  border-radius: var(--radius-md, 10px);
  font-size: 0.88rem;
  font-weight: 700;
  color: white;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  box-shadow: var(--shadow-glow);
}

.btn-liberar-sidebar:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--color-acento, #4f46e5) 38%, transparent);
}

.badge {
  background-color: #ef4444;
  color: white;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
  min-width: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(239,68,68,0.3);
  animation: pop 0.3s ease-out;
}

.badge-punto {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px white;
}

.monitor-alerta {
  animation: pulsoAlerta 1.5s ease-in-out infinite;
}

.btn-camarero-sidebar {
  width: 100%;
  padding: 9px 12px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: var(--radius-md, 10px);
  font-size: 0.85rem;
  font-weight: 700;
  color: #b45309;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  margin-bottom: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.btn-camarero-sidebar:hover {
  filter: brightness(0.97);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-reserva-sidebar {
  width: 100%;
  padding: 9px 12px;
  background: #ede9fe;
  border: 1px solid #ddd6fe;
  border-radius: var(--radius-md, 10px);
  font-size: 0.85rem;
  font-weight: 700;
  color: #6d28d9;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  margin-bottom: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
.btn-reserva-sidebar:hover {
  filter: brightness(0.97);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-reserva-sidebar.btn-reserva-lista {
  background: white;
  border-color: #ddd6fe;
  color: #6d28d9;
}

.camarero-alerta {
  animation: pulsoAlerta 1.5s ease-in-out infinite;
}

.badge-punto-amarillo {
  background: #d97706 !important;
}

@keyframes pulsoAlerta {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50%       { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

@keyframes pop {
  0%   { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}

/* POWERED BY */
.sidebar-bottom {
  padding: 12px 20px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0) 0%, #f8fafc 100%);
}
</style>
