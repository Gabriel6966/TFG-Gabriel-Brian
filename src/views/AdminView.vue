<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, addDoc, onSnapshot,
  query, orderBy, deleteDoc, doc, updateDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../composables/useAuth'

// --- Interfaces TypeScript ---
interface Mesa {
  id: string
  numero: number
  nombre?: string // NUEVO: Permite guardar un nombre personalizado opcional
  estado: 'libre' | 'ocupada'
  capacidad: number
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

const { logout } = useAuth()

const currentTab = ref('mesas')
const mesas = ref<Mesa[]>([])
const productos = ref<Producto[]>([])
const categorias = ref<Categoria[]>([])
const cantidadMesas = ref(10)
const isLoading = ref(false)

// Formulario nuevo producto
const nuevoProducto = ref({ name: '', price: 0, category: '', icon: '🍽️' })

// Formulario nueva categoría
const nuevaCategoria = ref({ nombre: '', icono: '🍽️' })

// Limpiadores de listeners
let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null
let unsubscribeCategorias: (() => void) | null = null

onMounted(() => {
  // Listener mesas
  const qMesas = query(collection(db, 'mesas'), orderBy('numero'))
  unsubscribeMesas = onSnapshot(qMesas, (snapshot) => {
    mesas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Mesa[]
  })

  // Listener productos ordenados por categoría
  const qProductos = query(collection(db, 'productos'), orderBy('category'))
  unsubscribeProductos = onSnapshot(qProductos, (snapshot) => {
    productos.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Producto[]
  })

  // Listener categorías — colección propia en Firestore
  // Así el admin puede añadir/eliminar categorías sin tocar código
  const qCategorias = query(collection(db, 'categorias'), orderBy('nombre'))
  unsubscribeCategorias = onSnapshot(qCategorias, (snapshot) => {
    categorias.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Categoria[]

    // Si el formulario no tiene categoría seleccionada, ponemos la primera disponible
    if (!nuevoProducto.value.category && categorias.value.length > 0) {
      nuevoProducto.value.category = categorias.value[0].nombre
    }
  })
})

onUnmounted(() => {
  unsubscribeMesas?.()
  unsubscribeProductos?.()
  unsubscribeCategorias?.()
})

// Productos agrupados por categoría para mostrar la carta ordenada.
// computed() devuelve un objeto donde cada clave es una categoría
// y el valor es el array de productos que pertenecen a ella.
const productosPorCategoria = computed(() => {
  const grupos: Record<string, Producto[]> = {}
  for (const cat of categorias.value) {
    grupos[cat.nombre] = productos.value.filter(p => p.category === cat.nombre)
  }
  // Productos sin categoría reconocida van a "Otros"
  const sinCategoria = productos.value.filter(
    p => !categorias.value.some(c => c.nombre === p.category)
  )
  if (sinCategoria.length > 0) grupos['Sin categoría'] = sinCategoria
  return grupos
})

// ── MESAS ──────────────────────────────────────────────────

const generarMesas = async () => {
  isLoading.value = true
  try {
    const ultimaNumero = mesas.value.length > 0
      ? mesas.value[mesas.value.length - 1].numero : 0
    for (let i = 1; i <= cantidadMesas.value; i++) {
      await addDoc(collection(db, 'mesas'), {
        numero: ultimaNumero + i,
        estado: 'libre',
        capacidad: 4
      })
    }
  } catch { alert('Error al generar mesas.') }
  finally { isLoading.value = false }
}

const resetearMesas = async () => {
  if (!confirm('¿Borrar TODAS las mesas? Esta acción no se puede deshacer.')) return
  try {
    await Promise.all(mesas.value.map(m => deleteDoc(doc(db, 'mesas', m.id))))
  } catch { alert('Error al borrar las mesas.') }
}

// NUEVO: Eliminar una sola mesa
const eliminarMesa = async (id: string, numero: number) => {
  if (!confirm(`¿Eliminar la mesa ${numero}?`)) return
  try {
    await deleteDoc(doc(db, 'mesas', id))
  } catch { alert('Error al eliminar la mesa.') }
}

// NUEVO: Cambiar nombre de la mesa
const cambiarNombreMesa = async (id: string, nuevoNombre: string) => {
  try {
    await updateDoc(doc(db, 'mesas', id), { nombre: nuevoNombre })
  } catch { alert('Error al cambiar el nombre de la mesa.') }
}

const cambiarCapacidad = async (id: string, nuevaCap: number) => {
  await updateDoc(doc(db, 'mesas', id), { capacidad: nuevaCap })
}

// ── CATEGORÍAS ─────────────────────────────────────────────

const guardarCategoria = async () => {
  if (!nuevaCategoria.value.nombre.trim()) return alert('El nombre es obligatorio.')
  // Evitamos duplicados comprobando si ya existe
  const yaExiste = categorias.value.some(
    c => c.nombre.toLowerCase() === nuevaCategoria.value.nombre.toLowerCase()
  )
  if (yaExiste) return alert('Esa categoría ya existe.')

  try {
    await addDoc(collection(db, 'categorias'), { ...nuevaCategoria.value })
    nuevaCategoria.value = { nombre: '', icono: '🍽️' }
  } catch { alert('Error al crear la categoría.') }
}

const eliminarCategoria = async (id: string, nombre: string) => {
  // Advertimos si hay productos que usan esa categoría
  const productosAfectados = productos.value.filter(p => p.category === nombre).length
  const msg = productosAfectados > 0
    ? `¿Eliminar "${nombre}"? Hay ${productosAfectados} productos con esta categoría que quedarán sin clasificar.`
    : `¿Eliminar la categoría "${nombre}"?`
  if (!confirm(msg)) return

  try {
    await deleteDoc(doc(db, 'categorias', id))
  } catch { alert('Error al eliminar la categoría.') }
}

// ── PRODUCTOS ──────────────────────────────────────────────

const guardarProducto = async () => {
  if (!nuevoProducto.value.name.trim()) return alert('El nombre del plato es obligatorio.')
  if (nuevoProducto.value.price <= 0) return alert('El precio debe ser mayor que 0.')
  if (!nuevoProducto.value.category) return alert('Selecciona una categoría.')

  try {
    await addDoc(collection(db, 'productos'), { ...nuevoProducto.value })
    nuevoProducto.value = {
      name: '',
      price: 0,
      category: categorias.value[0]?.nombre ?? '',
      icon: '🍽️'
    }
  } catch { alert('Error al guardar el producto.') }
}

const eliminarProducto = async (id: string, nombre: string) => {
  if (!confirm(`¿Eliminar "${nombre}" del menú?`)) return
  try {
    await deleteDoc(doc(db, 'productos', id))
  } catch { alert('Error al eliminar el producto.') }
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
        <button :class="{ active: currentTab === 'categorias' }" @click="currentTab = 'categorias'">
          🗂️ Categorías
        </button>
        <button :class="{ active: currentTab === 'productos' }" @click="currentTab = 'productos'">
          🍔 Menú
        </button>
      </nav>

      <button class="btn-logout" @click="logout">⬅ Cerrar sesión</button>
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

        <div class="tables-grid">
          <div v-for="mesa in mesas" :key="mesa.id" class="mesa-card">
            
            <div class="mesa-card-header">
              <!-- NUEVO: Input para el nombre de la mesa editable (por defecto "Mesa X") -->
              <input 
                type="text" 
                class="mesa-nombre-input"
                :value="mesa.nombre || `Mesa ${mesa.numero}`"
                @change="cambiarNombreMesa(mesa.id, ($event.target as HTMLInputElement).value)"
                title="Haz clic para editar el nombre"
              >
              
              <div class="mesa-header-actions">
                <span class="mesa-estado" :class="mesa.estado">{{ mesa.estado }}</span>
                <!-- NUEVO: Botón para borrar la mesa individual -->
                <button class="btn-eliminar-mesa" @click="eliminarMesa(mesa.id, mesa.numero)" title="Eliminar mesa">✕</button>
              </div>
            </div>

            <div class="mesa-capacidad">
              <label>Capacidad</label>
              <input
                type="number"
                :value="mesa.capacidad"
                min="1" max="20"
                @change="cambiarCapacidad(mesa.id, +($event.target as HTMLInputElement).value)"
              >
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB: CATEGORÍAS ── -->
      <div v-if="currentTab === 'categorias'">
        <div class="page-header">
          <div>
            <h1>Gestión de Categorías</h1>
            <p class="page-subtitle">{{ categorias.length }} categorías en la carta</p>
          </div>
        </div>

        <div class="productos-layout">

          <!-- Formulario nueva categoría -->
          <div class="product-form-card">
            <h3>Nueva categoría</h3>
            <div class="product-form">
              <div class="form-group">
                <label>Nombre</label>
                <input v-model="nuevaCategoria.nombre" placeholder="Ej: Entrantes">
              </div>
              <div class="form-group">
                <label>Icono (Emoji)</label>
                <input v-model="nuevaCategoria.icono" placeholder="🥗">
              </div>
              <button @click="guardarCategoria" class="btn-primary btn-full">
                + Añadir Categoría
              </button>
            </div>
          </div>

          <!-- Lista de categorías existentes -->
          <div class="productos-lista">
            <h3>Categorías actuales</h3>
            <div v-if="categorias.length === 0" class="empty-productos">
              No hay categorías todavía. Crea una para empezar.
            </div>
            <div v-for="cat in categorias" :key="cat.id" class="producto-row">
              <span class="producto-icon">{{ cat.icono }}</span>
              <div class="producto-info">
                <span class="producto-name">{{ cat.nombre }}</span>
                <span class="producto-cat">
                  {{ productos.filter(p => p.category === cat.nombre).length }} productos
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

          <!-- Formulario nuevo producto -->
          <div class="product-form-card">
            <h3>Añadir nuevo plato</h3>
            <div v-if="categorias.length === 0" class="empty-productos" style="padding: 20px 0">
              ⚠️ Primero crea al menos una categoría en la pestaña "Categorías".
            </div>
            <div v-else class="product-form">
              <div class="form-group">
                <label>Nombre del plato</label>
                <input v-model="nuevoProducto.name" placeholder="Ej: Burger Clásica">
              </div>
              <div class="form-group">
                <label>Precio (€)</label>
                <input type="number" v-model="nuevoProducto.price"
                  placeholder="0.00" step="0.01" min="0">
              </div>
              <div class="form-group">
                <label>Categoría</label>
                <!-- El select se genera dinámicamente desde Firestore -->
                <select v-model="nuevoProducto.category">
                  <option v-for="cat in categorias" :key="cat.id" :value="cat.nombre">
                    {{ cat.icono }} {{ cat.nombre }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Icono (Emoji)</label>
                <input v-model="nuevoProducto.icon" placeholder="🍔">
              </div>
              <button @click="guardarProducto" class="btn-primary btn-full">
                + Guardar en el Menú
              </button>
            </div>
          </div>

          <!-- Carta agrupada por categorías -->
          <div class="productos-lista">
            <h3>Carta actual</h3>
            <div v-if="productos.length === 0" class="empty-productos">
              No hay productos en el menú todavía.
            </div>

            <!-- Un bloque por cada categoría -->
            <div
              v-for="(platos, categoria) in productosPorCategoria"
              :key="categoria"
              class="categoria-grupo"
            >
              <!-- Cabecera de categoría — solo si tiene productos -->
              <div v-if="platos.length > 0" class="categoria-header">
                <span class="categoria-icono">
                  {{ categorias.find(c => c.nombre === categoria)?.icono ?? '🍽️' }}
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

    </main>
  </div>
</template>

<style scoped>
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

.sidebar-nav button:hover { background: #334155; color: white; }
.sidebar-nav button.active { background: #4f46e5; color: white; font-weight: 600; }

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
  margin-top: auto;
}

.btn-logout:hover { background: #ef4444; border-color: #ef4444; color: white; }

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

.page-header h1 { font-size: 1.6rem; font-weight: 700; color: #0f172a; }
.page-subtitle { color: #64748b; font-size: 0.9rem; margin-top: 4px; }

.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

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

.btn-primary:hover:not(:disabled) { background: #4338ca; }
.btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }
.btn-full { width: 100%; padding: 14px; }

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

/* ── MESAS ── */
.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.mesa-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #e2e8f0;
}

.mesa-card-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  gap: 8px;
}

/* NUEVO: Estilos para el input del nombre de la mesa */
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

/* NUEVO: Estilos para el botón de borrar mesa individual */
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
  flex-shrink: 0;
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

.mesa-estado.libre { background: #dcfce7; color: #16a34a; }
.mesa-estado.ocupada { background: #fee2e2; color: #dc2626; }

.mesa-capacidad { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #64748b; }
.mesa-capacidad input {
  width: 56px; padding: 6px 8px;
  border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 0.9rem; text-align: center;
}

/* ── LAYOUT COMPARTIDO CATEGORÍAS / PRODUCTOS ── */
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
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
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

.product-form { display: flex; flex-direction: column; gap: 14px; }

.form-group { display: flex; flex-direction: column; gap: 6px; }

.form-group label { font-size: 0.82rem; font-weight: 600; color: #475569; }

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

/* ── CARTA ── */
.productos-lista {
  background: white;
  border-radius: 14px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.empty-productos { color: #94a3b8; text-align: center; padding: 40px 0; font-size: 0.95rem; }

/* Cabecera de grupo de categoría */
.categoria-grupo { margin-bottom: 8px; }

.categoria-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 8px;
  border-bottom: 2px solid #f1f5f9;
  margin-bottom: 4px;
  margin-top: 16px;
}

.categoria-header:first-of-type { margin-top: 0; }

.categoria-icono { font-size: 1.2rem; }

.categoria-nombre {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.95rem;
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

.producto-row:last-child { border-bottom: none; }

.producto-icon { font-size: 1.5rem; }

.producto-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.producto-name { font-weight: 600; color: #0f172a; font-size: 0.95rem; }
.producto-cat { font-size: 0.78rem; color: #94a3b8; }
.producto-price { font-weight: 700; color: #4f46e5; font-size: 0.95rem; min-width: 60px; text-align: right; }

.btn-eliminar {
  width: 30px; height: 30px;
  background: #fee2e2; color: #dc2626;
  border: none; border-radius: 50%;
  cursor: pointer; font-weight: 700;
  font-size: 0.85rem; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.btn-eliminar:hover { background: #dc2626; color: white; }

@media (max-width: 900px) {
  .productos-layout { grid-template-columns: 1fr; }
  .product-form-card { position: static; }
}
</style>