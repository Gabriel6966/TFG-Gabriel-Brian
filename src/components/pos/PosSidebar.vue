<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useNegocio } from '../../composables/useNegocio'
import PoweredByEasyOrder from '../branding/PoweredByEasyOrder.vue'

const props = defineProps<{
  userEmail?: string
  localId?: string
  tables: any[]
  filtroActivo: string
  zonas?: any[]
  zonaActiva?: string
  comandasListasCount?: number
}>()

const emit = defineEmits(['logout', 'abrir-modal-factura', 'cambiar-filtro', 'cambiar-zona', 'abrir-modal-monitor'])

const { config: negocio, iniciar, detener } = useNegocio()

onMounted(() => {
  if (props.localId) iniciar(props.localId)
})

onUnmounted(() => detener())

const resumen = computed(() => ({
  disponibles: props.tables.filter(t => t.status === 'available').length,
  ocupadas:    props.tables.filter(t => t.status === 'occupied').length,
  preparacion: props.tables.filter(t => t.status === 'preparing').length,
  reservadas:  0
}))

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

    <!-- ── BRAND ── -->
    <div class="user-profile">
      <div class="brand" :style="{ borderBottomColor: colorAcento }">
        <div class="brand-identity">
          <!-- Logo del negocio -->
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
          <span class="role">Camarero</span>
          <span class="local-badge">{{ localId || 'LOCAL' }}</span>
        </div>
        <button class="btn-logout" @click="emit('logout')">Cerrar<br>sesión</button>
      </div>
    </div>

    <div class="scrollable-content">

      <!-- ── RESUMEN ── -->
      <section class="sidebar-section">
        <h3 class="section-title">📊 Resumen del servicio</h3>
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
          </div>
        </div>
      </section>

      <!-- ── SECCIONES / ZONAS ── -->
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

      <!-- ── FILTROS ── -->
      <section class="sidebar-section">
        <h3 class="section-title">Filtros rápidos</h3>
        <div class="filters-list">
          <button
            class="filter-pill"
            :class="{ active: filtroActivo === 'todas' }"
            :style="filtroActivo === 'todas' ? { borderColor: colorAcento, color: colorAcento, background: `${colorAcento}10` } : {}"
            @click="emit('cambiar-filtro', 'todas')"
          >
            <span class="indicator" :style="filtroActivo === 'todas' ? { background: colorAcento } : { background: '#4f46e5' }"></span>
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

      <!-- ── ACCIONES ── -->
      <section class="sidebar-section action-section">
        <button
          class="btn-monitor-sidebar"
          :style="{ background: `${colorAcento}15`, borderColor: `${colorAcento}40`, color: colorAcento }"
          @click="emit('abrir-modal-monitor')"
        >
          📺 Monitor de Pedidos
          <span v-if="comandasListasCount && comandasListasCount > 0" class="badge">
            {{ comandasListasCount }}
          </span>
        </button>
        <button class="btn-liberar-sidebar" @click="emit('abrir-modal-factura')">
          ✓ Finalizar Servicio
        </button>
      </section>

    </div>

    <!-- ── POWERED BY (abajo del todo) ── -->
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
}

/* ── BRAND ── */
.user-profile {
  padding: 20px 20px 0;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 0;
}

.brand {
  padding-bottom: 14px;
  border-bottom: 2px solid #4f46e5;
  margin-bottom: 14px;
  transition: border-color 0.3s;
}

.brand-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: white;
  flex-shrink: 0;
}

.brand-logo-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 800;
  font-size: 1.2rem;
  flex-shrink: 0;
  transition: background 0.3s;
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

/* ── INFO EMPLEADO ── */
.user-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
}

.info { display: flex; flex-direction: column; gap: 4px; }

.role {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
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

/* ── SCROLL CONTENT ── */
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.scrollable-content::-webkit-scrollbar { width: 3px; }
.scrollable-content::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }

.sidebar-section { margin-bottom: 28px; }

.section-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 10px;
}

/* ── STATS ── */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.stat-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-card .number { font-size: 1.5rem; font-weight: 800; line-height: 1; margin-bottom: 3px; }
.stat-card .label  { font-size: 0.68rem; font-weight: 600; color: #64748b; }

.stat-card.available .number { color: #16a34a; }
.stat-card.occupied  .number { color: #dc2626; }
.stat-card.preparing .number { color: #d97706; }
.stat-card.reserved  .number { color: #94a3b8; }

/* ── SECCIONES ── */
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

/* ── FILTROS ── */
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

.indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.indicator.red   { border: 2px solid #dc2626; }
.indicator.green { border: 2px solid #16a34a; }

/* ── ACCIONES ── */
.action-section {
  padding-top: 16px;
  border-top: 1px dashed #e2e8f0;
}

.btn-monitor-sidebar {
  width: 100%;
  padding: 11px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #1d4ed8;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.btn-monitor-sidebar:hover { filter: brightness(0.95); }

.btn-liberar-sidebar {
  width: 100%;
  padding: 11px 14px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-liberar-sidebar:hover { background: #f8fafc; border-color: #94a3b8; color: #0f172a; }

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

@keyframes pop {
  0%   { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}

/* ── POWERED BY ── */
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
