<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  collection, addDoc, onSnapshot,
  query, orderBy, where, deleteDoc, doc, updateDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'
import EmojiPicker from 'vue3-emoji-picker'
import FloorEditor from '../components/pos/FloorEditor.vue'

// --- Interfaces TypeScript ---
interface Mesa {
  id: string
  numero: number
  nombre?: string
  estado: 'libre' | 'ocupada'
  capacidad: number
  zona?: string
}

interface Producto {
  id: string
  name: string
  price: number
  category: string
  icon: string
}

interface Categoria {
  id: string
  nombre: string
  icono: string
}

interface Zona {
  id: string
  nombre: string
  icono: string
}

interface Invitacion {
  id: string
  email: string
  rol: 'admin' | 'camarero' | 'cocinero'
  codigo: string
  estado: 'pendiente' | 'usada'
  localId: string
  localNombre: string
  creadoEn: any
}

interface Empleado {
  id: string
  nombre: string
  email: string
  rol: 'admin' | 'camarero' | 'cocinero'
  activo: boolean
  localId: string
}

interface Factura {
  id: string
  mesaNumero: number
  zona: string
  usuarioNombre: string
  metodoPago: 'efectivo' | 'tarjeta'
  total: number
  fechaDia: string
  fecha: any
  items: any[]
}

const { logout, localId } = useAuth()

const currentTab = ref('finanzas')
const mesas = ref<Mesa[]>([])
const productos = ref<Producto[]>([])
const categorias = ref<Categoria[]>([])
const zonas = ref<Zona[]>([])
const invitaciones = ref<Invitacion[]>([])
const empleados = ref<Empleado[]>([])
const facturas = ref<Factura[]>([])

const cantidadMesas = ref(10)
const isLoading = ref(false)
const isCreandoInvitacion = ref(false)

// ── FILTROS ──
const filtroRol = ref('todos')
const filtroFecha = ref(new Date().toISOString().split('T')[0])
const finanzasSubTab = ref('tickets')
const filtroFEmpleado = ref('todos')
const filtroFPago = ref('todos')

// ── MODALES ──
const mostrarSelectorCategoria = ref(false)
const mostrarSelectorProducto = ref(false)
const mostrarSelectorZona = ref(false)
const mostrarModalZonas = ref(false)
const mostrarModalCategorias = ref(false)
const mostrarModalEditarFactura = ref(false)
const mostrarModalDetalleFactura = ref(false)

// ── FORMULARIOS ──
const nuevoProducto = ref({ name: '', price: 0, category: '', icon: '🍽️' })
const nuevaCategoria = ref({ nombre: '', icono: '🍽️' })
const nuevaZona = ref({ nombre: '', icono: '🛋️' })
const nuevaInvitacion = ref({ email: '', rol: 'camarero' as 'admin' | 'camarero' | 'cocinero' })
const facturaEditando = ref<Partial<Factura>>({})
const facturaSeleccionada = ref<Factura | null>(null)
const nuevoItemSeleccionado = ref('')

// ── MAPA ──
const mesaSeleccionada = ref<number | null>(null)
const zonaActiva = ref('')

// Posiciones guardadas en localStorage para el FloorEditor
const posicionesMesas = ref<Record<string, { x: number, y: number }>>({})

// ── LISTENERS ──
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null
let unsubscribeZonas: (() => void) | null = null
let unsubscribeInvitaciones: (() => void) | null = null
let unsubscribeEmpleados: (() => void) | null = null
let unsubscribeFacturas: (() => void) | null = null

// ── COMPUTED: FINANZAS ──
const totalVentas = computed(() => facturas.value.reduce((acc, f) => acc + f.total, 0))
const totalEfectivo = computed(() => facturas.value.filter(f => f.metodoPago === 'efectivo').reduce((acc, f) => acc + f.total, 0))
const totalTarjeta = computed(() => facturas.value.filter(f => f.metodoPago === 'tarjeta').reduce((acc, f) => acc + f.total, 0))
const numeroPedidos = computed(() => facturas.value.length)
const ticketMedio = computed(() => numeroPedidos.value > 0 ? (totalVentas.value / numeroPedidos.value) : 0)

const ventasPorEmpleado = computed(() => {
  const mapa = new Map<string, { nombre: string, total: number, pedidos: number }>()
  facturas.value.forEach(f => {
    const emp = mapa.get(f.usuarioNombre)
    if (emp) { emp.total += f.total; emp.pedidos += 1 }
    else { mapa.set(f.usuarioNombre, { nombre: f.usuarioNombre, total: f.total, pedidos: 1 }) }
  })
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
})

const facturasFiltradas = computed(() => {
  return facturas.value.filter(f => {
    const matchEmp = filtroFEmpleado.value === 'todos' || f.usuarioNombre === filtroFEmpleado.value
    const matchPago = filtroFPago.value === 'todos' || f.metodoPago === filtroFPago.value
    return matchEmp && matchPago
  })
})

const empleadosConVentasDia = computed(() =>
  Array.from(new Set(facturas.value.map(f => f.usuarioNombre))).sort()
)

// ── COMPUTED: MESAS PARA EL EDITOR ──
const mesasFiltradasPorZona = computed(() =>
  mesas.value.filter(m => m.zona === zonaActiva.value || (!m.zona && zonas.value.length === 0))
)

const mesasParaMapa = computed(() =>
  mesasFiltradasPorZona.value.map(m => ({
    id: m.id,
    nr: m.numero,
    status: m.estado === 'libre' ? 'available' : m.estado === 'ocupada' ? 'occupied' : 'preparing',
    capacity: m.capacidad,
    x: posicionesMesas.value[m.id]?.x,
    y: posicionesMesas.value[m.id]?.y
  }))
)

// ── COMPUTED: MENÚ ──
const productosPorCategoria = computed(() => {
  const grupos: Record<string, Producto[]> = {}
  for (const cat of categorias.value) {
    grupos[cat.nombre] = productos.value.filter(p => p.category === cat.nombre)
  }
  const sinCategoria = productos.value.filter(
    p => !categorias.value.some(c => c.nombre === p.category)
  )
  if (sinCategoria.length > 0) grupos['Sin categoría'] = sinCategoria
  return grupos
})

// ── CARGA DE DATOS ──
const cargarFacturas = (fecha: string) => {
  if (!localId.value) return
  if (unsubscribeFacturas) unsubscribeFacturas()
  const qFacturas = query(
    collection(db, `locales/${localId.value}/facturas`),
    where('fechaDia', '==', fecha),
    orderBy('fecha', 'desc')
  )
  unsubscribeFacturas = onSnapshot(qFacturas, (snapshot) => {
    facturas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Factura[]
  })
}

