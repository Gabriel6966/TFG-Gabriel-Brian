<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  collection, addDoc, onSnapshot,
  query, orderBy, where, deleteDoc, doc, updateDoc, setDoc, writeBatch, Timestamp, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'
import { useNegocio } from '../composables/useNegocio'
import EmojiPicker from 'vue3-emoji-picker'
import FloorEditor from '../components/pos/FloorEditor.vue'
import PoweredByEasyOrder from '../components/branding/PoweredByEasyOrder.vue'
import emailjs from '@emailjs/browser'
import { useNotify } from '../composables/useNotify'
import { useReservaNotify } from '../composables/useReservaNotify'
import { desglosarIva, TIPO_IVA_PCT } from '../utils/iva'

const { toast, confirm: confirmDialog } = useNotify()
const { enviarEmailReserva, linkWhatsAppReserva } = useReservaNotify()

// ── INTERFACES ────────────────────────────────────────────────────

interface Mesa {
  id: string
  numero: number
  nombre?: string
  estado: 'libre' | 'ocupada'
  capacidad: number
  zona?: string
  x?: number
  y?: number
}

interface Producto {
  id: string
  name: string
  price: number
  category: string
  icon: string
  imageUrl?: string
  sirveCamarero?: boolean
  stock?: number
  recomendado?: boolean
}

interface Categoria {
  id: string
  nombre: string
  icono: string
  imageUrl?: string
  orderIndex?: number
  createdAt?: any
  updatedAt?: any
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
  base?: number
  iva?: number
  tipoIva?: number
  fechaDia: string
  fecha: any
  items: any[]
}

interface Reserva {
  id: string
  nombre: string
  telefono?: string
  email?: string
  personas: number
  fechaHora: any
  fechaDia: string
  mesaId?: string
  notas?: string
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'cumplida'
  creadoEn: any
}

// ── AUTH & NEGOCIO ────────────────────────────────────────────────

const { logout, localId } = useAuth()
const { config: configNegocio, iniciar: iniciarNegocio } = useNegocio()

// ── ESTADO GENERAL ────────────────────────────────────────────────

const currentTab = ref('finanzas')
const mesas = ref<Mesa[]>([])
const productos = ref<Producto[]>([])
const categorias = ref<Categoria[]>([])
const zonas = ref<Zona[]>([])
const invitaciones = ref<Invitacion[]>([])
const empleados = ref<Empleado[]>([])
const facturas = ref<Factura[]>([])
const reservas = ref<Reserva[]>([])
const cantidadMesas = ref(10)
const isLoading = ref(false)
const isCreandoInvitacion = ref(false)
const isCreandoReserva = ref(false)

// ── FILTROS ───────────────────────────────────────────────────────

const filtroRol = ref('todos')
const filtroEstado = ref('todos')
const filtroFecha = ref(new Date().toISOString().split('T')[0])
const finanzasSubTab = ref('tickets')
const filtroFEmpleado = ref('todos')
const filtroFPago = ref('todos')
const filtroFechaReservas = ref(new Date().toISOString().split('T')[0])
const filtroEstadoReserva = ref<'todas' | 'pendiente' | 'confirmada' | 'cancelada' | 'cumplida'>('todas')

const nuevaReserva = ref({
  nombre: '',
  telefono: '',
  email: '',
  personas: 2,
  fecha: new Date().toISOString().split('T')[0],
  hora: '20:00',
  mesaId: '',
  notas: ''
})

const mostrarModalEditarReserva = ref(false)
const reservaEditandoId = ref<string | null>(null)
const reservaEditando = ref({
  nombre: '',
  telefono: '',
  email: '',
  personas: 2,
  fecha: '',
  hora: '',
  mesaId: '',
  notas: ''
})
const isGuardandoEdicionReserva = ref(false)

// ── MODALES ───────────────────────────────────────────────────────

const mostrarSelectorCategoria = ref(false)
const mostrarSelectorProducto = ref(false)
const mostrarSelectorZona = ref(false)
const mostrarModalZonas = ref(false)
const mostrarModalCategorias = ref(false)
const mostrarModalEditarFactura = ref(false)
const mostrarModalDetalleFactura = ref(false)

// ── FORMULARIOS ───────────────────────────────────────────────────

const nuevoProducto = ref({
  name: '',
  price: 0,
  category: '',
  icon: '🍽️',
  imageUrl: '',
  sirveCamarero: false,
  stock: 0,
  recomendado: false
})
const nuevaCategoria = ref({ nombre: '', icono: '🍽️', imageUrl: '' })
const editandoProductoId = ref<string | null>(null)
const editandoCategoriaId = ref<string | null>(null)
const nuevaZona = ref({ nombre: '', icono: '🛋️' })
const nuevaInvitacion = ref({ email: '', rol: 'camarero' as 'admin' | 'camarero' | 'cocinero' })
const facturaEditando = ref<Partial<Factura>>({})
const facturaSeleccionada = ref<Factura | null>(null)
// Desglose de IVA de la factura abierta en el modal de detalle.
const desgloseFacturaSel = computed(() =>
  desglosarIva(facturaSeleccionada.value?.total ?? 0)
)
const nuevoItemSeleccionado = ref('')
const subiendoFotoProducto = ref(false)
const subiendoFotoCategoria = ref(false)
const ordenCategorias = ref<'manual' | 'alfabetico' | 'alfabeticoDesc' | 'actualizacion' | 'productos' | 'bebidas'>('manual')

// ── MAPA ──────────────────────────────────────────────────────────

const mesaSeleccionada = ref<number | null>(null)
const zonaActiva = ref('')

// ── NEGOCIO ───────────────────────────────────────────────────────

const configEditando = ref({
  nombreNegocio: '',
  logoUrl: '',
  colorAcento: '#4f46e5'
})
const subiendoLogo = ref(false)
const guardandoConfig = ref(false)

const COLORES_PRESET = [
  '#4f46e5', '#dc2626', '#16a34a', '#d97706',
  '#0891b2', '#7c3aed', '#db2777', '#0f172a'
]

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET

// ── LISTENERS ────────────────────────────────────────────────────

let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null
let unsubscribeZonas: (() => void) | null = null
let unsubscribeInvitaciones: (() => void) | null = null
let unsubscribeEmpleados: (() => void) | null = null
let unsubscribeFacturas: (() => void) | null = null
let unsubscribeReservas: (() => void) | null = null

// ── COMPUTED: FINANZAS ────────────────────────────────────────────

const totalVentas = computed(() => facturas.value.reduce((acc, f) => acc + f.total, 0))
const totalEfectivo = computed(() => facturas.value.filter(f => f.metodoPago === 'efectivo').reduce((acc, f) => acc + f.total, 0))
const totalTarjeta = computed(() => facturas.value.filter(f => f.metodoPago === 'tarjeta').reduce((acc, f) => acc + f.total, 0))
const numeroPedidos = computed(() => facturas.value.length)
const ticketMedio = computed(() => numeroPedidos.value > 0 ? (totalVentas.value / numeroPedidos.value) : 0)
// Desglose de IVA del total recaudado (los precios ya incluyen IVA).
const desgloseCaja = computed(() => desglosarIva(totalVentas.value))

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

// ── COMPUTED: EMPLEADOS ───────────────────────────────────────────

const empleadosFiltrados = computed(() =>
  empleados.value.filter(e => {
    const matchRol    = filtroRol.value === 'todos' || e.rol === filtroRol.value
    const matchEstado = filtroEstado.value === 'todos' ||
                        (filtroEstado.value === 'activo'   &&  e.activo) ||
                        (filtroEstado.value === 'inactivo' && !e.activo)
    return matchRol && matchEstado
  })
)

// ── COMPUTED: MESAS ───────────────────────────────────────────────

const mesasFiltradasPorZona = computed(() =>
  mesas.value.filter(m => m.zona === zonaActiva.value || (!m.zona && zonas.value.length === 0))
)

const mesasParaMapa = computed(() =>
  mesasFiltradasPorZona.value.map(m => ({
    id: m.id,
    nr: m.numero,
    status: m.estado === 'libre' ? 'available' : m.estado === 'ocupada' ? 'occupied' : 'preparing',
    capacity: m.capacidad,
    x: m.x,
    y: m.y
  }))
)

// ── COMPUTED: MENÚ ────────────────────────────────────────────────

const obtenerCategoria = (nombre: string) =>
  categorias.value.find(c => c.nombre === nombre)

const contarProductosCategoria = (nombre: string) =>
  productos.value.filter(p => p.category === nombre).length

const fechaCategoriaMs = (cat: Categoria) => {
  const fecha = cat.updatedAt || cat.createdAt
  if (!fecha) return 0
  if (typeof fecha.toMillis === 'function') return fecha.toMillis()
  if (typeof fecha.seconds === 'number') return fecha.seconds * 1000
  if (fecha instanceof Date) return fecha.getTime()
  const parsed = new Date(fecha).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

const esCategoriaBebida = (cat: Categoria) => {
  const texto = cat.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ['bebida', 'bebidas', 'drink', 'drinks', 'bar', 'vino', 'cerveza', 'refresco', 'coctel'].some(
    palabra => texto.includes(palabra)
  )
}

const categoriasOrdenadas = computed(() => {
  const base = categorias.value.map((cat, index) => ({ cat, index }))
  return base.sort((a, b) => {
    if (ordenCategorias.value === 'alfabetico')
      return a.cat.nombre.localeCompare(b.cat.nombre, 'es', { sensitivity: 'base' })
    if (ordenCategorias.value === 'alfabeticoDesc')
      return b.cat.nombre.localeCompare(a.cat.nombre, 'es', { sensitivity: 'base' })
    if (ordenCategorias.value === 'actualizacion')
      return fechaCategoriaMs(b.cat) - fechaCategoriaMs(a.cat)
    if (ordenCategorias.value === 'productos')
      return contarProductosCategoria(b.cat.nombre) - contarProductosCategoria(a.cat.nombre)
        || a.cat.nombre.localeCompare(b.cat.nombre, 'es', { sensitivity: 'base' })
    if (ordenCategorias.value === 'bebidas')
      return Number(esCategoriaBebida(b.cat)) - Number(esCategoriaBebida(a.cat))
        || (a.cat.orderIndex ?? a.index) - (b.cat.orderIndex ?? b.index)
    return (a.cat.orderIndex ?? a.index) - (b.cat.orderIndex ?? b.index)
      || a.cat.nombre.localeCompare(b.cat.nombre, 'es', { sensitivity: 'base' })
  }).map(({ cat }) => cat)
})

const productosPorCategoria = computed(() => {
  const grupos: Record<string, Producto[]> = {}
  for (const cat of categoriasOrdenadas.value) {
    grupos[cat.nombre] = productos.value.filter(p => p.category === cat.nombre)
  }
  const sinCategoria = productos.value.filter(p => !categorias.value.some(c => c.nombre === p.category))
  if (sinCategoria.length > 0) grupos['Sin categoría'] = sinCategoria
  return grupos
})

// ── CARGA DE DATOS ────────────────────────────────────────────────

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

const cargarReservas = (fecha: string) => {
  if (!localId.value) return
  if (unsubscribeReservas) unsubscribeReservas()
  // Sin orderBy server-side: evita exigir índice compuesto (where+orderBy).
  // Ordenamos cliente-side por fechaHora ascendente.
  const qReservas = query(
    collection(db, `locales/${localId.value}/reservas`),
    where('fechaDia', '==', fecha)
  )
  unsubscribeReservas = onSnapshot(qReservas, (snapshot) => {
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Reserva[]
    docs.sort((a, b) => (a.fechaHora?.seconds ?? 0) - (b.fechaHora?.seconds ?? 0))
    reservas.value = docs
  })
}
watch(filtroFechaReservas, (val) => cargarReservas(val))

watch(configNegocio, (val) => {
  configEditando.value = { ...val }
}, { immediate: true, deep: true })

onMounted(() => {
  if (!localId.value) return

  iniciarNegocio(localId.value)
  cargarFacturas(filtroFecha.value)
  cargarReservas(filtroFechaReservas.value)

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
    query(collection(db, 'usuarios'), where('localId', '==', localId.value)),
    s => {
      empleados.value = s.docs.map(d => ({ id: d.id, ...d.data() } as Empleado))
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
  unsubscribeReservas?.()
})

// ── ACCIONES: LOGOUT ──────────────────────────────────────────────

const handleLogout = async () => {
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
  unsubscribeZonas?.()
  unsubscribeInvitaciones?.()
  unsubscribeEmpleados?.()
  unsubscribeFacturas?.()
  await logout()
}

// ── ACCIONES: NEGOCIO ─────────────────────────────────────────────

const guardarConfig = async () => {
  if (!localId.value) return
  guardandoConfig.value = true
  try {
    await setDoc(doc(db, `locales/${localId.value}/config`, 'negocio'), {
      ...configEditando.value
    })
    toast.success('Configuración guardada')
  } catch {
    toast.error('No se pudo guardar la configuración.')
  } finally {
    guardandoConfig.value = false
  }
}

const subirLogo = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) { input.value = ''; return toast.warning('Solo se permiten imágenes.') }
  if (file.size > 2 * 1024 * 1024)    { input.value = ''; return toast.warning('La imagen no puede superar 2MB.') }
  subiendoLogo.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_PRESET)
    formData.append('folder', `easyorder/${localId.value}`)
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: 'POST', body: formData }
    )
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    configEditando.value.logoUrl = data.secure_url || ''
  } catch {
    toast.error('No se pudo subir la imagen.')
  } finally {
    input.value = ''
    subiendoLogo.value = false
  }
}

// ── ACCIONES: MAPA ────────────────────────────────────────────────

const handleUpdatePosition = async (id: string, x: number, y: number) => {
  if (!localId.value) return
  const mesa = mesas.value.find(m => m.id === id)
  if (mesa) { mesa.x = x; mesa.y = y }
  try {
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, id), { x, y })
  } catch {
    toast.error('No se pudo guardar la posición de la mesa.')
  }
}

const handleSelectTable = (table: any) => {
  mesaSeleccionada.value = table.nr
}

// ── ACCIONES: MESAS ───────────────────────────────────────────────

