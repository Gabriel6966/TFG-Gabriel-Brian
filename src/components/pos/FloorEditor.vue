<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import {
  collection, onSnapshot, addDoc,
  deleteDoc, doc, updateDoc, query, where
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useNotify } from '../../composables/useNotify'

const { toast, confirm: confirmDialog } = useNotify()

// ── TIPOS ────────────────────────────────────────────────────────

interface ElementoDecorativo {
  id: string
  tipo: string
  x: number
  y: number
  w?: number
  h?: number
  zonaId: string
  localId: string
}

interface Mesa {
  id: string
  nr: number
  nombre?: string
  status: string
  capacity: number
  x?: number
  y?: number
}

const props = defineProps<{
  localId: string
  zonaId: string
  zonaNombre: string
  mesas: Mesa[]
  mesaSeleccionada: number | null
}>()

const emit = defineEmits<{
  (e: 'select-table', table: Mesa): void
  (e: 'update-mesa-position', id: string, x: number, y: number): void
}>()

// ── CATÁLOGO ─────────────────────────────────────────────────────

const CATALOGO = [
  {
    tipo: 'barra', label: 'Barra', descripcion: 'Barra del local (horizontal)',
    svgPath: `<rect x="5" y="35" width="90" height="30" rx="4" fill="#92400e"/>
      <rect x="5" y="35" width="90" height="8" rx="4" fill="#b45309"/>
      <rect x="8" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="20" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="32" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="44" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="56" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="68" y="55" width="6" height="8" rx="2" fill="#78350f"/>
      <rect x="80" y="55" width="6" height="8" rx="2" fill="#78350f"/>`,
    w: 140, h: 44,
  },
  {
    tipo: 'barra-vertical', label: 'Barra V', descripcion: 'Barra del local (vertical)',
    svgPath: `<rect x="35" y="5" width="30" height="90" rx="4" fill="#92400e"/>
      <rect x="35" y="5" width="30" height="8" rx="4" fill="#b45309"/>
      <rect x="55" y="8"  width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="20" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="32" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="44" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="56" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="68" width="8" height="6" rx="2" fill="#78350f"/>
      <rect x="55" y="80" width="8" height="6" rx="2" fill="#78350f"/>`,
    w: 44, h: 140,
  },
  {
    tipo: 'puerta', label: 'Puerta', descripcion: 'Entrada / salida',
    svgPath: `<rect x="10" y="20" width="80" height="75" rx="3" fill="#94a3b8"/>
      <path d="M10 20 Q50 5 90 20" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
      <rect x="15" y="25" width="70" height="65" rx="2" fill="#e2e8f0"/>
      <circle cx="72" cy="58" r="4" fill="#64748b"/>
      <line x1="50" y1="25" x2="50" y2="90" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="50" y="15" text-anchor="middle" font-size="10" fill="#475569" font-weight="bold">ENTRADA</text>`,
    w: 58, h: 58,
  },
  {
    tipo: 'banos', label: 'Baños', descripcion: 'Aseos',
    svgPath: `<rect x="5" y="5" width="90" height="90" rx="8" fill="#bfdbfe"/>
      <rect x="5" y="5" width="90" height="90" rx="8" fill="none" stroke="#3b82f6" stroke-width="3"/>
      <text x="50" y="45" text-anchor="middle" font-size="22" fill="#1d4ed8" font-weight="900">WC</text>
      <circle cx="32" cy="68" r="8" fill="none" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="32" y1="60" x2="32" y2="52" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="26" y1="65" x2="38" y2="65" stroke="#1d4ed8" stroke-width="2"/>
      <circle cx="68" cy="68" r="8" fill="none" stroke="#1d4ed8" stroke-width="2"/>
      <line x1="68" y1="60" x2="68" y2="52" stroke="#1d4ed8" stroke-width="2"/>
      <path d="M62 65 Q68 72 74 65" fill="none" stroke="#1d4ed8" stroke-width="2"/>`,
    w: 58, h: 58,
  },
  {
    tipo: 'caja', label: 'Caja', descripcion: 'Caja registradora',
    svgPath: `<rect x="10" y="25" width="80" height="60" rx="6" fill="#1e293b"/>
      <rect x="15" y="30" width="70" height="30" rx="4" fill="#334155"/>
      <rect x="20" y="35" width="60" height="20" rx="3" fill="#0f172a"/>
      <rect x="25" y="38" width="10" height="6" rx="1" fill="#22c55e"/>
      <rect x="38" y="38" width="10" height="6" rx="1" fill="#64748b"/>
      <rect x="51" y="38" width="10" height="6" rx="1" fill="#64748b"/>
      <rect x="64" y="38" width="6"  height="6" rx="1" fill="#ef4444"/>
      <rect x="30" y="65" width="40" height="12" rx="3" fill="#0f172a"/>
      <rect x="42" y="68" width="16" height="6"  rx="2" fill="#334155"/>
      <text x="50" y="22" text-anchor="middle" font-size="9" fill="#64748b" font-weight="bold">CAJA</text>`,
    w: 58, h: 58,
  },
  {
    tipo: 'planta', label: 'Planta', descripcion: 'Decoración vegetal',
    svgPath: `<ellipse cx="50" cy="55" rx="30" ry="25" fill="#15803d"/>
      <ellipse cx="35" cy="45" rx="20" ry="18" fill="#16a34a"/>
      <ellipse cx="65" cy="42" rx="22" ry="16" fill="#16a34a"/>
      <ellipse cx="50" cy="35" rx="18" ry="15" fill="#22c55e"/>
      <rect x="44" y="72" width="12" height="20" rx="3" fill="#854d0e"/>
      <ellipse cx="50" cy="72" rx="18" ry="6" fill="#166534"/>`,
    w: 52, h: 52,
  },
  {
    tipo: 'tabique', label: 'Tabique', descripcion: 'Pared divisoria (horizontal)',
    svgPath: `<rect x="5" y="40" width="90" height="20" rx="3" fill="#475569"/>
      <line x1="15" y1="40" x2="15" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="25" y1="40" x2="25" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="35" y1="40" x2="35" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="45" y1="40" x2="45" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="55" y1="40" x2="55" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="65" y1="40" x2="65" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="75" y1="40" x2="75" y2="60" stroke="#334155" stroke-width="1"/>
      <line x1="85" y1="40" x2="85" y2="60" stroke="#334155" stroke-width="1"/>`,
    w: 140, h: 32,
  },
  {
    tipo: 'tabique-vertical', label: 'Tabique V', descripcion: 'Pared divisoria (vertical)',
    svgPath: `<rect x="40" y="5" width="20" height="90" rx="3" fill="#475569"/>
      <line x1="40" y1="15" x2="60" y2="15" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="25" x2="60" y2="25" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="35" x2="60" y2="35" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="45" x2="60" y2="45" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="55" x2="60" y2="55" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="65" x2="60" y2="65" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="75" x2="60" y2="75" stroke="#334155" stroke-width="1"/>
      <line x1="40" y1="85" x2="60" y2="85" stroke="#334155" stroke-width="1"/>`,
    w: 32, h: 140,
  },
  {
    tipo: 'mostrador', label: 'Mostrador', descripcion: 'Mostrador / vitrina',
    svgPath: `<rect x="5" y="30" width="90" height="45" rx="5" fill="#d97706"/>
      <rect x="5" y="30" width="90" height="12" rx="5" fill="#f59e0b"/>
      <rect x="10" y="46" width="80" height="25" rx="3" fill="#b45309"/>
      <rect x="15" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>
      <rect x="40" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>
      <rect x="65" y="49" width="20" height="18" rx="2" fill="#fef3c7" opacity="0.6"/>`,
    w: 120, h: 48,
  },
  {
    tipo: 'ventana', label: 'Ventana', descripcion: 'Ventana exterior',
    svgPath: `<rect x="5" y="25" width="90" height="50" rx="3" fill="#bae6fd"/>
      <rect x="5" y="25" width="90" height="50" rx="3" fill="none" stroke="#0284c7" stroke-width="4"/>
      <line x1="50" y1="25" x2="50" y2="75" stroke="#0284c7" stroke-width="3"/>
      <line x1="5"  y1="50" x2="95" y2="50" stroke="#0284c7" stroke-width="3"/>
      <rect x="8" y="28" width="38" height="20" rx="1" fill="white" opacity="0.4"/>`,
    w: 72, h: 40,
  },
  {
    tipo: 'escalera', label: 'Escalera', descripcion: 'Escaleras',
    svgPath: `<rect x="5" y="5" width="90" height="90" rx="4" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>
      <rect x="5"  y="5"  width="90" height="14" rx="2" fill="#cbd5e1"/>
      <rect x="5"  y="19" width="77" height="14" fill="#e2e8f0"/>
      <rect x="5"  y="33" width="64" height="14" fill="#cbd5e1"/>
      <rect x="5"  y="47" width="51" height="14" fill="#e2e8f0"/>
      <rect x="5"  y="61" width="38" height="14" fill="#cbd5e1"/>
      <rect x="5"  y="75" width="25" height="14" fill="#e2e8f0"/>
      <text x="90" y="98" text-anchor="end" font-size="9" fill="#64748b" font-weight="bold">ESC</text>`,
    w: 70, h: 70,
  },
  {
    tipo: 'tv', label: 'TV', descripcion: 'Televisión / pantalla',
    svgPath: `<rect x="5" y="15" width="90" height="60" rx="4" fill="#0f172a"/>
      <rect x="10" y="20" width="80" height="50" rx="2" fill="#1e293b"/>
      <rect x="12" y="22" width="76" height="46" rx="1" fill="#334155"/>
      <rect x="38" y="75" width="24" height="8" rx="2" fill="#0f172a"/>
      <rect x="28" y="83" width="44" height="4" rx="2" fill="#0f172a"/>
      <circle cx="85" cy="68" r="3" fill="#22c55e"/>`,
    w: 80, h: 55,
  },
]

