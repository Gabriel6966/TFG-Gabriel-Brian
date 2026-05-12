<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query, where,
  orderBy, doc, updateDoc, addDoc, Timestamp, getDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'
import { useAuth } from '../composables/useAuth'
import { useNegocio } from '../composables/useNegocio'

import PosSidebar from '../components/pos/PosSidebar.vue'
import PosFloorMap from '../components/pos/PosFloorMap.vue'
import PosOrderPanel from '../components/pos/PosOrderPanel.vue'

const cartStore = CartStore()
const { currentUser, logout, localId } = useAuth()
const { config: negocio, iniciar: iniciarNegocio, detener: detenerNegocio } = useNegocio()

const abrirCobroRapido = (id: string) => {
  mesaIdTicket.value = id
  metodoPago.value = 'efectivo'
  mostrarModalTicket.value = true
}

interface Zona {
  id: string
  nombre: string
  icono: string
}

interface Categoria {
  id: string
  nombre: string
  icono?: string
  imageUrl?: string
  orderIndex?: number
}

interface Notificacion {
  id: string
  mesaNumero: number
  texto: string
  comandaId: string
  mesaId: string
}

// Estado reactivo
const tables = ref<any[]>([])
const productos = ref<any[]>([])
const categorias = ref<string[]>([])
const categoriasData = ref<Categoria[]>([])
const zonas = ref<Zona[]>([])
const mesaSeleccionada = ref<number | null>(null)
const mesaSeleccionadaId = ref<string | null>(null)
const categoriaSeleccionada = ref('')
const isEnviando = ref(false)

// Estado UI
const zonaActiva = ref('')
const filtroActivo = ref('todas')
const mostrarModalCarta = ref(false)

// Modal Ticket
const mostrarModalTicket = ref(false)
const mesaIdTicket = ref<string | null>(null)
const metodoPago = ref<'efectivo' | 'tarjeta'>('efectivo')

// Monitor
const mostrarModalMonitor = ref(false)
const comandasActivas = ref<any[]>([])
const mesaMonitorSeleccionada = ref<string | null>(null)

// â”€â”€ NOTIFICACIONES â”€â”€
const comandasNotificadas = ref<Set<string>>(new Set())
const notificaciones = ref<Notificacion[]>([])

let audioContext: AudioContext | null = null

const inicializarAudio = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
}

const reproducirSonidoCampana = () => {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator1 = audioContext.createOscillator()
    const oscillator2 = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator1.connect(gainNode)
    oscillator2.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime)
    oscillator1.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.5)
    oscillator2.frequency.setValueAtTime(1108, audioContext.currentTime)
    oscillator2.frequency.exponentialRampToValueAtTime(554, audioContext.currentTime + 0.5)

    oscillator1.type = 'sine'
    oscillator2.type = 'sine'

    gainNode.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.2)

    oscillator1.start(audioContext.currentTime)
    oscillator2.start(audioContext.currentTime)
    oscillator1.stop(audioContext.currentTime + 1.2)
    oscillator2.stop(audioContext.currentTime + 1.2)
  } catch (e) {
    console.warn('No se pudo reproducir el sonido:', e)
  }
}

const descartarNotificacion = async (notif: Notificacion) => {
  notificaciones.value = notificaciones.value.filter(n => n.id !== notif.id)
  if (localId.value) {
    try {
      await updateDoc(doc(db, `locales/${localId.value}/comandas`, notif.comandaId), {
        estado: 'entregado'
      })
      await updateDoc(doc(db, `locales/${localId.value}/mesas`, notif.mesaId), {
        estado: 'ocupada'
      })
    } catch (e) {
      console.error('Error al marcar como entregado:', e)
    }
  }
}

const descartarTodasNotificaciones = () => {
  notificaciones.value = []
}

const comandasListasCount = computed(() =>
  comandasActivas.value.filter(c => c.estado === 'listo').length
)

// â”€â”€ LISTENERS â”€â”€
let unsubscribeZonas: (() => void) | null = null
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null
let unsubscribeComandas: (() => void) | null = null

