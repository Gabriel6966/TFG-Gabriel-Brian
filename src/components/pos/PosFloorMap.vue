<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
    zona: string
    tables: any[]
    mesaSeleccionada: number | null
    isEditable?: boolean
}>()

const emit = defineEmits<{
    (e: 'select-table', table: any): void
    (e: 'update-position', id: string, x: number, y: number): void
}>()

const mapRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const draggedTableId = ref<string | null>(null)
const localPositions = ref<Record<string, { x: number, y: number }>>({})

const calcularPosicionInicial = (index: number) => {
    const cols = 4
    const row = Math.floor(index / cols)
    const col = index % cols
    return {
        x: 12 + (col * 25),
        y: 35 + (row * 22)
    }
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
    return { left: `${pos.x}%`, top: `${pos.y}%` }
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
    <div class="floor-map-wrapper">
        <div ref="mapRef" class="floor-surface" :class="zona === 'interior' ? 'surface-wood' : 'surface-stone'">
            <div v-for="table in tables" :key="table.id" class="table-node" :class="[
                table.status,
                { 'selected': mesaSeleccionada === table.nr },
                { 'dragging': draggedTableId === table.id },
                { 'editable': isEditable }
            ]" :style="getTableStyle(table)" @mousedown.stop="startDrag($event, table)">
                <div class="table-body">
                    <span class="t-number">{{ table.nr }}</span>
                    <div v-if="table.status === 'occupied'" class="t-timer">00:24</div>
                    <div class="t-pax">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                    <div v-if="mesaSeleccionada === table.nr" class="floating-card" @mousedown.stop>
                        <div class="fc-header">
                            <div class="fc-title-group">
                                <span class="fc-icon">🪑</span>
                                <h4>Mesa {{ table.nr }}</h4>
                            </div>
                            <span class="fc-badge" :class="table.status">
                                {{ table.status === 'available' ? 'Disponible' : 'Ocupada' }}
                            </span>
                        </div>
                        <div class="fc-details">
                            <div class="fc-row">
                                <span>👥 Capacidad</span>
                                <strong>{{ table.capacity }} personas</strong>
                            </div>
                            <div class="fc-row" v-if="table.status === 'occupied'">
                                <span>⏱️ Tiempo</span>
                                <strong>00:24 min</strong>
                            </div>
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
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.05);
}

.floor-surface {
    width: 100%;
    height: 100%;
    position: relative;
    transition: all 0.5s ease;
}

.surface-wood {
    background-color: #cda885;
    background-image: url('../../assets/fondo-interior.png');
    background-size: cover;
    background-position: center;
}

.surface-stone {
    background-color: #e5e5e0;
    background-image: url('../../assets/fondo-terraza.png');
    background-size: cover;
    background-position: center;
}

.table-node {
    position: absolute;
    width: 90px;
    height: 90px;
    border-radius: 16px;
    transform: translate(-50%, -50%);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 10;
}

.table-node.editable {
    cursor: grab;
}

.table-node.dragging {
    cursor: grabbing;
    transform: translate(-50%, -50%) scale(1.15);
    z-index: 1000;
    opacity: 0.9;
}

.table-node:hover:not(.dragging) {
    transform: translate(-50%, -50%) scale(1.05);
    z-index: 20;
}

.table-node.selected:not(.dragging) {
    transform: translate(-50%, -50%) scale(1.1);
    z-index: 30;
}

.table-body {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: white;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3), inset 0 2px 5px rgba(255, 255, 255, 0.2);
    z-index: 2;
    border: 2px solid transparent;
    pointer-events: none;
}

.available .table-body {
    background: #16a34a;
}

.occupied .table-body {
    background: #dc2626;
}

.preparing .table-body {
    background: #d97706;
}

.reserved .table-body {
    background: #64748b;
}

.selected .table-body {
    border-color: white;
    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.6), 0 15px 30px rgba(0, 0, 0, 0.4);
}

.t-number {
    font-size: 1.8rem;
    font-weight: 800;
    line-height: 1;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.t-timer {
    font-size: 0.7rem;
    font-family: monospace;
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    margin-top: 4px;
}

.t-pax {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    margin-top: 6px;
    opacity: 0.9;
}

.chair {
    position: absolute;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 20px;
    z-index: 1;
    transition: all 0.3s;
    pointer-events: none;
}

.table-node.available .chair {
    background: #14532d;
}

.table-node.occupied .chair {
    background: #7f1d1d;
}

.chair.top {
    top: -8px;
    left: 20px;
    right: 20px;
    height: 12px;
}

.chair.bottom {
    bottom: -8px;
    left: 20px;
    right: 20px;
    height: 12px;
}

.chair.left {
    left: -8px;
    top: 20px;
    bottom: 20px;
    width: 12px;
}

.chair.right {
    right: -8px;
    top: 20px;
    bottom: 20px;
    width: 12px;
}

.table-node:hover:not(.dragging) .chair.top {
    top: -12px;
}

.table-node:hover:not(.dragging) .chair.bottom {
    bottom: -12px;
}

.table-node:hover:not(.dragging) .chair.left {
    left: -12px;
}

.table-node:hover:not(.dragging) .chair.right {
    right: -12px;
}

.floating-card {
    position: absolute;
    left: 110%;
    top: 50%;
    transform: translateY(-50%);
    width: 220px;
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
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

.fc-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
}

.fc-title-group h4 {
    margin: 0;
    font-size: 1rem;
    color: #0f172a;
}

.fc-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    text-transform: uppercase;
}

.fc-badge.available {
    background: #dcfce7;
    color: #16a34a;
}

.fc-badge.occupied {
    background: #fee2e2;
    color: #dc2626;
}

.fc-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.fc-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
}

.fc-row span {
    color: #64748b;
}

.fc-row strong {
    color: #0f172a;
}

.fc-arrow {
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%) rotate(45deg);
    width: 12px;
    height: 12px;
    background: white;
    border-left: 1px solid rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
    opacity: 0;
    transform: translateY(-50%) scale(0.9);
}
</style>