const PASO_PEQUENO = 10
const PASO_GRANDE  = 20
const MIN_SIZE = 20
const MAX_SIZE = 400

// ── ESTADO ────────────────────────────────────────────────────────

const mapRef = ref<HTMLElement | null>(null)
const elementos = ref<ElementoDecorativo[]>([])

// Tooltip elemento
const elementoSeleccionadoId = ref<string | null>(null)
const elTooltipX = ref(0)
const elTooltipY = ref(0)
const elTooltipAbajo = ref(false)
const editandoW = ref(0)
const editandoH = ref(0)
const guardandoElemento = ref(false)
const EL_TOOLTIP_HEIGHT = 280

// Tooltip mesa
const mesaTooltipId = ref<string | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipAbajo = ref(false)
const editandoCapacidad = ref<number>(4)
const editandoNombre = ref<string>('')
const guardandoMesa = ref(false)
const TOOLTIP_HEIGHT = 220

// Drag
const isDragging = ref(false)
const draggingId = ref<string | null>(null)
const draggingType = ref<'elemento' | 'mesa' | null>(null)
const draggingFromPalette = ref<string | null>(null)
const didDrag = ref(false)
const mouseDownX = ref(0)
const mouseDownY = ref(0)
const DRAG_THRESHOLD = 5

