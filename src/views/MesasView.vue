<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query, where,
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
const mesaIdTicket = ref<string>('')

// Estado Monitor Cliente
const mostrarModalMonitor = ref(false)
const comandasActivas = ref<any[]>([])
const mesaMonitorSeleccionada = ref<string | null>(null)

let unsubscribeZonas: (() => void) | null = null
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeComandas: (() => void) | null = null

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

    // Listener Comandas (pendientes, en preparación o listas)
    // Listener Comandas (Espejo total: Muestra cualquier estado que no sea entregado)
    const qComandas = query(
      collection(db, `locales/${localId.value}/comandas`),
      where('estado', '!=', 'entregado')
    )
    unsubscribeComandas = onSnapshot(qComandas, (snapshot) => {
      comandasActivas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    })
  }
})

onUnmounted(() => {
  unsubscribeZonas?.()
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeComandas?.()
})

// --- LÓGICA DE FILTROS ---
const mesasFiltradas = computed(() => {
  // Filtramos primero por la zona dinámica seleccionada
  let filtradas = tables.value.filter(t => t.zona === zonaActiva.value || (!t.zona && zonas.value.length === 0))
  
  if (filtroActivo.value === 'ocupadas') {
    filtradas = filtradas.filter(t => t.status === 'occupied' || t.status === 'preparing')
  } else if (filtroActivo.value === 'disponibles') {
    filtradas = filtradas.filter(t => t.status === 'available')
  }
  return filtradas
})

// Todas las mesas que no están libres (útil para el selector de cobrar ticket)
const mesasOcupadasTodas = computed(() => {
  return tables.value.filter(t => t.status === 'occupied' || t.status === 'preparing')
})

// --- LÓGICA DEL MONITOR DE CLIENTE ---
const mesasConComandas = computed(() => {
  const mesasMap = new Map()
  for (const c of comandasActivas.value) {
    if (!mesasMap.has(c.mesaId)) {
      // Intentar recuperar la zona de la mesa original si no viene en la comanda
      const mesaActual = tables.value.find(t => t.id === c.mesaId)
      mesasMap.set(c.mesaId, {
        id: c.mesaId,
        numero: c.mesaNumero,
        zona: c.zona || mesaActual?.zona || 'Sin zona'
      })
    }
  }
  // Ordenar primero por nombre de zona y luego por número de mesa
  return Array.from(mesasMap.values()).sort((a, b) => {
    if (a.zona === b.zona) return a.numero - b.numero
    return a.zona.localeCompare(b.zona)
  })
})

const comandasMesaSeleccionada = computed(() => {
  return comandasActivas.value.filter(c => c.mesaId === mesaMonitorSeleccionada.value)
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

// --- LÓGICA PARA DESPACHAR COMANDAS ---
const marcarComoEntregada = async (comandaId: string, mesaId: string) => {
  if (!localId.value) return
  try {
    // 1. Marcar la comanda como entregada
    await updateDoc(doc(db, `locales/${localId.value}/comandas`, comandaId), {
      estado: 'entregado'
    })
    // 2. Actualizar la mesa a 'ocupada' si no hay más platos preparándose
    const quedanPendientes = comandasActivas.value.some(
      c => c.mesaId === mesaId && c.id !== comandaId && c.estado !== 'entregado' && c.estado !== 'listo' && c.estado !== 'terminado'
    )
    if (!quedanPendientes) {
      await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaId), { estado: 'ocupada' })
    }
  } catch (error) { console.error('Error al entregar comanda:', error) }
}

// --- LÓGICA DEL TICKET / FACTURA ---
const abrirModalFactura = () => {
  // Si ya hay una mesa seleccionada, la ponemos por defecto en el ticket
  mesaIdTicket.value = mesaSeleccionadaId.value || ''
  mostrarModalTicket.value = true
}