const generarMesas = async () => {
  if (!localId.value) return
  if (zonas.value.length === 0) return toast.warning('Crea una zona antes de añadir mesas.')
  if (!zonaActiva.value) zonaActiva.value = zonas.value[0].nombre
  isLoading.value = true
  try {
    const mesasEnZona = mesas.value.filter(m => m.zona === zonaActiva.value)
    const ultimaNumero = mesasEnZona.length > 0 ? Math.max(...mesasEnZona.map(m => m.numero)) : 0
    const batch = writeBatch(db)
    const mesasRef = collection(db, `locales/${localId.value}/mesas`)
    for (let i = 1; i <= cantidadMesas.value; i++) {
      const index = mesasEnZona.length + i - 1
      batch.set(doc(mesasRef), {
        numero: ultimaNumero + i,
        estado: 'libre',
        capacidad: 4,
        zona: zonaActiva.value,
        x: 12 + (index % 4) * 22,
        y: 15 + Math.floor(index / 4) * 20
      })
    }
    await batch.commit()
  } catch { toast.error('No se pudieron generar las mesas.') }
  finally { isLoading.value = false }
}

const resetearMesas = async () => {
  if (!localId.value) return
  const ok = await confirmDialog({
    title: 'Borrar TODAS las mesas',
    message: 'Esta acción no se puede deshacer.',
    confirmLabel: 'Borrar todo',
    variant: 'danger'
  })
  if (!ok) return
  try {
    // Firestore limita un batch a 500 ops; si algún día hay más mesas que eso
    // habría que partirlo, pero para un local de hostelería real está sobrado.
    const batch = writeBatch(db)
    for (const m of mesas.value) {
      batch.delete(doc(db, `locales/${localId.value}/mesas`, m.id))
    }
    await batch.commit()
  } catch { toast.error('No se pudieron borrar las mesas.') }
}

// ── ACCIONES: ZONAS ───────────────────────────────────────────────

const guardarZona = async () => {
  if (!localId.value || !nuevaZona.value.nombre.trim()) return toast.warning('El nombre es obligatorio.')
  const yaExiste = zonas.value.some(z => z.nombre.toLowerCase() === nuevaZona.value.nombre.toLowerCase())
  if (yaExiste) return toast.warning('Esa zona ya existe.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/zonas`), { ...nuevaZona.value })
    nuevaZona.value = { nombre: '', icono: '🛋️' }
  } catch { toast.error('No se pudo crear la zona.') }
}

const eliminarZona = async (id: string, nombre: string) => {
  if (!localId.value) return
  const afectadas = mesas.value.filter(m => m.zona === nombre).length
  const ok = await confirmDialog({
    title: `Eliminar la zona "${nombre}"`,
    message: afectadas > 0 ? `Hay ${afectadas} mesa${afectadas !== 1 ? 's' : ''} que perderá${afectadas !== 1 ? 'n' : ''} su zona.` : '',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/zonas`, id))
    if (zonaActiva.value === nombre) zonaActiva.value = zonas.value.find(z => z.id !== id)?.nombre || ''
  } catch { toast.error('No se pudo eliminar la zona.') }
}

// ── ACCIONES: CATEGORÍAS ──────────────────────────────────────────

const subirFotoCategoria = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !localId.value) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) { input.value = ''; return toast.warning('Solo se permiten imágenes.') }
  if (file.size > 3 * 1024 * 1024)    { input.value = ''; return toast.warning('La imagen no puede superar 3MB.') }
  subiendoFotoCategoria.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_PRESET)
    formData.append('folder', `easyorder/${localId.value}/categorias`)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: formData })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    nuevaCategoria.value.imageUrl = data.secure_url || ''
  } catch { toast.error('No se pudo subir la foto.') }
  finally { input.value = ''; subiendoFotoCategoria.value = false }
}

const quitarFotoCategoria = () => { nuevaCategoria.value.imageUrl = '' }

const resetCategoriaForm = () => {
  editandoCategoriaId.value = null
  nuevaCategoria.value = { nombre: '', icono: '🍽️', imageUrl: '' }
}

const editarCategoria = (cat: Categoria) => {
  editandoCategoriaId.value = cat.id
  nuevaCategoria.value = { nombre: cat.nombre, icono: cat.icono, imageUrl: cat.imageUrl || '' }
  mostrarModalCategorias.value = true
}

const guardarCategoria = async () => {
  if (!localId.value || !nuevaCategoria.value.nombre.trim()) return toast.warning('El nombre es obligatorio.')
  const nombreNuevo = nuevaCategoria.value.nombre.trim()
  const nombreAnterior = categorias.value.find(c => c.id === editandoCategoriaId.value)?.nombre
  const yaExiste = categorias.value.some(c =>
    c.nombre.toLowerCase() === nombreNuevo.toLowerCase() && c.id !== editandoCategoriaId.value
  )
  if (yaExiste) return toast.warning('Esa categoría ya existe.')
  try {
    const payload = {
      nombre: nombreNuevo,
      icono: nuevaCategoria.value.icono || '🍽️',
      imageUrl: nuevaCategoria.value.imageUrl || '',
      updatedAt: new Date()
    }
    if (editandoCategoriaId.value) {
      const batch = writeBatch(db)
      batch.update(doc(db, `locales/${localId.value}/categorias`, editandoCategoriaId.value), payload)
      if (nombreAnterior && nombreAnterior !== nombreNuevo) {
        productos.value.filter(p => p.category === nombreAnterior).forEach(producto => {
          batch.update(doc(db, `locales/${localId.value}/productos`, producto.id), { category: nombreNuevo })
        })
      }
      await batch.commit()
    } else {
      const siguienteOrden = Math.max(-1, ...categorias.value.map(c => typeof c.orderIndex === 'number' ? c.orderIndex : -1)) + 1
      await addDoc(collection(db, `locales/${localId.value}/categorias`), { ...payload, orderIndex: siguienteOrden, createdAt: new Date() })
    }
    resetCategoriaForm()
  } catch { toast.error('No se pudo guardar la categoría.') }
}

const moverCategoria = async (cat: Categoria, direccion: -1 | 1) => {
  if (!localId.value) return
  const lista = [...categoriasOrdenadas.value]
  const indiceActual = lista.findIndex(c => c.id === cat.id)
  const nuevoIndice = indiceActual + direccion
  if (indiceActual < 0 || nuevoIndice < 0 || nuevoIndice >= lista.length) return
  const [categoriaMovida] = lista.splice(indiceActual, 1)
  lista.splice(nuevoIndice, 0, categoriaMovida)
  try {
    ordenCategorias.value = 'manual'
    await Promise.all(lista.map((categoria, index) =>
      updateDoc(doc(db, `locales/${localId.value}/categorias`, categoria.id), { orderIndex: index })
    ))
  } catch { toast.error('No se pudieron reordenar las categorías.') }
}

const eliminarCategoria = async (id: string, nombre: string) => {
  if (!localId.value) return
  const afectados = productos.value.filter(p => p.category === nombre).length
  const ok = await confirmDialog({
    title: `Eliminar "${nombre}"`,
    message: afectados > 0 ? `${afectados} producto${afectados !== 1 ? 's' : ''} quedará${afectados !== 1 ? 'n' : ''} sin categoría.` : '',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try { await deleteDoc(doc(db, `locales/${localId.value}/categorias`, id)) }
  catch { toast.error('No se pudo eliminar.') }
}

// ── ACCIONES: PRODUCTOS ───────────────────────────────────────────

const resetProductoForm = () => {
  editandoProductoId.value = null
  nuevoProducto.value = {
    name: '',
    price: 0,
    category: categorias.value[0]?.nombre ?? '',
    icon: '🍽️',
    imageUrl: '',
    sirveCamarero: false,
    stock: 0,
    recomendado: false
  }
}

const editarProducto = (producto: Producto) => {
  editandoProductoId.value = producto.id
  nuevoProducto.value = {
    name: producto.name,
    price: Number(producto.price),
    category: producto.category,
    icon: producto.icon,
    imageUrl: producto.imageUrl || '',
    sirveCamarero: producto.sirveCamarero ?? false,
    stock: Number(producto.stock) || 0,
    recomendado: producto.recomendado ?? false
  }
}

const subirFotoProducto = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !localId.value) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) { input.value = ''; return toast.warning('Solo se permiten imágenes.') }
  if (file.size > 3 * 1024 * 1024)    { input.value = ''; return toast.warning('La imagen no puede superar 3MB.') }
  subiendoFotoProducto.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_PRESET)
    formData.append('folder', `easyorder/${localId.value}/productos`)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: formData })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    nuevoProducto.value.imageUrl = data.secure_url || ''
  } catch { toast.error('No se pudo subir la foto.') }
  finally { input.value = ''; subiendoFotoProducto.value = false }
}

const quitarFotoProducto = () => { nuevoProducto.value.imageUrl = '' }

const guardarProducto = async () => {
  if (!localId.value) return
  if (!nuevoProducto.value.name.trim()) return toast.warning('El nombre es obligatorio.')
  if (nuevoProducto.value.price <= 0)   return toast.warning('El precio debe ser mayor que 0.')
  if (!nuevoProducto.value.category)    return toast.warning('Selecciona una categoría.')
  try {
    const payload = {
      name: nuevoProducto.value.name.trim(),
      price: Number(nuevoProducto.value.price),
      category: nuevoProducto.value.category,
      icon: nuevoProducto.value.icon || '🍽️',
      imageUrl: nuevoProducto.value.imageUrl || '',
      sirveCamarero: nuevoProducto.value.sirveCamarero,
      stock: Math.max(0, Math.floor(Number(nuevoProducto.value.stock) || 0)),
      recomendado: nuevoProducto.value.recomendado
    }
    if (editandoProductoId.value) {
      await updateDoc(doc(db, `locales/${localId.value}/productos`, editandoProductoId.value), payload)
    } else {
      await addDoc(collection(db, `locales/${localId.value}/productos`), payload)
    }
    resetProductoForm()
  } catch { toast.error('No se pudo guardar el producto.') }
}

const eliminarProducto = async (id: string, nombre: string) => {
  if (!localId.value) return
  const ok = await confirmDialog({
    title: `Eliminar "${nombre}"`,
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try { await deleteDoc(doc(db, `locales/${localId.value}/productos`, id)) }
  catch { toast.error('No se pudo eliminar.') }
}

// ── INVENTARIO ────────────────────────────────────────────────────

// Valores de stock en edición, indexados por id de producto. Se rellenan
// desde la lista real, sin pisar lo que el admin esté escribiendo.
const stockEdit = ref<Record<string, number>>({})
watch(productos, (lista) => {
  for (const p of lista) {
    if (!(p.id in stockEdit.value)) stockEdit.value[p.id] = Number(p.stock) || 0
  }
}, { immediate: true, deep: true })

const filtroInventario = ref('')
const productosInventario = computed(() => {
  const q = filtroInventario.value.trim().toLowerCase()
  const lista = q
    ? productos.value.filter(p => p.name.toLowerCase().includes(q))
    : productos.value
  return [...lista].sort((a, b) => a.name.localeCompare(b.name))
})

// Estadísticas de cabecera.
const productosAgotados = computed(() =>
  productos.value.filter(p => (Number(p.stock) || 0) <= 0).length
)
const productosStockBajo = computed(() =>
  productos.value.filter(p => { const s = Number(p.stock) || 0; return s > 0 && s <= 5 }).length
)

// Estado de un producto: agotado / bajo / ok — para colorear.
const estadoStock = (p: Producto) => {
  const s = Number(p.stock) || 0
  return s <= 0 ? 'cero' : s <= 5 ? 'bajo' : 'ok'
}

// Una fila tiene cambios sin guardar si el valor editado difiere del real.
const stockSinGuardar = (p: Producto) => stockEdit.value[p.id] !== (Number(p.stock) || 0)

const ajustarStockEdit = (id: string, delta: number) => {
  const actual = Number(stockEdit.value[id]) || 0
  stockEdit.value[id] = Math.max(0, actual + delta)
}

const guardarStock = async (p: Producto) => {
  if (!localId.value) return
  const nuevo = Math.max(0, Math.floor(Number(stockEdit.value[p.id]) || 0))
  try {
    await updateDoc(doc(db, `locales/${localId.value}/productos`, p.id), { stock: nuevo })
    stockEdit.value[p.id] = nuevo
    toast.success('Stock actualizado', `${p.name}: ${nuevo} unidades.`)
  } catch {
    toast.error('No se pudo actualizar el stock.')
  }
}

// ── ACCIONES: INVITACIONES ────────────────────────────────────────

const generarCodigo = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

const crearInvitacion = async () => {
  if (!localId.value || !nuevaInvitacion.value.email.trim()) return
  isCreandoInvitacion.value = true

  const nuevoCodigo = generarCodigo()
  const emailDestino = nuevaInvitacion.value.email.trim().toLowerCase()
  // El código se usa como ID del documento — así /register puede hacer
  // `get` por ID y no necesita permiso de `list` (cierra la enumeración).
  const invitacionRef = doc(db, 'invitaciones', nuevoCodigo)

  try {
    await setDoc(invitacionRef, {
      email: emailDestino,
      rol: nuevaInvitacion.value.rol,
      codigo: nuevoCodigo,
      estado: 'pendiente',
      localId: localId.value,
      localNombre: localId.value,
      creadoEn: new Date()
    })

    const serviceID = import.meta.env.VITE_EMAILJS_SERVICE_ID
    const templateID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

    try {
      await emailjs.send(serviceID, templateID, {
        user_email: emailDestino,
        rol: nuevaInvitacion.value.rol,
        codigo: nuevoCodigo
      }, publicKey)
    } catch (emailError) {
      // El correo falló: borramos la invitación recién creada para que el admin
      // pueda reintentar. Si no, queda huérfana sin que el empleado se entere.
      try { await deleteDoc(invitacionRef) } catch { /* nada que hacer */ }
      throw emailError
    }

    nuevaInvitacion.value = { email: '', rol: 'camarero' }
    toast.success('Invitación enviada', 'El empleado recibirá el código por correo.')

  } catch (error) {
    console.error('Error:', error)
    toast.error('No se pudo crear la invitación', 'Comprueba el correo y la conexión.')
  } finally {
    isCreandoInvitacion.value = false
  }
}

const eliminarInvitacion = async (id: string) => {
  const ok = await confirmDialog({
    title: 'Eliminar esta invitación',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try { await deleteDoc(doc(db, 'invitaciones', id)) }
  catch { toast.error('No se pudo eliminar.') }
}

const limpiarInvitacionesUsadas = async () => {
  const usadas = invitaciones.value.filter(i => i.estado === 'usada')
  if (usadas.length === 0) return toast.info('No hay códigos usados que limpiar.')
  const ok = await confirmDialog({
    title: `Borrar ${usadas.length} código${usadas.length !== 1 ? 's' : ''} ya utilizado${usadas.length !== 1 ? 's' : ''}`,
    confirmLabel: 'Borrar',
    variant: 'danger'
  })
  if (!ok) return
  try { await Promise.all(usadas.map(inv => deleteDoc(doc(db, 'invitaciones', inv.id)))) }
  catch { toast.error('No se pudo limpiar.') }
}

// ── ACCIONES: EMPLEADOS ───────────────────────────────────────────

const toggleEstadoEmpleado = async (id: string, estadoActual: boolean) => {
  try { await updateDoc(doc(db, 'usuarios', id), { activo: !estadoActual }) }
  catch { toast.error('No se pudo actualizar el estado.') }
}

const eliminarEmpleado = async (id: string, nombre: string) => {
  const ok = await confirmDialog({
    title: `Eliminar a "${nombre}"`,
    message: 'Perderá el acceso inmediatamente.',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try { await deleteDoc(doc(db, 'usuarios', id)) }
  catch { toast.error('No se pudo eliminar.') }
}

// ── ACCIONES: FINANZAS ────────────────────────────────────────────

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
    facturaEditando.value.items.push({ nombre: prod.name, cantidad: 1, precio: prod.price, subtotal: prod.price })
    recalcularTotalFactura()
    nuevoItemSeleccionado.value = ''
  }
}

const guardarEdicionFactura = async () => {
  if (!localId.value || !facturaEditando.value.id) return
  try {
    // Si cambia el total, el desglose de IVA guardado debe recalcularse.
    const d = desglosarIva(Number(facturaEditando.value.total) || 0)
    await updateDoc(doc(db, `locales/${localId.value}/facturas`, facturaEditando.value.id), {
      total: facturaEditando.value.total,
      base: d.base,
      iva: d.iva,
      tipoIva: d.tipo,
      metodoPago: facturaEditando.value.metodoPago,
      items: facturaEditando.value.items
    })
    mostrarModalEditarFactura.value = false
  } catch { toast.error('No se pudo actualizar el ticket.') }
}

const eliminarFactura = async (id: string) => {
  const ok = await confirmDialog({
    title: 'Eliminar esta factura',
    message: 'Saldrá del cierre de caja del día.',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try { await deleteDoc(doc(db, `locales/${localId.value}/facturas`, id)) }
  catch { toast.error('No se pudo eliminar.') }
}

// ── EMOJI PICKER ──────────────────────────────────────────────────

const onSelectEmojiCategoria = (e: any) => { nuevaCategoria.value.icono = e.i; mostrarSelectorCategoria.value = false }
const onSelectEmojiProducto  = (e: any) => { nuevoProducto.value.icon  = e.i; mostrarSelectorProducto.value  = false }
const onSelectEmojiZona      = (e: any) => { nuevaZona.value.icono      = e.i; mostrarSelectorZona.value      = false }

// ── RESERVAS ──────────────────────────────────────────────────────

const reservasFiltradas = computed(() => {
  if (filtroEstadoReserva.value === 'todas') return reservas.value
  return reservas.value.filter(r => r.estado === filtroEstadoReserva.value)
})

const horaReserva = (r: Reserva) => {
  if (!r.fechaHora?.seconds) return '--:--'
  return new Date(r.fechaHora.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Reserva "vencida": ya pasó la hora prevista y nadie la marcó cumplida/cancelada.
const esReservaVencida = (r: Reserva) => {
  if (r.estado !== 'pendiente' && r.estado !== 'confirmada') return false
  if (!r.fechaHora?.seconds) return false
  return r.fechaHora.seconds * 1000 < Date.now()
}

const nombreMesa = (mesaId?: string) => {
  if (!mesaId) return 'Sin asignar'
  const m = mesas.value.find(x => x.id === mesaId)
  return m ? `Mesa ${m.numero}` : 'Sin asignar'
}

// Comprueba si una mesa ya tiene reserva activa solapada en ±90 min.
// Devuelve la reserva en conflicto si existe, o null si no.
const VENTANA_RESERVA_MIN = 90
const buscarConflictoReserva = async (
  mesaId: string,
  fechaHora: Date,
  fechaDia: string,
  excluirReservaId?: string
) => {
  if (!localId.value || !mesaId) return null
  const snap = await getDocs(query(
    collection(db, `locales/${localId.value}/reservas`),
    where('fechaDia', '==', fechaDia),
    where('mesaId', '==', mesaId),
    where('estado', 'in', ['pendiente', 'confirmada'])
  ))
  const ventanaMs = VENTANA_RESERVA_MIN * 60 * 1000
  const conflicto = snap.docs.find(d => {
    if (excluirReservaId && d.id === excluirReservaId) return false
    const data = d.data()
    if (!data.fechaHora?.toDate) return false
    const diff = Math.abs(data.fechaHora.toDate().getTime() - fechaHora.getTime())
    return diff < ventanaMs
  })
  return conflicto ? { id: conflicto.id, ...conflicto.data() } as any : null
}

// Valida un email con un patrón básico. Sirve tanto para crear como editar.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const crearReserva = async () => {
  if (!localId.value) return
  const nombre = nuevaReserva.value.nombre.trim()
  const telefono = nuevaReserva.value.telefono.trim()
  const email = nuevaReserva.value.email.trim()
  if (!nombre) return toast.warning('El nombre del cliente es obligatorio.')
  if (!telefono && !email) return toast.warning('Indica un email o un teléfono de contacto.')
  if (email && !EMAIL_RE.test(email)) return toast.warning('El email no tiene un formato válido.')
  if (nuevaReserva.value.personas <= 0) return toast.warning('Indica al menos 1 comensal.')
  if (!nuevaReserva.value.fecha || !nuevaReserva.value.hora) return toast.warning('Fecha y hora son obligatorias.')

  isCreandoReserva.value = true
  try {
    const fechaHora = new Date(`${nuevaReserva.value.fecha}T${nuevaReserva.value.hora}`)

    if (nuevaReserva.value.mesaId) {
      const conflicto = await buscarConflictoReserva(
        nuevaReserva.value.mesaId,
        fechaHora,
        nuevaReserva.value.fecha
      )
      if (conflicto) {
        const horaConflicto = new Date(conflicto.fechaHora.seconds * 1000)
          .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        toast.warning(
          'Mesa ocupada en ese tramo',
          `Ya hay una reserva de "${conflicto.nombre}" a las ${horaConflicto}. Mantén ±${VENTANA_RESERVA_MIN} min de margen o elige otra mesa.`
        )
        return
      }
    }

    const personas = Number(nuevaReserva.value.personas)
    const notas = nuevaReserva.value.notas.trim()
    await addDoc(collection(db, `locales/${localId.value}/reservas`), {
      nombre,
      telefono,
      email,
      personas,
      fechaHora: Timestamp.fromDate(fechaHora),
      fechaDia: nuevaReserva.value.fecha,
      mesaId: nuevaReserva.value.mesaId || '',
      notas,
      estado: 'pendiente',
      creadoEn: Timestamp.now()
    })
    nuevaReserva.value = {
      nombre: '', telefono: '', email: '', personas: 2,
      fecha: nuevaReserva.value.fecha, hora: '20:00',
      mesaId: '', notas: ''
    }

    // Email de confirmación: si falla, la reserva ya está creada — solo avisamos.
    if (email) {
      try {
        const enviado = await enviarEmailReserva(
          { nombre, email, telefono, personas, fechaHora, notas },
          configNegocio.value.nombreNegocio || 'EasyOrder'
        )
        if (enviado) toast.success('Reserva creada', 'Email de confirmación enviado al cliente.')
        else toast.success('Reserva creada')
      } catch {
        toast.warning('Reserva creada', 'Pero no se pudo enviar el email de confirmación.')
      }
    } else {
      toast.success('Reserva creada')
    }
  } catch (e) {
    console.error(e)
    toast.error('No se pudo crear la reserva.')
  } finally {
    isCreandoReserva.value = false
  }
}

const cambiarEstadoReserva = async (id: string, nuevoEstado: Reserva['estado']) => {
  if (!localId.value) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/reservas`, id), { estado: nuevoEstado })
  } catch {
    toast.error('No se pudo actualizar la reserva.')
  }
}