let unsubscribeElementos: (() => void) | null = null

// ── HELPERS TAMAÑO ────────────────────────────────────────────────

const getW = (el: ElementoDecorativo) =>
  el.w ?? (CATALOGO.find(c => c.tipo === el.tipo)?.w ?? 60)

const getH = (el: ElementoDecorativo) =>
  el.h ?? (CATALOGO.find(c => c.tipo === el.tipo)?.h ?? 60)

// ── FIRESTORE ─────────────────────────────────────────────────────

const cargarElementos = (zonaId: string) => {
  if (unsubscribeElementos) unsubscribeElementos()
  const q = query(
    collection(db, `locales/${props.localId}/elementosDecor`),
    where('zonaId', '==', zonaId)
  )
  unsubscribeElementos = onSnapshot(q, (snap) => {
    elementos.value = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ElementoDecorativo[]
  })
}

const guardarElemento = async (tipo: string, x: number, y: number) => {
  const cat = CATALOGO.find(c => c.tipo === tipo)
  await addDoc(collection(db, `locales/${props.localId}/elementosDecor`), {
    tipo, x, y,
    w: cat?.w ?? 60,
    h: cat?.h ?? 60,
    zonaId: props.zonaId,
    localId: props.localId
  })
}

const moverElemento = async (id: string, x: number, y: number) => {
  await updateDoc(doc(db, `locales/${props.localId}/elementosDecor`, id), { x, y })
}

const guardarTamanoElemento = async (id: string) => {
  guardandoElemento.value = true
  try {
    await updateDoc(doc(db, `locales/${props.localId}/elementosDecor`, id), {
      w: editandoW.value,
      h: editandoH.value
    })
    elementoSeleccionadoId.value = null
  } catch {
    toast.error('No se pudo guardar el tamaño.')
  } finally {
    guardandoElemento.value = false
  }
}

const eliminarElemento = async (id: string) => {
  await deleteDoc(doc(db, `locales/${props.localId}/elementosDecor`, id))
  if (elementoSeleccionadoId.value === id) elementoSeleccionadoId.value = null
}

watch(() => props.zonaId, (newId) => {
  if (newId) cargarElementos(newId)
}, { immediate: true })

