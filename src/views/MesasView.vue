<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query, where,
  orderBy, doc, updateDoc, Timestamp, getDoc, writeBatch, runTransaction, addDoc, getDocs, increment
} from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'
import { useAuth } from '../composables/useAuth'
import { useNegocio } from '../composables/useNegocio'

import PosSidebar from '../components/pos/PosSidebar.vue'
import PosFloorMap from '../components/pos/PosFloorMap.vue'
import { useNotify } from '../composables/useNotify'
import { useReservaNotify } from '../composables/useReservaNotify'
import { desglosarIva, TIPO_IVA_PCT } from '../utils/iva'

const cartStore = CartStore()
const { currentUser, logout, localId } = useAuth()
const { config: negocio, iniciar: iniciarNegocio, detener: detenerNegocio } = useNegocio()
const { toast } = useNotify()
const { enviarEmailReserva, linkWhatsAppReserva } = useReservaNotify()

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

// ── ESTADO ────────────────────────────────────────────────────────

const tables = ref<any[]>([])
const productos = ref<any[]>([])
const categorias = ref<string[]>([])
const categoriasData = ref<Categoria[]>([])
const zonas = ref<Zona[]>([])
const mesaSeleccionada = ref<number | null>(null)
const mesaSeleccionadaId = ref<string | null>(null)
const categoriaSeleccionada = ref('')
const isEnviando = ref(false)
const zonaActiva = ref('')
const filtroActivo = ref('todas')
const mostrarModalCarta = ref(false)
const mostrarModalCamarero = ref(false)
const hayProductosCamarero = ref(false)
const sidebarAbiertoMovil = ref(false)

// IDs de items del carrito con el campo de nota expandido
const notasExpandidas = ref<Set<string>>(new Set())
const toggleNota = (itemId: string) => {
  if (notasExpandidas.value.has(itemId)) notasExpandidas.value.delete(itemId)
  else notasExpandidas.value.add(itemId)
}

// ── RESERVAS (camarero) ─────────────────────────────────────────
const reservasHoy = ref<any[]>([])
let unsubscribeReservas: (() => void) | null = null

const mostrarModalReserva = ref(false)
const mostrarModalListaReservas = ref(false)
const isCreandoReserva = ref(false)
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

// Reservas activas indexadas por mesaId (pendiente/confirmada, día actual).
const reservasActivasPorMesa = computed(() => {
  const map = new Map<string, any[]>()
  for (const r of reservasHoy.value) {
    if (!r.mesaId) continue
    if (r.estado !== 'pendiente' && r.estado !== 'confirmada') continue
    if (!map.has(r.mesaId)) map.set(r.mesaId, [])
    map.get(r.mesaId)!.push(r)
  }
  return map
})

// Mesas con reserva en las próximas 2h (badge visual en el plano).
const VENTANA_PROXIMA_MS = 2 * 60 * 60 * 1000
// Mesas con reserva en la próxima 1h: bloquean tomar pedido.
const VENTANA_BLOQUEO_MS = 60 * 60 * 1000

const reservaProximaDeMesa = (mesaId: string, ventanaMs: number) => {
  const ahora = Date.now()
  const reservas = reservasActivasPorMesa.value.get(mesaId) ?? []
  return reservas.find(r => {
    const ms = r.fechaHora?.seconds ? r.fechaHora.seconds * 1000 : 0
    return ms - ahora <= ventanaMs && ms - ahora >= -30 * 60 * 1000
  })
}

const mesasConReservaProxima = computed(() => {
  const set = new Set<string>()
  for (const mesaId of reservasActivasPorMesa.value.keys()) {
    if (reservaProximaDeMesa(mesaId, VENTANA_PROXIMA_MS)) set.add(mesaId)
  }
  return set
})

// Mesas con reserva PENDIENTE en la próxima hora: bloquean tomar pedido
// hasta que el camarero confirme la reserva. Si la reserva ya está confirmada
// (el cliente llegó), la mesa se puede usar sin más.
const mesasReservaInminente = computed(() => {
  const set = new Set<string>()
  const ahora = Date.now()
  for (const [mesaId, reservasMesa] of reservasActivasPorMesa.value.entries()) {
    const tienePendiente = reservasMesa.some(r => {
      if (r.estado !== 'pendiente') return false
      const ms = r.fechaHora?.seconds ? r.fechaHora.seconds * 1000 : 0
      return ms - ahora <= VENTANA_BLOQUEO_MS && ms - ahora >= -30 * 60 * 1000
    })
    if (tienePendiente) set.add(mesaId)
  }
  return set
})

// Total de reservas pendientes/confirmadas del día, vengan o no asignadas
// a una mesa. Lo usa el sidebar para mostrar "+N más esta noche".
const reservasActivasTotalHoy = computed(() =>
  reservasHoy.value.filter(r => r.estado === 'pendiente' || r.estado === 'confirmada').length
)

// Info detallada de la reserva próxima por mesa (ventana 2h) — para tooltip
// y popup. Solo mete las activas (pendiente/confirmada).
const reservasInfoPorMesa = computed(() => {
  const map = new Map<string, { id: string; estado: string; nombre: string; hora: string; personas: number; minutos: number }>()
  const ahora = Date.now()
  for (const r of reservasHoy.value) {
    if (!r.mesaId) continue
    if (r.estado !== 'pendiente' && r.estado !== 'confirmada') continue
    const ms = r.fechaHora?.seconds ? r.fechaHora.seconds * 1000 : 0
    if (ms - ahora <= VENTANA_PROXIMA_MS && ms - ahora >= -30 * 60 * 1000) {
      map.set(r.mesaId, {
        id: r.id,
        estado: r.estado,
        nombre: r.nombre,
        hora: new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        personas: r.personas,
        minutos: Math.round((ms - ahora) / 60000)
      })
    }
  }
  return map
})