const abrirEditarReserva = (r: Reserva) => {
  reservaEditandoId.value = r.id
  const fechaHora = r.fechaHora?.toDate ? r.fechaHora.toDate() : new Date(r.fechaHora.seconds * 1000)
  reservaEditando.value = {
    nombre: r.nombre,
    telefono: r.telefono ?? '',
    email: r.email ?? '',
    personas: r.personas,
    fecha: r.fechaDia,
    hora: fechaHora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    mesaId: r.mesaId ?? '',
    notas: r.notas ?? ''
  }
  mostrarModalEditarReserva.value = true
}

const guardarEdicionReserva = async () => {
  if (!localId.value || !reservaEditandoId.value) return
  const nombre = reservaEditando.value.nombre.trim()
  const telefono = reservaEditando.value.telefono.trim()
  const email = reservaEditando.value.email.trim()
  if (!nombre) return toast.warning('El nombre del cliente es obligatorio.')
  if (!telefono && !email) return toast.warning('Indica un email o un teléfono de contacto.')
  if (email && !EMAIL_RE.test(email)) return toast.warning('El email no tiene un formato válido.')
  if (reservaEditando.value.personas <= 0) return toast.warning('Indica al menos 1 comensal.')
  if (!reservaEditando.value.fecha || !reservaEditando.value.hora) return toast.warning('Fecha y hora son obligatorias.')

  isGuardandoEdicionReserva.value = true
  try {
    const fechaHora = new Date(`${reservaEditando.value.fecha}T${reservaEditando.value.hora}`)

    if (reservaEditando.value.mesaId) {
      const conflicto = await buscarConflictoReserva(
        reservaEditando.value.mesaId,
        fechaHora,
        reservaEditando.value.fecha,
        reservaEditandoId.value
      )
      if (conflicto) {
        const horaConflicto = new Date(conflicto.fechaHora.seconds * 1000)
          .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        toast.warning(
          'Mesa ocupada en ese tramo',
          `Ya hay reserva de "${conflicto.nombre}" a las ${horaConflicto}.`
        )
        return
      }
    }

    await updateDoc(doc(db, `locales/${localId.value}/reservas`, reservaEditandoId.value), {
      nombre,
      telefono,
      email,
      personas: Number(reservaEditando.value.personas),
      fechaHora: Timestamp.fromDate(fechaHora),
      fechaDia: reservaEditando.value.fecha,
      mesaId: reservaEditando.value.mesaId || '',
      notas: reservaEditando.value.notas.trim() || ''
    })
    mostrarModalEditarReserva.value = false
    toast.success('Reserva actualizada')
  } catch {
    toast.error('No se pudo guardar.')
  } finally {
    isGuardandoEdicionReserva.value = false
  }
}