onUnmounted(() => unsubscribeElementos?.())

// ── TOOLTIP ELEMENTO ──────────────────────────────────────────────

const abrirTooltipElemento = (el: ElementoDecorativo, elDom: HTMLElement) => {
  if (elementoSeleccionadoId.value === el.id) {
    elementoSeleccionadoId.value = null
    return
  }
  if (!mapRef.value) return
  const mapRect = mapRef.value.getBoundingClientRect()
  const elRect  = elDom.getBoundingClientRect()

  const cx = elRect.left + elRect.width / 2 - mapRect.left
  const cy = elRect.top - mapRect.top

  elTooltipAbajo.value = cy < EL_TOOLTIP_HEIGHT + 20
  elTooltipX.value = cx
  elTooltipY.value = elTooltipAbajo.value
    ? elRect.bottom - mapRect.top + 12
    : cy - 12

  elementoSeleccionadoId.value = el.id
  editandoW.value = getW(el)
  editandoH.value = getH(el)
  mesaTooltipId.value = null
}

const elTooltipStyle = () => ({
  left: `${elTooltipX.value}px`,
  top:  elTooltipAbajo.value ? `${elTooltipY.value}px` : 'auto',
  bottom: elTooltipAbajo.value
    ? 'auto'
    : `${(mapRef.value?.getBoundingClientRect().height ?? 0) - elTooltipY.value}px`,
  transform: 'translateX(-50%)',
})

// ── TOOLTIP MESA ──────────────────────────────────────────────────

const abrirTooltipMesa = (mesa: Mesa, mesaEl: HTMLElement) => {
  if (mesaTooltipId.value === mesa.id) {
    mesaTooltipId.value = null
    return
  }
  if (!mapRef.value) return
  const mapRect  = mapRef.value.getBoundingClientRect()
  const mesaRect = mesaEl.getBoundingClientRect()

  const cx = mesaRect.left + mesaRect.width / 2 - mapRect.left
  const cy = mesaRect.top - mapRect.top

  tooltipAbajo.value = cy < TOOLTIP_HEIGHT + 20
  tooltipX.value = cx
  tooltipY.value = tooltipAbajo.value
    ? mesaRect.bottom - mapRect.top + 12
    : cy - 12

  mesaTooltipId.value = mesa.id
  editandoCapacidad.value = mesa.capacity
  editandoNombre.value = mesa.nombre ?? `Mesa ${mesa.nr}`
  elementoSeleccionadoId.value = null
}

const guardarMesa = async (mesaId: string) => {
  if (!props.localId) return
  guardandoMesa.value = true
  try {
    await updateDoc(doc(db, `locales/${props.localId}/mesas`, mesaId), {
      capacidad: editandoCapacidad.value,
      nombre: editandoNombre.value.trim() || null
    })
    mesaTooltipId.value = null
  } catch {
    toast.error('No se pudo actualizar la mesa.')
  } finally {
    guardandoMesa.value = false
  }
}

const eliminarMesa = async (mesaId: string, mesaNr: number) => {
  if (!props.localId) return
  const ok = await confirmDialog({
    title: `Eliminar la Mesa ${mesaNr}`,
    message: 'Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    variant: 'danger'
  })
  if (!ok) return
  try {
    await deleteDoc(doc(db, `locales/${props.localId}/mesas`, mesaId))
    mesaTooltipId.value = null
    delete localMesaPos.value[mesaId]
  } catch {
    toast.error('No se pudo eliminar la mesa.')
  }
}

const tooltipStyle = () => ({
  left: `${tooltipX.value}px`,
  top: tooltipAbajo.value ? `${tooltipY.value}px` : 'auto',
  bottom: tooltipAbajo.value
    ? 'auto'
    : `${(mapRef.value?.getBoundingClientRect().height ?? 0) - tooltipY.value}px`,
  transform: 'translateX(-50%)',
})

// ── POSICIONES LOCALES DE MESAS ───────────────────────────────────

const localMesaPos = ref<Record<string, { x: number, y: number }>>({})

watch(() => props.mesas, (mesas) => {
  mesas.forEach((t, i) => {
    if (localMesaPos.value[t.id] === undefined) {
      localMesaPos.value[t.id] = {
        x: t.x ?? (12 + (i % 4) * 22),
        y: t.y ?? (15 + Math.floor(i / 4) * 20)
      }
    } else {
      if (t.x !== undefined) localMesaPos.value[t.id].x = t.x
      if (t.y !== undefined) localMesaPos.value[t.id].y = t.y
    }
  })
}, { immediate: true, deep: true })