onMounted(() => {
  if (!localId.value) return

  iniciarNegocio(localId.value)

  const qMesas = query(collection(db, `locales/${localId.value}/mesas`), orderBy('numero'))
  unsubscribeMesas = onSnapshot(qMesas, (snapshot) => {
    tables.value = snapshot.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        nr: data.numero,
        nombre: data.nombre,
        capacity: data.capacidad ?? 4,
        status: data.estado === 'libre' ? 'available' : data.estado === 'preparando' ? 'preparing' : 'occupied',
        zona: data.zona,
        x: data.x,
        y: data.y
      }
    })
  })

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

  unsubscribeCategorias = onSnapshot(
    query(collection(db, `locales/${localId.value}/categorias`), orderBy('nombre')),
    (snapshot) => {
      categoriasData.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Categoria[]
    }
  )

  const qComandas = query(
    collection(db, `locales/${localId.value}/comandas`),
    where('estado', 'in', ['en_cocina', 'listo', 'entregado'])
  )
  unsubscribeComandas = onSnapshot(qComandas, (snapshot) => {
    const nuevasComandas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    for (const item of nuevasComandas) {
      const comanda = item as any
      if (comanda.estado === 'listo' && !comandasNotificadas.value.has(comanda.id)) {
        comandasNotificadas.value.add(comanda.id)
        notificaciones.value.push({
          id: comanda.id,
          mesaNumero: comanda.mesaNumero || 0,
          texto: `Mesa ${comanda.mesaNumero || '?'} - Pedido listo para recoger`,
          comandaId: comanda.id,
          mesaId: comanda.mesaId || ''
        })
        reproducirSonidoCampana()
      }
    }

    const idsActivos = new Set(nuevasComandas.map((c: any) => c.id))
    for (const id of comandasNotificadas.value) {
      if (!idsActivos.has(id)) comandasNotificadas.value.delete(id)
    }
    comandasActivas.value = nuevasComandas
  })
})

onUnmounted(() => {
  unsubscribeZonas?.()
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
  unsubscribeComandas?.()
  audioContext?.close()
  detenerNegocio()
})

// â”€â”€ COMPUTED â”€â”€

const cuentaFinalMesa = computed(() => {
  if (!mesaIdTicket.value) return { items: [], total: 0 }
  const comandasDeLaMesa = comandasActivas.value.filter(c => c.mesaId === mesaIdTicket.value)
  const itemsAgrupados = new Map<string, any>()
  let totalCalculado = 0

  comandasDeLaMesa.forEach(comanda => {
    comanda.lineas.forEach((linea: any) => {
      totalCalculado += linea.precio * linea.cantidad
      if (itemsAgrupados.has(linea.productoId)) {
        itemsAgrupados.get(linea.productoId).cantidad += linea.cantidad
      } else {
        itemsAgrupados.set(linea.productoId, { ...linea })
      }
    })
  })

  return { items: Array.from(itemsAgrupados.values()), total: totalCalculado }
})

const mesasFiltradas = computed(() => {
  let filtradas = tables.value.filter(t =>
    t.zona === zonaActiva.value || (!t.zona && zonas.value.length === 0)
  )
  if (filtroActivo.value === 'ocupadas') {
    filtradas = filtradas.filter(t => t.status === 'occupied' || t.status === 'preparing')
  } else if (filtroActivo.value === 'disponibles') {
    filtradas = filtradas.filter(t => t.status === 'available')
  }
  return filtradas
})

const mesasOcupadasTodas = computed(() =>
  tables.value.filter(t => t.status === 'occupied' || t.status === 'preparing')
)

const mesasConComandas = computed(() => {
  const mesasMap = new Map()
  const comandasParaMonitor = comandasActivas.value.filter(c => c.estado !== 'entregado')

  for (const c of comandasParaMonitor) {
    if (!mesasMap.has(c.mesaId)) {
      const mesaActual = tables.value.find(t => t.id === c.mesaId)
      mesasMap.set(c.mesaId, {
        id: c.mesaId,
        numero: c.mesaNumero,
        zona: c.zona || mesaActual?.zona || 'Sin zona',
        tieneListos: false
      })
    }
    if (c.estado === 'listo') {
      const mesa = mesasMap.get(c.mesaId)
      if (mesa) mesa.tieneListos = true
    }
  }

  return Array.from(mesasMap.values()).sort((a, b) => {
    if (a.zona === b.zona) return a.numero - b.numero
    return a.zona.localeCompare(b.zona)
  })
})

const comandasMesaSeleccionada = computed(() =>
  comandasActivas.value.filter(c =>
    c.mesaId === mesaMonitorSeleccionada.value && c.estado !== 'entregado'
  )
)

const categoriasCarta = computed(() => {
  const nombresConProductos = new Set(categorias.value)
  const configuradas = categoriasData.value
    .filter(cat => nombresConProductos.has(cat.nombre))
    .sort((a, b) =>
      (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER)
      || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    )

  const configuradasSet = new Set(configuradas.map(cat => cat.nombre))
  const sinConfigurar = categorias.value
    .filter(nombre => !configuradasSet.has(nombre))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map(nombre => ({ id: nombre, nombre, icono: '🍽️' } as Categoria))

  return [...configuradas, ...sinConfigurar]
})

const productosFiltrados = computed(() =>
  productos.value.filter((p: any) => p.category === categoriaSeleccionada.value)
)