// Confirma una reserva y abre el flujo de tomar pedido para esa mesa.
// Se usa tanto desde el popup de la mesa como desde la lista de reservas.
const confirmarReservaYAbrirCarta = async (reservaId: string, mesaId: string) => {
  if (!localId.value) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/reservas`, reservaId), { estado: 'confirmada' })
  } catch {
    toast.error('No se pudo confirmar la reserva.')
    return
  }
  // Cerrar el modal de lista si está abierto.
  mostrarModalListaReservas.value = false
  // Seleccionar la mesa y abrir tomar nota.
  const mesa = tables.value.find(t => t.id === mesaId)
  if (mesa) {
    mesaSeleccionada.value = mesa.nr
    mesaSeleccionadaId.value = mesa.id
    cartStore.setTable(mesa.nr)
    // skip porque acabamos de confirmar y el snapshot puede no haber llegado.
    abrirCartaPedido({ skipReservaCheck: true })
  }
}

const VENTANA_RESERVA_MIN_CAM = 90
const buscarConflictoCam = async (mesaId: string, fechaHora: Date, fechaDia: string) => {
  if (!localId.value || !mesaId) return null
  const snap = await getDocs(query(
    collection(db, `locales/${localId.value}/reservas`),
    where('fechaDia', '==', fechaDia),
    where('mesaId', '==', mesaId),
    where('estado', 'in', ['pendiente', 'confirmada'])
  ))
  const ventanaMs = VENTANA_RESERVA_MIN_CAM * 60 * 1000
  const conflicto = snap.docs.find(d => {
    const data = d.data()
    if (!data.fechaHora?.toDate) return false
    return Math.abs(data.fechaHora.toDate().getTime() - fechaHora.getTime()) < ventanaMs
  })
  return conflicto ? { id: conflicto.id, ...conflicto.data() } as any : null
}

const abrirModalReserva = () => {
  nuevaReserva.value = {
    nombre: '', telefono: '', email: '', personas: 2,
    fecha: new Date().toISOString().split('T')[0],
    hora: '20:00',
    mesaId: '', notas: ''
  }
  mostrarModalReserva.value = true
}

// Abre WhatsApp con el mensaje de confirmación ya redactado (envío manual).
const avisarWhatsAppCam = (r: any) => {
  const fecha = r.fechaHora?.toDate
    ? r.fechaHora.toDate()
    : new Date((r.fechaHora?.seconds ?? 0) * 1000)
  const link = linkWhatsAppReserva(
    { nombre: r.nombre, telefono: r.telefono, personas: r.personas, fechaHora: fecha, notas: r.notas },
    negocio.value.nombreNegocio || 'EasyOrder'
  )
  if (!link) return toast.info('Sin teléfono', 'Esta reserva no tiene teléfono.')
  window.open(link, '_blank', 'noopener')
}

// Reservas del día ordenadas, para la lista del camarero
const reservasOrdenadasHoy = computed(() => {
  const copia = [...reservasHoy.value]
  copia.sort((a, b) => (a.fechaHora?.seconds ?? 0) - (b.fechaHora?.seconds ?? 0))
  return copia
})

const cambiarEstadoReservaCamarero = async (id: string, nuevoEstado: 'confirmada' | 'cancelada' | 'cumplida') => {
  if (!localId.value) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/reservas`, id), { estado: nuevoEstado })
  } catch {
    toast.error('No se pudo actualizar.')
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const crearReservaCamarero = async () => {
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
      const conflicto = await buscarConflictoCam(nuevaReserva.value.mesaId, fechaHora, nuevaReserva.value.fecha)
      if (conflicto) {
        const horaConflicto = new Date(conflicto.fechaHora.seconds * 1000)
          .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        toast.warning(
          'Mesa ocupada en ese tramo',
          `Ya hay reserva de "${conflicto.nombre}" a las ${horaConflicto}. Deja ±90 min o elige otra mesa.`
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
    mostrarModalReserva.value = false

    // Email de confirmación: si falla, la reserva ya está creada — solo avisamos.
    if (email) {
      try {
        const enviado = await enviarEmailReserva(
          { nombre, email, telefono, personas, fechaHora, notas },
          negocio.value.nombreNegocio || 'EasyOrder'
        )
        if (enviado) toast.success('Reserva guardada', 'Email de confirmación enviado al cliente.')
        else toast.success('Reserva guardada')
      } catch {
        toast.warning('Reserva guardada', 'Pero no se pudo enviar el email de confirmación.')
      }
    } else {
      toast.success('Reserva guardada')
    }
  } catch (e) {
    console.error(e)
    toast.error('No se pudo crear la reserva.')
  } finally {
    isCreandoReserva.value = false
  }
}

// Modal Ticket
const mostrarModalTicket = ref(false)
const mesaIdTicket = ref<string | null>(null)
const metodoPago = ref<'efectivo' | 'tarjeta'>('efectivo')

// Monitor
const mostrarModalMonitor = ref(false)
const comandasActivas = ref<any[]>([])
const mesaMonitorSeleccionada = ref<string | null>(null)

// ── NOTIFICACIONES ────────────────────────────────────────────────
// Guardamos snapshot anterior para detectar cambios en líneas individuales
const comandasNotificadas = ref<Set<string>>(new Set())
const lineasNotificadas = ref<Set<string>>(new Set()) // clave: `${comandaId}_${lineaIndex}`
const hayAlgoListo = ref(false) // controla el badge rojo del monitor

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

// Recalcula si hay algo listo para el badge
const recalcularHayAlgoListo = () => {
  // Badge monitor cocina
  const hayPendienteDeServir = comandasActivas.value.some(c => {
    if (c.destino === 'camarero') return false
    if (c.estado === 'entregado' || c.estado === 'pagado') return false
    if (c.estado === 'listo') return true
    if (c.estadoLineas) {
      return Object.entries(c.estadoLineas).some(([idx, val]) => {
        if (val !== true) return false
        return !(c.lineasEntregadas?.[idx] === true)
      })
    }
    return false
  })
  hayAlgoListo.value = hayPendienteDeServir

  // Badge panel camarero
  hayProductosCamarero.value = comandasActivas.value.some(
    c => c.destino === 'camarero' && c.estado === 'para_camarero'
  )
}

const comandasListasCount = computed(() => {
  // Cuenta comandas con algo pendiente de servir: la comanda entera lista,
  // o alguna línea marcada lista por cocina que AÚN no se haya servido.
  // Excluye lo ya entregado/pagado y las líneas ya servidas (lineasEntregadas).
  return comandasActivas.value.filter(c => {
    if (c.destino === 'camarero') return false
    if (c.estado === 'entregado' || c.estado === 'pagado') return false
    if (c.estado === 'listo') return true
    if (c.estadoLineas) {
      return Object.entries(c.estadoLineas).some(([idx, val]) =>
        val === true && c.lineasEntregadas?.[idx] !== true
      )
    }
    return false
  }).length
})

const comandasCamarero = computed(() =>
  comandasActivas.value.filter(c =>
    c.destino === 'camarero' && c.estado === 'para_camarero'
  )
)

// Líneas de bebida/camarero aún sin servir — para el aviso flotante móvil.
const bebidasPendientesCount = computed(() =>
  comandasCamarero.value.reduce((acc, c) => {
    const lineas = (c.lineas ?? []) as any[]
    return acc + lineas.filter((_, i) => c.lineasEntregadas?.[String(i)] !== true).length
  }, 0)
)

// Si tras servir una comanda no quedan más pendientes en la mesa, la pasamos
// de 'preparando' a 'ocupada' (servida, esperando cobro). Excluye del cálculo
// la comanda recién marcada porque el snapshot del listener aún puede no haber
// reflejado el cambio.
const refrescarEstadoMesa = async (mesaId: string, comandaIdYaEntregada?: string) => {
  if (!localId.value) return
  const quedanPendientes = comandasActivas.value.some(
    c => c.mesaId === mesaId
      && c.id !== comandaIdYaEntregada
      && c.estado !== 'entregado'
      && c.estado !== 'pagado'
  )
  if (!quedanPendientes) {
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaId), { estado: 'ocupada' })
  }
}

const servirComandaCamarero = async (comandaId: string, mesaId: string) => {
  if (!localId.value) return
  try {
    await updateDoc(doc(db, `locales/${localId.value}/comandas`, comandaId), {
      estado: 'entregado'
    })
    await refrescarEstadoMesa(mesaId, comandaId)
    recalcularHayAlgoListo()
  } catch (error) {
    console.error('Error al marcar como servido:', error)
  }
}

const servirLineaCamarero = async (comanda: any, lineaIndex: string | number) => {
  if (!localId.value) return
  const ref = doc(db, `locales/${localId.value}/comandas`, comanda.id)
  let pasoAEntregada = false
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const data = snap.data()
      if (data.estado === 'entregado' || data.estado === 'pagado') return

      const lineasEntregadas: Record<string, boolean> = { ...(data.lineasEntregadas ?? {}) }
      lineasEntregadas[String(lineaIndex)] = true

      const lineas = (data.lineas ?? []) as any[]
      const todasEntregadas = lineas.every((_, i) => lineasEntregadas[String(i)] === true)

      if (todasEntregadas) {
        tx.update(ref, { estado: 'entregado', lineasEntregadas })
        pasoAEntregada = true
      } else {
        tx.update(ref, { lineasEntregadas })
      }
    })
    if (pasoAEntregada) await refrescarEstadoMesa(comanda.mesaId, comanda.id)
    recalcularHayAlgoListo()
  } catch (error) {
    console.error('Error al servir línea:', error)
  }
}

// ── LISTENERS ────────────────────────────────────────────────────

let unsubscribeZonas: (() => void) | null = null
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null
let unsubscribeComandas: (() => void) | null = null

// Mapa de estado anterior de líneas para detectar cambios
const estadoLineasAnterior = ref<Record<string, Record<string, boolean>>>({})
const primeraVez = ref(true)

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
    where('estado', 'in', ['en_cocina', 'listo', 'entregado', 'para_camarero'])
  )

  unsubscribeComandas = onSnapshot(qComandas, (snapshot) => {
    const nuevasComandas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    if (primeraVez.value) {
      // Primera carga: guardamos el estado inicial sin notificar
      nuevasComandas.forEach((c: any) => {
        estadoLineasAnterior.value[c.id] = { ...(c.estadoLineas ?? {}) }
        if (c.estado === 'listo') comandasNotificadas.value.add(c.id)
        if (c.estadoLineas) {
          Object.entries(c.estadoLineas).forEach(([idx, val]) => {
            if (val) lineasNotificadas.value.add(`${c.id}_${idx}`)
          })
        }
      })
      primeraVez.value = false
    } else {
      // Actualizaciones posteriores: detectamos cambios
      nuevasComandas.forEach((c: any) => {
        // 1. Comanda entera pasó a listo
        if (c.estado === 'listo' && !comandasNotificadas.value.has(c.id)) {
          comandasNotificadas.value.add(c.id)
          reproducirSonidoCampana()
        }

        // 2. Líneas individuales marcadas como listas
        if (c.estadoLineas) {
          const anterior = estadoLineasAnterior.value[c.id] ?? {}
          Object.entries(c.estadoLineas).forEach(([idx, val]) => {
            const clave = `${c.id}_${idx}`
            if (val === true && !anterior[idx] && !lineasNotificadas.value.has(clave)) {
              lineasNotificadas.value.add(clave)
              reproducirSonidoCampana()
            }
          })
        }

        // Actualizamos estado anterior
        estadoLineasAnterior.value[c.id] = { ...(c.estadoLineas ?? {}) }
      })

      // Limpiamos ids que ya no existen en el listener (comandas pagadas,
      // entregadas y luego sacadas del filtro, etc.).
      const idsActivos = new Set(nuevasComandas.map((c: any) => c.id))
      for (const id of comandasNotificadas.value) {
        if (!idsActivos.has(id)) comandasNotificadas.value.delete(id)
      }
      for (const clave of lineasNotificadas.value) {
        const comandaId = clave.split('_')[0]
        if (!idsActivos.has(comandaId)) lineasNotificadas.value.delete(clave)
      }
      for (const id of Object.keys(estadoLineasAnterior.value)) {
        if (!idsActivos.has(id)) delete estadoLineasAnterior.value[id]
      }
    }

    comandasActivas.value = nuevasComandas
    recalcularHayAlgoListo()
  })

  // Reservas del día — para el badge en plano y la validación.
  const hoy = new Date().toISOString().split('T')[0]
  unsubscribeReservas = onSnapshot(
    query(
      collection(db, `locales/${localId.value}/reservas`),
      where('fechaDia', '==', hoy)
    ),
    (snap) => { reservasHoy.value = snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  )
})