// ── DRAG DESDE PALETA ─────────────────────────────────────────────

const startDragFromPalette = (tipo: string, e: DragEvent) => {
  draggingFromPalette.value = tipo
  e.dataTransfer?.setData('tipo', tipo)
}

const onDropInMap = async (e: DragEvent) => {
  e.preventDefault()
  if (!mapRef.value || !draggingFromPalette.value) return
  const rect = mapRef.value.getBoundingClientRect()
  const x = Math.max(2, Math.min(((e.clientX - rect.left) / rect.width) * 100, 90))
  const y = Math.max(2, Math.min(((e.clientY - rect.top) / rect.height) * 100, 90))
  await guardarElemento(draggingFromPalette.value, x, y)
  draggingFromPalette.value = null
}

const onDragOver = (e: DragEvent) => e.preventDefault()

// ── DRAG DE ELEMENTOS ─────────────────────────────────────────────

const startDragElemento = (e: MouseEvent, el: ElementoDecorativo) => {
  e.stopPropagation()
  isDragging.value = true
  didDrag.value = false
  draggingId.value = el.id
  draggingType.value = 'elemento'
  mesaTooltipId.value = null
  mouseDownX.value = e.clientX
  mouseDownY.value = e.clientY
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ── DRAG DE MESAS ─────────────────────────────────────────────────

const startDragMesa = (e: MouseEvent, mesa: Mesa) => {
  e.stopPropagation()
  isDragging.value = true
  didDrag.value = false
  draggingId.value = mesa.id
  draggingType.value = 'mesa'
  mouseDownX.value = e.clientX
  mouseDownY.value = e.clientY
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !mapRef.value || !draggingId.value) return
  const distX = Math.abs(e.clientX - mouseDownX.value)
  const distY = Math.abs(e.clientY - mouseDownY.value)
  if (distX > DRAG_THRESHOLD || distY > DRAG_THRESHOLD) didDrag.value = true
  if (!didDrag.value) return

  const rect = mapRef.value.getBoundingClientRect()
  const x = Math.max(2, Math.min(((e.clientX - rect.left) / rect.width) * 100, 95))
  const y = Math.max(2, Math.min(((e.clientY - rect.top) / rect.height) * 100, 95))

  if (draggingType.value === 'elemento') {
    const idx = elementos.value.findIndex(el => el.id === draggingId.value)
    if (idx !== -1) elementos.value[idx] = { ...elementos.value[idx], x, y }
  } else if (draggingType.value === 'mesa') {
    localMesaPos.value[draggingId.value] = { x, y }
    if (mesaTooltipId.value === draggingId.value) mesaTooltipId.value = null
  }
}

