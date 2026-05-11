<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, addDoc, onSnapshot,
  query, orderBy, where, deleteDoc, doc, updateDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'
import EmojiPicker from 'vue3-emoji-picker'
import PosFloorMap from '../components/pos/PosFloorMap.vue'

// --- Interfaces TypeScript ---
interface Mesa {
  id: string
  numero: number
  nombre?: string
  estado: 'libre' | 'ocupada'
  capacidad: number
  zona?: string
}

interface Factura {
  id: string
  mesa: number
  zona: string
  camareroEmail: string
  fechaApertura?: any
  fechaCierre: any
  total: number
  items: any[]
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

const { logout, localId } = useAuth()

const currentTab = ref('mesas')
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

// Estado para el filtro de roles
const filtroRol = ref('todos')

// NUEVO: EMOJI PICKER - Estados para abrir/cerrar los teclados
const mostrarSelectorCategoria = ref(false)
const mostrarSelectorProducto = ref(false)
const mostrarSelectorZona = ref(false)

// Formularios
const nuevoProducto = ref({ name: '', price: 0, category: '', icon: '🍽️' })
const nuevaCategoria = ref({ nombre: '', icono: '🍽️' })
const nuevaZona = ref({ nombre: '', icono: '🛋️' })
const nuevaInvitacion = ref({
  email: '',
  rol: 'camarero' as 'admin' | 'camarero' | 'cocinero'
})

// NUEVO: Estado del mapa de mesas
const posicionesMesas = ref<Record<string, {x: number, y: number}>>({})
const mesaSeleccionada = ref<number | null>(null)
const zonaActiva = ref('')

// Limpiadores de listeners
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null
let unsubscribeZonas: (() => void) | null = null
let unsubscribeInvitaciones: (() => void) | null = null
let unsubscribeEmpleados: (() => void) | null = null
let unsubscribeFacturas: (() => void) | null = null

onMounted(() => {
  if (!localId.value) return

  posicionesMesas.value = JSON.parse(localStorage.getItem(`posicionesMesas_${localId.value}`) || '{}')

  // Listener mesas
  const qMesas = query(
    collection(db, `locales/${localId.value}/mesas`),
    orderBy('numero')
  )
  unsubscribeMesas = onSnapshot(qMesas, (snapshot) => {
    mesas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Mesa[]
  })

  // Listener productos
  const qProductos = query(
    collection(db, `locales/${localId.value}/productos`),
    orderBy('category')
  )
  unsubscribeProductos = onSnapshot(qProductos, (snapshot) => {
    productos.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Producto[]
  })

  // Listener categorías
  const qCategorias = query(
    collection(db, `locales/${localId.value}/categorias`),
    orderBy('nombre')
  )
  unsubscribeCategorias = onSnapshot(qCategorias, (snapshot) => {
    categorias.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Categoria[]
    if (!nuevoProducto.value.category && categorias.value.length > 0) {
      nuevoProducto.value.category = categorias.value[0].nombre
    }
  })

  // Listener zonas
  const qZonas = query(
    collection(db, `locales/${localId.value}/zonas`),
    orderBy('nombre')
  )
  unsubscribeZonas = onSnapshot(qZonas, (snapshot) => {
    zonas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Zona[]
    if (!zonaActiva.value && zonas.value.length > 0) {
      zonaActiva.value = zonas.value[0].nombre
    }
  })

  // Listener invitaciones
  const qInv = query(
    collection(db, 'invitaciones'),
    where('localId', '==', localId.value),
    orderBy('creadoEn', 'desc')
  )
  unsubscribeInvitaciones = onSnapshot(qInv, (snapshot) => {
    invitaciones.value = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Invitacion[]
  })

  // Listener empleados
  unsubscribeEmpleados = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
    empleados.value = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as Empleado))
      .filter(u => u.localId === localId.value)
  })

  // Listener de Registro Histórico (Facturas)
  const qFacturas = query(
    collection(db, `locales/${localId.value}/facturas`),
    orderBy('fechaCierre', 'desc')
  )
  unsubscribeFacturas = onSnapshot(qFacturas, (snapshot) => {
    facturas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Factura[]
  })
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

const handleLogout = async () => {
  // Detenemos los listeners de Firebase ANTES de cerrar sesión
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
  unsubscribeZonas?.()
  unsubscribeInvitaciones?.()
  unsubscribeEmpleados?.()
  unsubscribeFacturas?.()
  await logout()
}

// Productos agrupados por categoría
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

