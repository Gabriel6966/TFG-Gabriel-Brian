<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query,
  orderBy, doc, updateDoc, addDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'
import { useAuth } from '../composables/useAuth'

import PosSidebar from '../components/pos/PosSidebar.vue'
import PosFloorMap from '../components/pos/PosFloorMap.vue'
import PosOrderPanel from '../components/pos/PosOrderPanel.vue'

const cartStore = CartStore()
const { currentUser, logout, localId } = useAuth()

interface Zona {
  id: string
  nombre: string
  icono: string
}

// Estado reactivo original
const tables = ref<any[]>([])
const productos = ref<any[]>([])
const categorias = ref<string[]>([])
const zonas = ref<Zona[]>([])
const mesaSeleccionada = ref<number | null>(null)
const mesaSeleccionadaId = ref<string | null>(null)
const categoriaSeleccionada = ref('')
const isEnviando = ref(false)

// Estado UI Mapa
const zonaActiva = ref('')
const filtroActivo = ref('todas')

// Estado Modal Ticket
const mostrarModalTicket = ref(false)
const numeroMesaTicket = ref<number | null>(null)

let unsubscribeZonas: (() => void) | null = null
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null

onMounted(() => {
  if (localId.value) {
    const qMesas = query(collection(db, `locales/${localId.value}/mesas`), orderBy('numero'))
    unsubscribeMesas = onSnapshot(qMesas, (snapshot) => {
      const storageKey = `posicionesMesas_${localId.value}`
      const posicionesGuardadas = JSON.parse(localStorage.getItem(storageKey) || '{}')

      tables.value = snapshot.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          nr: data.numero,
          capacity: data.capacidad ?? 4,
          status: data.estado === 'libre' ? 'available' : data.estado === 'preparando' ? 'preparing' : 'occupied',
              zona: data.zona,
          x: posicionesGuardadas[d.id]?.x,
          y: posicionesGuardadas[d.id]?.y
        }
      })
    })
        
    // Listener Zonas
    const qZonas = query(collection(db, `locales/${localId.value}/zonas`), orderBy('nombre'))
    unsubscribeZonas = onSnapshot(qZonas, (snapshot) => {
      zonas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Zona[]
      if (zonas.value.length > 0 && !zonas.value.some(z => z.nombre === zonaActiva.value)) {
        zonaActiva.value = zonas.value[0].nombre
      }
    })

    unsubscribeProductos = onSnapshot(collection(db, `locales/${localId.value}/productos`), (snapshot) => {
      productos.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      const cats = [...new Set(productos.value.map((p: any) => p.category).filter(Boolean))] as string[]
      categorias.value = cats

      if (!categoriaSeleccionada.value && cats.length > 0) {
        categoriaSeleccionada.value = cats[0]
      }
    })
  }
})

onUnmounted(() => {
  unsubscribeZonas?.()
  unsubscribeMesas?.()
  unsubscribeProductos?.()
})

// --- LÓGICA DE FILTROS ---
const mesasFiltradas = computed(() => {
  // Filtramos primero por la zona dinámica seleccionada
  let filtradas = tables.value.filter(t => t.zona === zonaActiva.value || (!t.zona && zonas.value.length === 0))
  
  if (filtroActivo.value === 'ocupadas') {
    filtradas = filtradas.filter(t => t.status === 'occupied')
  } else if (filtroActivo.value === 'disponibles') {
    filtradas = filtradas.filter(t => t.status === 'available')
  } else if (filtroActivo.value === 'cocina') {
    filtradas = filtradas.filter(t => t.status === 'preparing')
  }
  return filtradas
})

const productosFiltrados = computed(() =>
  productos.value.filter((p: any) => p.category === categoriaSeleccionada.value)
)

const openTable = (table: any) => {
  if (mesaSeleccionada.value === table.nr) {
    // Si ya estaba seleccionada, la deseleccionamos (cierra el menú)
    mesaSeleccionada.value = null
    mesaSeleccionadaId.value = null
    cartStore.clear()
  } else {
    mesaSeleccionada.value = table.nr
    mesaSeleccionadaId.value = table.id
    cartStore.setTable(table.nr)
  }
}

