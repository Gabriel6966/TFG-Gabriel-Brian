<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
    userEmail?: string
    localId?: string
    tables: any[]
    filtroActivo: string // Para saber qué botón pintar de color
    zonas?: any[]
    zonaActiva?: string
    comandasListasCount?: number // NUEVO: Recibe el número de comandas listas
}>()

// EVENTOS
const emit = defineEmits(['logout', 'abrir-modal-factura', 'cambiar-filtro', 'cambiar-zona', 'abrir-modal-monitor'])

const resumen = computed(() => {
    return {
        disponibles: props.tables.filter(t => t.status === 'available').length,
        ocupadas: props.tables.filter(t => t.status === 'occupied').length,
        preparacion: props.tables.filter(t => t.status === 'preparing').length,
        reservadas: 0
    }
})

// Secciones dinámicas conectadas a Firebase
const secciones = computed(() => {
    if (!props.zonas) return []
    return props.zonas.map(z => ({
        nombre: z.nombre,
        icon: z.icono,
        cantidad: props.tables.filter(t => t.zona === z.nombre).length,
        activa: props.zonaActiva === z.nombre
    }))
})
</script>

<template>
    <div class="sidebar-wrapper">
        <div class="user-profile">
            <div class="brand">
                <h2>EasyOrder</h2>
            </div>
            <div class="user-details">
                <div class="info">
                    <span class="role">Camarero</span>
                    <span class="local-badge">{{ localId || 'LOCAL' }}</span>
                </div>
                <button class="btn-logout" @click="emit('logout')">Cerrar<br>sesión</button>
            </div>
        </div>

        <div class="scrollable-content">
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

            <section class="sidebar-section">
                <h3 class="section-title">Secciones</h3>
                <div class="sections-list">
                    <button v-for="sec in secciones" :key="sec.nombre" class="section-item"
                        :class="{ active: sec.activa }"
                        @click="emit('cambiar-zona', sec.nombre)">
                        <span class="sec-icon">{{ sec.icon }}</span>
                        <span class="sec-name">{{ sec.nombre }}</span>
                        <span class="sec-count">{{ sec.cantidad }}</span>
                    </button>
                </div>
            </section>

            <section class="sidebar-section">
                <h3 class="section-title">Filtros rápidos</h3>
                <div class="filters-list">
                    <button class="filter-pill" :class="{ active: filtroActivo === 'todas' }"
                        @click="emit('cambiar-filtro', 'todas')">
                        <span class="indicator blue"></span> Todas las mesas
                    </button>
                    <button class="filter-pill" :class="{ active: filtroActivo === 'ocupadas' }"
                        @click="emit('cambiar-filtro', 'ocupadas')">
                        <span class="indicator red"></span> Solo ocupadas
                    </button>
                    <button class="filter-pill" :class="{ active: filtroActivo === 'disponibles' }"
                        @click="emit('cambiar-filtro', 'disponibles')">
                        <span class="indicator green"></span> Solo disponibles
                    </button>
                </div>
            </section>

            <section class="sidebar-section action-section">
                <button class="btn-monitor-sidebar" @click="emit('abrir-modal-monitor')">
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
    </div>
</template>

<style scoped>
/* LOS ESTILOS SON LOS MISMOS QUE TENÍAS */
.sidebar-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px 0;
}

.scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px;
}

.user-profile {
    padding: 0 20px 20px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 20px;
}

.brand h2 {
    font-size: 1.4rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 12px 0;
    letter-spacing: -0.5px;
}

.user-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.role {
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
}

.local-badge {
    background: #fef08a;
    color: #854d0e;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
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
    font-size: 0.7rem;
    color: #64748b;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    line-height: 1.2;
}

.btn-logout:hover {
    background: #fee2e2;
    color: #dc2626;
    border-color: #fca5a5;
}

.sidebar-section {
    margin-bottom: 30px;
}

.section-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 12px 0;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.stat-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.stat-card .number {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
}

.stat-card .label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #64748b;
}

.stat-card.available .number {
    color: #16a34a;
}

.stat-card.occupied .number {
    color: #dc2626;
}

.stat-card.preparing .number {
    color: #d97706;
}

.stat-card.reserved .number {
    color: #94a3b8;
}

.sections-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.section-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.section-item:hover {
    background: #e2e8f0;
}

.section-item.active {
    background: #ede9fe;
    color: #4f46e5;
    font-weight: 600;
}

.section-item.active .sec-name {
    color: #4f46e5;
}

.section-item.active .sec-count {
    color: #4f46e5;
    background: #ddd6fe;
}

.sec-icon {
    margin-right: 10px;
    font-size: 1.1rem;
}

.sec-name {
    flex: 1;
    text-align: left;
    font-size: 0.9rem;
    color: #475569;
}

.sec-count {
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
}

.filters-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.filter-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-pill:hover {
    border-color: #cbd5e1;
}

.filter-pill.active {
    border-color: #818cf8;
    color: #4f46e5;
    background: #f5f3ff;
}

.indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.indicator.blue {
    background: #4f46e5;
    border: 2px solid transparent;
}

.filter-pill.active .indicator.blue {
    background: white;
    border: 2px solid #4f46e5;
}

.indicator.red {
    border: 2px solid #dc2626;
}

.indicator.green {
    border: 2px solid #16a34a;
}

.indicator.yellow {
    border: 2px solid #d97706;
}

.indicator.grey {
    border: 2px solid #94a3b8;
}

.action-section {
    margin-top: 10px;
    padding-top: 20px;
    border-top: 1px dashed #e2e8f0;
}

.btn-monitor-sidebar {
    width: 100%;
    padding: 12px 14px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 700;
    color: #1d4ed8;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
}

.btn-monitor-sidebar:hover {
    background: #dbeafe;
}

.btn-liberar-sidebar {
    width: 100%;
    padding: 12px 14px;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
}

.btn-liberar-sidebar:hover {
    background: #f8fafc;
    border-color: #94a3b8;
    color: #0f172a;
}

/* NUEVO: Estilo para la burbuja de notificación roja */
.badge {
    background-color: #ef4444;
    color: white;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
    animation: pop 0.3s ease-out;
}

@keyframes pop {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}
</style>