const eliminarReserva = async (id: string) => {
  if (!localId.value) return
  const ok = await confirmDialog({
    title: 'Eliminar reserva',
    message: 'Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/reservas`, id))
  } catch {
    toast.error('No se pudo eliminar.')
  }
}

// Abre WhatsApp con el mensaje de confirmación ya redactado (envío manual).
const avisarWhatsApp = (r: Reserva) => {
  const fecha = r.fechaHora?.toDate
    ? r.fechaHora.toDate()
    : new Date((r.fechaHora?.seconds ?? 0) * 1000)
  const link = linkWhatsAppReserva(
    { nombre: r.nombre, telefono: r.telefono, personas: r.personas, fechaHora: fecha, notas: r.notas },
    configNegocio.value.nombreNegocio || 'EasyOrder'
  )
  if (!link) return toast.info('Esta reserva no tiene teléfono.')
  window.open(link, '_blank', 'noopener')
}

// ── EXPORTAR (Excel / CSV) ────────────────────────────────────────

const exportandoExcel = ref(false)
const mostrarMenuExport = ref(false)

const formatHora = (fecha: any) =>
  fecha?.seconds
    ? new Date(fecha.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

// Nombre de fichero seguro a partir del nombre del negocio.
const slugNegocio = () =>
  (configNegocio.value.nombreNegocio || 'EasyOrder')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'easyorder'

// Despacha según el formato elegido en el menú desplegable.
const exportarFacturas = (formato: 'excel' | 'csv') => {
  mostrarMenuExport.value = false
  if (formato === 'excel') exportarFacturasExcel()
  else exportarFacturasCSV()
}

// CSV plano de los tickets del día. Separador ';' y BOM para que Excel
// en español lo abra directo en columnas y respete los acentos.
const exportarFacturasCSV = () => {
  if (facturasFiltradas.value.length === 0) {
    return toast.info('No hay facturas para exportar en este día.')
  }
  try {
    const cols = ['Hora', 'Mesa', 'Zona', 'Camarero', 'Método', 'Nº productos', 'Base (€)', `IVA ${TIPO_IVA_PCT}% (€)`, 'Total (€)']
    const filas = facturasFiltradas.value.map(f => {
      const d = desglosarIva(Number(f.total))
      return [
        formatHora(f.fecha),
        f.mesaNumero,
        f.zona || '',
        f.usuarioNombre,
        f.metodoPago,
        (f.items ?? []).reduce((acc: number, i: any) => acc + (Number(i.cantidad) || 0), 0),
        d.base.toFixed(2),
        d.iva.toFixed(2),
        d.total.toFixed(2)
      ]
    })
    const esc = (v: any) => {
      const s = String(v ?? '')
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [cols, ...filas].map(fila => fila.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugNegocio()}-cierre-${filtroFecha.value}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV descargado')
  } catch (e) {
    console.error('Export CSV:', e)
    toast.error('No se pudo generar el CSV.')
  }
}

const exportarFacturasExcel = async () => {
  if (facturasFiltradas.value.length === 0) {
    return toast.info('No hay facturas para exportar en este día.')
  }
  exportandoExcel.value = true
  try {
    // Carga dinámica: solo se descarga la librería cuando se pulsa el botón.
    const XLSX = await import('xlsx-js-style')
    const { utils, writeFile } = XLSX

    // ── Paleta y estilos reutilizables ────────────────────────────
    // Usamos el color del negocio para el banner; si no está, el morado por defecto.
    const acento = (configNegocio.value.colorAcento || '#4F46E5').replace('#', '').toUpperCase()

    const styleTitle = {
      font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: acento } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const styleSubtitle = {
      font: { italic: true, sz: 11, color: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const styleHeader = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top:    { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left:   { style: 'thin', color: { rgb: 'CBD5E1' } },
        right:  { style: 'thin', color: { rgb: 'CBD5E1' } },
      }
    }
    const borderThin = {
      top:    { style: 'thin', color: { rgb: 'F1F5F9' } },
      bottom: { style: 'thin', color: { rgb: 'F1F5F9' } },
      left:   { style: 'thin', color: { rgb: 'F1F5F9' } },
      right:  { style: 'thin', color: { rgb: 'F1F5F9' } },
    }
    const styleText  = { font: { sz: 10, color: { rgb: '0F172A' } }, alignment: { vertical: 'center' }, border: borderThin }
    const styleCenter = { ...styleText, alignment: { horizontal: 'center', vertical: 'center' } }
    const styleMoney = { ...styleText, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00 "€"' }
    const styleInt    = { ...styleCenter, numFmt: '0' }
    const styleLabelKpi = { ...styleText, font: { ...styleText.font, bold: true } }

    // Helper: aplica un estilo a un rango rectangular de celdas (las crea si no existen)
    const applyStyle = (ws: any, r1: number, c1: number, r2: number, c2: number, style: any) => {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const addr = utils.encode_cell({ r, c })
          if (!ws[addr]) ws[addr] = { v: '', t: 's' }
          ws[addr].s = { ...(ws[addr].s ?? {}), ...style }
        }
      }
    }

    const wb = utils.book_new()
    const negocioNombre = configNegocio.value.nombreNegocio || 'EasyOrder'
    const fechaLegible  = new Date(filtroFecha.value + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    })

    // ══════════════════════════════════════════════════════════════
    // HOJA 1 — RESUMEN
    // ══════════════════════════════════════════════════════════════
    {
      const ws = utils.aoa_to_sheet([
        ['Cierre de Caja'],                             // 0: título
        [`${negocioNombre} — ${fechaLegible}`],         // 1: subtítulo
        [],                                             // 2: separador
        ['Total recaudado',          totalVentas.value],      // 3
        [`Base imponible`,           desgloseCaja.value.base], // 4
        [`IVA (${TIPO_IVA_PCT}%)`,   desgloseCaja.value.iva],  // 5
        ['Efectivo',                 totalEfectivo.value],    // 6
        ['Tarjeta',                  totalTarjeta.value],     // 7
        ['Ticket medio',             ticketMedio.value],      // 8
        ['Nº de pedidos',            numeroPedidos.value],    // 9
      ])
      ws['!cols']   = [{ wch: 28 }, { wch: 22 }]
      ws['!rows']   = [{ hpt: 32 }, { hpt: 20 }]
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      ]
      applyStyle(ws, 0, 0, 0, 1, styleTitle)
      applyStyle(ws, 1, 0, 1, 1, styleSubtitle)
      applyStyle(ws, 3, 0, 9, 0, styleLabelKpi)
      applyStyle(ws, 3, 1, 8, 1, styleMoney)
      applyStyle(ws, 9, 1, 9, 1, styleInt)
      utils.book_append_sheet(wb, ws, 'Resumen')
    }

    // ══════════════════════════════════════════════════════════════
    // HOJA 2 — TICKETS (una fila por factura)
    // ══════════════════════════════════════════════════════════════
    {
      const cols  = ['Hora', 'Mesa', 'Zona', 'Camarero', 'Método', 'Nº productos', 'Base', `IVA (${TIPO_IVA_PCT}%)`, 'Total']
      const rows  = facturasFiltradas.value.map(f => {
        const d = desglosarIva(Number(f.total))
        return [
          formatHora(f.fecha),
          f.mesaNumero,
          f.zona || '',
          f.usuarioNombre,
          f.metodoPago,
          (f.items ?? []).reduce((acc: number, i: any) => acc + (Number(i.cantidad) || 0), 0),
          d.base,
          d.iva,
          d.total
        ]
      })
      const ws = utils.aoa_to_sheet([
        ['Tickets del día'],
        [`${negocioNombre} — ${fechaLegible}`],
        [],
        cols,
        ...rows
      ])
      ws['!cols']   = [{ wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
      ws['!rows']   = [{ hpt: 32 }, { hpt: 20 }, { hpt: 8 }, { hpt: 24 }]
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
      ]
      applyStyle(ws, 0, 0, 0, cols.length - 1, styleTitle)
      applyStyle(ws, 1, 0, 1, cols.length - 1, styleSubtitle)
      applyStyle(ws, 3, 0, 3, cols.length - 1, styleHeader)
      // Datos: alineación según columna
      const last = 3 + rows.length
      applyStyle(ws, 4, 0, last, 0, styleCenter)  // Hora
      applyStyle(ws, 4, 1, last, 1, styleCenter)  // Mesa
      applyStyle(ws, 4, 2, last, 2, styleText)    // Zona
      applyStyle(ws, 4, 3, last, 3, styleText)    // Camarero
      applyStyle(ws, 4, 4, last, 4, styleCenter)  // Método
      applyStyle(ws, 4, 5, last, 5, styleInt)     // Nº productos
      applyStyle(ws, 4, 6, last, 6, styleMoney)   // Base
      applyStyle(ws, 4, 7, last, 7, styleMoney)   // IVA
      applyStyle(ws, 4, 8, last, 8, styleMoney)   // Total
      utils.book_append_sheet(wb, ws, 'Tickets')
    }

    // ══════════════════════════════════════════════════════════════
    // HOJA 3 — DETALLE (una fila por línea)
    // ══════════════════════════════════════════════════════════════
    {
      const cols = ['Hora', 'Mesa', 'Camarero', 'Producto', 'Cantidad', 'Precio Unit', 'Subtotal']
      const rows: any[][] = []
      for (const f of facturasFiltradas.value) {
        const hora = formatHora(f.fecha)
        for (const item of (f.items ?? [])) {
          const subtotal = item.subtotal ?? (Number(item.precio) * Number(item.cantidad))
          rows.push([
            hora,
            f.mesaNumero,
            f.usuarioNombre,
            item.nombre,
            Number(item.cantidad),
            Number(item.precio),
            Number(subtotal)
          ])
        }
      }
      const ws = utils.aoa_to_sheet([
        ['Detalle de productos vendidos'],
        [`${negocioNombre} — ${fechaLegible}`],
        [],
        cols,
        ...rows
      ])
      ws['!cols']   = [{ wch: 10 }, { wch: 8 }, { wch: 24 }, { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
      ws['!rows']   = [{ hpt: 32 }, { hpt: 20 }, { hpt: 8 }, { hpt: 24 }]
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
      ]
      applyStyle(ws, 0, 0, 0, cols.length - 1, styleTitle)
      applyStyle(ws, 1, 0, 1, cols.length - 1, styleSubtitle)
      applyStyle(ws, 3, 0, 3, cols.length - 1, styleHeader)
      const last = 3 + rows.length
      applyStyle(ws, 4, 0, last, 0, styleCenter)
      applyStyle(ws, 4, 1, last, 1, styleCenter)
      applyStyle(ws, 4, 2, last, 2, styleText)
      applyStyle(ws, 4, 3, last, 3, styleText)
      applyStyle(ws, 4, 4, last, 4, styleInt)
      applyStyle(ws, 4, 5, last, 5, styleMoney)
      applyStyle(ws, 4, 6, last, 6, styleMoney)
      utils.book_append_sheet(wb, ws, 'Detalle')
    }

    writeFile(wb, `${slugNegocio()}-cierre-${filtroFecha.value}.xlsx`)
    toast.success('Excel descargado')
  } catch (e) {
    console.error('Export Excel:', e)
    toast.error('No se pudo generar el Excel.')
  } finally {
    exportandoExcel.value = false
  }
}
</script>

<template>
  <div class="admin-layout">

    <!-- ── SIDEBAR ── -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-logo">
          <img v-if="configNegocio.logoUrl" :src="configNegocio.logoUrl" class="sidebar-logo-img" alt="Logo" />
          <div v-else class="sidebar-logo-placeholder" :style="{ background: configNegocio.colorAcento || '#4f46e5' }">
            {{ configNegocio.nombreNegocio?.charAt(0) || 'E' }}
          </div>
        </div>
        <div class="sidebar-brand-texts">
          <h2>{{ configNegocio.nombreNegocio || 'EasyOrder' }}</h2>
          <span class="admin-tag" :style="{ background: configNegocio.colorAcento || '#4f46e5' }">Admin</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button :class="{ active: currentTab === 'finanzas' }"  @click="currentTab = 'finanzas'">💰 Finanzas</button>
        <button :class="{ active: currentTab === 'mesas' }"     @click="currentTab = 'mesas'">🪑 Sala</button>
        <button :class="{ active: currentTab === 'reservas' }"  @click="currentTab = 'reservas'">📅 Reservas</button>
        <button :class="{ active: currentTab === 'productos' }" @click="currentTab = 'productos'">🍔 Menú</button>
        <button :class="{ active: currentTab === 'inventario' }" @click="currentTab = 'inventario'">📦 Inventario</button>
        <button :class="{ active: currentTab === 'usuarios' }"  @click="currentTab = 'usuarios'">👥 Empleados</button>
        <button :class="{ active: currentTab === 'negocio' }"   @click="currentTab = 'negocio'">🏢 Mi Negocio</button>
      </nav>

      <div class="sidebar-footer">
        
        <div class="sidebar-powered">
          <PoweredByEasyOrder compact tone="dark" />
        </div>
        <button class="btn-logout" @click="handleLogout">⬅ Cerrar sesión</button>
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
            <div class="export-dropdown">
              <button
                class="btn-export-excel"
                :disabled="exportandoExcel || facturasFiltradas.length === 0"
                @click="mostrarMenuExport = !mostrarMenuExport"
                title="Descargar las facturas filtradas"
              >
                {{ exportandoExcel ? 'Generando...' : '⬇ Exportar' }}
                <span class="export-caret">▾</span>
              </button>
              <template v-if="mostrarMenuExport">
                <div class="export-backdrop" @click="mostrarMenuExport = false"></div>
                <div class="export-menu">
                  <button @click="exportarFacturas('excel')">📊 Excel (.xlsx)</button>
                  <button @click="exportarFacturas('csv')">📄 CSV (.csv)</button>
                </div>
              </template>
            </div>
          </div>
        </div>

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
          <div class="kpi-card">
            <span class="kpi-title">🧾 Base Imponible</span>
            <span class="kpi-value">{{ desgloseCaja.base.toFixed(2) }} €</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">🏛️ IVA ({{ TIPO_IVA_PCT }}%)</span>
            <span class="kpi-value">{{ desgloseCaja.iva.toFixed(2) }} €</span>
          </div>
        </div>

        <div class="tabs-zone-admin">
          <button :class="{ active: finanzasSubTab === 'tickets' }"     @click="finanzasSubTab = 'tickets'">🧾 Registro de Tickets</button>
          <button :class="{ active: finanzasSubTab === 'rendimiento' }" @click="finanzasSubTab = 'rendimiento'">👥 Rendimiento Empleados</button>
        </div>

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
            <div v-for="f in facturasFiltradas" :key="f.id" class="factura-card" @click="abrirDetalleFactura(f)">
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

        <div v-if="finanzasSubTab === 'rendimiento'" class="card-container">
          <div v-if="ventasPorEmpleado.length === 0" class="empty-state-box">No hay datos de ventas para este día.</div>
          <div v-else class="rendimiento-lista">
            <div v-for="(emp, i) in ventasPorEmpleado" :key="emp.nombre" class="rendimiento-row">
              <div class="rank-badge">{{ i + 1 }}</div>
              <div class="empleado-info">
                <span class="empleado-nombre">{{ emp.nombre }}</span>
                <span class="empleado-pedidos">{{ emp.pedidos }} pedido{{ emp.pedidos !== 1 ? 's' : '' }}</span>
              </div>
              <div class="barra-progreso-wrapper">
                <div class="barra-progreso" :style="{ width: `${(emp.total / totalVentas) * 100}%` }"></div>
              </div>
              <span class="rendimiento-total">{{ emp.total.toFixed(2) }} €</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: SALA ══ -->
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
            v-for="z in zonas" :key="z.id"
            :class="{ active: zonaActiva === z.nombre }"
            @click="zonaActiva = z.nombre; mesaSeleccionada = null"
          >
            {{ z.icono }} {{ z.nombre }}
          </button>
          <button class="btn-gestionar-zonas" @click="mostrarModalZonas = true">⚙️ Gestionar Zonas</button>
        </div>

        <FloorEditor
          v-if="zonas.length > 0 && localId && zonas.find(z => z.nombre === zonaActiva)?.id"
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
            <button class="btn-gestionar-zonas" @click="mostrarModalCategorias = true">⚙️ Gestionar Categorías</button>
          </div>
        </div>

        <div class="dos-columnas">
          <div class="form-card">
            <h3 class="form-card-title">{{ editandoProductoId ? 'Editar plato' : 'Nuevo plato' }}</h3>
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
                <label>Stock inicial (unidades)</label>
                <input type="number" v-model.number="nuevoProducto.stock" step="1" min="0">
              </div>
              <div class="field-group">
                <label>Categoría</label>
                <select v-model="nuevoProducto.category">
                  <option v-for="cat in categorias" :key="cat.id" :value="cat.nombre">{{ cat.icono }} {{ cat.nombre }}</option>
                </select>
              </div>
              <div class="field-group">
                <label>Icono y foto</label>
                <div class="producto-media-controls">
                  <div class="emoji-selector-container">
                    <button type="button" class="btn-emoji" @click="mostrarSelectorProducto = !mostrarSelectorProducto">
                      <span class="emoji-preview">{{ nuevoProducto.icon }}</span>
                      <span>Cambiar icono</span>
                    </button>
                    <div v-if="mostrarSelectorProducto" class="picker-popup">
                      <EmojiPicker :native="true" theme="light" @select="onSelectEmojiProducto" />
                    </div>
                  </div>
                  <label class="btn-upload-photo" :class="{ loading: subiendoFotoProducto }">
                    <input type="file" accept="image/*" @change="subirFotoProducto">
                    <span>{{ subiendoFotoProducto ? 'Subiendo...' : 'Agregar foto' }}</span>
                  </label>
                </div>
                <div v-if="nuevoProducto.imageUrl" class="producto-photo-preview">
                  <img :src="nuevoProducto.imageUrl" alt="Vista previa">
                  <button type="button" class="btn-remove-photo" @click="quitarFotoProducto">Quitar foto</button>
                </div>
                <p v-else class="field-hint">Opcional. Imagen para la carta digital.</p>
              </div>

              <!-- ── TOGGLE SIRVE CAMARERO ── -->
              <div class="field-group">
                <label>Destino del pedido</label>
                <div class="toggle-row">
                  <div class="toggle-info">
                    <span class="toggle-label">{{ nuevoProducto.sirveCamarero ? '🍺 Sirve el camarero' : '👨‍🍳 Va a cocina' }}</span>
                    <span class="toggle-desc">{{ nuevoProducto.sirveCamarero ? 'El camarero lo prepara y sirve directamente' : 'Se envía al panel de cocina' }}</span>
                  </div>
                  <button
                    type="button"
                    class="toggle-switch"
                    :class="{ active: nuevoProducto.sirveCamarero }"
                    @click="nuevoProducto.sirveCamarero = !nuevoProducto.sirveCamarero"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
              </div>

              <!-- ── TOGGLE RECOMENDADO DE LA CASA ── -->
              <div class="field-group">
                <label>Destacar en la carta</label>
                <div class="toggle-row">
                  <div class="toggle-info">
                    <span class="toggle-label">{{ nuevoProducto.recomendado ? '⭐ Recomendado de la casa' : 'Plato normal' }}</span>
                    <span class="toggle-desc">{{ nuevoProducto.recomendado ? 'Aparecerá destacado para el cliente' : 'Sin distintivo en la carta' }}</span>
                  </div>
                  <button
                    type="button"
                    class="toggle-switch"
                    :class="{ active: nuevoProducto.recomendado }"
                    @click="nuevoProducto.recomendado = !nuevoProducto.recomendado"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
              </div>

              <div class="form-actions-stacked">
                <button @click="guardarProducto" class="btn-primary btn-full">
                  {{ editandoProductoId ? 'Guardar cambios' : '+ Guardar en el Menú' }}
                </button>
                <button v-if="editandoProductoId" @click="resetProductoForm" class="btn-secondary btn-full">Cancelar edición</button>
              </div>
            </div>
          </div>

          <div class="lista-card carta-card">
            <div class="carta-title-row">
              <div>
                <h3 class="form-card-title">Carta actual</h3>
                <p class="carta-subtitle">Vista organizada por categorías</p>
              </div>
              <span class="carta-total">{{ productos.length }} platos</span>
            </div>
            <div v-if="productos.length === 0" class="empty-state-box">No hay productos todavía.</div>
            <div v-for="(platos, categoria) in productosPorCategoria" :key="categoria" class="categoria-grupo">
              <div class="categoria-header">
                <div class="categoria-visual">
                  <img v-if="obtenerCategoria(categoria)?.imageUrl" :src="obtenerCategoria(categoria)?.imageUrl" :alt="categoria" class="categoria-thumb">
                  <span v-else class="categoria-icono">{{ obtenerCategoria(categoria)?.icono ?? '🍽️' }}</span>
                </div>
                <span class="categoria-nombre">{{ categoria }}</span>
                <span class="categoria-count">{{ platos.length }}</span>
              </div>
              <div class="menu-platos-grid">
                <div v-for="p in platos" :key="p.id" class="menu-plato-card">
                  <div class="menu-plato-media">
                    <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.name" class="menu-plato-photo">
                    <span v-else class="menu-plato-icon">{{ p.icon }}</span>
                  </div>
                  <div class="menu-plato-info">
                    <span class="menu-plato-name">{{ p.name }}</span>
                    <span class="menu-plato-category">
                      {{ categoria }}
                      <span v-if="p.sirveCamarero" class="badge-camarero">🍺 Camarero</span>
                      <span v-if="p.recomendado" class="badge-recomendado">⭐ Recomendado</span>
                    </span>
                  </div>
                  <div class="menu-plato-footer">
                    <span class="menu-plato-price">{{ Number(p.price).toFixed(2) }}€</span>
                    <div class="item-actions">
                      <button class="btn-editar" @click="editarProducto(p)" title="Editar">✎</button>
                      <button class="btn-eliminar" @click="eliminarProducto(p.id, p.name)" title="Eliminar">✕</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: INVENTARIO ══ -->
      <div v-if="currentTab === 'inventario'">
        <div class="page-header">
          <div>
            <h1>Inventario</h1>
            <p class="page-subtitle">
              {{ productos.length }} producto{{ productos.length !== 1 ? 's' : '' }}
              · <span class="inv-stat bajo">{{ productosStockBajo }} con stock bajo</span>
              · <span class="inv-stat cero">{{ productosAgotados }} agotado{{ productosAgotados !== 1 ? 's' : '' }}</span>
            </p>
          </div>
          <div class="controls">
            <input v-model="filtroInventario" class="input-date" placeholder="🔍 Buscar producto..." style="width: 220px;">
          </div>
        </div>

        <div v-if="productos.length === 0" class="empty-state-box">
          No hay productos todavía. Créalos en la pestaña Menú.
        </div>

        <div v-else class="lista-card">
          <div v-if="productosInventario.length === 0" class="empty-state-box">
            Ningún producto coincide con la búsqueda.
          </div>
          <div v-else class="inventario-grid">
            <div v-for="p in productosInventario" :key="p.id" class="inv-row">
              <span class="inv-icon">
                <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.name">
                <span v-else>{{ p.icon || '🍽️' }}</span>
              </span>
              <div class="inv-info">
                <strong>{{ p.name }}</strong>
                <small>{{ p.category }}</small>
              </div>
              <span class="inv-actual" :class="estadoStock(p)">
                {{ Number(p.stock) || 0 }} ud.
              </span>
              <div class="inv-editor">
                <button class="inv-step" @click="ajustarStockEdit(p.id, -1)" aria-label="Restar">−</button>
                <input type="number" min="0" class="inv-input" v-model.number="stockEdit[p.id]">
                <button class="inv-step" @click="ajustarStockEdit(p.id, 1)" aria-label="Sumar">+</button>
              </div>
              <button
                class="btn-primary inv-save"
                :disabled="!stockSinGuardar(p)"
                @click="guardarStock(p)"
              >Guardar</button>
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
          <div class="columna-izq">
            <div class="form-card">
              <h3 class="form-card-title">🔑 Nueva invitación</h3>
              <p class="form-hint">El empleado usará el código en <strong>/register</strong> para activar su cuenta.</p>
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
              <div v-if="invitaciones.length === 0" class="empty-state-box" style="margin-top: 12px;">No hay invitaciones todavía.</div>
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

          <div class="lista-card">
            <h3 class="form-card-title">👥 Equipo registrado</h3>

            <div class="filtros-rol">
              <button :class="{ active: filtroRol === 'todos' }"    @click="filtroRol = 'todos'">Todos</button>
              <button :class="{ active: filtroRol === 'admin' }"    @click="filtroRol = 'admin'">Admins</button>
              <button :class="{ active: filtroRol === 'camarero' }" @click="filtroRol = 'camarero'">Camareros</button>
              <button :class="{ active: filtroRol === 'cocinero' }" @click="filtroRol = 'cocinero'">Cocineros</button>
            </div>

            <div class="filtros-rol" style="margin-top: 8px; margin-bottom: 20px;">
              <button :class="{ active: filtroEstado === 'todos' }"    @click="filtroEstado = 'todos'">Todos</button>
              <button :class="{ active: filtroEstado === 'activo' }"   @click="filtroEstado = 'activo'">● Activos</button>
              <button :class="{ active: filtroEstado === 'inactivo' }" @click="filtroEstado = 'inactivo'">○ Inactivos</button>
            </div>

            <div v-if="empleadosFiltrados.length === 0" class="empty-state-box">
              No hay empleados con este filtro.
            </div>

            <div v-else class="empleados-list">
              <div v-for="emp in empleadosFiltrados" :key="emp.id" class="empleado-row">
                <div class="empleado-avatar">{{ emp.nombre?.charAt(0).toUpperCase() ?? '?' }}</div>
                <div class="item-info">
                  <span class="item-name">{{ emp.nombre }}</span>
                  <span class="item-sub">{{ emp.email }}</span>
                </div>
                <span class="rol-badge" :class="emp.rol">{{ emp.rol }}</span>
                <button class="activo-toggle" :class="emp.activo ? 'activo' : 'inactivo'" @click="toggleEstadoEmpleado(emp.id, emp.activo)">
                  {{ emp.activo ? '● Activo' : '○ Inactivo' }}
                </button>
                <button class="btn-eliminar" @click="eliminarEmpleado(emp.id, emp.nombre)">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: RESERVAS ══ -->
      <div v-if="currentTab === 'reservas'">
        <div class="page-header">
          <div>
            <h1>Reservas</h1>
            <p class="page-subtitle">{{ reservasFiltradas.length }} reserva{{ reservasFiltradas.length !== 1 ? 's' : '' }} en este día</p>
          </div>
          <div class="controls">
            <input type="date" v-model="filtroFechaReservas" class="input-date">
          </div>
        </div>

        <div class="dos-columnas">
          <div class="form-card">
            <h3 class="form-card-title">📅 Nueva reserva</h3>
            <div class="form-fields">
              <div class="field-group">
                <label>Cliente</label>
                <input v-model="nuevaReserva.nombre" placeholder="Ej: María García">
              </div>
              <div class="reserva-row">
                <div class="field-group" style="flex: 1;">
                  <label>Teléfono</label>
                  <input v-model="nuevaReserva.telefono" placeholder="612 345 678">
                </div>
                <div class="field-group" style="flex: 1;">
                  <label>Email</label>
                  <input v-model="nuevaReserva.email" type="email" placeholder="cliente@email.com">
                </div>
              </div>
              <p class="contacto-hint">📩 Indica teléfono o email (al menos uno) — el cliente recibirá la confirmación.</p>
              <div class="reserva-row">
                <div class="field-group" style="flex: 1;">
                  <label>Personas</label>
                  <input type="number" min="1" max="50" v-model.number="nuevaReserva.personas">
                </div>
                <div class="field-group" style="flex: 1;">
                  <label>Fecha</label>
                  <input type="date" v-model="nuevaReserva.fecha">
                </div>
                <div class="field-group" style="flex: 1;">
                  <label>Hora</label>
                  <input type="time" v-model="nuevaReserva.hora">
                </div>
              </div>
              <div class="field-group">
                <label>Mesa asignada (opcional)</label>
                <select v-model="nuevaReserva.mesaId">
                  <option value="">Sin asignar</option>
                  <option v-for="m in mesas" :key="m.id" :value="m.id">
                    Mesa {{ m.numero }} {{ m.zona ? `(${m.zona})` : '' }}
                  </option>
                </select>
              </div>
              <div class="field-group">
                <label>Notas (opcional)</label>
                <input v-model="nuevaReserva.notas" placeholder="Ej: cumpleaños, alergia al gluten...">
              </div>
              <button class="btn-primary btn-full" @click="crearReserva" :disabled="isCreandoReserva">
                {{ isCreandoReserva ? 'Creando...' : '+ Guardar reserva' }}
              </button>
            </div>
          </div>

          <div class="lista-card">
            <div class="card-header-row">
              <h3 class="form-card-title" style="margin-bottom: 0;">Reservas del día</h3>
            </div>

            <div class="filtros-rol" style="margin-top: 12px; margin-bottom: 18px;">
              <button :class="{ active: filtroEstadoReserva === 'todas' }"     @click="filtroEstadoReserva = 'todas'">Todas</button>
              <button :class="{ active: filtroEstadoReserva === 'pendiente' }" @click="filtroEstadoReserva = 'pendiente'">⏳ Pendientes</button>
              <button :class="{ active: filtroEstadoReserva === 'confirmada' }" @click="filtroEstadoReserva = 'confirmada'">✓ Confirmadas</button>
              <button :class="{ active: filtroEstadoReserva === 'cumplida' }"  @click="filtroEstadoReserva = 'cumplida'">🍽️ Cumplidas</button>
              <button :class="{ active: filtroEstadoReserva === 'cancelada' }" @click="filtroEstadoReserva = 'cancelada'">✕ Canceladas</button>
            </div>

            <div v-if="reservasFiltradas.length === 0" class="empty-state-box">
              No hay reservas en este filtro.
            </div>

            <div v-else class="reservas-grid">
              <div v-for="r in reservasFiltradas" :key="r.id" class="reserva-card" :class="[`reserva-${r.estado}`, { 'reserva-vencida': esReservaVencida(r) }]">
                <div class="reserva-hora">
                  <span class="reserva-hora-num">{{ horaReserva(r) }}</span>
                  <span class="reserva-personas">👥 {{ r.personas }}</span>
                </div>
                <div class="reserva-info">
                  <div class="reserva-nombre">{{ r.nombre }}</div>
                  <div class="reserva-meta">
                    <span class="reserva-mesa">{{ nombreMesa(r.mesaId) }}</span>
                    <span v-if="r.telefono" class="reserva-tel">📞 {{ r.telefono }}</span>
                  </div>
                  <div v-if="r.notas" class="reserva-notas">⚠ {{ r.notas }}</div>
                </div>
                <span v-if="esReservaVencida(r)" class="reserva-estado-badge vencida">⌛ Vencida</span>
                <span v-else class="reserva-estado-badge" :class="r.estado">
                  {{
                    r.estado === 'pendiente' ? 'Pendiente' :
                    r.estado === 'confirmada' ? 'Confirmada' :
                    r.estado === 'cumplida' ? 'Cumplida' : 'Cancelada'
                  }}
                </span>
                <div class="reserva-actions">
                  <button v-if="r.telefono" class="r-btn whatsapp" @click="avisarWhatsApp(r)" title="Avisar por WhatsApp">💬</button>
                  <button class="r-btn edit" @click="abrirEditarReserva(r)" title="Editar">✏️</button>
                  <button v-if="r.estado === 'pendiente'" class="r-btn confirm" @click="cambiarEstadoReserva(r.id, 'confirmada')" title="Confirmar">✓</button>
                  <button v-if="r.estado === 'confirmada'" class="r-btn cumplida" @click="cambiarEstadoReserva(r.id, 'cumplida')" title="Marcar cumplida">🍽️</button>
                  <button v-if="r.estado !== 'cancelada' && r.estado !== 'cumplida'" class="r-btn cancel" @click="cambiarEstadoReserva(r.id, 'cancelada')" title="Cancelar">✕</button>
                  <button v-if="r.estado === 'cancelada' || r.estado === 'cumplida'" class="r-btn delete" @click="eliminarReserva(r.id)" title="Eliminar del historial">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ TAB: MI NEGOCIO ══ -->
      <div v-if="currentTab === 'negocio'">
        <div class="page-header">
          <div>
            <h1>Identidad del Negocio</h1>
            <p class="page-subtitle">Personaliza cómo aparece tu negocio en EasyOrder</p>
          </div>
        </div>

        <div class="dos-columnas">
          <div class="form-card">
            <h3 class="form-card-title">⚙️ Configuración</h3>
            <div class="form-fields">

              <div class="field-group">
                <label>Nombre del negocio</label>
                <input v-model="configEditando.nombreNegocio" placeholder="Ej: Bar Scarlatti" />
              </div>

              <div class="field-group">
                <label>Logo del negocio</label>
                <div class="logo-upload-area">
                  <img v-if="configEditando.logoUrl" :src="configEditando.logoUrl" class="logo-preview" alt="Logo" />
                  <div v-else class="logo-placeholder"><span>Sin logo</span></div>
                  <label class="btn-upload-logo" :class="{ loading: subiendoLogo }">
                    {{ subiendoLogo ? 'Subiendo...' : '📤 Subir imagen' }}
                    <input type="file" accept="image/*" style="display:none" @change="subirLogo" :disabled="subiendoLogo" />
                  </label>
                  <p class="upload-hint">PNG, JPG o SVG · Máx 2MB</p>
                </div>
              </div>

              <div class="field-group">
                <label>Color principal</label>
                <div class="color-picker-row">
                  <input type="color" v-model="configEditando.colorAcento" class="color-input" />
                  <span class="color-value">{{ configEditando.colorAcento }}</span>
                  <div class="color-preview-pill" :style="{ background: configEditando.colorAcento }">Aa</div>
                </div>
                <div class="color-presets">
                  <button
                    v-for="color in COLORES_PRESET" :key="color"
                    class="color-preset-btn"
                    :style="{ background: color }"
                    :class="{ active: configEditando.colorAcento === color }"
                    @click="configEditando.colorAcento = color"
                    :title="color"
                  />
                </div>
              </div>

              <button class="btn-primary btn-full" @click="guardarConfig" :disabled="guardandoConfig">
                {{ guardandoConfig ? 'Guardando...' : '✓ Guardar configuración' }}
              </button>
            </div>
          </div>

          <div class="lista-card">
            <h3 class="form-card-title">👁 Vista previa</h3>
            <p class="form-hint" style="margin-bottom: 20px;">Así se verá tu negocio en distintas pantallas con el color elegido.</p>

            <!-- ── MOCK 1: Sidebar camarero ── -->
            <p class="prev-label">Sidebar de sala</p>
            <div class="preview-sidebar">
              <div class="preview-brand" :style="{ borderBottomColor: configEditando.colorAcento }">
                <img v-if="configEditando.logoUrl" :src="configEditando.logoUrl" class="preview-logo" alt="Logo" />
                <div v-else class="preview-logo-placeholder" :style="{ background: configEditando.colorAcento }">
                  {{ configEditando.nombreNegocio?.charAt(0) || '?' }}
                </div>
                <div>
                  <div class="preview-nombre">{{ configEditando.nombreNegocio || 'Tu negocio' }}</div>
                  <div class="preview-powered">powered by EasyOrder</div>
                </div>
              </div>
              <div class="preview-nav">
                <div class="preview-nav-item" :style="{ background: configEditando.colorAcento }">🪑 Sala</div>
                <div class="preview-nav-item-inactive">📊 Resumen</div>
                <div class="preview-nav-item-inactive">🔔 Pedidos</div>
              </div>
            </div>

            <!-- ── MOCK 2: Pestañas de zona + mapa con mesas ── -->
            <p class="prev-label">Mapa de sala</p>
            <div class="prev-mapa">
              <div class="prev-zona-tabs">
                <span class="prev-zona-tab active" :style="{ background: configEditando.colorAcento }">🛋️ Salón</span>
                <span class="prev-zona-tab">☀️ Terraza</span>
                <span class="prev-zona-tab">🍺 Barra</span>
              </div>
              <div class="prev-mesas">
                <div class="prev-mesa available">
                  <span class="prev-mesa-num">1</span>
                  <span class="prev-mesa-label">Libre</span>
                </div>
                <div class="prev-mesa occupied" :style="{ borderColor: configEditando.colorAcento }">
                  <span class="prev-mesa-num" :style="{ color: configEditando.colorAcento }">2</span>
                  <span class="prev-mesa-label" :style="{ color: configEditando.colorAcento }">Ocupada</span>
                </div>
                <div class="prev-mesa available">
                  <span class="prev-mesa-num">3</span>
                  <span class="prev-mesa-label">Libre</span>
                </div>
              </div>
            </div>

            <!-- ── MOCK 3: Componentes UI (botones, badges) ── -->
            <p class="prev-label">Botones y elementos UI</p>
            <div class="prev-componentes">
              <button class="prev-btn-primary" :style="{ background: configEditando.colorAcento }">Enviar a cocina</button>
              <span class="prev-chip" :style="{ background: `${configEditando.colorAcento}18`, color: configEditando.colorAcento, borderColor: `${configEditando.colorAcento}40` }">
                Activo
              </span>
              <span class="prev-precio" :style="{ color: configEditando.colorAcento }">12,50 €</span>
            </div>

            <!-- ── MOCK 4: Toast de confirmación ── -->
            <p class="prev-label">Notificación de éxito</p>
            <div class="prev-toast">
              <span class="prev-toast-icon" :style="{ background: configEditando.colorAcento }">✓</span>
              <div class="prev-toast-body">
                <strong>Pedido enviado</strong>
                <span>Mesa 4 — 3 productos</span>
              </div>
            </div>

            <!-- ── MOCK 5: Barra de cocina ── -->
            <p class="prev-label">Barra superior de cocina</p>
            <div class="preview-cocina-bar" :style="{ borderBottomColor: configEditando.colorAcento }">
              <div class="preview-cocina-left">
                <img v-if="configEditando.logoUrl" :src="configEditando.logoUrl" class="preview-logo-sm" alt="Logo" />
                <div v-else class="preview-logo-sm-placeholder" :style="{ background: configEditando.colorAcento }">
                  {{ configEditando.nombreNegocio?.charAt(0) || '?' }}
                </div>
                <span class="preview-cocina-nombre">{{ configEditando.nombreNegocio || 'Tu negocio' }}</span>
              </div>
              <span class="preview-cocina-role">Cocina</span>
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
              <h2>{{ configNegocio.nombreNegocio || 'EasyOrder' }}</h2>
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
            <div class="ticket-iva-row-admin">
              <span>Base imponible</span>
              <span>{{ desgloseFacturaSel.base.toFixed(2) }}€</span>
            </div>
            <div class="ticket-iva-row-admin">
              <span>IVA ({{ TIPO_IVA_PCT }}%)</span>
              <span>{{ desgloseFacturaSel.iva.toFixed(2) }}€</span>
            </div>
            <div class="ticket-total-row">
              <span>TOTAL</span>
              <span>{{ facturaSeleccionada.total.toFixed(2) }}€</span>
            </div>
            <p class="ticket-info muted" style="text-align:right; margin-top: 6px;">Método: {{ facturaSeleccionada.metodoPago }}</p>
          </div>
          <button class="btn-primary btn-full" style="border-radius: 0 0 14px 14px;" @click="mostrarModalDetalleFactura = false">Cerrar</button>
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

    <!-- ══ MODAL: EDITAR RESERVA ══ -->
    <transition name="fade">
      <div v-if="mostrarModalEditarReserva" class="modal-backdrop" @click.self="mostrarModalEditarReserva = false">
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2>Editar reserva</h2>
            <button class="btn-close" @click="mostrarModalEditarReserva = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-fields">
              <div class="field-group">
                <label>Cliente</label>
                <input v-model="reservaEditando.nombre" placeholder="Ej: María García">
              </div>
              <div class="reserva-row">
                <div class="field-group" style="flex: 1;">
                  <label>Teléfono</label>
                  <input v-model="reservaEditando.telefono" placeholder="612 345 678">
                </div>
                <div class="field-group" style="flex: 1;">
                  <label>Email</label>
                  <input v-model="reservaEditando.email" type="email" placeholder="cliente@email.com">
                </div>
              </div>
              <p class="contacto-hint">📩 Indica teléfono o email (al menos uno).</p>
              <div class="reserva-row">
                <div class="field-group">
                  <label>Personas</label>
                  <input type="number" min="1" max="50" v-model.number="reservaEditando.personas">
                </div>
                <div class="field-group">
                  <label>Fecha</label>
                  <input type="date" v-model="reservaEditando.fecha">
                </div>
                <div class="field-group">
                  <label>Hora</label>
                  <input type="time" v-model="reservaEditando.hora">
                </div>
              </div>
              <div class="field-group">
                <label>Mesa asignada (opcional)</label>
                <select v-model="reservaEditando.mesaId">
                  <option value="">Sin asignar</option>
                  <option v-for="m in mesas" :key="m.id" :value="m.id">
                    Mesa {{ m.numero }} {{ m.zona ? `(${m.zona})` : '' }}
                  </option>
                </select>
              </div>
              <div class="field-group">
                <label>Notas (opcional)</label>
                <input v-model="reservaEditando.notas" placeholder="Ej: cumpleaños, alergias...">
              </div>
              <button @click="guardarEdicionReserva" class="btn-primary btn-full" :disabled="isGuardandoEdicionReserva">
                {{ isGuardandoEdicionReserva ? 'Guardando...' : 'Guardar cambios' }}
              </button>
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
        <div class="modal-content modal-sm modal-categorias">
          <div class="modal-header">
            <h2>Gestionar Categorías</h2>
            <button class="btn-close" @click="mostrarModalCategorias = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="dos-columnas">
              <div class="form-card">
                <h3 class="form-card-title">{{ editandoCategoriaId ? 'Editar categoría' : 'Nueva categoría' }}</h3>
                <div class="form-fields">
                  <div class="field-group">
                    <label>Nombre</label>
                    <input v-model="nuevaCategoria.nombre" placeholder="Ej: Entrantes">
                  </div>
                  <div class="field-group">
                    <label>Icono y foto</label>
                    <div class="producto-media-controls">
                      <div class="emoji-selector-container">
                        <button type="button" class="btn-emoji" @click="mostrarSelectorCategoria = !mostrarSelectorCategoria">
                          <span class="emoji-preview">{{ nuevaCategoria.icono }}</span>
                          <span>Cambiar</span>
                        </button>
                        <div v-if="mostrarSelectorCategoria" class="picker-popup">
                          <EmojiPicker :native="true" theme="light" @select="onSelectEmojiCategoria" />
                        </div>
                      </div>
                      <label class="btn-upload-photo" :class="{ loading: subiendoFotoCategoria }">
                        <input type="file" accept="image/*" @change="subirFotoCategoria">
                        <span>{{ subiendoFotoCategoria ? 'Subiendo...' : 'Agregar foto' }}</span>
                      </label>
                    </div>
                    <div v-if="nuevaCategoria.imageUrl" class="producto-photo-preview">
                      <img :src="nuevaCategoria.imageUrl" alt="Vista previa">
                      <button type="button" class="btn-remove-photo" @click="quitarFotoCategoria">Quitar foto</button>
                    </div>
                    <p v-else class="field-hint">Opcional. Imagen representativa de la categoría.</p>
                  </div>
                  <div class="form-actions-stacked">
                    <button @click="guardarCategoria" class="btn-primary btn-full">
                      {{ editandoCategoriaId ? 'Guardar cambios' : '+ Añadir Categoría' }}
                    </button>
                    <button v-if="editandoCategoriaId" @click="resetCategoriaForm" class="btn-secondary btn-full">Cancelar edición</button>
                  </div>
                </div>
              </div>
              <div class="lista-card">
                <div class="categoria-list-toolbar">
                  <h3 class="form-card-title">Categorías actuales</h3>
                  <select v-model="ordenCategorias" class="category-sort-select">
                    <option value="manual">Orden personalizado</option>
                    <option value="alfabetico">A-Z</option>
                    <option value="alfabeticoDesc">Z-A</option>
                    <option value="actualizacion">Última actualización</option>
                    <option value="productos">Más productos</option>
                    <option value="bebidas">Bebidas primero</option>
                  </select>
                </div>
                <div v-if="categorias.length === 0" class="empty-state-box">No hay categorías todavía.</div>
                <div v-for="(cat, index) in categoriasOrdenadas" :key="cat.id" class="item-row">
                  <div class="producto-visual">
                    <img v-if="cat.imageUrl" :src="cat.imageUrl" :alt="cat.nombre" class="producto-thumb">
                    <span v-else class="item-icon">{{ cat.icono }}</span>
                  </div>
                  <div class="item-info">
                    <span class="item-name">{{ cat.nombre }}</span>
                    <span class="item-sub">{{ contarProductosCategoria(cat.nombre) }} productos</span>
                  </div>
                  <div class="item-actions">
                    <button class="btn-reorder" :disabled="index === 0" title="Subir" @click="moverCategoria(cat, -1)">↑</button>
                    <button class="btn-reorder" :disabled="index === categoriasOrdenadas.length - 1" title="Bajar" @click="moverCategoria(cat, 1)">↓</button>
                    <button class="btn-editar" @click="editarCategoria(cat)">✎</button>
                    <button class="btn-eliminar" @click="eliminarCategoria(cat.id, cat.nombre)">✕</button>
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
@import 'vue3-emoji-picker/css';

* { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }

.admin-layout { display: flex; height: 100vh; background: #f3f4f6; overflow: hidden; }

/* ── SIDEBAR ── */
.sidebar {
  width: 220px;
  height: 100vh;
  background: linear-gradient(180deg, #1e293b, #0f172a);
  color: white;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  overflow-y: auto;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.04), 2px 0 12px rgba(15, 23, 42, 0.15);
}

.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

.sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 20px; border-bottom: 1px solid #334155; margin-bottom: 8px; }
.sidebar-brand-logo { flex-shrink: 0; }
.sidebar-logo-img { width: 36px; height: 36px; object-fit: contain; border-radius: 8px; background: white; }
.sidebar-logo-placeholder { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 1.1rem; }
.sidebar-brand-texts { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sidebar-brand-texts h2 { font-size: 0.95rem; font-weight: 800; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin-tag { color: white; font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; width: fit-content; transition: background 0.3s; }

.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sidebar-nav button { padding: 12px 16px; background: transparent; border: none; color: #94a3b8; text-align: left; cursor: pointer; font-size: 0.9rem; border-radius: 8px; transition: all 0.2s; width: 100%; }
.sidebar-nav button:hover { background: #334155; color: white; }
.sidebar-nav button.active { background: #4f46e5; color: white; font-weight: 600; }

.sidebar-footer { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid #334155; }
.sidebar-powered { display: flex; justify-content: center; padding: 4px 0; }
.local-info { font-size: 0.72rem; color: #64748b; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-logout { padding: 10px 16px; background: transparent; border: 1px solid #334155; color: #94a3b8; text-align: left; cursor: pointer; font-size: 0.85rem; border-radius: 8px; transition: all 0.2s; width: 100%; }
.btn-logout:hover { background: #ef4444; border-color: #ef4444; color: white; }

/* ── CONTENT ── */
.content { flex: 1; padding: 36px 40px; overflow-y: auto; min-width: 0; height: 100vh; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; flex-wrap: wrap; gap: 16px; }
.page-header h1 { font-size: 1.6rem; font-weight: 700; color: #0f172a; }
.page-subtitle { color: #64748b; font-size: 0.9rem; margin-top: 4px; }
.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

/* ── BOTONES ── */
.btn-primary {
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 75%, #000));
  color: white;
  border: none;
  padding: 11px 22px;
  border-radius: var(--radius-md, 12px);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  box-shadow: var(--shadow-glow);
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--color-acento, #4f46e5) 38%, transparent);
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.btn-full { width: 100%; padding: 14px; font-size: 0.95rem; }

.btn-secondary {
  background: white;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 11px 22px;
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: transform 0.18s, box-shadow 0.18s, background 0.2s, border-color 0.2s;
}
.btn-secondary:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  color: white;
  border: none;
  padding: 11px 22px;
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
  box-shadow: 0 8px 18px rgba(220, 38, 38, 0.28);
}
.btn-danger:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(220, 38, 38, 0.38);
}

.btn-close { background: #fee2e2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
.btn-close:hover { background: #dc2626; color: white; }

.btn-eliminar { width: 30px; height: 30px; background: #fee2e2; color: #dc2626; border: none; border-radius: 50%; cursor: pointer; font-weight: 700; font-size: 0.85rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-eliminar:hover { background: #dc2626; color: white; }

.btn-editar { width: 30px; height: 30px; background: #e0e7ff; color: #4338ca; border: none; border-radius: 50%; cursor: pointer; font-weight: 700; font-size: 0.85rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-editar:hover { background: #4338ca; color: white; }

.btn-text-danger { background: transparent; border: none; color: #64748b; font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: all 0.2s; }
.btn-text-danger:hover { background: #fee2e2; color: #dc2626; }

.btn-reorder { width: 30px; height: 30px; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; border-radius: 50%; cursor: pointer; font-weight: 800; font-size: 0.9rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-reorder:hover:not(:disabled) { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }
.btn-reorder:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── INPUTS ── */
.input-num, .input-date, .input-select {
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
  font-size: 0.95rem;
  color: #0f172a;
  background: white;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  font-family: inherit;
}
.input-num { width: 90px; text-align: center; }
.input-date:focus, .input-num:focus, .input-select:focus {
  border-color: var(--color-acento, #4f46e5);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-acento, #4f46e5) 18%, transparent);
}

.btn-export-excel {
  padding: 10px 16px;
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.18s, transform 0.18s, box-shadow 0.18s;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25);
}
.btn-export-excel:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(22, 163, 74, 0.32);
}
.btn-export-excel:disabled { opacity: 0.45; cursor: not-allowed; }
.export-caret { font-size: 0.72rem; margin-left: 4px; }

/* ── DESPLEGABLE DE EXPORTACIÓN ── */
.export-dropdown { position: relative; }
.export-backdrop { position: fixed; inset: 0; z-index: 49; }
.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 180px;
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.export-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: transparent;
  border: none;
  border-radius: 7px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.export-menu button:hover { background: #f1f5f9; }

/* ── PISTA DE CONTACTO EN RESERVAS ── */
.contacto-hint {
  font-size: 0.76rem;
  color: #64748b;
  margin: -4px 0 2px;
  line-height: 1.4;
}

/* ── TABS ── */
.tabs-zone-admin { display: flex; gap: 8px; margin-bottom: 24px; overflow-x: auto; padding-bottom: 4px; align-items: center; }
.tabs-zone-admin button {
  padding: 9px 18px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
  transition: transform 0.18s, box-shadow 0.18s, background 0.2s, border-color 0.2s, color 0.2s;
  white-space: nowrap;
  font-size: 0.9rem;
}
.tabs-zone-admin button.active {
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 75%, #000));
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-glow);
}
.tabs-zone-admin button:hover:not(.active) {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.btn-gestionar-zonas { border-style: dashed !important; background: transparent !important; color: #64748b !important; }
.btn-gestionar-zonas:hover { border-color: #4f46e5 !important; color: #4f46e5 !important; background: #ede9fe !important; }

/* ── KPIs ── */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
.kpi-card {
  background: white;
  padding: 22px 24px;
  border-radius: var(--radius-lg, 16px);
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.kpi-card.highlight {
  background: linear-gradient(160deg, #f0fdf4, #dcfce7);
  border-color: #bbf7d0;
}
.kpi-title { font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-card.highlight .kpi-title { color: #15803d; }
.kpi-value { font-size: 1.75rem; font-weight: 800; color: #0f172a; }
.kpi-card.highlight .kpi-value { color: #16a34a; }

/* ── FINANZAS ── */
.finanzas-filtros { display: flex; gap: 16px; margin-bottom: 20px; background: #f8fafc; padding: 14px 18px; border-radius: 10px; border: 1px solid #e2e8f0; flex-wrap: wrap; }
.form-group-inline { display: flex; align-items: center; gap: 10px; }
.form-group-inline label { font-size: 0.85rem; font-weight: 700; color: #475569; white-space: nowrap; }
.tickets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  max-height: calc(100vh - 420px);
  overflow-y: auto;
  padding-right: 6px;
}
.tickets-grid::-webkit-scrollbar { width: 6px; }
.tickets-grid::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }

.factura-card {
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-lg, 14px);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}
.factura-card:hover {
  border-color: color-mix(in srgb, var(--color-acento, #4f46e5) 35%, transparent);
  box-shadow: var(--shadow-md);
  transform: translateY(-3px);
}
.f-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0; }
.f-mesa { font-weight: 800; color: #0f172a; font-size: 1rem; }
.f-mesa small { color: #64748b; font-weight: 600; font-size: 0.82rem; }
.f-metodo { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.f-metodo.efectivo { background: #dcfce7; color: #16a34a; }
.f-metodo.tarjeta  { background: #dbeafe; color: #1d4ed8; }
.f-body { display: flex; justify-content: space-between; align-items: center; }
.f-empleado { font-size: 0.88rem; color: #475569; font-weight: 500; }
.f-hora { font-size: 0.82rem; color: #94a3b8; font-weight: 600; }
.f-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; }
.f-total { font-size: 1.35rem; font-weight: 900; color: #0f172a; }
.ticket-actions { display: flex; gap: 8px; }
.btn-icon { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; font-size: 0.95rem; }
.btn-icon.btn-edit:hover { background: #e0e7ff; }
.btn-icon.btn-del:hover  { background: #fee2e2; }

/* ── RENDIMIENTO ── */
.rendimiento-lista { display: flex; flex-direction: column; gap: 14px; }
.rendimiento-row { display: flex; align-items: center; gap: 14px; background: white; padding: 14px 18px; border-radius: 12px; border: 1px solid #e2e8f0; }
.rank-badge { width: 32px; height: 32px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; flex-shrink: 0; }
.empleado-info { display: flex; flex-direction: column; min-width: 120px; }
.empleado-nombre { font-weight: 700; color: #0f172a; font-size: 0.95rem; }
.empleado-pedidos { font-size: 0.78rem; color: #64748b; }
.barra-progreso-wrapper { flex: 1; height: 8px; background: #f1f5f9; border-radius: 10px; overflow: hidden; }
.barra-progreso { height: 100%; background: linear-gradient(90deg, #4f46e5, #818cf8); border-radius: 10px; transition: width 0.5s ease; min-width: 4px; }
.rendimiento-total { font-weight: 800; color: #0f172a; font-size: 1rem; min-width: 80px; text-align: right; }

/* ── DOS COLUMNAS ── */
.dos-columnas { display: grid; grid-template-columns: 340px 1fr; gap: 24px; align-items: start; }
.columna-izq { display: flex; flex-direction: column; gap: 0; }
.form-card, .lista-card {
  background: white;
  border-radius: var(--radius-lg, 16px);
  padding: 24px;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: var(--shadow-sm);
}
.form-card { position: sticky; top: 0; }
.form-card-title { font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 18px; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.form-hint { font-size: 0.82rem; color: #64748b; line-height: 1.5; margin-bottom: 4px; }
.field-hint { font-size: 0.78rem; color: #64748b; }
.form-fields { display: flex; flex-direction: column; gap: 14px; }
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-group label, .field-label { font-size: 0.82rem; font-weight: 600; color: #475569; }
.field-group input, .field-group select {
  padding: 11px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
  font-size: 0.95rem;
  color: #0f172a;
  background: white;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  width: 100%;
  font-family: inherit;
}
.field-group input:focus, .field-group select:focus {
  border-color: var(--color-acento, #4f46e5);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-acento, #4f46e5) 18%, transparent);
}
.two-cols-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-actions-stacked { display: flex; flex-direction: column; gap: 8px; }

/* ── TOGGLE SIRVE CAMARERO ── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.toggle-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.toggle-label { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.toggle-desc { font-size: 0.75rem; color: #64748b; line-height: 1.3; }

.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: #cbd5e1;
  cursor: pointer;
  transition: background 0.25s ease;
  flex-shrink: 0;
  padding: 0;
}

.toggle-switch.active { background: #4f46e5; }

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: transform 0.25s ease;
}

.toggle-switch.active .toggle-thumb { transform: translateX(22px); }

.badge-camarero {
  display: inline-block;
  background: #fef3c7;
  color: #b45309;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
  margin-left: 4px;
  vertical-align: middle;
}

.badge-recomendado {
  display: inline-block;
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
  margin-left: 4px;
  vertical-align: middle;
}

/* ── ITEMS ── */
.item-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
.item-row:last-child { border-bottom: none; }
.item-icon { font-size: 1.5rem; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.item-name { font-weight: 600; color: #0f172a; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-sub { font-size: 0.78rem; color: #94a3b8; }
.item-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.producto-visual { width: 44px; height: 44px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.producto-thumb { width: 100%; height: 100%; object-fit: cover; }

/* ── CARTA ── */
.carta-card { background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92)), repeating-linear-gradient(0deg, rgba(226,232,240,0.28) 0 1px, transparent 1px 26px); }
.carta-title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; margin-bottom: 18px; }
.carta-title-row .form-card-title { margin-bottom: 4px; }
.carta-subtitle { color: #64748b; font-size: 0.82rem; }
.carta-total { background: #0f172a; color: white; padding: 6px 12px; border-radius: 999px; font-size: 0.76rem; font-weight: 800; white-space: nowrap; }

.categoria-grupo { margin-bottom: 24px; }
.categoria-grupo:last-child { margin-bottom: 0; }
.categoria-header { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: linear-gradient(135deg, #ffffff, #f8fafc); border: 1px solid #dbe3ee; border-left: 5px solid #4f46e5; border-radius: 14px; margin-top: 18px; box-shadow: 0 10px 24px rgba(15,23,42,0.06); }
.categoria-visual { width: 48px; height: 48px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.categoria-thumb { width: 100%; height: 100%; object-fit: cover; }
.categoria-icono { font-size: 1.55rem; }
.categoria-nombre { font-weight: 900; color: #0f172a; flex: 1; text-transform: uppercase; font-size: 1.08rem; }
.categoria-count { background: #f1f5f9; color: #64748b; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; }

.menu-platos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; padding: 14px 0 6px; }
.menu-plato-card { display: grid; grid-template-columns: 72px minmax(0,1fr); grid-template-rows: auto auto; gap: 12px; padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 18px rgba(15,23,42,0.05); transition: transform 0.18s, box-shadow 0.18s; }
.menu-plato-card:hover { transform: translateY(-2px); border-color: #cbd5e1; box-shadow: 0 14px 28px rgba(15,23,42,0.08); }
.menu-plato-media { grid-row: 1/span 2; width: 72px; height: 72px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.menu-plato-photo { width: 100%; height: 100%; object-fit: cover; }
.menu-plato-icon { font-size: 2rem; }
.menu-plato-info { min-width: 0; display: flex; flex-direction: column; gap: 4px; align-self: start; }
.menu-plato-name { color: #0f172a; font-size: 0.96rem; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.menu-plato-category { color: #94a3b8; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
.menu-plato-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; align-self: end; }
.menu-plato-price { color: #4f46e5; font-size: 1rem; font-weight: 900; white-space: nowrap; }

/* ── EMPLEADOS ── */
.empleados-list {
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  padding-right: 6px;
}
.empleados-list::-webkit-scrollbar { width: 6px; }
.empleados-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }

.empleado-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
.empleado-row:last-child { border-bottom: none; }
.empleado-avatar { width: 38px; height: 38px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
.rol-badge { font-size: 0.72rem; font-weight: 800; padding: 5px 11px; border-radius: 20px; text-transform: capitalize; flex-shrink: 0; letter-spacing: 0.3px; }
.rol-badge.admin    { background: #ede9fe; color: #6d28d9; box-shadow: inset 0 0 0 1px rgba(109, 40, 217, 0.15); }
.rol-badge.camarero { background: #dbeafe; color: #1d4ed8; box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.15); }
.rol-badge.cocinero { background: #fef3c7; color: #b45309; box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.15); }
.activo-toggle {
  border: none; padding: 5px 12px; border-radius: 20px;
  font-size: 0.72rem; font-weight: 800; cursor: pointer;
  transition: filter 0.2s, transform 0.18s;
  flex-shrink: 0;
}
.activo-toggle.activo   { background: #dcfce7; color: #16a34a; box-shadow: inset 0 0 0 1px rgba(22, 163, 74, 0.2); }
.activo-toggle.inactivo { background: #f1f5f9; color: #94a3b8; box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.2); }
.activo-toggle:hover { filter: brightness(1.05); transform: translateY(-1px); }
.filtros-rol { display: flex; gap: 8px; flex-wrap: wrap; }
.filtros-rol button { background: #f1f5f9; border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; }
.filtros-rol button.active { background: #4f46e5; color: white; }
.filtros-rol button:hover:not(.active) { background: #e2e8f0; }

/* ── INVITACIONES ── */
.codigo-badge {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 8px);
  letter-spacing: 2px;
  flex-shrink: 0;
}
.codigo-badge.pendiente {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #b45309;
  border: 1px dashed #f59e0b;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.18);
}
.codigo-badge.usada { background: #dcfce7; color: #16a34a; box-shadow: inset 0 0 0 1px rgba(22, 163, 74, 0.2); }

/* ── RESERVAS ── */
.reserva-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.reserva-row .field-group { min-width: 0; }
.reserva-row input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
}

.reservas-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 360px);
  overflow-y: auto;
  padding-right: 6px;
}
.reservas-grid::-webkit-scrollbar { width: 6px; }
.reservas-grid::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }

.reserva-card {
  display: grid;
  grid-template-columns: 90px 1fr auto auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-left: 4px solid #94a3b8;
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s;
}
.reserva-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }

.reserva-card.reserva-pendiente { border-left-color: #d97706; }
.reserva-card.reserva-confirmada { border-left-color: #16a34a; background: linear-gradient(160deg, #f0fdf4, white); }
.reserva-card.reserva-cumplida { border-left-color: #4338ca; opacity: 0.85; }
.reserva-card.reserva-cancelada { border-left-color: #dc2626; opacity: 0.55; }
.reserva-card.reserva-vencida {
  border-left-color: #f59e0b;
  background: linear-gradient(160deg, #fffbeb, white);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
}

.reserva-hora {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: var(--radius-sm, 10px);
  flex-shrink: 0;
}
.reserva-hora-num { font-size: 1.15rem; font-weight: 800; color: #0f172a; line-height: 1; font-variant-numeric: tabular-nums; }
.reserva-personas { font-size: 0.7rem; font-weight: 700; color: #64748b; }

.reserva-info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.reserva-nombre { font-size: 0.98rem; font-weight: 800; color: #0f172a; }
.reserva-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.78rem; color: #64748b; font-weight: 600; }
.reserva-tel { color: #475569; }
.reserva-notas {
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-left: 3px solid #d97706;
  padding: 4px 8px;
  border-radius: 6px;
  margin-top: 2px;
}

.reserva-estado-badge { font-size: 0.72rem; font-weight: 800; padding: 5px 11px; border-radius: 20px; letter-spacing: 0.3px; }
.reserva-estado-badge.pendiente  { background: #fef3c7; color: #b45309; }
.reserva-estado-badge.confirmada { background: #dcfce7; color: #16a34a; }
.reserva-estado-badge.cumplida   { background: #e0e7ff; color: #4338ca; }
.reserva-estado-badge.cancelada  { background: #fee2e2; color: #dc2626; }
.reserva-estado-badge.vencida    { background: #ffedd5; color: #c2410c; box-shadow: inset 0 0 0 1px rgba(194, 65, 12, 0.25); }

.reserva-actions { display: flex; gap: 6px; }
.r-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  cursor: pointer;
  font-size: 0.9rem;
  transition: transform 0.15s, filter 0.18s, border-color 0.18s, background 0.18s;
}
.r-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
.r-btn.confirm  { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }
.r-btn.cumplida { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }
.r-btn.cancel   { background: #fef3c7; color: #b45309; border-color: #fde68a; }
.r-btn.delete   { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.r-btn.edit     { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
.r-btn.whatsapp { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }

/* ── INVENTARIO ── */
.inv-stat { font-weight: 700; }
.inv-stat.bajo { color: #d97706; }
.inv-stat.cero { color: #dc2626; }

.inventario-grid { display: flex; flex-direction: column; gap: 8px; }

.inv-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  transition: border-color 0.18s, background 0.18s;
}
.inv-row:hover { border-color: #cbd5e1; background: white; }

.inv-icon {
  width: 42px; height: 42px;
  flex-shrink: 0;
  border-radius: 9px;
  background: white;
  border: 1px solid #eef2f7;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.3rem;
  overflow: hidden;
}
.inv-icon img { width: 100%; height: 100%; object-fit: cover; }

.inv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.inv-info strong { color: #0f172a; font-size: 0.92rem; overflow-wrap: anywhere; }
.inv-info small  { color: #94a3b8; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; }

.inv-actual {
  flex-shrink: 0;
  min-width: 74px;
  text-align: center;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 800;
}
.inv-actual.ok   { background: #dcfce7; color: #16a34a; }
.inv-actual.bajo { background: #fef3c7; color: #b45309; }
.inv-actual.cero { background: #fee2e2; color: #dc2626; }

.inv-editor { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.inv-step {
  width: 30px; height: 32px;
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 800;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s;
}
.inv-step:hover { background: #f1f5f9; }
.inv-input {
  width: 56px;
  height: 32px;
  text-align: center;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}
.inv-save { padding: 7px 16px; font-size: 0.84rem; flex-shrink: 0; }
.inv-save:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 640px) {
  .inv-row { flex-wrap: wrap; }
  .inv-info { flex-basis: 60%; }
  .inv-save { margin-left: auto; }
}

/* ── EMOJI PICKER ── */
.emoji-selector-container { position: relative; }
.btn-emoji { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 0.9rem; color: #475569; font-weight: 500; transition: all 0.2s; }
.btn-emoji:hover { background: #f1f5f9; border-color: #cbd5e1; }
.emoji-preview { font-size: 1.4rem; line-height: 1; }
.picker-popup { position: absolute; top: calc(100% + 8px); left: 0; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.12); border-radius: 10px; }

.producto-media-controls { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.btn-upload-photo { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 14px; background: #fff7ed; color: #c2410c; border: 1px dashed #fdba74; border-radius: 8px; cursor: pointer; font-size: 0.88rem; font-weight: 700; transition: all 0.2s; }
.btn-upload-photo:hover { background: #ffedd5; border-color: #fb923c; }
.btn-upload-photo.loading { opacity: 0.7; cursor: progress; }
.btn-upload-photo input { display: none; }

.producto-photo-preview { display: flex; align-items: center; gap: 12px; padding: 10px; margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; }
.producto-photo-preview img { width: 68px; height: 68px; object-fit: cover; border-radius: 10px; border: 1px solid #cbd5e1; }
.btn-remove-photo { border: none; background: #fee2e2; color: #dc2626; padding: 8px 12px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.btn-remove-photo:hover { background: #fecaca; }

/* ── CATEGORÍAS MODAL ── */
.categoria-list-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.categoria-list-toolbar .form-card-title { margin-bottom: 0; }
.category-sort-select { min-width: 180px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; color: #0f172a; font-size: 0.85rem; font-weight: 600; outline: none; }
.category-sort-select:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.08); }

/* ── EMPTY STATE ── */
.empty-state-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; color: #94a3b8; font-size: 0.9rem; }
.card-container { background: white; border-radius: 14px; padding: 24px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }

/* ── MI NEGOCIO ── */
.logo-upload-area { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; }
.logo-preview { width: 100px; height: 100px; object-fit: contain; border-radius: 12px; border: 1px solid #e2e8f0; background: white; padding: 4px; }
.logo-placeholder { width: 100px; height: 100px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 0.85rem; border: 1px dashed #cbd5e1; }
.btn-upload-logo { padding: 8px 16px; background: #4f46e5; color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-upload-logo:hover { background: #4338ca; }
.btn-upload-logo.loading { background: #a5b4fc; cursor: not-allowed; }
.upload-hint { font-size: 0.72rem; color: #94a3b8; margin: 0; }
.color-picker-row { display: flex; align-items: center; gap: 12px; }
.color-input { width: 48px; height: 48px; border: none; border-radius: 8px; cursor: pointer; padding: 2px; background: none; }
.color-value { font-size: 0.88rem; font-weight: 600; color: #475569; font-family: monospace; }
.color-preview-pill { padding: 6px 14px; border-radius: 20px; color: white; font-weight: 700; font-size: 0.85rem; }
.color-presets { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.color-preset-btn { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
.color-preset-btn:hover { transform: scale(1.15); }
.color-preset-btn.active { border-color: #0f172a; transform: scale(1.15); }

/* ── PREVIEWS NEGOCIO ── */
.preview-sidebar { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
.preview-brand { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 2px solid #4f46e5; background: white; transition: border-color 0.3s; }
.preview-logo { width: 36px; height: 36px; object-fit: contain; border-radius: 8px; }
.preview-logo-placeholder { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 1.1rem; flex-shrink: 0; transition: background 0.3s; }
.preview-nombre { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.preview-powered { font-size: 0.62rem; color: #94a3b8; font-weight: 500; }
.preview-nav { padding: 8px; display: flex; flex-direction: column; gap: 4px; background: #f8fafc; }
.preview-nav-item { padding: 8px 12px; border-radius: 6px; color: white; font-size: 0.82rem; font-weight: 600; transition: background 0.3s; }
.preview-nav-item-inactive { padding: 8px 12px; border-radius: 6px; color: #64748b; font-size: 0.82rem; }
.preview-cocina-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 10px; background: #1e293b; border-bottom: 3px solid #4f46e5; transition: border-color 0.3s; }
.preview-cocina-left { display: flex; align-items: center; gap: 10px; }
.preview-logo-sm { width: 24px; height: 24px; object-fit: contain; border-radius: 4px; background: white; }
.preview-logo-sm-placeholder { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 0.75rem; flex-shrink: 0; transition: background 0.3s; }
.preview-cocina-nombre { font-size: 0.9rem; font-weight: 700; color: #f1f5f9; }
.preview-cocina-badge { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; color: white; transition: background 0.3s; }
.preview-cocina-role { font-size: 0.78rem; color: #64748b; font-weight: 600; }

/* ── PREVIEWS extra (Mi Negocio) ── */
.prev-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 18px 0 8px;
}

.prev-mapa {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
}

.prev-zona-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: #e2e8f0;
  border-radius: 10px;
  margin-bottom: 14px;
  width: fit-content;
}

.prev-zona-tab {
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  background: transparent;
}

.prev-zona-tab.active { color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }

.prev-mesas { display: flex; gap: 12px; }

.prev-mesa {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  background: white;
  border: 2px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
}

.prev-mesa.available { border-color: #cbd5e1; }
.prev-mesa.occupied { background: white; box-shadow: 0 4px 8px rgba(0,0,0,0.04); }
.prev-mesa-num { font-size: 1.4rem; font-weight: 900; color: #334155; line-height: 1; }
.prev-mesa-label { font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; }

.prev-componentes {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.prev-btn-primary {
  border: none;
  color: white;
  padding: 10px 18px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
}

.prev-chip {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid;
}

.prev-precio { font-size: 1.1rem; font-weight: 900; }

.prev-toast {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
  max-width: 320px;
}

.prev-toast-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 900;
  font-size: 1rem;
}

.prev-toast-body { display: flex; flex-direction: column; gap: 2px; }
.prev-toast-body strong { font-size: 0.88rem; color: #0f172a; }
.prev-toast-body span { font-size: 0.76rem; color: #64748b; }

/* ── MODALES ── */
.modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content {
  background: #f8fafc;
  width: 860px;
  max-width: 95vw;
  max-height: 90vh;
  border-radius: var(--radius-xl, 20px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 40px 80px rgba(15, 23, 42, 0.35);
  animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-sm { width: 700px; }
.modal-categorias { width: 1080px; max-width: 98vw; }
.modal-categorias .dos-columnas { grid-template-columns: 360px minmax(0,1fr); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; background: white; border-bottom: 3px solid var(--color-acento, #4f46e5); flex-shrink: 0; transition: border-color 0.3s; }
.modal-header h2 { font-size: 1.2rem; font-weight: 800; color: #0f172a; }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }

.modal-ticket {
  background: white;
  width: 380px;
  border-radius: var(--radius-xl, 20px);
  overflow: hidden;
  box-shadow: 0 40px 80px rgba(15, 23, 42, 0.35);
  animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.ticket-paper-admin { padding: 28px 24px 20px; font-family: 'Courier New', Courier, monospace; }
.ticket-top { text-align: center; margin-bottom: 16px; }
.ticket-top h2 { font-size: 1.4rem; font-weight: 900; margin: 0; }
.ticket-sub { font-size: 0.85rem; color: #64748b; margin: 4px 0 12px; }
.ticket-info { font-size: 0.9rem; margin: 2px 0; }
.ticket-info.muted { color: #64748b; font-size: 0.82rem; }
.ticket-divider { border-top: 1px dashed #cbd5e1; margin: 14px 0; }
.ticket-items-admin { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
.t-item-admin { display: flex; font-size: 0.92rem; gap: 8px; }
.t-qty-admin   { width: 30px; font-weight: 700; flex-shrink: 0; }
.t-name-admin  { flex: 1; word-break: break-word; }
.t-price-admin { font-weight: 700; white-space: nowrap; }
.ticket-iva-row-admin { display: flex; justify-content: space-between; font-size: 0.84rem; color: #64748b; font-weight: 600; margin-bottom: 4px; }
.ticket-total-row { display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 900; color: #0f172a; margin-top: 4px; }

.edit-items-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 4px; }
.edit-items-list { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; margin: 8px 0; }
.edit-item-row { display: flex; align-items: center; background: white; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; gap: 10px; }
.edit-item-name { flex: 1; font-size: 0.88rem; font-weight: 600; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit-item-controls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.edit-sep { font-size: 0.8rem; color: #94a3b8; }
.edit-input-sm { width: 58px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; outline: none; font-size: 0.88rem; }
.edit-input-sm:focus { border-color: #4f46e5; }
.btn-eliminar-sm { width: 24px; height: 24px; background: #fee2e2; color: #dc2626; border: none; border-radius: 50%; cursor: pointer; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.btn-eliminar-sm:hover { background: #dc2626; color: white; }
.add-item-row { display: flex; gap: 8px; margin-top: 10px; }

/* ── ANIMACIONES ── */
@keyframes modalIn { from { transform: translateY(16px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── RESPONSIVE ── */
@media (max-width: 1100px) {
  .dos-columnas { grid-template-columns: 1fr; }
  .form-card { position: static; }
  .modal-categorias .dos-columnas { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .content { padding: 20px; }
  .modal-content { width: 95%; }
  .modal-categorias { width: 96%; }
  .categoria-list-toolbar { align-items: stretch; flex-direction: column; }
  .category-sort-select { width: 100%; }
  .menu-platos-grid { grid-template-columns: 1fr; }
  .modal-ticket { width: 95%; }
  .tickets-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .finanzas-filtros { flex-direction: column; }
}

/* Móvil: la barra lateral fija pasa a barra superior de pestañas en
   horizontal, para que el contenido disponga de todo el ancho. */
@media (max-width: 760px) {
  .admin-layout { flex-direction: column; }
  .sidebar {
    width: 100%;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }
  .sidebar-brand { display: none; }
  .sidebar-nav { flex-direction: row; gap: 6px; overflow-x: auto; }
  .sidebar-nav button {
    width: auto;
    flex-shrink: 0;
    white-space: nowrap;
    padding: 8px 12px;
    font-size: 0.82rem;
  }
  .sidebar-footer {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding-top: 0;
    border-top: none;
    flex-shrink: 0;
  }
  .sidebar-powered { display: none; }
  .btn-logout { width: auto; white-space: nowrap; padding: 8px 12px; font-size: 0.8rem; }
  .content { height: auto; min-height: 0; padding: 16px 14px; }
}
</style>