const actualizarPosicionMesa = (id: string, x: number, y: number) => {
  if (!localId.value) return
  const storageKey = `posicionesMesas_${localId.value}`
  const posicionesGuardadas = JSON.parse(localStorage.getItem(storageKey) || '{}')
  posicionesGuardadas[id] = { x, y }
  localStorage.setItem(storageKey, JSON.stringify(posicionesGuardadas))

  const tableIndex = tables.value.findIndex(t => t.id === id)
  if (tableIndex !== -1) {
    tables.value[tableIndex].x = x
    tables.value[tableIndex].y = y
  }
}

// --- LÓGICA DEL TICKET / FACTURA ---
const abrirModalFactura = () => {
  // Si ya hay una mesa seleccionada, la ponemos por defecto en el ticket
  numeroMesaTicket.value = mesaSeleccionada.value || null
  mostrarModalTicket.value = true
}

const guardarCopiaYFinalizar = async () => {
  if (!numeroMesaTicket.value || !localId.value) return

  const mesaALiberar = tables.value.find(t => t.nr === numeroMesaTicket.value)
  if (!mesaALiberar) return alert(`No existe la mesa ${numeroMesaTicket.value}`)
  if (mesaALiberar.status === 'available') return alert('Esta mesa ya está libre.')

  try {
    // 1. Guardamos el ticket en LocalStorage (Facturas Históricas) para el Admin
    const historicoKey = `facturas_${localId.value}`
    const facturas = JSON.parse(localStorage.getItem(historicoKey) || '[]')

    facturas.push({
      id: Date.now().toString(),
      mesa: numeroMesaTicket.value,
      fecha: new Date().toLocaleString(),
      total: cartStore.totalPrice,
      items: cartStore.items.length > 0 ? cartStore.items : [{ name: 'Consumo genérico', price: 0, quantity: 1 }] // Mock por si el carrito está vacío al cobrar
    })

    localStorage.setItem(historicoKey, JSON.stringify(facturas))

    // 2. Liberamos la mesa en Firebase
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaALiberar.id), {
      estado: 'libre'
    })

    if (mesaSeleccionada.value === numeroMesaTicket.value) {
      cartStore.clear()
      mesaSeleccionada.value = null
      mesaSeleccionadaId.value = null
    }

    mostrarModalTicket.value = false
    alert('Ticket guardado en el sistema y mesa liberada con éxito.')

  } catch (error) {
    console.error('Error al cobrar:', error)
    alert('Error al procesar el ticket.')
  }
}

const enviarPedido = async () => {
  if (cartStore.items.length === 0) return alert('El pedido está vacío')
  if (!mesaSeleccionadaId.value || !currentUser.value || !localId.value) return

  isEnviando.value = true

  try {
    await addDoc(collection(db, `locales/${localId.value}/comandas`), {
      mesaId: mesaSeleccionadaId.value,
      mesaNumero: mesaSeleccionada.value,
      usuarioId: currentUser.value.uid,
      fechaHora: Timestamp.now(),
      estado: 'pendiente',
      importeTotal: cartStore.totalPrice,
      lineas: cartStore.items.map(item => ({
        productoId: item.id,
        nombre: item.name,
        precio: item.price,
        cantidad: item.quantity,
        notas: item.notes ?? ''
      }))
    })

    // La marcamos como "preparando" para que salga en el filtro "Ver Cocina"
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaSeleccionadaId.value), {
      estado: 'preparando'
    })

    cartStore.clear()
    mesaSeleccionada.value = null
    mesaSeleccionadaId.value = null

  } catch (error) {
    console.error('Error al enviar la comanda:', error)
    alert('Error al enviar el pedido.')
  } finally {
    isEnviando.value = false
  }
}
</script>