const onMouseUp = async (e: MouseEvent) => {
  if (!draggingId.value) return

  if (draggingType.value === 'elemento') {
    if (!didDrag.value) {
      const elDom = (e.target as HTMLElement).closest('.elemento-decor') as HTMLElement
      const el = elementos.value.find(el => el.id === draggingId.value)
      if (el && elDom) abrirTooltipElemento(el, elDom)
    } else {
      const el = elementos.value.find(el => el.id === draggingId.value)
      if (el) await moverElemento(el.id, el.x, el.y)
    }
  } else if (draggingType.value === 'mesa') {
    if (!didDrag.value) {
      const mesaEl = (e.target as HTMLElement).closest('.mesa-node') as HTMLElement
      const mesa = props.mesas.find(m => m.id === draggingId.value)
      if (mesa && mesaEl) abrirTooltipMesa(mesa, mesaEl)
    } else {
      const pos = localMesaPos.value[draggingId.value]
      if (pos) emit('update-mesa-position', draggingId.value, pos.x, pos.y)
    }
  }

  isDragging.value = false
  didDrag.value = false
  draggingId.value = null
  draggingType.value = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// ── HELPERS ESTILO ────────────────────────────────────────────────

const getCatalogItem = (tipo: string) => CATALOGO.find(c => c.tipo === tipo)

const getElementoStyle = (el: ElementoDecorativo) => ({
  left: `${el.x}%`,
  top:  `${el.y}%`,
  transform: 'translate(-50%, -50%)',
  width:  `${elementoSeleccionadoId.value === el.id ? editandoW.value : getW(el)}px`,
  height: `${elementoSeleccionadoId.value === el.id ? editandoH.value : getH(el)}px`,
  cursor: 'pointer',
})

const getMesaStyle = (mesa: Mesa) => {
  const pos = localMesaPos.value[mesa.id]
  if (!pos) return {}
  return { left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }
}

const getNombreMesa = (mesa: Mesa) => mesa.nombre || `${mesa.nr}`
const getLabelMesa  = (mesa: Mesa) => mesa.nombre ? mesa.nombre : `Mesa ${mesa.nr}`
</script>

<template>
  <div class="floor-editor">

    <!-- ── PALETA LATERAL ── -->
    <aside class="palette">
      <div class="palette-header">
        <h3>Elementos</h3>
        <p class="palette-hint">Arrastra al mapa</p>
      </div>
      <div class="palette-items">
        <div
          v-for="item in CATALOGO"
          :key="item.tipo"
          class="palette-item"
          draggable="true"
          @dragstart="startDragFromPalette(item.tipo, $event)"
          :title="item.descripcion"
        >
          <svg viewBox="0 0 100 100" class="palette-preview" v-html="item.svgPath" />
          <span class="palette-label">{{ item.label }}</span>
        </div>
      </div>
    </aside>

    <!-- ── MAPA EDITABLE ── -->
    <div
      ref="mapRef"
      class="editor-map"
      @dragover="onDragOver"
      @drop="onDropInMap"
      @click="elementoSeleccionadoId = null; mesaTooltipId = null"
    >
      <div class="map-grid"></div>
      <div class="zona-label">{{ zonaNombre }}</div>

      <!-- Elementos decorativos -->
      <div
        v-for="el in elementos"
        :key="el.id"
        class="elemento-decor"
        :class="{ selected: elementoSeleccionadoId === el.id }"
        :style="getElementoStyle(el)"
        @mousedown.stop="startDragElemento($event, el)"
        @click.stop
      >
        <!-- DESPUÉS -->
<svg
  viewBox="0 0 100 100"
  preserveAspectRatio="none"
  class="elemento-svg"
  v-html="getCatalogItem(el.tipo)?.svgPath"
/>
      </div>

      <!-- Tooltip de elemento -->
      <transition name="tooltip-fade">
        <div
          v-if="elementoSeleccionadoId"
          class="el-tooltip"
          :class="{ 'tooltip-abajo': elTooltipAbajo }"
          :style="elTooltipStyle()"
          @mousedown.stop
          @click.stop
        >
          <div class="tooltip-arrow"></div>

          <div class="tooltip-header">
            <span class="tooltip-title">
              {{ getCatalogItem(elementos.find(e => e.id === elementoSeleccionadoId)?.tipo ?? '')?.label }}
            </span>
            <button class="tooltip-close" @click.stop="elementoSeleccionadoId = null">✕</button>
          </div>

          <!-- Ancho -->
          <div class="tooltip-field">
            <label>Ancho</label>
            <div class="size-controls">
              <button class="size-btn" title="−20" @click.stop="editandoW = Math.max(MIN_SIZE, editandoW - PASO_GRANDE)">−−</button>
              <button class="size-btn" title="−10" @click.stop="editandoW = Math.max(MIN_SIZE, editandoW - PASO_PEQUENO)">−</button>
              <span class="size-value">{{ editandoW }}px</span>
              <button class="size-btn" title="+10" @click.stop="editandoW = Math.min(MAX_SIZE, editandoW + PASO_PEQUENO)">+</button>
              <button class="size-btn" title="+20" @click.stop="editandoW = Math.min(MAX_SIZE, editandoW + PASO_GRANDE)">++</button>
            </div>
          </div>

          <!-- Alto -->
          <div class="tooltip-field">
            <label>Alto</label>
            <div class="size-controls">
              <button class="size-btn" title="−20" @click.stop="editandoH = Math.max(MIN_SIZE, editandoH - PASO_GRANDE)">−−</button>
              <button class="size-btn" title="−10" @click.stop="editandoH = Math.max(MIN_SIZE, editandoH - PASO_PEQUENO)">−</button>
              <span class="size-value">{{ editandoH }}px</span>
              <button class="size-btn" title="+10" @click.stop="editandoH = Math.min(MAX_SIZE, editandoH + PASO_PEQUENO)">+</button>
              <button class="size-btn" title="+20" @click.stop="editandoH = Math.min(MAX_SIZE, editandoH + PASO_GRANDE)">++</button>
            </div>
          </div>

          <p class="size-preview-text">{{ editandoW }} × {{ editandoH }} px</p>

          <div class="tooltip-actions">
            <button
              class="tooltip-btn-save"
              :disabled="guardandoElemento"
              @click.stop="guardarTamanoElemento(elementoSeleccionadoId)"
            >
              {{ guardandoElemento ? 'Guardando...' : '✓ Aplicar tamaño' }}
            </button>
            <button
              class="tooltip-btn-delete"
              @click.stop="eliminarElemento(elementoSeleccionadoId)"
            >
              🗑 Eliminar
            </button>
          </div>
        </div>
      </transition>

      <!-- Mesas -->
      <div
        v-for="mesa in mesas"
        :key="mesa.id"
        class="mesa-node"
        :class="[mesa.status, { selected: mesaTooltipId === mesa.id }]"
        :style="getMesaStyle(mesa)"
        @mousedown.stop="startDragMesa($event, mesa)"
        @click.stop
      >
        <span class="mesa-nr" :class="{ 'mesa-nombre-custom': !!mesa.nombre }">
          {{ getNombreMesa(mesa) }}
        </span>
        <span class="mesa-cap">{{ mesa.capacity }}p</span>
      </div>

      <!-- Tooltip de mesa -->
      <transition name="tooltip-fade">
        <div
          v-if="mesaTooltipId"
          class="mesa-tooltip"
          :class="{ 'tooltip-abajo': tooltipAbajo }"
          :style="tooltipStyle()"
          @mousedown.stop
          @click.stop
        >
          <div class="tooltip-arrow"></div>

          <div class="tooltip-header">
            <span class="tooltip-title">
              {{ getLabelMesa(mesas.find(m => m.id === mesaTooltipId)!) }}
            </span>
            <button class="tooltip-close" @click.stop="mesaTooltipId = null">✕</button>
          </div>

          <div class="tooltip-field">
            <label>Nombre</label>
            <input
              v-model="editandoNombre"
              class="tooltip-input"
              placeholder="Ej: Sofá, Terraza 1..."
              @click.stop
              @mousedown.stop
            />
          </div>

          <div class="tooltip-field">
            <label>Capacidad (personas)</label>
            <div class="capacity-controls">
              <button class="cap-btn" @click.stop="editandoCapacidad = Math.max(1, editandoCapacidad - 1)">−</button>
              <span class="cap-value">{{ editandoCapacidad }}</span>
              <button class="cap-btn" @click.stop="editandoCapacidad = Math.min(20, editandoCapacidad + 1)">+</button>
            </div>
          </div>

          <div class="tooltip-actions">
            <button
              class="tooltip-btn-save"
              :disabled="guardandoMesa"
              @click.stop="guardarMesa(mesaTooltipId)"
            >
              {{ guardandoMesa ? 'Guardando...' : '✓ Guardar' }}
            </button>
            <button
              class="tooltip-btn-delete"
              @click.stop="eliminarMesa(
                mesaTooltipId,
                mesas.find(m => m.id === mesaTooltipId)?.nr ?? 0
              )"
            >
              🗑 Eliminar mesa
            </button>
          </div>
        </div>
      </transition>

      <!-- Hint vacío -->
      <div v-if="mesas.length === 0 && elementos.length === 0" class="empty-hint">
        <span>Arrastra elementos de la paleta para diseñar tu local</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.floor-editor {
  display: flex;
  height: 600px;
  border-radius: 14px;
  overflow: visible;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

/* ── PALETA ── */
.palette {
  width: 130px;
  background: linear-gradient(180deg, #1e293b, #0f172a);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px 0 0 14px;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.04);
}

.palette-header { padding: 14px 12px 10px; border-bottom: 1px solid #334155; }
.palette-header h3 { font-size: 0.85rem; font-weight: 700; color: #f1f5f9; margin: 0 0 2px; }
.palette-hint { font-size: 0.7rem; color: #64748b; margin: 0; }

.palette-items {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-items::-webkit-scrollbar { width: 3px; }
.palette-items::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  background: #334155;
  border-radius: 8px;
  cursor: grab;
  transition: all 0.2s;
  border: 1px solid transparent;
  user-select: none;
}

.palette-item:hover {
  background: #475569;
  border-color: var(--color-acento, #4f46e5);
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--color-acento, #4f46e5) 35%, transparent);
}
.palette-item:active { cursor: grabbing; }
.palette-preview { width: 52px; height: 36px; }

.palette-label {
  font-size: 0.68rem;
  color: #94a3b8;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

/* ── MAPA ── */
.editor-map {
  flex: 1;
  position: relative;
  background: #f8fafc;
  overflow: hidden;
  border-radius: 0 14px 14px 0;
}

.map-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, #e2e8f0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e8f0 1px, transparent 1px);
  background-size: 40px 40px;
  background-color: #f8fafc;
}

.zona-label {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(79, 70, 229, 0.1);
  border: 1px solid rgba(79, 70, 229, 0.2);
  color: #4f46e5;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  z-index: 5;
  pointer-events: none;
}

/* ── ELEMENTOS ── */
.elemento-decor {
  position: absolute;
  z-index: 10;
  transition: filter 0.15s;
}

.elemento-decor:hover { filter: brightness(1.08); }

.elemento-decor.selected {
  filter: drop-shadow(0 0 6px rgba(79, 70, 229, 0.7));
  z-index: 20;
}

.elemento-svg { width: 100%; height: 100%; display: block; }

/* ── TOOLTIP ELEMENTO ── */
.el-tooltip {
  position: absolute;
  width: 230px;
  background: white;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
  z-index: 200;
  cursor: default;
}

/* ── CONTROLES TAMAÑO ── */
.size-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 6px;
}

.size-btn {
  width: 26px;
  height: 26px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
  line-height: 1;
}

.size-btn:hover { background: #4338ca; }

.size-value {
  font-size: 0.8rem;
  font-weight: 800;
  color: #0f172a;
  min-width: 44px;
  text-align: center;
}

.size-preview-text {
  font-size: 0.72rem;
  color: #94a3b8;
  text-align: center;
  margin: 2px 0 8px;
}

/* ── MESAS ── */
.mesa-node {
  position: absolute;
  width: 70px;
  height: 70px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-weight: 700;
  z-index: 15;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  transition: box-shadow 0.1s;
  user-select: none;
  padding: 4px;
}

.mesa-node:hover { box-shadow: 0 8px 16px rgba(0,0,0,0.25); }

.mesa-node.selected {
  box-shadow: 0 0 0 3px white, 0 0 0 5px #4f46e5;
  z-index: 25;
}

.mesa-node.available { background: #16a34a; }
.mesa-node.occupied  { background: #dc2626; }
.mesa-node.preparing { background: #d97706; }

.mesa-nr { font-size: 1.6rem; font-weight: 800; line-height: 1; text-align: center; }

.mesa-nombre-custom {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-word;
  text-align: center;
  max-width: 62px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mesa-cap { font-size: 0.72rem; opacity: 0.85; margin-top: 3px; }

/* ── TOOLTIP MESA ── */
.mesa-tooltip {
  position: absolute;
  width: 200px;
  background: white;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
  z-index: 200;
  cursor: default;
}

/* ── TOOLTIP COMPARTIDO ── */
.tooltip-arrow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: white;
  border-right: 1px solid rgba(0,0,0,0.06);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.tooltip-abajo .tooltip-arrow {
  bottom: auto;
  top: -6px;
  border-right: none;
  border-bottom: none;
  border-left: 1px solid rgba(0,0,0,0.06);
  border-top: 1px solid rgba(0,0,0,0.06);
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tooltip-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.tooltip-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.2s;
  line-height: 1;
  flex-shrink: 0;
}

.tooltip-close:hover { background: #fee2e2; color: #dc2626; }

.tooltip-field { margin-bottom: 10px; }

.tooltip-field label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}

.tooltip-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  font-size: 0.88rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
  background: #f8fafc;
}

.tooltip-input:focus {
  border-color: #4f46e5;
  background: white;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.08);
}

.capacity-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
}

.cap-btn {
  width: 26px;
  height: 26px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  line-height: 1;
  flex-shrink: 0;
}

.cap-btn:hover { background: #4338ca; }

.cap-value {
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  min-width: 28px;
  text-align: center;
}

.tooltip-actions { display: flex; flex-direction: column; gap: 6px; }

.tooltip-btn-save {
  width: 100%;
  padding: 8px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 7px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.tooltip-btn-save:hover:not(:disabled) { background: #4338ca; }
.tooltip-btn-save:disabled { background: #a5b4fc; cursor: not-allowed; }

.tooltip-btn-delete {
  width: 100%;
  padding: 8px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 7px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.tooltip-btn-delete:hover { background: #dc2626; color: white; }

/* ── TRANSICIONES ── */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active { transition: all 0.15s ease; }
.tooltip-fade-enter-from,
.tooltip-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }

/* ── HINT VACÍO ── */
.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.empty-hint span {
  background: rgba(79, 70, 229, 0.06);
  border: 2px dashed rgba(79, 70, 229, 0.2);
  color: #94a3b8;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 16px 28px;
  border-radius: 12px;
  text-align: center;
  max-width: 280px;
}
</style>