watch(filtroFecha, (newFecha) => cargarFacturas(newFecha))

onMounted(() => {
  if (!localId.value) return

  posicionesMesas.value = JSON.parse(
    localStorage.getItem(`posicionesMesas_${localId.value}`) || '{}'
  )

  cargarFacturas(filtroFecha.value)

  unsubscribeMesas = onSnapshot(
    query(collection(db, `locales/${localId.value}/mesas`), orderBy('numero')),
    s => { mesas.value = s.docs.map(d => ({ id: d.id, ...d.data() })) as Mesa[] }
  )

  unsubscribeProductos = onSnapshot(
    query(collection(db, `locales/${localId.value}/productos`), orderBy('category')),
    s => { productos.value = s.docs.map(d => ({ id: d.id, ...d.data() })) as Producto[] }
  )

  unsubscribeCategorias = onSnapshot(
    query(collection(db, `locales/${localId.value}/categorias`), orderBy('nombre')),
    s => {
      categorias.value = s.docs.map(d => ({ id: d.id, ...d.data() })) as Categoria[]
      if (!nuevoProducto.value.category && categorias.value.length > 0) {
        nuevoProducto.value.category = categorias.value[0].nombre
      }
    }
  )

  unsubscribeZonas = onSnapshot(
    query(collection(db, `locales/${localId.value}/zonas`), orderBy('nombre')),
    s => {
      zonas.value = s.docs.map(d => ({ id: d.id, ...d.data() })) as Zona[]
      if (!zonaActiva.value && zonas.value.length > 0) {
        zonaActiva.value = zonas.value[0].nombre
      }
    }
  )

  unsubscribeInvitaciones = onSnapshot(
    query(collection(db, 'invitaciones'), where('localId', '==', localId.value), orderBy('creadoEn', 'desc')),
    s => { invitaciones.value = s.docs.map(d => ({ id: d.id, ...d.data() })) as Invitacion[] }
  )

  unsubscribeEmpleados = onSnapshot(
    collection(db, 'usuarios'),
    s => {
      empleados.value = s.docs
        .map(d => ({ id: d.id, ...d.data() } as Empleado))
        .filter(u => u.localId === localId.value)
    }
  )
})

onUnmounted(() => {
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
  unsubscribeZonas?.()
  unsubscribeInvitaciones?.()
  unsubscribeEmpleados?.()
  unsubscribeFacturas?.()
})

// ── ACCIONES: MAPA ──
const handleUpdatePosition = (id: string, x: number, y: number) => {
  posicionesMesas.value[id] = { x, y }
  localStorage.setItem(`posicionesMesas_${localId.value}`, JSON.stringify(posicionesMesas.value))
}

const handleSelectTable = (table: any) => {
  mesaSeleccionada.value = table.nr
}

// ── ACCIONES: MESAS ──
const generarMesas = async () => {
  if (!localId.value) return
  if (zonas.value.length === 0) return alert('⚠️ Crea una Zona antes de añadir mesas.')
  if (!zonaActiva.value) zonaActiva.value = zonas.value[0].nombre
  isLoading.value = true
  try {
    const mesasEnZona = mesas.value.filter(m => m.zona === zonaActiva.value)
    const ultimaNumero = mesasEnZona.length > 0
      ? Math.max(...mesasEnZona.map(m => m.numero)) : 0
    for (let i = 1; i <= cantidadMesas.value; i++) {
      await addDoc(collection(db, `locales/${localId.value}/mesas`), {
        numero: ultimaNumero + i,
        estado: 'libre',
        capacidad: 4,
        zona: zonaActiva.value
      })
    }
  } catch { alert('Error al generar mesas.') }
  finally { isLoading.value = false }
}

const resetearMesas = async () => {
  if (!localId.value || !confirm('¿Borrar TODAS las mesas? Esta acción no se puede deshacer.')) return
  try {
    await Promise.all(mesas.value.map(m => deleteDoc(doc(db, `locales/${localId.value}/mesas`, m.id))))
  } catch { alert('Error al borrar las mesas.') }
}

// ── ACCIONES: ZONAS ──
const guardarZona = async () => {
  if (!localId.value || !nuevaZona.value.nombre.trim()) return alert('El nombre es obligatorio.')
  const yaExiste = zonas.value.some(z => z.nombre.toLowerCase() === nuevaZona.value.nombre.toLowerCase())
  if (yaExiste) return alert('Esa zona ya existe.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/zonas`), { ...nuevaZona.value })
    nuevaZona.value = { nombre: '', icono: '🛋️' }
  } catch { alert('Error al crear la zona.') }
}

const eliminarZona = async (id: string, nombre: string) => {
  if (!localId.value) return
  const afectadas = mesas.value.filter(m => m.zona === nombre).length
  const msg = afectadas > 0
    ? `¿Eliminar "${nombre}"? Hay ${afectadas} mesas que perderán su zona.`
    : `¿Eliminar la zona "${nombre}"?`
  if (!confirm(msg)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/zonas`, id))
    if (zonaActiva.value === nombre) zonaActiva.value = zonas.value.find(z => z.id !== id)?.nombre || ''
  } catch { alert('Error al eliminar la zona.') }
}

// ── ACCIONES: CATEGORÍAS ──
const guardarCategoria = async () => {
  if (!localId.value || !nuevaCategoria.value.nombre.trim()) return alert('El nombre es obligatorio.')
  const yaExiste = categorias.value.some(c => c.nombre.toLowerCase() === nuevaCategoria.value.nombre.toLowerCase())
  if (yaExiste) return alert('Esa categoría ya existe.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/categorias`), { ...nuevaCategoria.value })
    nuevaCategoria.value = { nombre: '', icono: '🍽️' }
  } catch { alert('Error al crear la categoría.') }
}

const eliminarCategoria = async (id: string, nombre: string) => {
  if (!localId.value) return
  const afectados = productos.value.filter(p => p.category === nombre).length
  const msg = afectados > 0
    ? `¿Eliminar "${nombre}"? ${afectados} productos quedarán sin categoría.`
    : `¿Eliminar la categoría "${nombre}"?`
  if (!confirm(msg)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/categorias`, id))
  } catch { alert('Error al eliminar.') }
}

// ── ACCIONES: PRODUCTOS ──
const guardarProducto = async () => {
  if (!localId.value) return
  if (!nuevoProducto.value.name.trim()) return alert('El nombre es obligatorio.')
  if (nuevoProducto.value.price <= 0) return alert('El precio debe ser mayor que 0.')
  if (!nuevoProducto.value.category) return alert('Selecciona una categoría.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/productos`), { ...nuevoProducto.value })
    nuevoProducto.value = { name: '', price: 0, category: categorias.value[0]?.nombre ?? '', icon: '🍽️' }
  } catch { alert('Error al guardar el producto.') }
}