// Empleados filtrados por rol
const empleadosFiltrados = computed(() => {
  if (filtroRol.value === 'todos') return empleados.value
  return empleados.value.filter(emp => emp.rol === filtroRol.value)
})


// NUEVO: EMOJI PICKER - Funciones para guardar la selección
const onSelectEmojiCategoria = (emoji: any) => {
  nuevaCategoria.value.icono = emoji.i
  mostrarSelectorCategoria.value = false
}

const onSelectEmojiProducto = (emoji: any) => {
  nuevoProducto.value.icon = emoji.i
  mostrarSelectorProducto.value = false
}

const onSelectEmojiZona = (emoji: any) => {
  nuevaZona.value.icono = emoji.i
  mostrarSelectorZona.value = false
}

// NUEVO: Lógica del mapa interactivo para el Admin
const handleUpdatePosition = (id: string, x: number, y: number) => {
  posicionesMesas.value[id] = { x, y }
  localStorage.setItem(`posicionesMesas_${localId.value}`, JSON.stringify(posicionesMesas.value))
}

const handleSelectTable = (table: any) => {
  mesaSeleccionada.value = table.nr
}

const mesasFiltradasPorZona = computed(() => {
  return mesas.value.filter(m => m.zona === zonaActiva.value || (!m.zona && zonas.value.length === 0))
})

const mesasParaMapa = computed(() => {
  return mesasFiltradasPorZona.value.map(m => ({
    id: m.id,
    nr: m.numero,
    status: m.estado === 'libre' ? 'available' : m.estado === 'ocupada' ? 'occupied' : 'preparing',
    capacity: m.capacidad,
    x: posicionesMesas.value[m.id]?.x,
    y: posicionesMesas.value[m.id]?.y
  }))
})

// ── MESAS ──────────────────────────────────────────────────────────────────

const generarMesas = async () => {
  if (!localId.value) return
  if (zonas.value.length === 0) return alert('⚠️ Por favor, crea al menos una "Zona" antes de añadir mesas.')
  if (!zonaActiva.value) zonaActiva.value = zonas.value[0].nombre
  isLoading.value = true
  try {
    // Filtrar por zona activa para que la numeración sea independiente por zona
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
    await Promise.all(mesas.value.map(m =>
      deleteDoc(doc(db, `locales/${localId.value}/mesas`, m.id))
    ))
  } catch { alert('Error al borrar las mesas.') }
}

const eliminarMesa = async (id: string, numero: number) => {
  if (!localId.value || !confirm(`¿Eliminar la Mesa ${numero}?`)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/mesas`, id))
  } catch { alert('Error al eliminar la mesa.') }
}

const cambiarCapacidad = async (id: string, nuevaCap: number) => {
  if (!localId.value) return
  await updateDoc(doc(db, `locales/${localId.value}/mesas`, id), { capacidad: nuevaCap })
}

const cambiarNombreMesa = async (id: string, nuevoNombre: string) => {
  if (!localId.value) return
  await updateDoc(doc(db, `locales/${localId.value}/mesas`, id), { nombre: nuevoNombre })
}

// ── CATEGORÍAS ─────────────────────────────────────────────────────────────

const guardarCategoria = async () => {
  if (!localId.value) return
  if (!nuevaCategoria.value.nombre.trim()) return alert('El nombre es obligatorio.')
  const yaExiste = categorias.value.some(
    c => c.nombre.toLowerCase() === nuevaCategoria.value.nombre.toLowerCase()
  )
  if (yaExiste) return alert('Esa categoría ya existe.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/categorias`), {
      ...nuevaCategoria.value
    })
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
  } catch { alert('Error al eliminar la categoría.') }
}

// ── ZONAS ──────────────────────────────────────────────────────────────────