<template>
  <div class="pos-master-layout">

    <aside class="pos-sidebar-container">
      <PosSidebar :user-email="currentUser?.email ?? undefined" :local-id="localId ?? undefined" :tables="tables"
        :filtro-activo="filtroActivo" 
        :zonas="zonas" 
        :zona-activa="zonaActiva" 
        @logout="logout" @cambiar-filtro="(f) => filtroActivo = f"
        @cambiar-zona="(z) => zonaActiva = z"
        @abrir-modal-factura="abrirModalFactura" />
    </aside>

    <main class="pos-center-container">
      <header class="map-header">
        <div class="header-spacer"></div>
        <div class="tabs-zone" v-if="zonas.length > 0">
          <button v-for="z in zonas" :key="z.id" :class="{ active: zonaActiva === z.nombre }" @click="zonaActiva = z.nombre">
            {{ z.icono }} {{ z.nombre }}
          </button>
        </div>
        <div v-else class="tabs-zone">
          <span style="color: #64748b; font-size: 0.85rem; font-weight: 500;">Buscando secciones...</span>
        </div>
      </header>

      <div class="map-area">
        <!-- Pasamos las mesas FILTRADAS al mapa -->
        <PosFloorMap :zona="zonaActiva.toLowerCase()" :tables="mesasFiltradas" :mesa-seleccionada="mesaSeleccionada"
          @select-table="openTable" @update-position="actualizarPosicionMesa" />

        <!-- MENÚ FLOTANTE: Aparece sobre el mapa cuando seleccionas una mesa -->
        <transition name="slide-up">
          <div v-if="mesaSeleccionada" class="menu-overlay-panel">
            <div class="menu-header">
              <h3>Comandar Mesa {{ mesaSeleccionada }}</h3>
              <button class="btn-close-menu" @click="openTable({ nr: mesaSeleccionada })">✕ Cerrar</button>
            </div>

            <nav class="categories-tabs">
              <button v-for="cat in categorias" :key="cat" :class="{ active: categoriaSeleccionada === cat }"
                @click="categoriaSeleccionada = cat">
                {{ cat }}
              </button>
            </nav>

            <div class="products-grid">
              <div v-for="p in productosFiltrados" :key="p.id" class="product-card" @click="cartStore.addToCart(p)">
                <div class="product-img">{{ p.icon || '🍔' }}</div>
                <div class="product-info">
                  <h4>{{ p.name }}</h4>
                  <p class="price">{{ p.price }}€</p>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </main>

    <aside class="pos-order-container">
      <PosOrderPanel :mesa-seleccionada="mesaSeleccionada" :is-enviando="isEnviando" @enviar="enviarPedido" />
    </aside>

    <!-- MODAL FACTURA / TICKET -->
    <transition name="fade">
      <div v-if="mostrarModalTicket" class="modal-backdrop" @click.self="mostrarModalTicket = false">
        <div class="ticket-modal">

          <div class="ticket-paper">
            <h2 class="ticket-title">BAR SCARLATTI</h2>
            <p class="ticket-subtitle">TICKET DE VENTA</p>
            <div class="ticket-divider"></div>

            <div class="ticket-input-group">
              <label>MESA A COBRAR:</label>
              <input type="number" v-model="numeroMesaTicket" placeholder="Ej: 2" class="ticket-input" />
            </div>

            <div class="ticket-divider"></div>

            <div v-if="cartStore.items.length > 0 && mesaSeleccionada === numeroMesaTicket" class="ticket-items">
              <div v-for="item in cartStore.items" :key="item.id" class="t-item">
                <span class="t-qty">{{ item.quantity }}x</span>
                <span class="t-name">{{ item.name }}</span>
                <span class="t-price">{{ (item.price * item.quantity).toFixed(2) }}€</span>
              </div>
            </div>
            <div v-else class="ticket-empty">
              (Cargando histórico de la mesa...)
            </div>

            <div class="ticket-divider"></div>

            <div class="ticket-total">
              <span>TOTAL</span>
              <span v-if="mesaSeleccionada === numeroMesaTicket">{{ cartStore.totalPrice.toFixed(2) }}€</span>
              <span v-else>-- €</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancelar" @click="mostrarModalTicket = false">Cancelar</button>
            <button class="btn-cobrar" @click="guardarCopiaYFinalizar" :disabled="!numeroMesaTicket">
              💳 Guardar Copia y Finalizar
            </button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