const eliminarProducto = async (id: string, nombre: string) => {
  if (!localId.value || !confirm(`¿Eliminar "${nombre}"?`)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/productos`, id))
  } catch { alert('Error al eliminar.') }
}

// ── ACCIONES: INVITACIONES ──
const generarCodigo = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const crearInvitacion = async () => {
  if (!localId.value || !nuevaInvitacion.value.email.trim()) return alert('El email es obligatorio.')
  isCreandoInvitacion.value = true
  try {
    await addDoc(collection(db, 'invitaciones'), {
      email: nuevaInvitacion.value.email.trim().toLowerCase(),
      rol: nuevaInvitacion.value.rol,
      codigo: generarCodigo(),
      estado: 'pendiente',
      localId: localId.value,
      localNombre: localId.value,
      creadoEn: new Date()
    })
    nuevaInvitacion.value = { email: '', rol: 'camarero' }
  } catch { alert('Error al crear la invitación.') }
  finally { isCreandoInvitacion.value = false }
}

const eliminarInvitacion = async (id: string) => {
  if (!confirm('¿Eliminar esta invitación?')) return
  try { await deleteDoc(doc(db, 'invitaciones', id)) }
  catch { alert('Error al eliminar.') }
}

const limpiarInvitacionesUsadas = async () => {
  const usadas = invitaciones.value.filter(i => i.estado === 'usada')
  if (usadas.length === 0) return alert('No hay códigos usados que limpiar.')
  if (!confirm(`¿Borrar ${usadas.length} códigos ya utilizados?`)) return
  try {
    await Promise.all(usadas.map(inv => deleteDoc(doc(db, 'invitaciones', inv.id))))
  } catch { alert('Error al limpiar.') }
}

// ── ACCIONES: EMPLEADOS ──
const toggleEstadoEmpleado = async (id: string, estadoActual: boolean) => {
  try {
    await updateDoc(doc(db, 'usuarios', id), { activo: !estadoActual })
  } catch { alert('Error al actualizar el estado.') }
}

const eliminarEmpleado = async (id: string, nombre: string) => {
  if (!confirm(`¿Eliminar a "${nombre}"? Perderá el acceso inmediatamente.`)) return
  try { await deleteDoc(doc(db, 'usuarios', id)) }
  catch { alert('Error al eliminar.') }
}

// ── ACCIONES: FINANZAS ──
const abrirDetalleFactura = (factura: Factura) => {
  facturaSeleccionada.value = factura
  mostrarModalDetalleFactura.value = true
}

const abrirEditarFactura = (factura: Factura) => {
  facturaEditando.value = JSON.parse(JSON.stringify(factura))
  nuevoItemSeleccionado.value = ''
  mostrarModalEditarFactura.value = true
}

const recalcularTotalFactura = () => {
  if (!facturaEditando.value.items) return
  let total = 0
  facturaEditando.value.items.forEach((item: any) => {
    item.subtotal = item.cantidad * item.precio
    total += item.subtotal
  })
  facturaEditando.value.total = parseFloat(total.toFixed(2))
}

const quitarItemTicket = (index: number) => {
  facturaEditando.value.items?.splice(index, 1)
  recalcularTotalFactura()
}

const agregarItemTicket = () => {
  if (!nuevoItemSeleccionado.value) return
  const prod = productos.value.find(p => p.id === nuevoItemSeleccionado.value)
  if (prod && facturaEditando.value.items) {
    facturaEditando.value.items.push({
      nombre: prod.name, cantidad: 1, precio: prod.price, subtotal: prod.price
    })
    recalcularTotalFactura()
    nuevoItemSeleccionado.value = ''
  }
}

const guardarEdicionFactura = async () => {
  if (!localId.value || !facturaEditando.value.id) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/facturas`, facturaEditando.value.id), {
      total: facturaEditando.value.total,
      metodoPago: facturaEditando.value.metodoPago,
      items: facturaEditando.value.items
    })
    mostrarModalEditarFactura.value = false
  } catch { alert('Error al actualizar el ticket.') }
}

const eliminarFactura = async (id: string) => {
  if (!confirm('¿Eliminar esta factura?')) return
  try { await deleteDoc(doc(db, `locales/${localId.value}/facturas`, id)) }
  catch { alert('Error al eliminar.') }
}

// ── EMOJI PICKER ──
const onSelectEmojiCategoria = (e: any) => { nuevaCategoria.value.icono = e.i; mostrarSelectorCategoria.value = false }
const onSelectEmojiProducto = (e: any) => { nuevoProducto.value.icon = e.i; mostrarSelectorProducto.value = false }
const onSelectEmojiZona = (e: any) => { nuevaZona.value.icono = e.i; mostrarSelectorZona.value = false }
</script>