const guardarZona = async () => {
  if (!localId.value) return
  if (!nuevaZona.value.nombre.trim()) return alert('El nombre de la zona es obligatorio.')
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
    ? `¿Eliminar la zona "${nombre}"? Hay ${afectadas} mesas en esta zona que se ocultarán.`
    : `¿Eliminar la zona "${nombre}"?`
  if (!confirm(msg)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/zonas`, id))
    if (zonaActiva.value === nombre) zonaActiva.value = zonas.value.find(z => z.id !== id)?.nombre || ''
  } catch { alert('Error al eliminar la zona.') }
}

// ── PRODUCTOS ──────────────────────────────────────────────────────────────

const guardarProducto = async () => {
  if (!localId.value) return
  if (!nuevoProducto.value.name.trim()) return alert('El nombre es obligatorio.')
  if (nuevoProducto.value.price <= 0) return alert('El precio debe ser mayor que 0.')
  if (!nuevoProducto.value.category) return alert('Selecciona una categoría.')
  try {
    await addDoc(collection(db, `locales/${localId.value}/productos`), {
      ...nuevoProducto.value
    })
    nuevoProducto.value = {
      name: '',
      price: 0,
      category: categorias.value[0]?.nombre ?? '',
      icon: '🍽️'
    }
  } catch { alert('Error al guardar el producto.') }
}

const eliminarProducto = async (id: string, nombre: string) => {
  if (!localId.value || !confirm(`¿Eliminar "${nombre}"?`)) return
  try {
    await deleteDoc(doc(db, `locales/${localId.value}/productos`, id))
  } catch { alert('Error al eliminar el producto.') }
}

// ── INVITACIONES ───────────────────────────────────────────────────────────

const generarCodigo = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

const crearInvitacion = async () => {
  if (!localId.value) return
  if (!nuevaInvitacion.value.email.trim()) return alert('El email es obligatorio.')
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
  if (!confirm('¿Eliminar esta invitación? El código dejará de ser válido.')) return
  try {
    await deleteDoc(doc(db, 'invitaciones', id))
  } catch { alert('Error al eliminar la invitación.') }
}

const limpiarInvitacionesUsadas = async () => {
  const usadas = invitaciones.value.filter(i => i.estado === 'usada')
  if (usadas.length === 0) return alert('No hay códigos usados que limpiar.')
  if (!confirm(`¿Borrar los ${usadas.length} códigos que ya han sido utilizados?`)) return

  try {
    await Promise.all(usadas.map(inv => deleteDoc(doc(db, 'invitaciones', inv.id))))
  } catch {
    alert('Error al limpiar las invitaciones usadas.')
  }
}

// ── EMPLEADOS ──────────────────────────────────────────────────────────────

const toggleEstadoEmpleado = async (id: string, estadoActual: boolean) => {
  try {
    await updateDoc(doc(db, 'usuarios', id), {
      activo: !estadoActual
    })
  } catch {
    alert('Error al actualizar el estado del empleado.')
  }
}

const eliminarEmpleado = async (id: string, nombre: string) => {
  if (!confirm(`¿Eliminar a "${nombre}"? Perderá el acceso al sistema inmediatamente.`)) return
  try {
    await deleteDoc(doc(db, 'usuarios', id))
  } catch { alert('Error al eliminar el empleado.') }
}
</script>

<template>
  <div class="admin-layout">

    <!-- SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h2>EasyOrder</h2>
        <span class="admin-tag">Admin</span>
      </div>

      <nav class="sidebar-nav">
        <button :class="{ active: currentTab === 'mesas' }" @click="currentTab = 'mesas'">
          🪑 Mesas
        </button>
        <button :class="{ active: currentTab === 'zonas' }" @click="currentTab = 'zonas'">
          🔲 Zonas
        </button>
        <button :class="{ active: currentTab === 'categorias' }" @click="currentTab = 'categorias'">
          🗂️ Categorías
        </button>
        <button :class="{ active: currentTab === 'productos' }" @click="currentTab = 'productos'">
          🍔 Menú
        </button>
        <button :class="{ active: currentTab === 'usuarios' }" @click="currentTab = 'usuarios'">
          👥 Empleados
        </button>
        <button :class="{ active: currentTab === 'registro' }" @click="currentTab = 'registro'">
          🧾 Registro
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="local-info">🏢 {{ localId }}</div>
        <button class="btn-logout" @click="handleLogout">⬅ Cerrar sesión</button>
      </div>
    </aside>

    <!-- CONTENIDO PRINCIPAL -->
    <main class="content">

      <!-- ── TAB: MESAS ── -->
      <div v-if="currentTab === 'mesas'">
        <div class="page-header">
          <div>
            <h1>Gestión de Mesas</h1>
            <p class="page-subtitle">{{ mesas.length }} mesas en total</p>
          </div>
          <div class="controls">
            <input type="number" v-model="cantidadMesas" min="1" max="50" class="input-num">
            <button @click="generarMesas" class="btn-primary" :disabled="isLoading">
              {{ isLoading ? 'Añadiendo...' : '+ Añadir Mesas' }}
            </button>
            <button @click="resetearMesas" class="btn-danger">Borrar Todo</button>
          </div>
        </div>

        <div class="tabs-zone-admin" v-if="zonas.length > 0">
          <button v-for="z in zonas" :key="z.id" :class="{ active: zonaActiva === z.nombre }" @click="zonaActiva = z.nombre; mesaSeleccionada = null">
            {{ z.icono }} {{ z.nombre }}
          </button>
        </div>
        <div v-else class="empty-productos" style="padding: 10px 0;">⚠️ Primero debes crear una Zona en la pestaña "Zonas" para ver el mapa.</div>

        <div class="mesas-admin-layout">
          <!-- MAPA INTERACTIVO -->
          <div class="mapa-admin-container" v-if="zonas.length > 0">
            <PosFloorMap
              :zona="zonaActiva.toLowerCase()"
              :tables="mesasParaMapa"
              :mesa-seleccionada="mesaSeleccionada"
              :is-editable="true"
              @select-table="(table) => handleSelectTable(table)"
              @update-position="(id, x, y) => handleUpdatePosition(id, x, y)"
            />
          </div>

          <!-- LISTA DE MESAS (SIDEBAR DERECHO) -->
          <div class="mesas-lista-admin">
            <div v-for="mesa in mesasFiltradasPorZona" :key="mesa.id" class="mesa-card" :class="{ 'selected-card': mesaSeleccionada === mesa.numero }" @click="mesaSeleccionada = mesa.numero">
              <div class="mesa-card-header">
                <input type="text" class="mesa-nombre-input" :value="mesa.nombre || `Mesa ${mesa.numero}`"
                  @change="cambiarNombreMesa(mesa.id, ($event.target as HTMLInputElement).value)">
                <div class="mesa-header-actions">
                  <span class="mesa-estado" :class="mesa.estado">{{ mesa.estado }}</span>
                  <button class="btn-eliminar-mesa" @click.stop="eliminarMesa(mesa.id, mesa.numero)">✕</button>
                </div>
              </div>
              <div class="mesa-capacidad">
                <label>Capacidad</label>
                <input type="number" :value="mesa.capacidad" min="1" max="20"
                  @change="cambiarCapacidad(mesa.id, +($event.target as HTMLInputElement).value)">
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- ── TAB: ZONAS ── -->
      <div v-if="currentTab === 'zonas'">
        <div class="page-header">
          <div>
            <h1>Gestión de Zonas</h1>
            <p class="page-subtitle">{{ zonas.length }} zonas creadas (Salones, Terrazas, Barras...)</p>
          </div>
        </div>

        <div class="productos-layout">
          <div class="product-form-card">
            <h3>Nueva Zona</h3>
            <div class="product-form">
              <div class="form-group">
                <label>Nombre de la zona</label>
                <input v-model="nuevaZona.nombre" placeholder="Ej: Terraza Principal">
              </div>
              <div class="form-group">
                <label>Icono (Emoji)</label>
                <div class="emoji-selector-container">
                  <button type="button" class="btn-emoji" @click="mostrarSelectorZona = !mostrarSelectorZona">
                    <span class="emoji-preview">{{ nuevaZona.icono }}</span> Cambiar Icono
                  </button>
                  <div v-if="mostrarSelectorZona" class="picker-popup">
                    <EmojiPicker :native="true" theme="light" @select="onSelectEmojiZona" />
                  </div>
                </div>
              </div>
              <button @click="guardarZona" class="btn-primary btn-full">+ Crear Zona</button>
            </div>
          </div>

          <div class="productos-lista">
            <h3>Zonas actuales</h3>
            <div v-if="zonas.length === 0" class="empty-productos">No hay zonas creadas todavía.</div>
            <div v-for="z in zonas" :key="z.id" class="producto-row">
              <span class="producto-icon">{{ z.icono }}</span>
              <div class="producto-info">
                <span class="producto-name">{{ z.nombre }}</span>
                <span class="producto-cat">{{ mesas.filter(m => m.zona === z.nombre).length }} mesas en esta zona</span>
              </div>
              <button class="btn-eliminar" @click="eliminarZona(z.id, z.nombre)">✕</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB: CATEGORÍAS ── -->
      <div v-if="currentTab === 'categorias'">
        <div class="page-header">
          <div>
            <h1>Gestión de Categorías</h1>
            <p class="page-subtitle">{{ categorias.length }} categorías activas</p>
          </div>
        </div>

        <div class="productos-layout">
          <div class="product-form-card">
            <h3>Nueva categoría</h3>
            <div class="product-form">
              <div class="form-group">
                <label>Nombre</label>
                <input v-model="nuevaCategoria.nombre" placeholder="Ej: Entrantes">
              </div>

              <!-- NUEVO: EMOJI PICKER EN CATEGORÍAS -->
              <div class="form-group">
                <label>Icono (Emoji)</label>
                <div class="emoji-selector-container">
                  <button type="button" class="btn-emoji" @click="mostrarSelectorCategoria = !mostrarSelectorCategoria">
                    <span class="emoji-preview">{{ nuevaCategoria.icono }}</span> Cambiar Icono
                  </button>
                  <div v-if="mostrarSelectorCategoria" class="picker-popup">
                    <EmojiPicker :native="true" theme="light" @select="onSelectEmojiCategoria" />
                  </div>
                </div>
              </div>
              <!-- FIN EMOJI PICKER -->

              <button @click="guardarCategoria" class="btn-primary btn-full">
                + Añadir Categoría
              </button>
            </div>
          </div>

          <div class="productos-lista">
            <h3>Categorías actuales</h3>
            <div v-if="categorias.length === 0" class="empty-productos">
              No hay categorías todavía.
            </div>
            <div v-for="cat in categorias" :key="cat.id" class="producto-row">
              <span class="producto-icon">{{ cat.icono }}</span>
              <div class="producto-info">
                <span class="producto-name">{{ cat.nombre }}</span>
                <span class="producto-cat">
                  {{productos.filter(p => p.category === cat.nombre).length}} productos
                </span>
              </div>
              <button class="btn-eliminar" @click="eliminarCategoria(cat.id, cat.nombre)">✕</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB: PRODUCTOS ── -->
      <div v-if="currentTab === 'productos'">
        <div class="page-header">
          <div>
            <h1>Gestión del Menú</h1>
            <p class="page-subtitle">{{ productos.length }} productos en la carta</p>
          </div>
        </div>

        <div class="productos-layout">
          <div class="product-form-card">
            <h3>Añadir nuevo plato</h3>
            <div v-if="categorias.length === 0" class="empty-productos" style="padding: 16px 0">
              ⚠️ Primero crea una categoría en la pestaña "Categorías".
            </div>
            <div v-else class="product-form">
              <div class="form-group">
                <label>Nombre del plato</label>
                <input v-model="nuevoProducto.name" placeholder="Ej: Burger Clásica">
              </div>
              <div class="form-group">
                <label>Precio (€)</label>
                <input type="number" v-model="nuevoProducto.price" step="0.01" min="0">
              </div>
              <div class="form-group">
                <label>Categoría</label>
                <select v-model="nuevoProducto.category">
                  <option v-for="cat in categorias" :key="cat.id" :value="cat.nombre">
                    {{ cat.icono }} {{ cat.nombre }}
                  </option>
                </select>
              </div>

              <!-- NUEVO: EMOJI PICKER EN PRODUCTOS -->
              <div class="form-group">
                <label>Icono (Emoji)</label>
                <div class="emoji-selector-container">
                  <button type="button" class="btn-emoji" @click="mostrarSelectorProducto = !mostrarSelectorProducto">
                    <span class="emoji-preview">{{ nuevoProducto.icon }}</span> Cambiar Icono
                  </button>
                  <div v-if="mostrarSelectorProducto" class="picker-popup">
                    <EmojiPicker :native="true" theme="light" @select="onSelectEmojiProducto" />
                  </div>
                </div>
              </div>
              <!-- FIN EMOJI PICKER -->

              <button @click="guardarProducto" class="btn-primary btn-full">
                + Guardar en el Menú
              </button>
            </div>
          </div>

          <div class="productos-lista">
            <h3>Carta actual</h3>
            <div v-if="productos.length === 0" class="empty-productos">
              No hay productos todavía.
            </div>
            <div v-for="(platos, categoria) in productosPorCategoria" :key="categoria" class="categoria-grupo">
              <div v-if="platos.length > 0" class="categoria-header">
                <span class="categoria-icono">
                  {{categorias.find(c => c.nombre === categoria)?.icono ?? '🍽️'}}
                </span>
                <span class="categoria-nombre">{{ categoria }}</span>
                <span class="categoria-count">{{ platos.length }}</span>
              </div>
              <div v-for="p in platos" :key="p.id" class="producto-row">
                <span class="producto-icon">{{ p.icon }}</span>
                <div class="producto-info">
                  <span class="producto-name">{{ p.name }}</span>
                </div>
                <span class="producto-price">{{ Number(p.price).toFixed(2) }}€</span>
                <button class="btn-eliminar" @click="eliminarProducto(p.id, p.name)">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB: EMPLEADOS ── -->
      <div v-if="currentTab === 'usuarios'">
        <div class="page-header">
          <div>
            <h1>Gestión de Empleados</h1>
            <p class="page-subtitle">{{ empleados.length }} empleados registrados</p>
          </div>
        </div>

        <div class="empleados-layout">

          <!-- Columna izquierda: formulario + códigos generados -->
          <div class="empleados-left">

            <div class="product-form-card">
              <h3>🔑 Nueva invitación</h3>
              <p class="form-hint">
                Se generará un código único que el empleado usará en
                <strong>/register</strong> para activar su cuenta.
              </p>
              <div class="product-form" style="margin-top: 18px;">
                <div class="form-group">
                  <label>Email del empleado</label>
                  <input type="email" v-model="nuevaInvitacion.email" placeholder="empleado@restaurante.com">
                </div>
                <div class="form-group">
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

            <!-- Códigos generados -->
            <div class="product-form-card" style="margin-top: 20px;">
              <div class="section-header-flex">
                <h3 style="margin-bottom: 0;">Códigos generados</h3>
                <button class="btn-icon-text" @click="limpiarInvitacionesUsadas"
                  title="Borra todos los códigos que ya han sido usados">
                  🧹 Limpiar usados
                </button>
              </div>

              <div v-if="invitaciones.length === 0" class="empty-productos" style="padding: 20px 0">
                No hay invitaciones todavía.
              </div>
              <div v-for="inv in invitaciones" :key="inv.id" class="invitacion-row">
                <div class="producto-info min-width-0">
                  <span class="producto-name truncate">{{ inv.email }}</span>
                  <span class="producto-cat">{{ inv.rol }}</span>
                </div>
                <span class="codigo-badge" :class="inv.estado">
                  {{ inv.estado === 'pendiente' ? inv.codigo : '✓ Usada' }}
                </span>
                <button v-if="inv.estado === 'pendiente'" class="btn-eliminar"
                  @click="eliminarInvitacion(inv.id)">✕</button>
              </div>
            </div>

          </div>

          <!-- Columna derecha: lista de empleados registrados -->
          <div class="productos-lista">
            <h3>👥 Equipo registrado</h3>

            <div class="filtros-rol" v-if="empleados.length > 0">
              <button :class="{ active: filtroRol === 'todos' }" @click="filtroRol = 'todos'">Todos</button>
              <button :class="{ active: filtroRol === 'admin' }" @click="filtroRol = 'admin'">Admins</button>
              <button :class="{ active: filtroRol === 'camarero' }" @click="filtroRol = 'camarero'">Camareros</button>
              <button :class="{ active: filtroRol === 'cocinero' }" @click="filtroRol = 'cocinero'">Cocineros</button>
            </div>

            <div v-if="empleadosFiltrados.length === 0" class="empty-productos">
              No hay empleados que coincidan con este filtro.
            </div>

            <div v-for="emp in empleadosFiltrados" :key="emp.id" class="empleado-row">
              <div class="empleado-avatar">
                {{ emp.nombre?.charAt(0).toUpperCase() ?? '?' }}
              </div>
              <div class="producto-info min-width-0">
                <span class="producto-name truncate">{{ emp.nombre }}</span>
                <span class="producto-cat truncate">{{ emp.email }}</span>
              </div>
              <span class="rol-badge" :class="emp.rol">{{ emp.rol }}</span>

              <button class="activo-toggle" :class="emp.activo ? 'activo' : 'inactivo'"
                @click="toggleEstadoEmpleado(emp.id, emp.activo)">
                {{ emp.activo ? '● Activo' : '○ Inactivo' }}
              </button>

              <button class="btn-eliminar" @click="eliminarEmpleado(emp.id, emp.nombre)">✕</button>
            </div>
          </div>

        </div>
      </div>

      <!-- ── TAB: REGISTRO (HISTORIAL) ── -->
      <div v-if="currentTab === 'registro'">
        <div class="page-header">
          <div>
            <h1>Registro de Servicios</h1>
            <p class="page-subtitle">{{ facturas.length }} tickets cerrados</p>
          </div>
        </div>

        <div class="productos-lista">
          <h3>Historial de Tickets</h3>
          <div v-if="facturas.length === 0" class="empty-productos">
            No hay facturas registradas todavía.
          </div>
          <div v-for="factura in facturas" :key="factura.id" class="factura-row">
            <div class="factura-info">
              <span class="factura-fecha">
                🔴 Cerrada: {{ factura.fechaCierre?.toDate ? factura.fechaCierre.toDate().toLocaleString() : 'Desconocida' }}
              </span>
              <span class="factura-fecha-apertura" v-if="factura.fechaApertura">
                🟢 Abierta: {{ factura.fechaApertura?.toDate ? factura.fechaApertura.toDate().toLocaleString() : 'Desconocida' }}
              </span>
              <span class="factura-mesa">Mesa {{ factura.mesa }} ({{ factura.zona }})</span>
              <span class="factura-camarero">🧑‍🍳 Atendido por: {{ factura.camareroEmail }}</span>
            </div>
            <div class="factura-items">
              <ul>
                <li v-for="(item, idx) in factura.items" :key="idx">
                  {{ item.quantity }}x {{ item.name }} ({{ item.price }}€)
                </li>
              </ul>
            </div>
            <div class="factura-total">
              <span class="total-text">{{ factura.total.toFixed(2) }}€</span>
            </div>
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<style scoped>
@import 'vue3-emoji-picker/css';
* {
  box-sizing: border-box;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 0;
}

.admin-layout {
  display: flex;
  min-height: 100vh;
  background: #f3f4f6;
}

/* ── SIDEBAR ── */
.sidebar {
  width: 240px;
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

.sidebar-brand h2 {
  font-size: 1.15rem;
  font-weight: 800;
  color: white;
}

.admin-tag {
  background: #4f46e5;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

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
}

.sidebar-nav button:hover {
  background: #334155;
  color: white;
}

.sidebar-nav button.active {
  background: #4f46e5;
  color: white;
  font-weight: 600;
}

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
  padding: 12px 16px;
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

/* ── CONTENT ── */
.content {
  flex: 1;
  padding: 36px 40px;
  overflow-y: auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-header h1 {
  font-size: 1.6rem;
  font-weight: 700;
  color: #0f172a;
}

.page-subtitle {
  color: #64748b;
  font-size: 0.9rem;
  margin-top: 4px;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.input-num {
  width: 80px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  text-align: center;
}

/* ── BOTONES ── */
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

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn-primary:disabled {
  background: #a5b4fc;
  cursor: not-allowed;
}

.btn-full {
  width: 100%;
  padding: 14px;
}

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

.btn-danger:hover {
  background: #b91c1c;
}

/* ── MESAS ── */
.tabs-zone-admin {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tabs-zone-admin button {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
  transition: all 0.2s;
  white-space: nowrap;
}

.tabs-zone-admin button.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.mesas-admin-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 24px;
  align-items: start;
}

.mapa-admin-container {
  height: 600px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  background: #fff;
  position: sticky;
  top: 0;
}

.mesas-lista-admin {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 600px;
  overflow-y: auto;
  padding-right: 8px;
}

.mesa-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
  cursor: pointer;
}

.mesa-card:hover {
  border-color: #cbd5e1;
}

.mesa-card.selected-card {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}

.mesa-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.mesa-nombre-input {
  font-weight: 700;
  color: #0f172a;
  font-size: 1rem;
  border: 1px solid transparent;
  background: transparent;
  padding: 2px 4px;
  border-radius: 4px;
  width: 100%;
  min-width: 0;
  transition: all 0.2s;
  outline: none;
}

.mesa-nombre-input:hover {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.mesa-nombre-input:focus {
  border-color: #4f46e5;
  background: white;
}

.mesa-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-eliminar-mesa {
  width: 24px;
  height: 24px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.75rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-eliminar-mesa:hover {
  background: #dc2626;
  color: white;
}

.mesa-estado {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
}

.mesa-estado.libre {
  background: #dcfce7;
  color: #16a34a;
}

.mesa-estado.ocupada {
  background: #fee2e2;
  color: #dc2626;
}

.mesa-capacidad {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #64748b;
}

.mesa-capacidad input {
  width: 56px;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  text-align: center;
}

/* ── LAYOUT COMPARTIDO ── */
.productos-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  align-items: start;
}

.product-form-card {
  background: white;
  border-radius: 14px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 0;
}

.product-form-card h3,
.productos-lista h3 {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 18px;
}

.form-hint {
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.5;
}

.product-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #0f172a;
  transition: border-color 0.2s;
  outline: none;
  background: white;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

/* ── NUEVO: CSS PARA EL SELECTOR DE EMOJIS ── */
.emoji-selector-container {
  position: relative;
  display: flex;
  flex-direction: column;
}

.btn-emoji {
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  font-size: 0.95rem;
  color: #475569;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-emoji:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.emoji-preview {
  font-size: 1.4rem;
  line-height: 1;
}

.picker-popup {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 50;
  margin-top: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  /* Esto asegura que no se salga de la pantalla en pantallas pequeñas */
  max-width: 100%;
}

/* ── FIN EMOJI CSS ── */

/* ── CARTA ── */
.productos-lista {
  background: white;
  border-radius: 14px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.empty-productos {
  color: #94a3b8;
  text-align: center;
  padding: 40px 0;
  font-size: 0.95rem;
}

.categoria-grupo {
  margin-bottom: 8px;
}

.categoria-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 8px;
  border-bottom: 2px solid #f1f5f9;
  margin-bottom: 4px;
  margin-top: 16px;
}

.categoria-icono {
  font-size: 1.2rem;
}

.categoria-nombre {
  font-weight: 700;
  color: #0f172a;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.8rem;
}

.categoria-count {
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
}

.producto-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid #f8fafc;
}

.producto-row:last-child {
  border-bottom: none;
}

.producto-icon {
  font-size: 1.5rem;
}

.producto-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.producto-name {
  font-weight: 600;
  color: #0f172a;
  font-size: 0.95rem;
}

.producto-cat {
  font-size: 0.78rem;
  color: #94a3b8;
}

.producto-price {
  font-weight: 700;
  color: #4f46e5;
  font-size: 0.95rem;
  min-width: 60px;
  text-align: right;
}

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

.btn-eliminar:hover {
  background: #dc2626;
  color: white;
}

/* ── EMPLEADOS ── */
.empleados-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  align-items: start;
}

.empleados-left {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.empleado-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.empleado-row:last-child {
  border-bottom: none;
}

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
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  text-transform: capitalize;
  flex-shrink: 0;
}

.rol-badge.admin {
  background: #ede9fe;
  color: #6d28d9;
}

.rol-badge.camarero {
  background: #dbeafe;
  color: #1d4ed8;
}

.rol-badge.cocinero {
  background: #fef3c7;
  color: #b45309;
}

/* ── INVITACIONES ── */
.invitacion-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.invitacion-row:last-child {
  border-bottom: none;
}

.codigo-badge {
  font-family: 'Courier New', monospace;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 5px 10px;
  border-radius: 8px;
  letter-spacing: 2px;
  flex-shrink: 0;
}

.codigo-badge.pendiente {
  background: #fef3c7;
  color: #b45309;
  border: 1px dashed #fcd34d;
}

.codigo-badge.usada {
  background: #dcfce7;
  color: #16a34a;
}

/* ── NUEVOS ESTILOS PARA UX EMPLEADOS ── */
.min-width-0 {
  min-width: 0;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activo-toggle {
  border: none;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s;
  flex-shrink: 0;
}

.activo-toggle.activo {
  background: #dcfce7;
  color: #16a34a;
}

.activo-toggle.inactivo {
  background: #f1f5f9;
  color: #94a3b8;
}

.activo-toggle:hover {
  filter: brightness(0.95);
}

/* Filtros de rol */
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

.filtros-rol button.active {
  background: #4f46e5;
  color: white;
}

.filtros-rol button:hover:not(.active) {
  background: #e2e8f0;
}

/* Botón y header para limpiar códigos */
.section-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.btn-icon-text {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
  padding: 4px 8px;
  border-radius: 6px;
}

/* ── REGISTRO / FACTURAS ── */
.factura-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
}

.factura-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.factura-fecha {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.95rem;
}

.factura-fecha-apertura {
  color: #64748b;
  font-size: 0.85rem;
}

.factura-mesa {
  color: #4f46e5;
  font-weight: 600;
  font-size: 0.9rem;
  margin-top: 4px;
}

.factura-camarero {
  color: #64748b;
  font-size: 0.8rem;
}

.factura-items {
  flex: 2;
  font-size: 0.85rem;
  color: #475569;
  max-height: 100px;
  overflow-y: auto;
}

.factura-items ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.factura-items li {
  margin-bottom: 2px;
}

.factura-total {
  font-size: 1.2rem;
  font-weight: 800;
  color: #10b981;
  text-align: right;
  min-width: 80px;
}

.btn-icon-text:hover {
  background: #fee2e2;
  color: #dc2626;
}

@media (max-width: 1100px) {
  .empleados-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .productos-layout {
    grid-template-columns: 1fr;
  }
  
  .mesas-admin-layout {
    grid-template-columns: 1fr;
  }

  .mapa-admin-container {
    position: static;
    height: 400px;
  }

  .product-form-card {
    position: static;
  }

  .content {
    padding: 20px;
  }
}
</style>