const guardarCopiaYFinalizar = async () => {
  if (!mesaIdTicket.value || !localId.value) return

  const mesaALiberar = tables.value.find(t => t.id === mesaIdTicket.value)
  if (!mesaALiberar) return alert('Seleccione una mesa válida.')
  if (mesaALiberar.status === 'available') return alert('Esta mesa ya está libre.')

  try {
    // Calculamos a qué hora se abrió la mesa basándonos en su primera comanda
    const comandasDeLaMesa = comandasActivas.value.filter(c => c.mesaId === mesaALiberar.id)
    let fechaApertura = Timestamp.now()
    if (comandasDeLaMesa.length > 0) {
      const timestamps = comandasDeLaMesa.map(c => c.fechaHora?.seconds || Timestamp.now().seconds)
      fechaApertura = new Timestamp(Math.min(...timestamps), 0)
    }

    // 1. Guardamos el ticket en Firebase para el historial del Admin
    await addDoc(collection(db, `locales/${localId.value}/facturas`), {
      mesa: mesaALiberar.nr,
      zona: mesaALiberar.zona || 'Sin zona',
      camareroEmail: currentUser.value?.email || 'Desconocido',
      fechaApertura: fechaApertura,
      fechaCierre: Timestamp.now(),
      total: cartStore.totalPrice,
      items: cartStore.items.length > 0 ? cartStore.items : [{ name: 'Consumo genérico', price: 0, quantity: 1 }]
    })

    // 2. Liberamos la mesa en Firebase
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaALiberar.id), {
      estado: 'libre'
    })

    if (mesaSeleccionadaId.value === mesaIdTicket.value) {
      cartStore.clear()
      mesaSeleccionada.value = null
      mesaSeleccionadaId.value = null
    }

    mesaIdTicket.value = ''
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

  const mesaObj = tables.value.find(t => t.id === mesaSeleccionadaId.value)

  try {
    await addDoc(collection(db, `locales/${localId.value}/comandas`), {
      mesaId: mesaSeleccionadaId.value,
      mesaNumero: mesaSeleccionada.value,
      zona: mesaObj?.zona || 'Sin zona',
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
        @logout="handleLogout" @cambiar-filtro="(f) => filtroActivo = f"
        @cambiar-zona="(z) => zonaActiva = z"
        @abrir-modal-monitor="mostrarModalMonitor = true"
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
              <label style="flex: 1;">MESA A COBRAR:</label>
              <select v-model="mesaIdTicket" class="ticket-input select-mesa">
                <option value="" disabled>Elige...</option>
                <option v-for="m in mesasOcupadasTodas" :key="m.id" :value="m.id">
                  Mesa {{ m.nr }} ({{ m.zona || 'Sin zona' }})
                </option>
              </select>
            </div>

            <div class="ticket-divider"></div>

            <div v-if="cartStore.items.length > 0 && mesaSeleccionadaId === mesaIdTicket" class="ticket-items">
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
              <span v-if="mesaSeleccionadaId === mesaIdTicket">{{ cartStore.totalPrice.toFixed(2) }}€</span>
              <span v-else>-- €</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancelar" @click="mostrarModalTicket = false">Cancelar</button>
            <button class="btn-cobrar" @click="guardarCopiaYFinalizar" :disabled="!mesaIdTicket">
              💳 Guardar Copia y Finalizar
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- MODAL MONITOR DE ESTADO PARA EL CLIENTE -->
    <transition name="fade">
      <div v-if="mostrarModalMonitor" class="modal-backdrop" @click.self="mostrarModalMonitor = false; mesaMonitorSeleccionada = null">
        <div class="monitor-modal">
          <div class="monitor-header">
            <h2>📺 Estado de Pedidos en Tiempo Real</h2>
            <button class="btn-cancelar" style="padding: 8px 16px; flex: none;" @click="mostrarModalMonitor = false; mesaMonitorSeleccionada = null">Cerrar</button>
          </div>
          <div class="monitor-body">
            <div class="monitor-sidebar">
              <h3 style="margin-bottom: 12px; font-size: 0.9rem; color: #64748b;">MESAS ACTIVAS</h3>
              <div v-if="mesasConComandas.length === 0" class="ticket-empty">No hay pedidos en curso</div>
              <button v-for="mesa in mesasConComandas" :key="mesa.id"
                      class="monitor-table-btn"
                      :class="{ active: mesaMonitorSeleccionada === mesa.id }"
                      @click="mesaMonitorSeleccionada = mesa.id">
                Mesa {{ mesa.numero }}
                <br><small style="font-weight: 500; opacity: 0.85;">{{ mesa.zona }}</small>
              </button>
            </div>
            <div class="monitor-content">
              <div v-if="!mesaMonitorSeleccionada" class="ticket-empty" style="margin-top: 40px;">Selecciona una mesa en la izquierda para ver el estado de sus platos.</div>
              <div v-else>
                <h3 style="margin-bottom: 20px; font-size: 1.2rem; color: #0f172a;">
                  Comandas de la Mesa {{ mesasConComandas.find(m => m.id === mesaMonitorSeleccionada)?.numero }}
                  <span style="color: #64748b; font-weight: normal; font-size: 1.1rem;">({{ mesasConComandas.find(m => m.id === mesaMonitorSeleccionada)?.zona }})</span>
                </h3>
                <div v-for="comanda in comandasMesaSeleccionada" :key="comanda.id" class="comanda-card">
                  <div class="c-header">
                    <span class="c-time">🕒 {{ new Date(comanda.fechaHora.seconds * 1000).toLocaleTimeString() }}</span>
                    <!-- Limpiamos guiones bajos para que se lea "EN PREPARACION" en vez de "EN_PREPARACION" -->
                    <span class="c-status" :class="comanda.estado.toLowerCase().replace(/[\s_]+/g, '-')">{{ comanda.estado.replace(/_/g, ' ').toUpperCase() }}</span>
                  </div>
                  <ul class="c-lines">
                    <li v-for="linea in comanda.lineas" :key="linea.productoId">
                      <strong>{{ linea.cantidad }}x</strong> {{ linea.nombre }}
                      <!-- Muestra el estado individual de cada plato si la cocina trabaja así -->
                      <span v-if="linea.estado" class="linea-estado" :class="linea.estado.toLowerCase().replace(/[\s_]+/g, '-')">{{ linea.estado.replace(/_/g, ' ').toUpperCase() }}</span>
                    </li>
                  </ul>
                  <div class="c-actions" v-if="comanda.estado !== 'pendiente' && comanda.estado !== 'entregado'">
                    <button class="btn-entregar" @click="marcarComoEntregada(comanda.id, comanda.mesaId)">✓ Marcar como Servido</button>
                  </div>
              </div>
            </div>
          </div>
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

.select-mesa {
  width: auto;
  font-size: 1rem;
  max-width: 160px;
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

/* ── MODAL MONITOR DE ESTADO ── */
.monitor-modal {
  background: white;
  width: 800px;
  max-width: 95vw;
  height: 600px;
  max-height: 90vh;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
  animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.monitor-header h2 { margin: 0; font-size: 1.2rem; color: #0f172a; font-weight: 800; }
.monitor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.monitor-sidebar {
  width: 220px;
  background: #f1f5f9;
  border-right: 1px solid #e2e8f0;
  padding: 16px;
  overflow-y: auto;
}
.monitor-table-btn {
  width: 100%;
  padding: 14px;
  margin-bottom: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  color: #334155;
  text-align: left;
  transition: 0.2s;
}
.monitor-table-btn:hover { border-color: #94a3b8; }
.monitor-table-btn.active { background: #4f46e5; color: white; border-color: #4f46e5; }
.monitor-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: white;
}
.comanda-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  background: #f8fafc;
}
.c-header { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #cbd5e1; }
.c-time { color: #475569; font-weight: 600; font-size: 0.95rem; }
.c-status { font-size: 0.8rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; }
.c-status { font-size: 0.8rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; background: #e2e8f0; color: #334155; border: 1px solid #cbd5e1; }
.c-status.pendiente { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.c-status.preparando { background: #fef08a; color: #b45309; border: 1px solid #fde047; }
.c-status.listo { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
.c-status.preparando, .c-status.en-cocina, .c-status.cocinando { background: #fef08a; color: #b45309; border: 1px solid #fde047; }
.c-status.listo, .c-status.terminado, .c-status.preparado { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
.c-lines { list-style: none; padding: 0; margin: 0; }
.c-lines li { padding: 6px 0; color: #0f172a; font-size: 1.05rem; }
.linea-estado { font-size: 0.75rem; font-weight: 800; padding: 2px 6px; border-radius: 12px; margin-left: 8px; background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; text-transform: uppercase; }
.linea-estado.preparando, .linea-estado.en-cocina, .linea-estado.cocinando { background: #fef08a; color: #b45309; border-color: #fde047; }
.linea-estado.listo, .linea-estado.terminado, .linea-estado.preparado { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }
.c-actions { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: flex-end; }
.btn-entregar { background: #16a34a; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-entregar:hover { background: #15803d; }
</style>