onUnmounted(() => {
  unsubscribeZonas?.()
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
  unsubscribeComandas?.()
  unsubscribeReservas?.()
  audioContext?.close()
  detenerNegocio()
})

// ── COMPUTED ──────────────────────────────────────────────────────

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

// Desglose de IVA del ticket actual: los precios ya incluyen IVA, así que
// el total no cambia — solo se descompone en base imponible + cuota.
const desgloseTicket = computed(() => desglosarIva(cuentaFinalMesa.value.total))

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
    // Tiene listos si la comanda entera está lista O si alguna línea individual está lista
    if (c.estado === 'listo' || (c.estadoLineas && Object.values(c.estadoLineas).some(v => v === true))) {
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

// ── STOCK / INVENTARIO ────────────────────────────────────────────
// Unidades ya añadidas al carrito de un producto.
const enCarrito = (id: string) => cartStore.items.find(i => i.id === id)?.quantity ?? 0
// Stock actual del producto en el menú (0 si no está configurado).
const stockDe = (id: string) => {
  const p = productos.value.find((x: any) => x.id === id)
  return Number(p?.stock) || 0
}

// Añade un producto desde la carta respetando el stock disponible.
const agregarProductoCarta = (p: any) => {
  const stock = Number(p.stock) || 0
  if (enCarrito(p.id) >= stock) {
    return toast.warning('Sin stock', `No quedan más unidades de ${p.name}.`)
  }
  cartStore.addToCart(p)
}

// Incrementa un ítem del carrito sin pasarse del stock.
const incrementarItem = (item: any) => {
  if (enCarrito(item.id) >= stockDe(item.id)) {
    return toast.warning('Sin stock', `No quedan más unidades de ${item.name}.`)
  }
  cartStore.increment(item.id)
}

// Fija la cantidad escrita a mano, recortándola al stock disponible.
const setCantidadItem = (item: any, valor: number) => {
  const stock = stockDe(item.id)
  const n = Math.floor(Number(valor)) || 0
  if (n > stock) {
    toast.warning('Sin stock', `Solo quedan ${stock} unidades de ${item.name}.`)
    cartStore.setQuantity(item.id, stock)
  } else {
    cartStore.setQuantity(item.id, n)
  }
}

const mesaActual = computed(() =>
  tables.value.find(t => t.id === mesaSeleccionadaId.value)
)

// ── ACCIONES ──────────────────────────────────────────────────────

const openTable = (table: any) => {
  inicializarAudio()
  // Click en vacío (table === null) → deseleccionar y cerrar popup.
  if (!table) {
    if (mesaSeleccionada.value !== null) {
      mesaSeleccionada.value = null
      mesaSeleccionadaId.value = null
      mostrarModalCarta.value = false
      cartStore.clear()
    }
    return
  }
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

const abrirCartaPedido = (opts: { skipReservaCheck?: boolean } = {}) => {
  if (!mesaSeleccionada.value) return
  // Bloqueo: si la mesa tiene reserva PENDIENTE en la próxima hora, hay que
  // confirmarla primero (el camarero acepta que el cliente ya está aquí).
  // Una vez confirmada, mesasReservaInminente la deja de marcar.
  if (!opts.skipReservaCheck && mesaSeleccionadaId.value && mesasReservaInminente.value.has(mesaSeleccionadaId.value)) {
    const reserva = reservaProximaDeMesa(mesaSeleccionadaId.value, VENTANA_BLOQUEO_MS)
    if (reserva && reserva.estado === 'pendiente') {
      const horaReserva = new Date((reserva.fechaHora?.seconds ?? 0) * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      toast.warning(
        'Reserva pendiente',
        `${reserva.nombre} llega a las ${horaReserva}. Confírmala antes de tomar pedido.`
      )
      return
    }
  }
  // Siempre arrancar en la primera categoría (la que está arriba según el
  // orden de la carta), no en la última que el camarero dejó.
  if (categoriasCarta.value.length > 0) {
    categoriaSeleccionada.value = categoriasCarta.value[0].nombre
  }
  mostrarModalCarta.value = true
}

const cerrarCartaPedido = () => {
  mostrarModalCarta.value = false
  notasExpandidas.value.clear()
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
    await refrescarEstadoMesa(mesaId, comandaId)
    // Limpiamos notificaciones de esta comanda
    comandasNotificadas.value.delete(comandaId)
    for (const clave of lineasNotificadas.value) {
      if (clave.startsWith(`${comandaId}_`)) lineasNotificadas.value.delete(clave)
    }
    recalcularHayAlgoListo()
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
  if (!mesaALiberar) return toast.warning('Seleccione una mesa válida.')
  const consumoTotal = cuentaFinalMesa.value

  try {
    const usuarioDoc = await getDoc(doc(db, 'usuarios', currentUser.value.uid))
    const usuarioNombre = usuarioDoc.exists() ? usuarioDoc.data().nombre : currentUser.value.email

    const batch = writeBatch(db)
    const facturasRef = collection(db, `locales/${localId.value}/facturas`)

    const desglose = desglosarIva(consumoTotal.total)
    batch.set(doc(facturasRef), {
      mesaId: mesaIdTicket.value,
      mesaNumero: mesaALiberar.nr,
      zona: mesaALiberar.zona || 'Sin zona',
      usuarioId: currentUser.value.uid,
      usuarioNombre,
      usuarioEmail: currentUser.value.email,
      metodoPago: metodoPago.value,
      total: consumoTotal.total,
      base: desglose.base,
      iva: desglose.iva,
      tipoIva: desglose.tipo,
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
      batch.update(doc(db, `locales/${localId.value}/comandas`, c.id), { estado: 'pagado' })
    }

    // Marcar como "cumplida" cualquier reserva confirmada del día para esa
    // mesa: el cliente ya consumió y cobró, no tiene sentido que siga
    // mostrándose como "en X min" en la lista.
    const reservasACumplir = reservasHoy.value.filter(
      r => r.mesaId === mesaIdTicket.value && r.estado === 'confirmada'
    )
    for (const r of reservasACumplir) {
      batch.update(doc(db, `locales/${localId.value}/reservas`, r.id), { estado: 'cumplida' })
    }

    batch.update(doc(db, `locales/${localId.value}/mesas`, mesaALiberar.id), { estado: 'libre' })

    await batch.commit()

    if (mesaSeleccionadaId.value === mesaIdTicket.value) {
      cartStore.clear()
      mesaSeleccionada.value = null
      mesaSeleccionadaId.value = null
    }

    mesaIdTicket.value = null
    mostrarModalTicket.value = false
    toast.success('Cobro registrado', 'Mesa liberada correctamente.')
  } catch (error) {
    console.error('Error al cobrar:', error)
    toast.error('No se pudo procesar el cobro', 'Inténtalo de nuevo.')
  }
}

const enviarPedido = async () => {
  if (cartStore.items.length === 0) return toast.warning('El pedido está vacío')
  if (!mesaSeleccionadaId.value || !currentUser.value || !localId.value) return

  isEnviando.value = true
  const mesaObj = tables.value.find(t => t.id === mesaSeleccionadaId.value)

  try {
    const usuarioDoc = await getDoc(doc(db, 'usuarios', currentUser.value.uid))
    const usuarioNombre = usuarioDoc.exists() ? usuarioDoc.data().nombre : currentUser.value.email

    // Separamos líneas por destino
    const lineasCocina   = cartStore.items.filter(item => !item.sirveCamarero)
    const lineasCamarero = cartStore.items.filter(item =>  item.sirveCamarero)

    const baseComanda = {
      mesaId: mesaSeleccionadaId.value,
      mesaNumero: mesaSeleccionada.value,
      zona: mesaObj?.zona || 'Sin zona',
      usuarioId: currentUser.value.uid,
      usuarioNombre,
      usuarioEmail: currentUser.value.email,
      fechaHora: Timestamp.now(),
      fechaDia: new Date().toISOString().split('T')[0],
    }

    const batch = writeBatch(db)
    const comandasRef = collection(db, `locales/${localId.value}/comandas`)

    if (lineasCocina.length > 0) {
      batch.set(doc(comandasRef), {
        ...baseComanda,
        estado: 'en_cocina',
        destino: 'cocina',
        importeTotal: lineasCocina.reduce((acc, i) => acc + i.price * i.quantity, 0),
        lineas: lineasCocina.map(item => ({
          productoId: item.id,
          nombre: item.name,
          precio: item.price,
          cantidad: item.quantity,
          notas: item.notes ?? ''
        }))
      })
    }

    if (lineasCamarero.length > 0) {
      batch.set(doc(comandasRef), {
        ...baseComanda,
        estado: 'para_camarero',
        destino: 'camarero',
        importeTotal: lineasCamarero.reduce((acc, i) => acc + i.price * i.quantity, 0),
        lineas: lineasCamarero.map(item => ({
          productoId: item.id,
          nombre: item.name,
          precio: item.price,
          cantidad: item.quantity,
          notas: item.notes ?? ''
        }))
      })
    }

    batch.update(doc(db, `locales/${localId.value}/mesas`, mesaSeleccionadaId.value), {
      estado: 'preparando'
    })

    // Descuento de inventario: cada línea resta del stock del producto.
    // increment() es atómico — sin condiciones de carrera. Se omiten los
    // productos que ya no existen en el menú para no romper el batch.
    for (const item of cartStore.items) {
      if (productos.value.some((p: any) => p.id === item.id)) {
        batch.update(doc(db, `locales/${localId.value}/productos`, item.id), {
          stock: increment(-item.quantity)
        })
      }
    }

    await batch.commit()

    cartStore.clear()
    notasExpandidas.value.clear()
    mostrarModalCarta.value = false
    mesaSeleccionada.value = null
    mesaSeleccionadaId.value = null
  } catch (error) {
    console.error('Error al enviar la comanda:', error)
    toast.error('No se pudo enviar el pedido', 'Comprueba tu conexión e inténtalo de nuevo.')
  } finally {
    isEnviando.value = false
  }
}

// Al abrir el monitor marcamos como visto
const abrirMonitor = () => {
  mostrarModalMonitor.value = true
}

// Al cerrar el monitor limpiamos el badge si todo está entregado
const cerrarMonitor = () => {
  mostrarModalMonitor.value = false
  mesaMonitorSeleccionada.value = null
  recalcularHayAlgoListo()
}

const marcarLineaEntregada = async (comanda: any, lineaIndex: string | number) => {
  if (!localId.value) return
  const ref = doc(db, `locales/${localId.value}/comandas`, comanda.id)
  let pasoAEntregada = false
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const data = snap.data()
      if (data.estado === 'entregado' || data.estado === 'pagado') return

      const estadoLineas = (data.estadoLineas ?? {}) as Record<string, boolean>
      const lineasEntregadas: Record<string, boolean> = { ...(data.lineasEntregadas ?? {}) }
      lineasEntregadas[String(lineaIndex)] = true

      const lineas = (data.lineas ?? []) as any[]
      const todasEntregadas = lineas.every((_, i) => {
        const estaLista = estadoLineas[String(i)] === true
        return !estaLista || lineasEntregadas[String(i)] === true
      })

      if (todasEntregadas && data.estado === 'listo') {
        tx.update(ref, { estado: 'entregado', lineasEntregadas })
        pasoAEntregada = true
      } else {
        tx.update(ref, { lineasEntregadas })
      }
    })

    if (pasoAEntregada) {
      await refrescarEstadoMesa(comanda.mesaId, comanda.id)
      comandasNotificadas.value.delete(comanda.id)
      for (const clave of lineasNotificadas.value) {
        if (clave.startsWith(`${comanda.id}_`)) lineasNotificadas.value.delete(clave)
      }
    }
    recalcularHayAlgoListo()
  } catch (error) {
    console.error('Error al marcar línea como entregada:', error)
  }
}
</script>

<template>
  <div class="pos-master-layout" @click="inicializarAudio">
    <div class="pos-inner-layout">

      <div
        v-if="sidebarAbiertoMovil"
        class="sidebar-backdrop-movil"
        @click="sidebarAbiertoMovil = false"
      ></div>

      <aside class="pos-sidebar-container" :class="{ 'sidebar-abierto-movil': sidebarAbiertoMovil }">
        <PosSidebar
          :user-email="currentUser?.email ?? undefined"
          :local-id="localId ?? undefined"
          :tables="tables"
          :filtro-activo="filtroActivo"
          :zonas="zonas"
          :zona-activa="zonaActiva"
          :comandas-listas-count="comandasListasCount"
          :hay-algo-listo="hayAlgoListo"
          :hay-productos-camarero="hayProductosCamarero"
          :mesas-reserva-inminente="mesasReservaInminente"
          :reservas-activas-total-hoy="reservasActivasTotalHoy"
          @logout="logout"
          @cambiar-filtro="(f) => { filtroActivo = f; sidebarAbiertoMovil = false }"
          @cambiar-zona="(z) => { zonaActiva = z; sidebarAbiertoMovil = false }"
          @abrir-modal-monitor="() => { abrirMonitor(); sidebarAbiertoMovil = false }"
          @abrir-modal-factura="() => { abrirModalFactura(); sidebarAbiertoMovil = false }"
          @abrir-panel-camarero="() => { mostrarModalCamarero = true; sidebarAbiertoMovil = false }"
          @abrir-modal-reserva="() => { abrirModalReserva(); sidebarAbiertoMovil = false }"
          @abrir-lista-reservas="() => { mostrarModalListaReservas = true; sidebarAbiertoMovil = false }"
        />
      </aside>

      <main class="pos-center-container">
        <header class="map-header">
          <button class="btn-menu-movil" @click="sidebarAbiertoMovil = true" aria-label="Abrir menú">
            <span></span><span></span><span></span>
          </button>
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
            :mesas-con-reserva-proxima="mesasConReservaProxima"
            :mesas-reserva-inminente="mesasReservaInminente"
            :reservas-info-por-mesa="reservasInfoPorMesa"
            @select-table="openTable"
            @update-position="actualizarPosicionMesa"
            @cobrar-mesa="abrirCobroRapido"
            @comenzar-pedido="abrirCartaPedido"
            @confirmar-reserva-y-pedido="(p) => confirmarReservaYAbrirCarta(p.reservaId, p.mesaId)"
          />
        </div>
      </main>

    </div>

    <!-- Avisos flotantes (solo móvil): cocina y bebidas pendientes de servir.
         En móvil el sidebar está oculto, así que el camarero no ve los badges. -->
    <div class="avisos-movil">
      <transition name="aviso-slide">
        <button
          v-if="bebidasPendientesCount > 0"
          class="aviso-movil aviso-bebidas"
          @click="mostrarModalCamarero = true"
        >
          <span class="aviso-dot"></span>
          <span class="aviso-texto">
            🍹 {{ bebidasPendientesCount }}
            {{ bebidasPendientesCount === 1 ? 'bebida' : 'bebidas' }} por servir
          </span>
          <span class="aviso-chevron">›</span>
        </button>
      </transition>
      <transition name="aviso-slide">
        <button
          v-if="comandasListasCount > 0"
          class="aviso-movil aviso-cocina"
          @click="abrirMonitor"
        >
          <span class="aviso-dot"></span>
          <span class="aviso-texto">
            🍽️ {{ comandasListasCount }}
            {{ comandasListasCount === 1 ? 'pedido listo' : 'pedidos listos' }} para servir
          </span>
          <span class="aviso-chevron">›</span>
        </button>
      </transition>
    </div>

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
                    :class="{ agotado: (Number(p.stock) || 0) <= 0 }"
                    :disabled="(Number(p.stock) || 0) <= 0"
                    @click="agregarProductoCarta(p)"
                  >
                    <span class="carta-product-media">
                      <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.name">
                      <span v-else>{{ p.icon || '🍽️' }}</span>
                    </span>
                    <span class="carta-product-info">
                      <strong>{{ p.name }}</strong>
                      <small>{{ p.category }}</small>
                      <span
                        class="carta-product-stock"
                        :class="{ cero: (Number(p.stock) || 0) <= 0, bajo: (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= 5 }"
                      >
                        {{ (Number(p.stock) || 0) <= 0 ? 'Agotado' : `Quedan ${Number(p.stock) || 0}` }}
                      </span>
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
                <div v-for="item in cartStore.items" :key="item.id" class="summary-item-wrap">
                  <div class="summary-item">
                    <div class="qty-control">
                      <button class="qty-btn" @click="cartStore.decrement(item.id)" :aria-label="`Quitar ${item.name}`">−</button>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        class="qty-input"
                        :value="item.quantity"
                        @change="setCantidadItem(item, Number(($event.target as HTMLInputElement).value))"
                      >
                      <button class="qty-btn" @click="incrementarItem(item)" :aria-label="`Añadir otro ${item.name}`">+</button>
                    </div>
                    <div class="summary-info">
                      <strong>{{ item.name }}</strong>
                      <small>{{ (item.price * item.quantity).toFixed(2) }}€</small>
                    </div>
                    <button
                      class="btn-nota"
                      :class="{ active: item.notes || notasExpandidas.has(item.id) }"
                      :title="item.notes ? 'Editar nota' : 'Añadir nota'"
                      @click="toggleNota(item.id)"
                    >
                      📝
                    </button>
                    <button class="btn-remove" @click="cartStore.removeFromCart(item.id)" title="Quitar todo">✕</button>
                  </div>
                  <div v-if="notasExpandidas.has(item.id)" class="summary-nota-row">
                    <input
                      type="text"
                      class="summary-nota-input"
                      v-model="item.notes"
                      placeholder="Ej: sin cebolla, bien hecho..."
                      maxlength="120"
                      @keyup.enter="toggleNota(item.id)"
                    >
                  </div>
                  <div v-else-if="item.notes" class="summary-nota-preview" @click="toggleNota(item.id)">
                    ⚠ {{ item.notes }}
                  </div>
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
            <div class="ticket-iva-row">
              <span>Base imponible</span>
              <span>{{ desgloseTicket.base.toFixed(2) }}€</span>
            </div>
            <div class="ticket-iva-row">
              <span>IVA ({{ TIPO_IVA_PCT }}%)</span>
              <span>{{ desgloseTicket.iva.toFixed(2) }}€</span>
            </div>
            <div class="ticket-total">
              <span>TOTAL</span>
              <span>{{ desgloseTicket.total.toFixed(2) }}€</span>
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

    <transition name="fade">
      <div v-if="mostrarModalMonitor" class="modal-backdrop" @click.self="cerrarMonitor">
        <div class="monitor-modal">
          <div class="monitor-header">
            <h2>📺 Estado de Pedidos en Tiempo Real</h2>
            <button class="btn-cancelar" style="padding: 8px 16px; flex: none;" @click="cerrarMonitor">
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
                <span class="mtb-top">
                  <span class="mtb-mesa">Mesa {{ mesa.numero }}</span>
                  <span v-if="mesa.tieneListos" class="badge-listo">✓ LISTO</span>
                </span>
                <small class="mtb-zona">{{ mesa.zona }}</small>
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
                    <span class="c-time">🕐 {{ comanda.fechaHora?.seconds ? new Date(comanda.fechaHora.seconds * 1000).toLocaleTimeString() : '--:--' }}</span>
                    <span class="c-status" :class="comanda.estado.toLowerCase().replace(/[\s_]+/g, '-')">
                      {{ comanda.estado.replace(/_/g, ' ').toUpperCase() }}
                    </span>
                  </div>
                  <ul class="c-lines">
                    <li
                      v-for="(linea, idx) in comanda.lineas"
                      :key="idx"
                      class="c-linea"
                      :class="{
                        'c-linea-lista':     comanda.estadoLineas?.[String(idx)] === true,
                        'c-linea-entregada': comanda.lineasEntregadas?.[String(idx)] === true
                      }"
                    >
                      <span class="c-linea-check">
                        {{ comanda.lineasEntregadas?.[String(idx)] ? '✓✓' : comanda.estadoLineas?.[String(idx)] ? '✓' : '○' }}
                      </span>
                        <span class="c-linea-texto">
                          <strong>{{ linea.cantidad }}x</strong> {{ linea.nombre }}
                        </span>
                        <button
                      v-if="comanda.estadoLineas?.[String(idx)] === true && !comanda.lineasEntregadas?.[String(idx)]"
                      class="btn-servir-linea"
                      @click="marcarLineaEntregada(comanda, idx)"
                    >
                      Servir
                    </button>
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

    <transition name="fade">
      <div v-if="mostrarModalCamarero" class="modal-backdrop" @click.self="mostrarModalCamarero = false">
        <div class="monitor-modal">
          <div class="monitor-header">
            <h2>🍺 Para servir — Camarero</h2>
            <button class="btn-cancelar" style="padding: 8px 16px; flex: none;" @click="mostrarModalCamarero = false">
              Cerrar
            </button>
          </div>

          <div class="camarero-panel-body">
            <div v-if="comandasCamarero.length === 0" class="ticket-empty" style="margin: 40px auto;">
              No hay productos pendientes de servir.
            </div>

            <div v-else class="camarero-cards-grid">
              <div
                v-for="comanda in comandasCamarero"
                :key="comanda.id"
                class="camarero-card"
              >
                <div class="camarero-card-header">
                  <div>
                    <span class="camarero-mesa">Mesa {{ comanda.mesaNumero }}</span>
                    <span class="camarero-zona">{{ comanda.zona }}</span>
                  </div>
                  <span class="camarero-hora">
                    🕐 {{ comanda.fechaHora?.seconds ? new Date(comanda.fechaHora.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--' }}
                  </span>
                </div>

                <ul class="camarero-lineas">
                  <li
                    v-for="(linea, idx) in comanda.lineas"
                    :key="idx"
                    class="camarero-linea"
                    :class="{ 'camarero-linea-servida': comanda.lineasEntregadas?.[String(idx)] === true }"
                  >
                    <span class="camarero-linea-qty">{{ linea.cantidad }}x</span>
                    <span class="camarero-linea-nombre">{{ linea.nombre }}</span>
                    <button
                      v-if="!comanda.lineasEntregadas?.[String(idx)]"
                      class="btn-servir-linea-camarero"
                      @click="servirLineaCamarero(comanda, idx)"
                    >
                      Servir
                    </button>
                    <span v-else class="servido-check">✓ Servido</span>
                  </li>
                </ul>

                <button
                  class="btn-todo-servido"
                  @click="servirComandaCamarero(comanda.id, comanda.mesaId)"
                >
                  ✅ Todo servido
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="mostrarModalListaReservas" class="modal-backdrop" @click.self="mostrarModalListaReservas = false">
        <div class="monitor-modal">
          <div class="monitor-header">
            <h2>📅 Reservas de hoy</h2>
            <button class="btn-cancelar" style="padding: 8px 16px; flex: none;" @click="mostrarModalListaReservas = false">
              Cerrar
            </button>
          </div>
          <div class="lista-reservas-body">
            <div v-if="reservasOrdenadasHoy.length === 0" class="ticket-empty" style="margin: 40px auto;">
              No hay reservas para hoy.
            </div>
            <div v-else class="lista-reservas-grid">
              <div
                v-for="r in reservasOrdenadasHoy"
                :key="r.id"
                class="reserva-row-cam"
                :class="`reserva-${r.estado}`"
              >
                <div class="reserva-row-hora">
                  <span class="r-hora-num">{{ r.fechaHora?.seconds ? new Date(r.fechaHora.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--' }}</span>
                  <span class="r-personas">👥 {{ r.personas }}</span>
                </div>
                <div class="reserva-row-info">
                  <strong>{{ r.nombre }}</strong>
                  <div class="reserva-row-meta">
                    <span>{{ r.mesaId ? `Mesa ${tables.find(t => t.id === r.mesaId)?.nr ?? '?'}` : 'Sin mesa' }}</span>
                    <span v-if="r.telefono">📞 {{ r.telefono }}</span>
                  </div>
                  <div v-if="r.notas" class="reserva-row-notas">⚠ {{ r.notas }}</div>
                </div>
                <span class="reserva-row-estado" :class="r.estado">
                  {{
                    r.estado === 'pendiente' ? 'Pendiente' :
                    r.estado === 'confirmada' ? 'Confirmada' :
                    r.estado === 'cumplida' ? 'Cumplida' : 'Cancelada'
                  }}
                </span>
                <div class="reserva-row-actions">
                  <button
                    v-if="r.telefono"
                    class="r-btn whatsapp"
                    @click="avisarWhatsAppCam(r)"
                    title="Avisar por WhatsApp"
                  >💬</button>
                  <button
                    v-if="r.estado === 'pendiente' && r.mesaId"
                    class="btn-atender-reserva"
                    @click="confirmarReservaYAbrirCarta(r.id, r.mesaId)"
                  >
                    ✓ Atender
                  </button>
                  <button
                    v-else-if="r.estado === 'pendiente'"
                    class="btn-atender-reserva"
                    @click="cambiarEstadoReservaCamarero(r.id, 'confirmada')"
                    title="Sin mesa asignada"
                  >
                    ✓ Confirmar
                  </button>
                  <button
                    v-if="r.estado !== 'cancelada' && r.estado !== 'cumplida'"
                    class="r-btn cancel"
                    @click="cambiarEstadoReservaCamarero(r.id, 'cancelada')"
                    title="Cancelar"
                  >✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="mostrarModalReserva" class="modal-backdrop" @click.self="mostrarModalReserva = false">
        <div class="reserva-modal">
          <div class="reserva-modal-header" :style="{ borderBottomColor: negocio.colorAcento || '#4f46e5' }">
            <div>
              <span class="reserva-modal-kicker">Nueva reserva</span>
              <h2>Apuntar cliente</h2>
            </div>
            <button class="btn-close-carta" @click="mostrarModalReserva = false">Cerrar</button>
          </div>
          <div class="reserva-modal-body">
            <div class="field-group">
              <label>Cliente</label>
              <input v-model="nuevaReserva.nombre" placeholder="Ej: María García">
            </div>
            <div class="reserva-modal-row reserva-modal-row-2">
              <div class="field-group">
                <label>Teléfono</label>
                <input v-model="nuevaReserva.telefono" placeholder="612 345 678">
              </div>
              <div class="field-group">
                <label>Email</label>
                <input v-model="nuevaReserva.email" type="email" placeholder="cliente@email.com">
              </div>
            </div>
            <p class="contacto-hint">📩 Indica teléfono o email (al menos uno) — el cliente recibirá la confirmación.</p>
            <div class="reserva-modal-row">
              <div class="field-group">
                <label>Personas</label>
                <input type="number" min="1" max="50" v-model.number="nuevaReserva.personas">
              </div>
              <div class="field-group">
                <label>Fecha</label>
                <input type="date" v-model="nuevaReserva.fecha">
              </div>
              <div class="field-group">
                <label>Hora</label>
                <input type="time" v-model="nuevaReserva.hora">
              </div>
            </div>
            <div class="field-group">
              <label>Mesa asignada (opcional)</label>
              <select v-model="nuevaReserva.mesaId">
                <option value="">Sin asignar</option>
                <option v-for="m in tables" :key="m.id" :value="m.id">
                  Mesa {{ m.nr }} {{ m.zona ? `(${m.zona})` : '' }}
                </option>
              </select>
            </div>
            <div class="field-group">
              <label>Notas (opcional)</label>
              <input v-model="nuevaReserva.notas" placeholder="Ej: cumpleaños, alergias...">
            </div>
            <button
              class="btn-enviar-modal"
              :style="{ background: negocio.colorAcento || '#4f46e5' }"
              :disabled="isCreandoReserva"
              @click="crearReservaCamarero"
            >
              {{ isCreandoReserva ? 'Guardando...' : '📅 Guardar reserva' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
/* ── LAYOUT ── */
.pos-master-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  flex-direction: column;
}

.pos-inner-layout { display: flex; flex: 1; overflow: hidden; position: relative; }

/* Panel derecho eliminado — el centro ahora ocupa todo */
.pos-sidebar-container {
  width: 260px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 20;
  flex-shrink: 0;
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.pos-center-container  { flex: 1; display: flex; flex-direction: column; background: white; position: relative; min-width: 0; }

/* Botón hamburguesa — oculto por defecto, solo aparece en móvil */
.btn-menu-movil {
  display: none;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  transition: background 0.15s;
}
.btn-menu-movil:hover { background: #f8fafc; }
.btn-menu-movil span {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--color-acento, #4f46e5);
  border-radius: 2px;
}

.sidebar-backdrop-movil { display: none; }

@media (max-width: 768px) {
  .pos-sidebar-container {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: min(280px, 85vw);
    transform: translateX(-105%);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.3);
    z-index: 50;
  }
  .pos-sidebar-container.sidebar-abierto-movil {
    transform: translateX(0);
  }
  .sidebar-backdrop-movil {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 40;
    animation: fadeIn 0.2s ease-out;
  }
  .btn-menu-movil { display: flex; }
  .header-spacer { display: none; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
}

/* ── MAP HEADER ── */
.map-header {
  height: 68px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  box-shadow: 0 1px 0 var(--border, #e2e8f0), 0 4px 12px rgba(15, 23, 42, 0.03);
}

.tabs-zone {
  display: flex;
  background: #f1f5f9;
  padding: 5px;
  border-radius: var(--radius-md, 12px);
  gap: 4px;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
}

.tabs-zone button {
  border: none;
  background: transparent;
  padding: 9px 18px;
  border-radius: var(--radius-sm, 8px);
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.18s ease;
}

.tabs-zone button:hover:not(.active) { color: #0f172a; background: rgba(255, 255, 255, 0.6); }

.tabs-zone button.active {
  background: linear-gradient(135deg, var(--color-acento, #4f46e5), color-mix(in srgb, var(--color-acento, #4f46e5) 75%, #000));
  color: white;
  box-shadow: var(--shadow-glow), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.map-area {
  flex: 1;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.04), transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(124, 58, 237, 0.04), transparent 50%),
    #eef2f7;
  position: relative;
}

/* ── MODAL TOMAR NOTA ── */
.carta-backdrop {
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.tomar-nota-modal {
  width: min(1180px, 94vw);
  height: min(760px, 90vh);
  background: #f8fafc;
  border-radius: var(--radius-xl, 22px);
  box-shadow:
    0 40px 80px rgba(15, 23, 42, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.tomar-nota-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 26px;
  background: white;
  border-bottom: 3px solid var(--color-acento, #4f46e5);
  position: relative;
}

.tomar-nota-kicker {
  display: block;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tomar-nota-header h2 { margin: 0; color: #0f172a; font-size: 1.6rem; font-weight: 900; }
.tomar-nota-header p  { margin: 4px 0 0; color: #64748b; font-size: 0.88rem; font-weight: 600; }

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
  border: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  border-radius: var(--radius-md, 14px);
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-weight: 800;
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s, box-shadow 0.18s, background 0.18s, border-color 0.18s;
}

.carta-category-btn:hover {
  background: white;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.carta-category-btn.active {
  background: white;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: color-mix(in srgb, var(--color-acento, #4f46e5) 40%, transparent);
}

.carta-category-media {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  font-size: 1.35rem;
}

.carta-category-media img { width: 100%; height: 100%; object-fit: cover; }

.carta-products-area { min-width: 0; overflow-y: auto; padding: 24px; }

.carta-section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.carta-section-title h3 { margin: 0; color: #0f172a; font-size: 1.35rem; font-weight: 900; }
.carta-section-title p  { margin: 4px 0 0; color: #64748b; font-size: 0.86rem; font-weight: 600; }

.carta-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}

.carta-product-card {
  border: 1px solid var(--border, #e2e8f0);
  background: white;
  border-radius: var(--radius-lg, 16px);
  padding: 12px;
  min-height: 216px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.18s;
}

.carta-product-card:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--color-acento, #4f46e5) 35%, transparent);
  box-shadow: var(--shadow-lg);
}

.carta-product-media {
  height: 112px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  font-size: 2.4rem;
}

.carta-product-media img { width: 100%; height: 100%; object-fit: cover; }

.carta-product-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.carta-product-info strong { color: #0f172a; font-size: 0.98rem; line-height: 1.25; overflow-wrap: anywhere; }
.carta-product-info small  { color: #94a3b8; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
.carta-product-price { font-weight: 900; font-size: 1.08rem; }

/* Etiqueta de stock en la carta */
.carta-product-stock {
  font-size: 0.72rem;
  font-weight: 800;
  color: #16a34a;
  margin-top: 2px;
}
.carta-product-stock.bajo { color: #d97706; }
.carta-product-stock.cero { color: #dc2626; }

/* Producto agotado: no clicable y atenuado */
.carta-product-card.agotado {
  cursor: not-allowed;
  opacity: 0.55;
  filter: grayscale(0.4);
}
.carta-product-card.agotado:hover {
  transform: none;
  border-color: var(--border, #e2e8f0);
  box-shadow: var(--shadow-sm);
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

/* ── RESUMEN PEDIDO EN MODAL ── */
.carta-order-summary {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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

.summary-header h3 { margin: 0; color: #0f172a; font-size: 1.05rem; font-weight: 900; }
.summary-header span { color: #64748b; font-weight: 800; font-size: 0.8rem; }

.summary-empty { margin: auto 20px; color: #94a3b8; text-align: center; line-height: 1.45; font-weight: 600; }

.summary-items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  background: #f8fafc;
}

.summary-item {
  display: grid;
  grid-template-columns: 92px minmax(0,1fr) 30px 30px;
  align-items: center;
  gap: 8px;
}

.qty-control {
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.qty-btn {
  width: 26px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-acento, #4f46e5);
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
  line-height: 1;
  transition: background 0.15s;
  flex-shrink: 0;
}
.qty-btn:hover { background: #f1f5f9; }
.qty-input {
  width: 36px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
  outline: none;
  padding: 0;
  font-family: inherit;
  -moz-appearance: textfield;
}
.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

.summary-info { min-width: 0; }
.summary-item strong { display: block; color: #0f172a; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-item small  { color: #64748b; font-weight: 800; }

.btn-nota {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: #e0e7ff; color: #4338ca;
  cursor: pointer; font-size: 0.85rem;
  transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.btn-nota:hover { background: #c7d2fe; }
.btn-nota.active { background: #fef3c7; color: #b45309; box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.25); }

.btn-remove {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: #fee2e2; color: #dc2626;
  cursor: pointer; font-weight: 900;
}

.summary-nota-row { display: flex; }
.summary-nota-input {
  flex: 1;
  border: 1px solid #fde68a;
  background: white;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.summary-nota-input:focus {
  border-color: #d97706;
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.18);
}

.summary-nota-preview {
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-left: 3px solid #d97706;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  word-break: break-word;
}
.summary-nota-preview:hover { background: #fde68a; }

.summary-footer { padding: 20px; border-top: 1px solid #e2e8f0; }

.summary-total { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.summary-total span   { color: #64748b; font-weight: 800; }
.summary-total strong { color: #0f172a; font-size: 1.45rem; font-weight: 900; }

.btn-enviar-modal {
  width: 100%;
  border: none;
  border-radius: var(--radius-md, 12px);
  color: white;
  padding: 15px;
  font-weight: 800;
  font-size: 0.95rem;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: filter 0.2s, transform 0.2s, box-shadow 0.2s;
  box-shadow: var(--shadow-glow);
}

.btn-enviar-modal:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-2px);
  box-shadow: 0 14px 30px color-mix(in srgb, var(--color-acento, #4f46e5) 40%, transparent);
}
.btn-enviar-modal:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── TICKET ── */
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.28), 0 8px 20px rgba(15, 23, 42, 0.12);
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
.ticket-iva-row  { display: flex; justify-content: space-between; font-size: 0.86rem; color: #64748b; font-weight: 600; margin-bottom: 4px; }
.ticket-total    { display: flex; justify-content: space-between; font-size: 1.3rem; font-weight: 900; color: #000; margin-top: 4px; }

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
.btn-cancelar, .btn-cobrar {
  flex: 1; padding: 14px; border: none;
  border-radius: var(--radius-md, 12px);
  font-weight: 700; cursor: pointer; font-size: 0.95rem;
  transition: transform 0.18s, box-shadow 0.18s, filter 0.2s;
}
.btn-cancelar { background: #f1f5f9; color: #64748b; }
.btn-cancelar:hover { background: #e2e8f0; color: #334155; }
.btn-cobrar {
  background: linear-gradient(135deg, #22c55e, #15803d);
  color: white;
  box-shadow: 0 10px 22px rgba(22, 163, 74, 0.32);
}
.btn-cobrar:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(22, 163, 74, 0.4);
}
.btn-cobrar:disabled { opacity: 0.5; cursor: not-allowed; }

.ticket-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.t-item { display: flex; justify-content: space-between; align-items: flex-start; font-size: 0.95rem; }
.t-qty  { width: 35px; font-weight: bold; flex-shrink: 0; }
.t-name { flex: 1; padding-right: 15px; word-break: break-word; }
.t-price{ font-weight: bold; flex-shrink: 0; text-align: right; }
.ticket-empty { color: #94a3b8; font-size: 0.85rem; text-align: center; padding: 10px 0; }

/* ── MONITOR ── */
.monitor-modal {
  background: white;
  width: 800px;
  max-width: 95vw;
  height: 600px;
  border-radius: var(--radius-xl, 20px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 40px 80px rgba(15, 23, 42, 0.35);
  animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
  border: 1px solid var(--border, #cbd5e1);
  border-radius: var(--radius-md, 10px);
  background: white;
  cursor: pointer;
  text-align: left;
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s, background 0.18s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mtb-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mtb-mesa { font-weight: 700; }
.mtb-zona { font-weight: 500; opacity: 0.85; }

.monitor-table-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }

.monitor-table-btn.tiene-listos {
  border-color: #22c55e;
  background: linear-gradient(160deg, #f0fdf4, #dcfce7);
  color: #15803d;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.15);
}

.badge-listo {
  background: #16a34a;
  color: white;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.monitor-content { flex: 1; padding: 24px; overflow-y: auto; }

.comanda-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 14px);
  padding: 16px;
  margin-bottom: 16px;
  background: white;
  box-shadow: var(--shadow-xs);
  transition: box-shadow 0.18s;
}
.comanda-card:hover { box-shadow: var(--shadow-sm); }

.comanda-lista {
  border-color: #22c55e;
  background: linear-gradient(160deg, #f0fdf4, #dcfce7);
  box-shadow: 0 8px 22px rgba(22, 163, 74, 0.12);
}

.c-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dashed #cbd5e1;
  margin-bottom: 12px;
  padding-bottom: 12px;
}

.c-status { font-size: 0.8rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; }
.c-status.en-cocina     { background: #fef3c7; color: #b45309; }
.c-status.listo         { background: #dcfce7; color: #16a34a; }
.c-status.para-camarero { background: #fed7aa; color: #c2410c; }
.c-status.entregado     { background: #e0e7ff; color: #4338ca; }
.c-status.pagado        { background: #f1f5f9; color: #64748b; }

.c-lines {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.c-linea {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #475569;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s;
}

.c-linea-lista {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  font-weight: 700;
}

.c-linea-check {
  font-size: 0.8rem;
  font-weight: 800;
  width: 16px;
  flex-shrink: 0;
  color: #94a3b8;
}

.c-linea-lista .c-linea-check { color: #16a34a; }

.c-actions { margin-top: 12px; }

.btn-entregar {
  background: linear-gradient(135deg, #22c55e, #15803d);
  color: white;
  border: none;
  padding: 9px 18px;
  border-radius: var(--radius-sm, 10px);
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s, transform 0.18s, box-shadow 0.18s;
  box-shadow: 0 6px 14px rgba(22, 163, 74, 0.28);
}

.c-linea-entregada {
  opacity: 0.4;
  background: rgba(34, 197, 94, 0.08);
  color: #15803d;
  text-decoration: line-through;
}

.c-linea-texto { flex: 1; }

.btn-servir-linea {
  background: #16a34a;
  color: white;
  border: none;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s;
  flex-shrink: 0;
}

.btn-servir-linea:hover { filter: brightness(1.05); transform: translateY(-1px); }
.btn-entregar:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(22, 163, 74, 0.4);
}

/* ── PANEL CAMARERO ── */
.camarero-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.camarero-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.camarero-card {
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-left: 4px solid #d97706;
  border-radius: var(--radius-md, 14px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s, box-shadow 0.18s;
}
.camarero-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

.camarero-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
}

.camarero-mesa  { display: block; font-weight: 800; color: #0f172a; font-size: 1rem; }
.camarero-zona  { display: block; font-size: 0.72rem; color: #64748b; font-weight: 600; margin-top: 2px; }
.camarero-hora  { font-size: 0.78rem; color: #94a3b8; font-weight: 600; }

.camarero-lineas {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.camarero-linea {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  transition: all 0.2s;
}

.camarero-linea-servida {
  background: #f0fdf4 !important;
  border-color: #bbf7d0 !important;
  opacity: 0.6;
}

.camarero-linea-qty    { font-weight: 800; color: #b45309; font-size: 0.88rem; flex-shrink: 0; }
.camarero-linea-nombre { flex: 1; font-weight: 600; color: #0f172a; font-size: 0.9rem; }

.btn-servir-linea-camarero {
  background: linear-gradient(135deg, #f59e0b, #b45309);
  color: white;
  border: none;
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s, transform 0.18s, box-shadow 0.18s;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(217, 119, 6, 0.28);
}

.btn-servir-linea-camarero:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(217, 119, 6, 0.4);
}

.servido-check {
  font-size: 0.72rem;
  font-weight: 700;
  color: #16a34a;
  flex-shrink: 0;
}

.btn-todo-servido {
  width: 100%;
  padding: 10px;
  background: rgba(217, 119, 6, 0.1);
  color: #d97706;
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-todo-servido:hover { background: #d97706; color: white; }

/* ── AVISOS FLOTANTES (solo móvil) ── */
/* Ocultos por defecto: en escritorio el sidebar ya muestra los contadores. */
.avisos-movil { display: none; }

.aviso-movil {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 16px;
  border: none;
  border-radius: 14px;
  color: white;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
}
.aviso-movil.aviso-cocina  { background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 10px 28px rgba(22, 163, 74, 0.5); }
.aviso-movil.aviso-bebidas { background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 10px 28px rgba(217, 119, 6, 0.5); }

.aviso-texto { flex: 1; text-align: left; line-height: 1.3; }
.aviso-chevron { font-size: 1.4rem; font-weight: 900; flex-shrink: 0; }
.aviso-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: white;
  flex-shrink: 0;
  animation: avisoDot 1.4s infinite;
}

@keyframes avisoDot {
  0%   { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.75); }
  70%  { box-shadow: 0 0 0 9px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
}

.aviso-slide-enter-active,
.aviso-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.aviso-slide-enter-from,
.aviso-slide-leave-to { transform: translateY(140%); opacity: 0; }

/* ── RESPONSIVE ── */
@media (max-width: 1100px) {
  .tomar-nota-body { grid-template-columns: 1fr; }
  .carta-order-summary { max-height: 260px; border-left: none; border-top: 1px solid #e2e8f0; }
}

@media (max-width: 780px) {
  /* ── Tomar nota → fullscreen y compacto ── */
  .tomar-nota-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
  .tomar-nota-header { padding: 10px 14px; gap: 10px; }
  .tomar-nota-kicker { font-size: 0.62rem; margin-bottom: 1px; }
  .tomar-nota-header h2 { font-size: 1.05rem; }
  .tomar-nota-header p  { font-size: 0.76rem; margin-top: 1px; }
  .btn-close-carta { padding: 8px 12px; font-size: 0.82rem; }

  /* Carta arriba flexible, carrito abajo con altura propia */
  .tomar-nota-body { grid-template-rows: minmax(0, 1fr) auto; }
  .carta-menu-section { grid-template-columns: 1fr; }

  /* Categorías como chips compactos en fila */
  .carta-category-rail {
    flex-direction: row; overflow-x: auto; overflow-y: hidden;
    border-right: none; border-bottom: 1px solid #e2e8f0;
    padding: 8px 10px; gap: 6px; max-height: none;
  }
  .carta-category-btn { min-width: 0; flex-shrink: 0; padding: 6px 10px; gap: 6px; font-size: 0.8rem; }
  .carta-category-media { width: 26px; height: 26px; font-size: 0.95rem; }

  .carta-products-area { padding: 12px; }
  .carta-section-title { margin-bottom: 10px; }
  .carta-section-title h3 { font-size: 1.05rem; }
  .carta-section-title p  { font-size: 0.74rem; }

  /* Productos como lista compacta de filas — se navega mucho mejor */
  .carta-products-grid { grid-template-columns: 1fr; gap: 8px; }
  .carta-product-card {
    flex-direction: row;
    align-items: center;
    min-height: 0;
    padding: 8px 10px;
    gap: 10px;
  }
  .carta-product-media { width: 50px; height: 50px; flex-shrink: 0; border-radius: 10px; font-size: 1.5rem; }
  .carta-product-info { flex: 1; }
  .carta-product-info strong { font-size: 0.9rem; }
  /* La categoría es redundante dentro de la carta — se oculta en móvil */
  .carta-product-info small { display: none; }
  .carta-product-price { font-size: 1rem; flex-shrink: 0; }

  /* El carrito ocupa hasta algo más de medio alto: sitio real para
     ver y modificar lo pedido. El botón de enviar queda abajo del todo. */
  .carta-order-summary { max-height: 56vh; border-left: none; border-top: 1px solid #e2e8f0; }
  .summary-header { padding: 12px 16px; }
  .summary-items { padding: 12px; gap: 8px; }
  .summary-footer { padding: 12px 16px; }
  .summary-total { margin-bottom: 8px; }
  .summary-total strong { font-size: 1.2rem; }
  .btn-enviar-modal { padding: 12px; }

  /* Resto de modales → fullscreen también */
  .modal-backdrop { padding: 0; }
  .monitor-modal,
  .reserva-modal {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    max-width: 100vw;
    border-radius: 0;
  }
  .ticket-paper { width: 92vw; max-width: 360px; }
  .modal-actions { width: 92vw; max-width: 360px; }

  /* ── Monitor de pedidos compacto ── */
  .monitor-header { padding: 12px 14px; }
  .monitor-header h2 { font-size: 0.92rem; }
  .monitor-body { flex-direction: column; }
  .monitor-sidebar {
    width: 100%; max-height: none;
    border-right: none; border-bottom: 1px solid #e2e8f0;
    display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden;
    padding: 10px;
  }
  .monitor-sidebar > h3 { display: none; }
  .monitor-table-btn { width: auto; min-width: 124px; flex-shrink: 0; margin-bottom: 0; padding: 8px 10px; font-size: 0.82rem; }
  .monitor-content { padding: 14px; }
  .comanda-card { padding: 12px; margin-bottom: 10px; }

  /* Header del mapa: tabs en scroll horizontal si no caben */
  .map-header { padding: 0 14px; gap: 12px; }
  .tabs-zone { overflow-x: auto; flex-shrink: 1; min-width: 0; }
  .tabs-zone button { padding: 8px 14px; font-size: 0.8rem; flex-shrink: 0; }

  /* Avisos flotantes apilados abajo (cocina + bebidas) */
  .avisos-movil {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 14px;
    z-index: 35;
  }

  /* Modal nueva reserva: fila de 3 inputs apilada */
  .reserva-modal-row { grid-template-columns: 1fr 1fr; }
  .reserva-modal-row .field-group:first-child { grid-column: 1 / -1; }
  /* La fila de contacto (teléfono/email) se mantiene en 2 columnas */
  .reserva-modal-row-2 .field-group:first-child { grid-column: auto; }
}

@media (max-width: 480px) {
  .carta-products-grid { grid-template-columns: 1fr; }
  .summary-item { grid-template-columns: 84px minmax(0,1fr) 28px 28px; gap: 6px; }
  .qty-control { box-shadow: none; }
  .qty-btn { width: 24px; height: 26px; }
  .qty-input { width: 30px; font-size: 0.88rem; }
}

/* ── MODAL LISTA DE RESERVAS (camarero) ── */
.lista-reservas-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
.lista-reservas-grid { display: flex; flex-direction: column; gap: 10px; }

.reserva-row-cam {
  display: grid;
  grid-template-columns: 80px 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: white;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #94a3b8;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
}
.reserva-row-cam.reserva-pendiente  { border-left-color: #d97706; }
.reserva-row-cam.reserva-confirmada { border-left-color: #16a34a; background: linear-gradient(160deg, #f0fdf4, white); }
.reserva-row-cam.reserva-cumplida   { border-left-color: #4338ca; opacity: 0.7; }
.reserva-row-cam.reserva-cancelada  { border-left-color: #dc2626; opacity: 0.5; }

.reserva-row-hora {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 10px; background: #f8fafc; border-radius: 10px;
}
.r-hora-num { font-size: 1.1rem; font-weight: 800; color: #0f172a; line-height: 1; font-variant-numeric: tabular-nums; }
.r-personas { font-size: 0.68rem; font-weight: 700; color: #64748b; }

.reserva-row-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.reserva-row-info strong { font-size: 0.95rem; font-weight: 800; color: #0f172a; }
.reserva-row-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.76rem; color: #64748b; font-weight: 600; }
.reserva-row-notas {
  font-size: 0.74rem; font-weight: 600; color: #b45309;
  background: #fef3c7; border-left: 3px solid #d97706;
  padding: 3px 7px; border-radius: 6px; margin-top: 2px;
}

.reserva-row-estado { font-size: 0.7rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.3px; }
.reserva-row-estado.pendiente  { background: #fef3c7; color: #b45309; }
.reserva-row-estado.confirmada { background: #dcfce7; color: #16a34a; }
.reserva-row-estado.cumplida   { background: #e0e7ff; color: #4338ca; }
.reserva-row-estado.cancelada  { background: #fee2e2; color: #dc2626; }

.reserva-row-actions { display: flex; gap: 6px; }
.reserva-row-actions .r-btn {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid #e2e8f0; background: white; cursor: pointer;
  font-size: 0.85rem; transition: transform 0.15s, filter 0.18s;
}
.reserva-row-actions .r-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
.reserva-row-actions .r-btn.confirm  { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }
.reserva-row-actions .r-btn.cumplida { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }
.reserva-row-actions .r-btn.cancel   { background: #fef3c7; color: #b45309; border-color: #fde68a; }
.reserva-row-actions .r-btn.whatsapp { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }

.btn-atender-reserva {
  padding: 7px 14px;
  background: linear-gradient(135deg, #22c55e, #15803d);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.18s, filter 0.18s;
  box-shadow: 0 4px 10px rgba(22, 163, 74, 0.28);
  white-space: nowrap;
}
.btn-atender-reserva:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 8px 18px rgba(22, 163, 74, 0.38);
}
.btn-atender-reserva.btn-cumplida {
  background: linear-gradient(135deg, #6366f1, #4338ca);
  box-shadow: 0 4px 10px rgba(67, 56, 202, 0.3);
}
.btn-atender-reserva.btn-cumplida:hover {
  box-shadow: 0 8px 18px rgba(67, 56, 202, 0.4);
}

/* ── MODAL NUEVA RESERVA (camarero) ── */
.reserva-modal {
  width: min(560px, 94vw);
  background: white;
  border-radius: var(--radius-xl, 22px);
  box-shadow: 0 40px 80px rgba(15, 23, 42, 0.35);
  overflow: hidden;
  animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.reserva-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px 26px;
  border-bottom: 3px solid #4f46e5;
}
.reserva-modal-kicker {
  display: block;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.reserva-modal-header h2 { margin: 0; color: #0f172a; font-size: 1.4rem; font-weight: 900; }
.reserva-modal-body {
  padding: 22px 26px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.reserva-modal-row {
  display: grid;
  grid-template-columns: 90px 1fr 1fr;
  gap: 12px;
}
.reserva-modal-row .field-group { min-width: 0; }
.reserva-modal-row-2 { grid-template-columns: 1fr 1fr; }
.contacto-hint {
  font-size: 0.76rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}
.reserva-modal-body .field-group { display: flex; flex-direction: column; gap: 6px; }
.reserva-modal-body .field-group label { font-size: 0.78rem; font-weight: 700; color: #475569; }
.reserva-modal-body .field-group input,
.reserva-modal-body .field-group select {
  padding: 11px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  width: 100%;
  box-sizing: border-box;
}
.reserva-modal-body .field-group input:focus,
.reserva-modal-body .field-group select:focus {
  border-color: var(--color-acento, #4f46e5);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-acento, #4f46e5) 18%, transparent);
}

@keyframes modalIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>