const mesaActual = computed(() =>
  tables.value.find(t => t.id === mesaSeleccionadaId.value)
)

const abrirCartaPedido = () => {
  if (!mesaSeleccionada.value) return
  if (!categoriaSeleccionada.value && categoriasCarta.value.length > 0) {
    categoriaSeleccionada.value = categoriasCarta.value[0].nombre
  }
  mostrarModalCarta.value = true
}

const cerrarCartaPedido = () => {
  mostrarModalCarta.value = false
}

// â”€â”€ ACCIONES â”€â”€

const openTable = (table: any) => {
  inicializarAudio()
  if (mesaSeleccionada.value === table.nr) {
    mesaSeleccionada.value = null
    mesaSeleccionadaId.value = null
    mostrarModalCarta.value = false
    cartStore.clear()
  } else {
    mesaSeleccionada.value = table.nr
    mesaSeleccionadaId.value = table.id
    cartStore.setTable(table.nr)
  }
}

const actualizarPosicionMesa = (id: string, x: number, y: number) => {
  const tableIndex = tables.value.findIndex(t => t.id === id)
  if (tableIndex !== -1) {
    tables.value[tableIndex].x = x
    tables.value[tableIndex].y = y
  }
}

const marcarComoEntregada = async (comandaId: string, mesaId: string) => {
  if (!localId.value) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/comandas`, comandaId), {
      estado: 'entregado'
    })
    const quedanPendientes = comandasActivas.value.some(
      c => c.mesaId === mesaId && c.id !== comandaId &&
        c.estado !== 'entregado' && c.estado !== 'listo'
    )
    if (!quedanPendientes) {
      await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaId), { estado: 'ocupada' })
    }
    notificaciones.value = notificaciones.value.filter(n => n.comandaId !== comandaId)
  } catch (error) {
    console.error('Error al entregar comanda:', error)
  }
}

const abrirModalFactura = () => {
  mesaIdTicket.value = mesaSeleccionadaId.value || null
  metodoPago.value = 'efectivo'
  mostrarModalTicket.value = true
}

const guardarCopiaYFinalizar = async () => {
  if (!mesaIdTicket.value || !localId.value || !currentUser.value) return
  const mesaALiberar = tables.value.find(t => t.id === mesaIdTicket.value)
  if (!mesaALiberar) return alert('Seleccione una mesa válida.')
  const consumoTotal = cuentaFinalMesa.value

  try {
    const usuarioDoc = await getDoc(doc(db, 'usuarios', currentUser.value.uid))
    const usuarioNombre = usuarioDoc.exists() ? usuarioDoc.data().nombre : currentUser.value.email

    await addDoc(collection(db, `locales/${localId.value}/facturas`), {
      mesaId: mesaIdTicket.value,
      mesaNumero: mesaALiberar.nr,
      zona: mesaALiberar.zona || 'Sin zona',
      usuarioId: currentUser.value.uid,
      usuarioNombre,
      usuarioEmail: currentUser.value.email,
      metodoPago: metodoPago.value,
      total: consumoTotal.total,
      items: consumoTotal.items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio: i.precio,
        subtotal: i.precio * i.cantidad
      })),
      fecha: Timestamp.now(),
      fechaDia: new Date().toISOString().split('T')[0]
    })

    const comandasDeLaMesa = comandasActivas.value.filter(c => c.mesaId === mesaIdTicket.value)
    for (const c of comandasDeLaMesa) {
      await updateDoc(doc(db, `locales/${localId.value}/comandas`, c.id), { estado: 'pagado' })
    }

    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaALiberar.id), { estado: 'libre' })

    if (mesaSeleccionadaId.value === mesaIdTicket.value) {
      cartStore.clear()
      mesaSeleccionada.value = null
      mesaSeleccionadaId.value = null
    }

    mesaIdTicket.value = null
    mostrarModalTicket.value = false
    alert('Cobro registrado y mesa liberada.')
  } catch (error) {
    console.error('Error al cobrar:', error)
    alert('Error al procesar el cobro.')
  }
}

const enviarPedido = async () => {
  if (cartStore.items.length === 0) return alert('El pedido está vacío')
  if (!mesaSeleccionadaId.value || !currentUser.value || !localId.value) return

  isEnviando.value = true
  const mesaObj = tables.value.find(t => t.id === mesaSeleccionadaId.value)

  try {
    const usuarioDoc = await getDoc(doc(db, 'usuarios', currentUser.value.uid))
    const usuarioNombre = usuarioDoc.exists() ? usuarioDoc.data().nombre : currentUser.value.email

    await addDoc(collection(db, `locales/${localId.value}/comandas`), {
      mesaId: mesaSeleccionadaId.value,
      mesaNumero: mesaSeleccionada.value,
      zona: mesaObj?.zona || 'Sin zona',
      usuarioId: currentUser.value.uid,
      usuarioNombre,
      usuarioEmail: currentUser.value.email,
      fechaHora: Timestamp.now(),
      fechaDia: new Date().toISOString().split('T')[0],
      estado: 'en_cocina',
      importeTotal: cartStore.totalPrice,
      lineas: cartStore.items.map(item => ({
        productoId: item.id,
        nombre: item.name,
        precio: item.price,
        cantidad: item.quantity,
        notas: item.notes ?? ''
      }))
    })

    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaSeleccionadaId.value), {
      estado: 'preparando'
    })

    cartStore.clear()
    mostrarModalCarta.value = false
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
  <div class="pos-master-layout" @click="inicializarAudio">

    <!-- â”€â”€ BANNER NOTIFICACIONES â”€â”€ -->
    <transition name="banner-slide">
      <div v-if="notificaciones.length > 0" class="notificaciones-banner">
        <div class="banner-content">
          <span class="banner-icon">ðŸ””</span>
          <div class="banner-lista">
            <div v-for="notif in notificaciones" :key="notif.id" class="banner-item">
              <span class="banner-texto">{{ notif.texto }}</span>
              <button class="btn-banner-entregar" @click="descartarNotificacion(notif)">âœ“ Servido</button>
            </div>
          </div>
          <button v-if="notificaciones.length > 1" class="btn-banner-all" @click="descartarTodasNotificaciones">
            Descartar todas
          </button>
        </div>
      </div>
    </transition>

    <div class="pos-inner-layout">

      <!-- â”€â”€ SIDEBAR â”€â”€ -->
      <aside class="pos-sidebar-container">
        <PosSidebar
          :user-email="currentUser?.email ?? undefined"
          :local-id="localId ?? undefined"
          :tables="tables"
          :filtro-activo="filtroActivo"
          :zonas="zonas"
          :zona-activa="zonaActiva"
          :comandas-listas-count="comandasListasCount"
          @logout="logout"
          @cambiar-filtro="(f) => filtroActivo = f"
          @cambiar-zona="(z) => zonaActiva = z"
          @abrir-modal-monitor="mostrarModalMonitor = true"
          @abrir-modal-factura="abrirModalFactura"
        />
      </aside>

      <!-- â”€â”€ CENTRO â”€â”€ -->
      <main class="pos-center-container">
        <header class="map-header">
          <div class="header-spacer"></div>
          <div class="tabs-zone" v-if="zonas.length > 0">
            <button
              v-for="z in zonas"
              :key="z.id"
              :class="{ active: zonaActiva === z.nombre }"
              :style="zonaActiva === z.nombre ? { background: negocio.colorAcento || '#4f46e5', color: 'white' } : {}"
              @click="zonaActiva = z.nombre"
            >
              {{ z.icono }} {{ z.nombre }}
            </button>
          </div>
          <div v-else class="tabs-zone">
            <span style="color: #64748b; font-size: 0.85rem; font-weight: 500;">Buscando secciones...</span>
          </div>
        </header>

        <div class="map-area">
          <PosFloorMap
            :zona="zonaActiva.toLowerCase()"
            :tables="mesasFiltradas"
            :mesa-seleccionada="mesaSeleccionada"
            :local-id="localId ?? undefined"
            :zona-id="zonas.find(z => z.nombre === zonaActiva)?.id ?? undefined"
            @select-table="openTable"
            @update-position="actualizarPosicionMesa"
            @cobrar-mesa="abrirCobroRapido"
            @comenzar-pedido="abrirCartaPedido"
          />
        </div>
      </main>

      <!-- â”€â”€ PANEL PEDIDO â”€â”€ -->
      <aside class="pos-order-container">
        <PosOrderPanel
          :mesa-seleccionada="mesaSeleccionada"
          :is-enviando="isEnviando"
          @enviar="enviarPedido"
        />
      </aside>
    </div>

    <!-- â”€â”€ MODAL TOMAR NOTA â”€â”€ -->
    <transition name="fade">
      <div v-if="mostrarModalCarta" class="modal-backdrop carta-backdrop" @click.self="cerrarCartaPedido">
        <div class="tomar-nota-modal">
          <header class="tomar-nota-header">
            <div>
              <span class="tomar-nota-kicker">Tomar nota</span>
              <h2>Mesa {{ mesaSeleccionada }}</h2>
              <p>{{ mesaActual?.zona || 'Sin zona' }} · {{ cartStore.totalItems }} producto{{ cartStore.totalItems !== 1 ? 's' : '' }}</p>
            </div>
            <button class="btn-close-carta" @click="cerrarCartaPedido">Cerrar</button>
          </header>

          <div class="tomar-nota-body">
            <section class="carta-menu-section">
              <nav class="carta-category-rail">
                <button
                  v-for="cat in categoriasCarta"
                  :key="cat.id"
                  class="carta-category-btn"
                  :class="{ active: categoriaSeleccionada === cat.nombre }"
                  :style="categoriaSeleccionada === cat.nombre ? { borderColor: negocio.colorAcento || '#4f46e5', color: negocio.colorAcento || '#4f46e5' } : {}"
                  @click="categoriaSeleccionada = cat.nombre"
                >
                  <span class="carta-category-media">
                    <img v-if="cat.imageUrl" :src="cat.imageUrl" :alt="cat.nombre">
                    <span v-else>{{ cat.icono || '🍽️' }}</span>
                  </span>
                  <span>{{ cat.nombre }}</span>
                </button>
              </nav>

              <div class="carta-products-area">
                <div class="carta-section-title">
                  <div>
                    <h3>{{ categoriaSeleccionada || 'Carta' }}</h3>
                    <p>{{ productosFiltrados.length }} plato{{ productosFiltrados.length !== 1 ? 's' : '' }} disponibles</p>
                  </div>
                </div>

                <div v-if="productosFiltrados.length === 0" class="carta-empty">
                  No hay productos en esta categoría.
                </div>

                <div v-else class="carta-products-grid">
                  <button
                    v-for="p in productosFiltrados"
                    :key="p.id"
                    class="carta-product-card"
                    @click="cartStore.addToCart(p)"
                  >
                    <span class="carta-product-media">
                      <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.name">
                      <span v-else>{{ p.icon || '🍽️' }}</span>
                    </span>
                    <span class="carta-product-info">
                      <strong>{{ p.name }}</strong>
                      <small>{{ p.category }}</small>
                    </span>
                    <span class="carta-product-price" :style="{ color: negocio.colorAcento || '#4f46e5' }">
                      {{ Number(p.price).toFixed(2) }}€
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <aside class="carta-order-summary">
              <div class="summary-header">
                <h3>Pedido</h3>
                <span>{{ cartStore.totalItems }} uds.</span>
              </div>

              <div v-if="cartStore.items.length === 0" class="summary-empty">
                Selecciona platos de la carta para comenzar la comanda.
              </div>

              <div v-else class="summary-items">
                <div v-for="item in cartStore.items" :key="item.id" class="summary-item">
                  <span class="summary-qty">{{ item.quantity }}</span>
                  <div>
                    <strong>{{ item.name }}</strong>
                    <small>{{ (item.price * item.quantity).toFixed(2) }}€</small>
                  </div>
                  <button @click="cartStore.removeFromCart(item.id)">✕</button>
                </div>
              </div>

              <div class="summary-footer">
                <div class="summary-total">
                  <span>Total</span>
                  <strong>{{ cartStore.totalPrice.toFixed(2) }}€</strong>
                </div>
                <button
                  class="btn-enviar-modal"
                  :style="{ background: negocio.colorAcento || '#4f46e5' }"
                  :disabled="cartStore.items.length === 0 || isEnviando"
                  @click="enviarPedido"
                >
                  {{ isEnviando ? 'Enviando...' : 'Enviar a cocina' }}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </transition>

    <!-- â”€â”€ MODAL TICKET â”€â”€ -->
    <transition name="fade">
      <div v-if="mostrarModalTicket" class="modal-backdrop" @click.self="mostrarModalTicket = false">
        <div class="ticket-modal">
          <div class="ticket-paper">
            <h2 class="ticket-title">{{ negocio.nombreNegocio || 'EasyOrder' }}</h2>
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
            <div class="metodo-pago-group">
              <label class="metodo-label">MÉTODO DE PAGO:</label>
              <div class="metodo-btns">
                <button
                  class="btn-metodo"
                  :class="{ active: metodoPago === 'efectivo' }"
                  :style="metodoPago === 'efectivo' ? { borderColor: negocio.colorAcento, background: `${negocio.colorAcento}15`, color: negocio.colorAcento } : {}"
                  @click="metodoPago = 'efectivo'"
                >💵 Efectivo</button>
                <button
                  class="btn-metodo"
                  :class="{ active: metodoPago === 'tarjeta' }"
                  :style="metodoPago === 'tarjeta' ? { borderColor: negocio.colorAcento, background: `${negocio.colorAcento}15`, color: negocio.colorAcento } : {}"
                  @click="metodoPago = 'tarjeta'"
                >💳 Tarjeta</button>
              </div>
            </div>

            <div class="ticket-divider"></div>

            <div v-if="cuentaFinalMesa.items.length > 0" class="ticket-items">
              <div v-for="item in cuentaFinalMesa.items" :key="item.productoId" class="t-item">
                <span class="t-qty">{{ item.cantidad }}x</span>
                <span class="t-name">{{ item.nombre }}</span>
                <span class="t-price">{{ (item.precio * item.cantidad).toFixed(2) }}€</span>
              </div>
            </div>
            <div v-else class="ticket-empty">(La mesa no tiene consumo registrado)</div>

            <div class="ticket-divider"></div>

            <div class="ticket-total">
              <span>TOTAL</span>
              <span>{{ cuentaFinalMesa.total.toFixed(2) }}€</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancelar" @click="mostrarModalTicket = false">Cancelar</button>
            <button
              class="btn-cobrar"
              :style="{ background: negocio.colorAcento || '#16a34a' }"
              @click="guardarCopiaYFinalizar"
              :disabled="!mesaIdTicket"
            >
              💳 Cobrar y Liberar Mesa
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- â”€â”€ MODAL MONITOR â”€â”€ -->
    <transition name="fade">
      <div v-if="mostrarModalMonitor" class="modal-backdrop" @click.self="mostrarModalMonitor = false; mesaMonitorSeleccionada = null">
        <div class="monitor-modal">
          <div class="monitor-header">
            <h2>📺 Estado de Pedidos en Tiempo Real</h2>
            <button class="btn-cancelar" style="padding: 8px 16px; flex: none;" @click="mostrarModalMonitor = false; mesaMonitorSeleccionada = null">
              Cerrar
            </button>
          </div>
          <div class="monitor-body">
            <div class="monitor-sidebar">
              <h3 style="margin-bottom: 12px; font-size: 0.9rem; color: #64748b;">MESAS ACTIVAS</h3>
              <div v-if="mesasConComandas.length === 0" class="ticket-empty">No hay pedidos en curso</div>
              <button
                v-for="mesa in mesasConComandas"
                :key="mesa.id"
                class="monitor-table-btn"
                :class="{ active: mesaMonitorSeleccionada === mesa.id, 'tiene-listos': mesa.tieneListos }"
                :style="mesaMonitorSeleccionada === mesa.id ? { background: negocio.colorAcento || '#4f46e5', color: 'white' } : {}"
                @click="mesaMonitorSeleccionada = mesa.id"
              >
                <span>Mesa {{ mesa.numero }}</span>
                <span v-if="mesa.tieneListos" class="badge-listo">✓ LISTO</span>
                <br>
                <small style="font-weight: 500; opacity: 0.85;">{{ mesa.zona }}</small>
              </button>
            </div>
            <div class="monitor-content">
              <div v-if="!mesaMonitorSeleccionada" class="ticket-empty" style="margin-top: 40px;">
                Selecciona una mesa para ver el estado.
              </div>
              <div v-else>
                <h3 style="margin-bottom: 20px; font-size: 1.2rem; color: #0f172a;">
                  Mesa {{ mesasConComandas.find(m => m.id === mesaMonitorSeleccionada)?.numero }}
                  <span style="color: #64748b; font-weight: normal; font-size: 1rem;">
                    ({{ mesasConComandas.find(m => m.id === mesaMonitorSeleccionada)?.zona }})
                  </span>
                </h3>
                <div
                  v-for="comanda in comandasMesaSeleccionada"
                  :key="comanda.id"
                  class="comanda-card"
                  :class="{ 'comanda-lista': comanda.estado === 'listo' }"
                >
                  <div class="c-header">
                    <span class="c-time">🕐 {{ new Date(comanda.fechaHora.seconds * 1000).toLocaleTimeString() }}</span>
                    <span class="c-status" :class="comanda.estado.toLowerCase().replace(/[\s_]+/g, '-')">
                      {{ comanda.estado.replace(/_/g, ' ').toUpperCase() }}
                    </span>
                  </div>
                  <ul class="c-lines">
                    <li v-for="linea in comanda.lineas" :key="linea.productoId">
                      <strong>{{ linea.cantidad }}x</strong> {{ linea.nombre }}
                    </li>
                  </ul>
                  <div class="c-actions" v-if="comanda.estado === 'listo'">
                    <button
                      class="btn-entregar"
                      :style="{ background: negocio.colorAcento || '#16a34a' }"
                      @click="marcarComoEntregada(comanda.id, comanda.mesaId)"
                    >
                      ✓ Marcar como Servido
                    </button>
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
/* â”€â”€ LAYOUT â”€â”€ */
.pos-master-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  flex-direction: column;
}

.pos-inner-layout { display: flex; flex: 1; overflow: hidden; }

/* â”€â”€ NOTIFICACIONES â”€â”€ */
.notificaciones-banner {
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: white;
  padding: 12px 24px;
  z-index: 100;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(22,163,74,0.3);
}

.banner-content { display: flex; align-items: center; gap: 16px; max-width: 100%; }
.banner-icon { font-size: 1.4rem; flex-shrink: 0; animation: bellRing 0.5s ease-in-out; }

@keyframes bellRing {
  0%, 100% { transform: rotate(0deg); }
  25%       { transform: rotate(15deg); }
  75%       { transform: rotate(-15deg); }
}

.banner-lista { flex: 1; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.banner-item  { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.banner-texto { font-weight: 600; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.btn-banner-entregar {
  background: white;
  color: #16a34a;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-banner-all {
  background: rgba(255,255,255,0.2);
  color: white;
  border: 1px solid rgba(255,255,255,0.4);
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  flex-shrink: 0;
}

.banner-slide-enter-active, .banner-slide-leave-active { transition: all 0.3s ease; }
.banner-slide-enter-from, .banner-slide-leave-to { transform: translateY(-100%); opacity: 0; }

/* â”€â”€ CONTENEDORES â”€â”€ */
.pos-sidebar-container { width: 260px; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 20; }
.pos-center-container  { flex: 1; display: flex; flex-direction: column; background: white; position: relative; }
.pos-order-container   { width: 320px; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 20; }

/* â”€â”€ MAP HEADER â”€â”€ */
.map-header {
  height: 64px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  z-index: 10;
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
  box-shadow: 0 2px 4px rgba(79,70,229,0.2);
}

.map-area { flex: 1; overflow: hidden; background: #e2e8f0; position: relative; }

/* â”€â”€ MENU OVERLAY â”€â”€ */
.menu-overlay-panel {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 45%;
  background: white;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
  border-radius: 20px 20px 0 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
}

.menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 24px;
  border-bottom: 1px solid #f1f5f9;
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
  color: #475569;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
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
  background: #f8fafc;
  flex: 1;
}

.product-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 15px 10px;
  text-align: center;
  cursor: pointer;
  transition: 0.2s;
}

.product-card:hover { transform: translateY(-3px); box-shadow: 0 8px 15px rgba(0,0,0,0.05); }
.product-media {
  width: 100%;
  height: 92px;
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.product-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-img { font-size: 2.5rem; margin-bottom: 8px; }
.price { font-weight: 800; font-size: 1rem; margin: 0; }

.carta-backdrop {
  background: rgba(15, 23, 42, 0.72);
}

.tomar-nota-modal {
  width: min(1180px, 94vw);
  height: min(760px, 90vh);
  background: #f8fafc;
  border-radius: 22px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalIn 0.25s ease-out;
}

.tomar-nota-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 26px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.tomar-nota-kicker {
  display: block;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tomar-nota-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.6rem;
  font-weight: 900;
}

.tomar-nota-header p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.88rem;
  font-weight: 600;
}

.btn-close-carta {
  border: none;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 800;
}

.tomar-nota-body {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
}

.carta-menu-section {
  min-width: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  overflow: hidden;
}

.carta-category-rail {
  background: #fff;
  border-right: 1px solid #e2e8f0;
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.carta-category-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 14px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-weight: 800;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s;
}

.carta-category-btn.active,
.carta-category-btn:hover {
  background: white;
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
}

.carta-category-media {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1.35rem;
}

.carta-category-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.carta-products-area {
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
}

.carta-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.carta-section-title h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.35rem;
  font-weight: 900;
}

.carta-section-title p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.86rem;
  font-weight: 600;
}

.carta-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}

.carta-product-card {
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 16px;
  padding: 12px;
  min-height: 216px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.carta-product-card:hover {
  transform: translateY(-3px);
  border-color: #cbd5e1;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
}

.carta-product-media {
  height: 112px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 2.4rem;
}

.carta-product-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.carta-product-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.carta-product-info strong {
  color: #0f172a;
  font-size: 0.98rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.carta-product-info small {
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.carta-product-price {
  font-weight: 900;
  font-size: 1.08rem;
}

.carta-empty {
  background: white;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  color: #94a3b8;
  padding: 32px;
  text-align: center;
  font-weight: 700;
}

.carta-order-summary {
  min-width: 0;
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.summary-header {
  padding: 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.05rem;
  font-weight: 900;
}

.summary-header span {
  color: #64748b;
  font-weight: 800;
  font-size: 0.8rem;
}

.summary-empty {
  margin: auto 20px;
  color: #94a3b8;
  text-align: center;
  line-height: 1.45;
  font-weight: 600;
}

.summary-items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  background: #f8fafc;
}

.summary-qty {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f46e5;
  font-weight: 900;
}

.summary-item strong {
  display: block;
  color: #0f172a;
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-item small {
  color: #64748b;
  font-weight: 800;
}

.summary-item button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  cursor: pointer;
  font-weight: 900;
}

.summary-footer {
  padding: 20px;
  border-top: 1px solid #e2e8f0;
}

.summary-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.summary-total span {
  color: #64748b;
  font-weight: 800;
}

.summary-total strong {
  color: #0f172a;
  font-size: 1.45rem;
  font-weight: 900;
}

.btn-enviar-modal {
  width: 100%;
  border: none;
  border-radius: 12px;
  color: white;
  padding: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: filter 0.2s, transform 0.2s;
}

.btn-enviar-modal:hover:not(:disabled) {
  filter: brightness(0.94);
  transform: translateY(-1px);
}

.btn-enviar-modal:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 1100px) {
  .tomar-nota-body {
    grid-template-columns: 1fr;
  }

  .carta-order-summary {
    max-height: 260px;
    border-left: none;
    border-top: 1px solid #e2e8f0;
  }
}

@media (max-width: 780px) {
  .tomar-nota-modal {
    width: 96vw;
    height: 92vh;
  }

  .tomar-nota-header {
    align-items: flex-start;
    padding: 18px;
  }

  .carta-menu-section {
    grid-template-columns: 1fr;
  }

  .carta-category-rail {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
    padding: 12px;
  }

  .carta-category-btn {
    min-width: 150px;
  }

  .carta-products-area {
    padding: 16px;
  }
}

.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }

/* â”€â”€ TICKET â”€â”€ */
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.ticket-paper {
  background: white;
  width: 340px;
  padding: 30px 24px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  position: relative;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}

.ticket-paper::after {
  content: "";
  position: absolute;
  bottom: -6px; left: 0; right: 0;
  height: 6px;
  background-image: radial-gradient(circle at 6px 0, transparent 6px, white 6px);
  background-size: 12px 12px;
  background-repeat: repeat-x;
}

.ticket-title    { text-align: center; font-weight: 900; margin: 0; }
.ticket-subtitle { text-align: center; font-size: 0.9rem; margin: 5px 0 20px; color: #666; }
.ticket-divider  { border-top: 1px dashed #ccc; margin: 15px 0; }
.ticket-total    { display: flex; justify-content: space-between; font-size: 1.3rem; font-weight: 900; color: #000; }

.metodo-btns { display: flex; gap: 10px; }

.btn-metodo {
  flex: 1;
  padding: 10px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.modal-actions { display: flex; gap: 10px; width: 340px; margin-top: 20px; }
.btn-cancelar, .btn-cobrar { flex: 1; padding: 14px; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
.btn-cancelar { background: #f1f5f9; color: #64748b; }
.btn-cobrar   { background: #16a34a; color: white; transition: background 0.3s; }

.ticket-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.t-item { display: flex; justify-content: space-between; align-items: flex-start; font-size: 0.95rem; }
.t-qty  { width: 35px; font-weight: bold; flex-shrink: 0; }
.t-name { flex: 1; padding-right: 15px; word-break: break-word; }
.t-price{ font-weight: bold; flex-shrink: 0; text-align: right; }
.ticket-empty { color: #94a3b8; font-size: 0.85rem; text-align: center; padding: 10px 0; }

/* â”€â”€ MONITOR â”€â”€ */
.monitor-modal {
  background: white;
  width: 800px;
  max-width: 95vw;
  height: 600px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalIn 0.3s ease-out;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.monitor-header h2 { font-size: 1.1rem; font-weight: 800; color: #0f172a; margin: 0; }

.monitor-body { display: flex; flex: 1; overflow: hidden; }

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
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.monitor-table-btn.tiene-listos { border-color: #16a34a; background: #f0fdf4; color: #15803d; }

.badge-listo {
  background: #16a34a;
  color: white;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 6px;
}

.monitor-content { flex: 1; padding: 24px; overflow-y: auto; }

.comanda-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  background: #f8fafc;
}

.comanda-lista { border-color: #16a34a; background: #f0fdf4; }

.c-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dashed #cbd5e1;
  margin-bottom: 12px;
  padding-bottom: 12px;
}

.c-status { font-size: 0.8rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; }
.c-status.en-cocina { background: #fef3c7; color: #b45309; }
.c-status.listo     { background: #dcfce7; color: #16a34a; }

.c-lines { padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.c-lines li { font-size: 0.9rem; color: #475569; }

.c-actions { margin-top: 12px; }

.btn-entregar {
  background: #16a34a;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s;
}

.btn-entregar:hover { filter: brightness(0.9); }

@keyframes modalIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