<template>
  <div class="admin-layout">

    <!-- ── SIDEBAR ── -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h2>EasyOrder</h2>
        <span class="admin-tag">Admin</span>
      </div>
      <nav class="sidebar-nav">
        <button :class="{ active: currentTab === 'finanzas' }" @click="currentTab = 'finanzas'">💰 Finanzas</button>
        <button :class="{ active: currentTab === 'mesas' }" @click="currentTab = 'mesas'">🪑 Sala</button>
        <button :class="{ active: currentTab === 'productos' }" @click="currentTab = 'productos'">🍔 Menú</button>
        <button :class="{ active: currentTab === 'usuarios' }" @click="currentTab = 'usuarios'">👥 Empleados</button>
      </nav>
      <div class="sidebar-footer">
        <div class="local-info">🏢 {{ localId }}</div>
        <button class="btn-logout" @click="logout">⬅ Cerrar sesión</button>
      </div>
    </aside>

    <!-- ── CONTENIDO PRINCIPAL ── -->
    <main class="content">

      <!-- ══ TAB: FINANZAS ══ -->
      <div v-if="currentTab === 'finanzas'">
        <div class="page-header">
          <div>
            <h1>Cierre de Caja</h1>
            <p class="page-subtitle">Facturación del día</p>
          </div>
          <div class="controls">
            <input type="date" v-model="filtroFecha" class="input-date">
          </div>
        </div>

        <!-- KPIs -->
        <div class="kpi-grid">
          <div class="kpi-card highlight">
            <span class="kpi-title">Total Recaudado</span>
            <span class="kpi-value">{{ totalVentas.toFixed(2) }} €</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">💵 Efectivo</span>
            <span class="kpi-value">{{ totalEfectivo.toFixed(2) }} €</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">💳 Tarjeta</span>
            <span class="kpi-value">{{ totalTarjeta.toFixed(2) }} €</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">📊 Ticket Medio</span>
            <span class="kpi-value">{{ ticketMedio.toFixed(2) }} €</span>
          </div>
        </div>

        <!-- Sub-tabs finanzas -->
        <div class="tabs-zone-admin">
          <button :class="{ active: finanzasSubTab === 'tickets' }" @click="finanzasSubTab = 'tickets'">
            🧾 Registro de Tickets
          </button>
          <button :class="{ active: finanzasSubTab === 'rendimiento' }" @click="finanzasSubTab = 'rendimiento'">
            👥 Rendimiento Empleados
          </button>
        </div>

        <!-- Tickets -->
        <div v-if="finanzasSubTab === 'tickets'" class="card-container">
          <div class="finanzas-filtros">
            <div class="form-group-inline">
              <label>Camarero:</label>
              <select v-model="filtroFEmpleado" class="input-select">
                <option value="todos">Todos</option>
                <option v-for="e in empleadosConVentasDia" :key="e" :value="e">{{ e }}</option>
              </select>
            </div>
            <div class="form-group-inline">
              <label>Pago:</label>
              <select v-model="filtroFPago" class="input-select">
                <option value="todos">Todos</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
          </div>

          <div v-if="facturasFiltradas.length === 0" class="empty-state-box">
            No hay tickets registrados para este día.
          </div>

          <div class="tickets-grid">
            <div
              v-for="f in facturasFiltradas"
              :key="f.id"
              class="factura-card"
              @click="abrirDetalleFactura(f)"
            >
              <div class="f-header">
                <span class="f-mesa">Mesa {{ f.mesaNumero }} <small>({{ f.zona }})</small></span>
                <span class="f-metodo" :class="f.metodoPago">{{ f.metodoPago }}</span>
              </div>
              <div class="f-body">
                <span class="f-empleado">{{ f.usuarioNombre }}</span>
                <span class="f-hora">
                  {{ f.fecha ? new Date(f.fecha.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--' }}
                </span>
              </div>
              <div class="f-footer">
                <span class="f-total">{{ f.total.toFixed(2) }} €</span>
                <div class="ticket-actions">
                  <button class="btn-icon btn-edit" @click.stop="abrirEditarFactura(f)" title="Editar">✏️</button>
                  <button class="btn-icon btn-del"  @click.stop="eliminarFactura(f.id)"  title="Eliminar">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Rendimiento empleados -->
        <div v-if="finanzasSubTab === 'rendimiento'" class="card-container">
          <div v-if="ventasPorEmpleado.length === 0" class="empty-state-box">
            No hay datos de ventas para este día.
          </div>
          <div v-else class="rendimiento-lista">
            <div v-for="(emp, i) in ventasPorEmpleado" :key="emp.nombre" class="rendimiento-row">
              <div class="rank-badge">{{ i + 1 }}</div>
              <div class="empleado-info">
                <span class="empleado-nombre">{{ emp.nombre }}</span>
                <span class="empleado-pedidos">{{ emp.pedidos }} pedido{{ emp.pedidos !== 1 ? 's' : '' }}</span>
              </div>
              <div class="barra-progreso-wrapper">
                <div
                  class="barra-progreso"
                  :style="{ width: `${(emp.total / totalVentas) * 100}%` }"
                ></div>
              </div>
              <span class="rendimiento-total">{{ emp.total.toFixed(2) }} €</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: SALA / MESAS ══ -->
      <div v-if="currentTab === 'mesas'">
        <div class="page-header">
          <div>
            <h1>Gestión de Sala</h1>
            <p class="page-subtitle">{{ mesas.length }} mesas · Diseña la distribución de tu local</p>
          </div>
          <div class="controls">
            <input type="number" v-model="cantidadMesas" min="1" max="50" class="input-num">
            <button @click="generarMesas" class="btn-primary" :disabled="isLoading">
              {{ isLoading ? 'Añadiendo...' : '+ Añadir Mesas' }}
            </button>
            <button @click="resetearMesas" class="btn-danger">Borrar Todo</button>
          </div>
        </div>

        <div class="tabs-zone-admin">
          <button
            v-for="z in zonas"
            :key="z.id"
            :class="{ active: zonaActiva === z.nombre }"
            @click="zonaActiva = z.nombre; mesaSeleccionada = null"
          >
            {{ z.icono }} {{ z.nombre }}
          </button>
          <button class="btn-gestionar-zonas" @click="mostrarModalZonas = true">
            ⚙️ Gestionar Zonas
          </button>
        </div>

        <FloorEditor
          v-if="zonas.length > 0 && localId"
          :local-id="localId"
          :zona-id="zonas.find(z => z.nombre === zonaActiva)?.id ?? ''"
          :zona-nombre="zonaActiva"
          :mesas="mesasParaMapa"
          :mesa-seleccionada="mesaSeleccionada"
          @select-table="handleSelectTable"
          @update-mesa-position="handleUpdatePosition"
        />

        <div v-else class="empty-state-box" style="margin-top: 24px;">
          ⚠️ Crea al menos una zona en "Gestionar Zonas" para diseñar el local.
        </div>
      </div>

      <!-- ══ TAB: MENÚ ══ -->
      <div v-if="currentTab === 'productos'">
        <div class="page-header">
          <div>
            <h1>Gestión del Menú</h1>
            <p class="page-subtitle">{{ productos.length }} productos en la carta</p>
          </div>
          <div class="controls">
            <button class="btn-gestionar-zonas" @click="mostrarModalCategorias = true">
              ⚙️ Gestionar Categorías
            </button>
          </div>
        </div>

        <div class="dos-columnas">
          <!-- Formulario nuevo producto -->
          <div class="form-card">
            <h3 class="form-card-title">Nuevo plato</h3>
            <div v-if="categorias.length === 0" class="empty-state-box">
              ⚠️ Crea primero una categoría en "Gestionar Categorías".
            </div>
            <div v-else class="form-fields">
              <div class="field-group">
                <label>Nombre del plato</label>
                <input v-model="nuevoProducto.name" placeholder="Ej: Burger Clásica">
              </div>
              <div class="field-group">
                <label>Precio (€)</label>
                <input type="number" v-model="nuevoProducto.price" step="0.01" min="0">
              </div>
              <div class="field-group">
                <label>Categoría</label>
                <select v-model="nuevoProducto.category">
                  <option v-for="cat in categorias" :key="cat.id" :value="cat.nombre">
                    {{ cat.icono }} {{ cat.nombre }}
                  </option>
                </select>
              </div>
              <div class="field-group">
                <label>Icono</label>
                <div class="emoji-selector-container">
                  <button type="button" class="btn-emoji" @click="mostrarSelectorProducto = !mostrarSelectorProducto">
                    <span class="emoji-preview">{{ nuevoProducto.icon }}</span>
                    <span>Cambiar icono</span>
                  </button>
                  <div v-if="mostrarSelectorProducto" class="picker-popup">
                    <EmojiPicker :native="true" theme="light" @select="onSelectEmojiProducto" />
                  </div>
                </div>
              </div>
              <button @click="guardarProducto" class="btn-primary btn-full">+ Guardar en el Menú</button>
            </div>
          </div>

          <!-- Carta actual agrupada -->
          <div class="lista-card">
            <h3 class="form-card-title">Carta actual</h3>
            <div v-if="productos.length === 0" class="empty-state-box">No hay productos todavía.</div>
            <div v-for="(platos, categoria) in productosPorCategoria" :key="categoria" class="categoria-grupo">
              <div class="categoria-header">
                <span class="categoria-icono">{{ categorias.find(c => c.nombre === categoria)?.icono ?? '🍽️' }}</span>
                <span class="categoria-nombre">{{ categoria }}</span>
                <span class="categoria-count">{{ platos.length }}</span>
              </div>
              <div v-for="p in platos" :key="p.id" class="item-row">
                <span class="item-icon">{{ p.icon }}</span>
                <div class="item-info">
                  <span class="item-name">{{ p.name }}</span>
                </div>
                <span class="item-price">{{ Number(p.price).toFixed(2) }}€</span>
                <button class="btn-eliminar" @click="eliminarProducto(p.id, p.name)">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: EMPLEADOS ══ -->
      <div v-if="currentTab === 'usuarios'">
        <div class="page-header">
          <div>
            <h1>Gestión de Empleados</h1>
            <p class="page-subtitle">{{ empleados.length }} empleados registrados</p>
          </div>
        </div>

        <div class="dos-columnas">
          <!-- Columna izquierda: invitaciones -->
          <div class="columna-izq">

            <div class="form-card">
              <h3 class="form-card-title">🔑 Nueva invitación</h3>
              <p class="form-hint">
                El empleado usará el código en <strong>/register</strong> para activar su cuenta.
              </p>
              <div class="form-fields" style="margin-top: 16px;">
                <div class="field-group">
                  <label>Email del empleado</label>
                  <input type="email" v-model="nuevaInvitacion.email" placeholder="empleado@restaurante.com">
                </div>
                <div class="field-group">
                  <label>Rol asignado</label>
                  <select v-model="nuevaInvitacion.rol">
                    <option value="camarero">🙋 Camarero</option>
                    <option value="cocinero">👨‍🍳 Cocinero</option>
                    <option value="admin">⚙️ Admin</option>
                  </select>
                </div>
                <button @click="crearInvitacion" class="btn-primary btn-full" :disabled="isCreandoInvitacion">
                  {{ isCreandoInvitacion ? 'Generando...' : '🔑 Generar Código' }}
                </button>
              </div>
            </div>

            <div class="form-card" style="margin-top: 20px;">
              <div class="card-header-row">
                <h3 class="form-card-title" style="margin-bottom: 0;">Códigos generados</h3>
                <button class="btn-text-danger" @click="limpiarInvitacionesUsadas">🧹 Limpiar usados</button>
              </div>
              <div v-if="invitaciones.length === 0" class="empty-state-box" style="margin-top: 12px;">
                No hay invitaciones todavía.
              </div>
              <div v-for="inv in invitaciones" :key="inv.id" class="item-row" style="margin-top: 8px;">
                <div class="item-info">
                  <span class="item-name" style="font-size: 0.85rem;">{{ inv.email }}</span>
                  <span class="item-sub">{{ inv.rol }}</span>
                </div>
                <span class="codigo-badge" :class="inv.estado">
                  {{ inv.estado === 'pendiente' ? inv.codigo : '✓ Usado' }}
                </span>
                <button v-if="inv.estado === 'pendiente'" class="btn-eliminar" @click="eliminarInvitacion(inv.id)">✕</button>
              </div>
            </div>

          </div>

          <!-- Columna derecha: lista de empleados -->
          <div class="lista-card">
            <h3 class="form-card-title">👥 Equipo registrado</h3>

            <div class="filtros-rol">
              <button :class="{ active: filtroRol === 'todos' }"    @click="filtroRol = 'todos'">Todos</button>
              <button :class="{ active: filtroRol === 'admin' }"    @click="filtroRol = 'admin'">Admins</button>
              <button :class="{ active: filtroRol === 'camarero' }" @click="filtroRol = 'camarero'">Camareros</button>
              <button :class="{ active: filtroRol === 'cocinero' }" @click="filtroRol = 'cocinero'">Cocineros</button>
            </div>

            <div v-if="empleados.filter(e => filtroRol === 'todos' || e.rol === filtroRol).length === 0" class="empty-state-box">
              No hay empleados con este filtro.
            </div>

            <div
              v-for="emp in empleados.filter(e => filtroRol === 'todos' || e.rol === filtroRol)"
              :key="emp.id"
              class="empleado-row"
            >
              <div class="empleado-avatar">{{ emp.nombre?.charAt(0).toUpperCase() ?? '?' }}</div>
              <div class="item-info">
                <span class="item-name">{{ emp.nombre }}</span>
                <span class="item-sub">{{ emp.email }}</span>
              </div>
              <span class="rol-badge" :class="emp.rol">{{ emp.rol }}</span>
              <button
                class="activo-toggle"
                :class="emp.activo ? 'activo' : 'inactivo'"
                @click="toggleEstadoEmpleado(emp.id, emp.activo)"
              >
                {{ emp.activo ? '● Activo' : '○ Inactivo' }}
              </button>
              <button class="btn-eliminar" @click="eliminarEmpleado(emp.id, emp.nombre)">✕</button>
            </div>
          </div>
        </div>
      </div>

    </main>

    <!-- ══ MODAL: DETALLE FACTURA ══ -->
    <transition name="fade">
      <div v-if="mostrarModalDetalleFactura && facturaSeleccionada" class="modal-backdrop" @click.self="mostrarModalDetalleFactura = false">
        <div class="modal-ticket">
          <div class="ticket-paper-admin">
            <div class="ticket-top">
              <h2>EasyOrder</h2>
              <p class="ticket-sub">COPIA DE TICKET</p>
              <p class="ticket-info">Mesa {{ facturaSeleccionada.mesaNumero }} ({{ facturaSeleccionada.zona }})</p>
              <p class="ticket-info muted">{{ new Date(facturaSeleccionada.fecha.seconds * 1000).toLocaleString() }}</p>
              <p class="ticket-info muted">Camarero: {{ facturaSeleccionada.usuarioNombre }}</p>
            </div>
            <div class="ticket-divider"></div>
            <div class="ticket-items-admin">
              <div v-for="(item, idx) in facturaSeleccionada.items" :key="idx" class="t-item-admin">
                <span class="t-qty-admin">{{ item.cantidad }}x</span>
                <span class="t-name-admin">{{ item.nombre }}</span>
                <span class="t-price-admin">{{ (item.precio * item.cantidad).toFixed(2) }}€</span>
              </div>
            </div>
            <div class="ticket-divider"></div>
            <div class="ticket-total-row">
              <span>TOTAL</span>
              <span>{{ facturaSeleccionada.total.toFixed(2) }}€</span>
            </div>
            <p class="ticket-info muted" style="text-align:right; margin-top: 6px;">
              Método: {{ facturaSeleccionada.metodoPago }}
            </p>
          </div>
          <button class="btn-primary btn-full" style="border-radius: 0 0 14px 14px;" @click="mostrarModalDetalleFactura = false">
            Cerrar
          </button>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: EDITAR FACTURA ══ -->
    <transition name="fade">
      <div v-if="mostrarModalEditarFactura" class="modal-backdrop" @click.self="mostrarModalEditarFactura = false">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Editar Ticket</h2>
            <button class="btn-close" @click="mostrarModalEditarFactura = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-fields">
              <label class="field-label">Productos:</label>
              <div class="edit-items-container">
                <div class="edit-items-list">
                  <div v-for="(item, idx) in facturaEditando.items" :key="idx" class="edit-item-row">
                    <span class="edit-item-name">{{ item.nombre }}</span>
                    <div class="edit-item-controls">
                      <input type="number" v-model.number="item.cantidad" min="1" @input="recalcularTotalFactura" class="edit-input-sm">
                      <span class="edit-sep">×</span>
                      <input type="number" v-model.number="item.precio" step="0.01" @input="recalcularTotalFactura" class="edit-input-sm">
                      <button class="btn-eliminar-sm" @click="quitarItemTicket(idx)">✕</button>
                    </div>
                  </div>
                </div>
                <div class="add-item-row">
                  <select v-model="nuevoItemSeleccionado" class="input-select" style="flex:1">
                    <option value="">Añadir producto...</option>
                    <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                  <button class="btn-primary" @click="agregarItemTicket" style="padding: 8px 16px;">OK</button>
                </div>
              </div>

              <div class="two-cols-fields">
                <div class="field-group">
                  <label>Total (€)</label>
                  <input type="number" v-model.number="facturaEditando.total" step="0.01">
                </div>
                <div class="field-group">
                  <label>Método de pago</label>
                  <select v-model="facturaEditando.metodoPago">
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>

              <button @click="guardarEdicionFactura" class="btn-primary btn-full">Guardar Cambios</button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: ZONAS ══ -->
    <transition name="fade">
      <div v-if="mostrarModalZonas" class="modal-backdrop" @click.self="mostrarModalZonas = false">
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2>Gestionar Zonas</h2>
            <button class="btn-close" @click="mostrarModalZonas = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="dos-columnas">
              <div class="form-card">
                <h3 class="form-card-title">Nueva zona</h3>
                <div class="form-fields">
                  <div class="field-group">
                    <label>Nombre</label>
                    <input v-model="nuevaZona.nombre" placeholder="Ej: Terraza">
                  </div>
                  <div class="field-group">
                    <label>Icono</label>
                    <div class="emoji-selector-container">
                      <button type="button" class="btn-emoji" @click="mostrarSelectorZona = !mostrarSelectorZona">
                        <span class="emoji-preview">{{ nuevaZona.icono }}</span>
                        <span>Cambiar</span>
                      </button>
                      <div v-if="mostrarSelectorZona" class="picker-popup">
                        <EmojiPicker :native="true" theme="light" @select="onSelectEmojiZona" />
                      </div>
                    </div>
                  </div>
                  <button @click="guardarZona" class="btn-primary btn-full">+ Crear Zona</button>
                </div>
              </div>
              <div class="lista-card">
                <h3 class="form-card-title">Zonas actuales</h3>
                <div v-if="zonas.length === 0" class="empty-state-box">No hay zonas todavía.</div>
                <div v-for="z in zonas" :key="z.id" class="item-row">
                  <span class="item-icon">{{ z.icono }}</span>
                  <div class="item-info">
                    <span class="item-name">{{ z.nombre }}</span>
                    <span class="item-sub">{{ mesas.filter(m => m.zona === z.nombre).length }} mesas</span>
                  </div>
                  <button class="btn-eliminar" @click="eliminarZona(z.id, z.nombre)">✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: CATEGORÍAS ══ -->
    <transition name="fade">
      <div v-if="mostrarModalCategorias" class="modal-backdrop" @click.self="mostrarModalCategorias = false">
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2>Gestionar Categorías</h2>
            <button class="btn-close" @click="mostrarModalCategorias = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="dos-columnas">
              <div class="form-card">
                <h3 class="form-card-title">Nueva categoría</h3>
                <div class="form-fields">
                  <div class="field-group">
                    <label>Nombre</label>
                    <input v-model="nuevaCategoria.nombre" placeholder="Ej: Entrantes">
                  </div>
                  <div class="field-group">
                    <label>Icono</label>
                    <div class="emoji-selector-container">
                      <button type="button" class="btn-emoji" @click="mostrarSelectorCategoria = !mostrarSelectorCategoria">
                        <span class="emoji-preview">{{ nuevaCategoria.icono }}</span>
                        <span>Cambiar</span>
                      </button>
                      <div v-if="mostrarSelectorCategoria" class="picker-popup">
                        <EmojiPicker :native="true" theme="light" @select="onSelectEmojiCategoria" />
                      </div>
                    </div>
                  </div>
                  <button @click="guardarCategoria" class="btn-primary btn-full">+ Añadir Categoría</button>
                </div>
              </div>
              <div class="lista-card">
                <h3 class="form-card-title">Categorías actuales</h3>
                <div v-if="categorias.length === 0" class="empty-state-box">No hay categorías todavía.</div>
                <div v-for="cat in categorias" :key="cat.id" class="item-row">
                  <span class="item-icon">{{ cat.icono }}</span>
                  <div class="item-info">
                    <span class="item-name">{{ cat.nombre }}</span>
                    <span class="item-sub">{{ productos.filter(p => p.category === cat.nombre).length }} productos</span>
                  </div>
                  <button class="btn-eliminar" @click="eliminarCategoria(cat.id, cat.nombre)">✕</button>
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
@import 'vue3-emoji-picker/css';

* { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }

/* ── LAYOUT BASE ── */
.admin-layout { display: flex; min-height: 100vh; background: #f3f4f6; }

/* ── SIDEBAR ── */
.sidebar {
  width: 220px;
  background: #1e293b;
  color: white;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 20px;
  border-bottom: 1px solid #334155;
  margin-bottom: 8px;
}

.sidebar-brand h2 { font-size: 1.15rem; font-weight: 800; color: white; }

.admin-tag {
  background: #4f46e5;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }

.sidebar-nav button {
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  border-radius: 8px;
  transition: all 0.2s;
  width: 100%;
}

.sidebar-nav button:hover { background: #334155; color: white; }
.sidebar-nav button.active { background: #4f46e5; color: white; font-weight: 600; }

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #334155;
}

.local-info {
  font-size: 0.75rem;
  color: #64748b;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-logout {
  padding: 10px 16px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
  border-radius: 8px;
  transition: all 0.2s;
  width: 100%;
}

.btn-logout:hover { background: #ef4444; border-color: #ef4444; color: white; }

/* ── CONTENT ── */
.content { flex: 1; padding: 36px 40px; overflow-y: auto; min-width: 0; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-header h1 { font-size: 1.6rem; font-weight: 700; color: #0f172a; }
.page-subtitle { color: #64748b; font-size: 0.9rem; margin-top: 4px; }

.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

/* ── BOTONES GLOBALES ── */
.btn-primary {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) { background: #4338ca; }
.btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }
.btn-full { width: 100%; padding: 14px; font-size: 0.95rem; }

.btn-danger {
  background: #dc2626;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.btn-danger:hover { background: #b91c1c; }

.btn-close {
  background: #fee2e2;
  color: #dc2626;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-close:hover { background: #dc2626; color: white; }

.btn-eliminar {
  width: 30px;
  height: 30px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-eliminar:hover { background: #dc2626; color: white; }

.btn-text-danger {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-text-danger:hover { background: #fee2e2; color: #dc2626; }

/* ── INPUTS ── */
.input-num, .input-date, .input-select {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #0f172a;
  background: white;
  outline: none;
  transition: border-color 0.2s;
}

.input-num { width: 80px; text-align: center; }
.input-date:focus, .input-num:focus, .input-select:focus { border-color: #4f46e5; }

/* ── TABS ── */
.tabs-zone-admin {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  overflow-x: auto;
  padding-bottom: 4px;
  align-items: center;
}

.tabs-zone-admin button {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
  transition: all 0.2s;
  white-space: nowrap;
  font-size: 0.9rem;
}

.tabs-zone-admin button.active { background: #4f46e5; color: white; border-color: #4f46e5; }
.tabs-zone-admin button:hover:not(.active) { background: #f1f5f9; }

.btn-gestionar-zonas {
  border-style: dashed !important;
  background: transparent !important;
  color: #64748b !important;
}

.btn-gestionar-zonas:hover {
  border-color: #4f46e5 !important;
  color: #4f46e5 !important;
  background: #ede9fe !important;
}

/* ── FINANZAS: KPIs ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.kpi-card {
  background: white;
  padding: 22px 24px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kpi-card.highlight { background: #f0fdf4; border-color: #bbf7d0; }

.kpi-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-card.highlight .kpi-title { color: #15803d; }

.kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
}

.kpi-card.highlight .kpi-value { color: #16a34a; }

/* ── FINANZAS: FILTROS ── */
.finanzas-filtros {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  background: #f8fafc;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.form-group-inline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-group-inline label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

/* ── FINANZAS: TICKETS ── */
.tickets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.factura-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

.factura-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 6px 12px rgba(0,0,0,0.06);
  transform: translateY(-2px);
}

.f-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e2e8f0;
}

.f-mesa { font-weight: 800; color: #0f172a; font-size: 1rem; }
.f-mesa small { color: #64748b; font-weight: 600; font-size: 0.82rem; }

.f-metodo {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.f-metodo.efectivo { background: #dcfce7; color: #16a34a; }
.f-metodo.tarjeta  { background: #dbeafe; color: #1d4ed8; }

.f-body { display: flex; justify-content: space-between; align-items: center; }
.f-empleado { font-size: 0.88rem; color: #475569; font-weight: 500; }
.f-hora     { font-size: 0.82rem; color: #94a3b8; font-weight: 600; }

.f-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
}

.f-total { font-size: 1.35rem; font-weight: 900; color: #0f172a; }

.ticket-actions { display: flex; gap: 8px; }

.btn-icon {
  background: #f1f5f9;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.2s;
  font-size: 0.95rem;
}

.btn-icon.btn-edit:hover { background: #e0e7ff; }
.btn-icon.btn-del:hover  { background: #fee2e2; }

/* ── FINANZAS: RENDIMIENTO ── */
.rendimiento-lista { display: flex; flex-direction: column; gap: 14px; }

.rendimiento-row {
  display: flex;
  align-items: center;
  gap: 14px;
  background: white;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.rank-badge {
  width: 32px;
  height: 32px;
  background: #4f46e5;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.empleado-info { display: flex; flex-direction: column; min-width: 120px; }
.empleado-nombre { font-weight: 700; color: #0f172a; font-size: 0.95rem; }
.empleado-pedidos { font-size: 0.78rem; color: #64748b; }

.barra-progreso-wrapper {
  flex: 1;
  height: 8px;
  background: #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
}

.barra-progreso {
  height: 100%;
  background: linear-gradient(90deg, #4f46e5, #818cf8);
  border-radius: 10px;
  transition: width 0.5s ease;
  min-width: 4px;
}

.rendimiento-total {
  font-weight: 800;
  color: #0f172a;
  font-size: 1rem;
  min-width: 80px;
  text-align: right;
}

/* ── LAYOUT DOS COLUMNAS (Menú y Empleados) ── */
.dos-columnas {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  align-items: start;
}

.columna-izq { display: flex; flex-direction: column; gap: 0; }

/* ── TARJETAS DE FORMULARIO Y LISTA ── */
.form-card, .lista-card {
  background: white;
  border-radius: 14px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.form-card { position: sticky; top: 0; }

.form-card-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 18px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.form-hint {
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 4px;
}

.form-fields { display: flex; flex-direction: column; gap: 14px; }

.field-group { display: flex; flex-direction: column; gap: 6px; }

.field-group label, .field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}

.field-group input,
.field-group select {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #0f172a;
  background: white;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}

.field-group input:focus,
.field-group select:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08);
}

.two-cols-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

/* ── FILAS DE ITEMS ── */
.item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.item-row:last-child { border-bottom: none; }

.item-icon { font-size: 1.5rem; flex-shrink: 0; }

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-weight: 600;
  color: #0f172a;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-sub { font-size: 0.78rem; color: #94a3b8; }
.item-price { font-weight: 700; color: #4f46e5; font-size: 0.95rem; white-space: nowrap; }

/* ── MENÚ: CATEGORÍAS ── */
.categoria-grupo { margin-bottom: 6px; }

.categoria-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 8px;
  border-bottom: 2px solid #f1f5f9;
  margin-bottom: 4px;
  margin-top: 16px;
}

.categoria-icono { font-size: 1.1rem; }

.categoria-nombre {
  font-weight: 700;
  color: #0f172a;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.78rem;
}

.categoria-count {
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

/* ── EMPLEADOS ── */
.empleado-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.empleado-row:last-child { border-bottom: none; }

.empleado-avatar {
  width: 38px;
  height: 38px;
  background: #4f46e5;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  flex-shrink: 0;
}

.rol-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  text-transform: capitalize;
  flex-shrink: 0;
}

.rol-badge.admin    { background: #ede9fe; color: #6d28d9; }
.rol-badge.camarero { background: #dbeafe; color: #1d4ed8; }
.rol-badge.cocinero { background: #fef3c7; color: #b45309; }

.activo-toggle {
  border: none;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s;
  flex-shrink: 0;
}

.activo-toggle.activo   { background: #dcfce7; color: #16a34a; }
.activo-toggle.inactivo { background: #f1f5f9; color: #94a3b8; }
.activo-toggle:hover { filter: brightness(0.94); }

.filtros-rol {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filtros-rol button {
  background: #f1f5f9;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: 0.2s;
}

.filtros-rol button.active { background: #4f46e5; color: white; }
.filtros-rol button:hover:not(.active) { background: #e2e8f0; }

/* ── INVITACIONES ── */
.codigo-badge {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 8px;
  letter-spacing: 2px;
  flex-shrink: 0;
}

.codigo-badge.pendiente { background: #fef3c7; color: #b45309; border: 1px dashed #fcd34d; }
.codigo-badge.usada     { background: #dcfce7; color: #16a34a; }

/* ── EMOJI PICKER ── */
.emoji-selector-container { position: relative; }

.btn-emoji {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #475569;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-emoji:hover { background: #f1f5f9; border-color: #cbd5e1; }
.emoji-preview { font-size: 1.4rem; line-height: 1; }

.picker-popup {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 100;
  box-shadow: 0 10px 25px rgba(0,0,0,0.12);
  border-radius: 10px;
}

/* ── ESTADOS VACÍOS ── */
.empty-state-box {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
}

.card-container {
  background: white;
  border-radius: 14px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

/* ── MODALES ── */
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #f8fafc;
  width: 860px;
  max-width: 95vw;
  max-height: 90vh;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
  animation: modalIn 0.25s ease-out;
}

.modal-sm { width: 700px; }

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.modal-header h2 { font-size: 1.2rem; font-weight: 800; color: #0f172a; }

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

/* ── MODAL TICKET DETALLE ── */
.modal-ticket {
  background: white;
  width: 380px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
  animation: modalIn 0.25s ease-out;
}

.ticket-paper-admin {
  padding: 28px 24px 20px;
  font-family: 'Courier New', Courier, monospace;
}

.ticket-top { text-align: center; margin-bottom: 16px; }
.ticket-top h2 { font-size: 1.4rem; font-weight: 900; margin: 0; }
.ticket-sub { font-size: 0.85rem; color: #64748b; margin: 4px 0 12px; }
.ticket-info { font-size: 0.9rem; margin: 2px 0; }
.ticket-info.muted { color: #64748b; font-size: 0.82rem; }
.ticket-divider { border-top: 1px dashed #cbd5e1; margin: 14px 0; }

.ticket-items-admin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.t-item-admin { display: flex; font-size: 0.92rem; gap: 8px; }
.t-qty-admin  { width: 30px; font-weight: 700; flex-shrink: 0; }
.t-name-admin { flex: 1; word-break: break-word; }
.t-price-admin{ font-weight: 700; white-space: nowrap; }

.ticket-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 1.25rem;
  font-weight: 900;
  color: #0f172a;
}

/* ── MODAL EDITAR FACTURA ── */
.edit-items-container {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 4px;
}

.edit-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  margin: 8px 0;
}

.edit-item-row {
  display: flex;
  align-items: center;
  background: white;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  gap: 10px;
}

.edit-item-name {
  flex: 1;
  font-size: 0.88rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-item-controls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.edit-sep { font-size: 0.8rem; color: #94a3b8; }

.edit-input-sm {
  width: 58px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  text-align: center;
  outline: none;
  font-size: 0.88rem;
}

.edit-input-sm:focus { border-color: #4f46e5; }

.btn-eliminar-sm {
  width: 24px;
  height: 24px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-eliminar-sm:hover { background: #dc2626; color: white; }

.add-item-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* ── ANIMACIONES ── */
@keyframes modalIn {
  from { transform: translateY(16px) scale(0.98); opacity: 0; }
  to   { transform: translateY(0)    scale(1);    opacity: 1; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,  .fade-leave-to     { opacity: 0; }

/* ── RESPONSIVE ── */
@media (max-width: 1100px) {
  .dos-columnas { grid-template-columns: 1fr; }
  .form-card { position: static; }
}

@media (max-width: 900px) {
  .content { padding: 20px; }
  .modal-content { width: 95%; }
  .modal-ticket { width: 95%; }
  .tickets-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 600px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .finanzas-filtros { flex-direction: column; }
}
</style>