/* ── LAYOUT PRINCIPAL ── */
.pos-master-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
  overflow: hidden;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

.pos-sidebar-container {
  width: 260px;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 20;
}

.pos-center-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  position: relative;
}

.map-header {
  height: 64px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: white;
  z-index: 10;
}

.header-spacer {
  width: 100px;
}

.tabs-zone {
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
}

.tabs-zone button {
  border: none;
  background: transparent;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.tabs-zone button.active {
  background: #4f46e5;
  color: white;
  box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
}

.map-area {
  flex: 1;
  overflow: hidden;
  background: #e2e8f0;
  position: relative;
}

.pos-order-container {
  width: 320px;
  background-color: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 20;
}

/* ── MENÚ FLOTANTE DE PRODUCTOS ── */
.menu-overlay-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: white;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 50;
  border-radius: 20px 20px 0 0;
}

.menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.menu-header h3 {
  margin: 0;
  color: #0f172a;
  font-weight: 800;
  font-size: 1.1rem;
}

.btn-close-menu {
  background: #fee2e2;
  color: #dc2626;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.categories-tabs {
  display: flex;
  gap: 10px;
  padding: 15px 24px;
  border-bottom: 1px solid #f1f5f9;
  overflow-x: auto;
}

.categories-tabs button {
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
  transition: 0.2s;
  white-space: nowrap;
}

.categories-tabs button.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
  padding: 20px 24px;
  overflow-y: auto;
  align-content: start;
  flex: 1;
  background: #f8fafc;
}

.product-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 15px 10px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.product-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.05);
  border-color: #cbd5e1;
}

.product-img {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.product-info h4 {
  margin: 0 0 4px 0;
  font-size: 0.9rem;
  color: #0f172a;
}

.price {
  color: #4f46e5;
  font-weight: 800;
  margin: 0;
  font-size: 1rem;
}

/* Animación Menú */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

/* ── MODAL TICKET ── */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.ticket-modal {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ticket-paper {
  background: white;
  width: 320px;
  padding: 30px 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  position: relative;
  font-family: 'Courier New', Courier, monospace;
}

/* Efecto de papel cortado abajo */
.ticket-paper::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 0;
  right: 0;
  height: 6px;
  background-image: radial-gradient(circle at 6px 0, transparent 6px, white 6px);
  background-size: 12px 12px;
  background-repeat: repeat-x;
}

.ticket-title {
  text-align: center;
  font-size: 1.4rem;
  font-weight: 900;
  margin: 0;
  color: #111;
}

.ticket-subtitle {
  text-align: center;
  font-size: 0.9rem;
  margin: 5px 0 20px;
  color: #666;
}

.ticket-divider {
  border-top: 1px dashed #ccc;
  margin: 15px 0;
}

.ticket-input-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: bold;
}

.ticket-input {
  width: 60px;
  font-family: inherit;
  font-size: 1.2rem;
  font-weight: bold;
  text-align: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px;
}

.ticket-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.t-item {
  display: flex;
  font-size: 0.9rem;
  color: #333;
}

.t-qty {
  width: 30px;
  font-weight: bold;
}

.t-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 10px;
}

.t-price {
  font-weight: bold;
}

.ticket-empty {
  text-align: center;
  color: #999;
  font-size: 0.85rem;
  font-style: italic;
}

.ticket-total {
  display: flex;
  justify-content: space-between;
  font-size: 1.3rem;
  font-weight: 900;
  color: #000;
}

.modal-actions {
  display: flex;
  gap: 10px;
  width: 320px;
}

.btn-cancelar,
.btn-cobrar {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: 0.2s;
}

.btn-cancelar {
  background: #f1f5f9;
  color: #475569;
}

.btn-cancelar:hover {
  background: #e2e8f0;
}

.btn-cobrar {
  background: #16a34a;
  color: white;
}

.btn-cobrar:hover:not(:disabled) {
  background: #15803d;
}

.btn-cobrar:disabled {
  background: #86efac;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes modalIn {
  from {
    transform: translateY(20px) scale(0.95);
    opacity: 0;
  }

  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>