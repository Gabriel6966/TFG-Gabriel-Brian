<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, onSnapshot, query,
  orderBy, doc, updateDoc, addDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'
import { useAuth } from '../composables/useAuth'

const cartStore = CartStore()
const { currentUser, logout, localId } = useAuth()

// Estado reactivo
const tables = ref<any[]>([])
const productos = ref<any[]>([])
const categorias = ref<string[]>([])
const mesaSeleccionada = ref<number | null>(null)
const mesaSeleccionadaId = ref<string | null>(null)
const categoriaSeleccionada = ref('')
const isEnviando = ref(false)

let unsubscribeMesas: (() => void) | null = null
let unsubscribeProductos: (() => void) | null = null

onMounted(() => {
  // Solo activamos los escuchas si tenemos la "llave" del local
  if (localId.value) {
    
    // 1. Listener Mesas (Ruta SaaS)
    const qMesas = query(collection(db, `locales/${localId.value}/mesas`), orderBy('numero'))
    unsubscribeMesas = onSnapshot(qMesas, (snapshot) => {
      tables.value = snapshot.docs.map(d => ({
        id: d.id,
        nr: d.data().numero,
        capacity: d.data().capacidad ?? 4,
        status: d.data().estado === 'libre' ? 'available' : 'occupied'
      }))
    })

    // 2. Listener Productos (Ruta SaaS)
    unsubscribeProductos = onSnapshot(collection(db, `locales/${localId.value}/productos`), (snapshot) => {
      productos.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

      // Categorías dinámicas extraídas de los productos del local
      const cats = [...new Set(productos.value.map((p: any) => p.category).filter(Boolean))] as string[]
      categorias.value = cats

      if (!categoriaSeleccionada.value && cats.length > 0) {
        categoriaSeleccionada.value = cats[0]
      }
    })
  }
})

onUnmounted(() => {
  unsubscribeMesas?.()
  unsubscribeProductos?.()
})

const productosFiltrados = computed(() =>
  productos.value.filter((p: any) => p.category === categoriaSeleccionada.value)
)

const openTable = (table: any) => {
  mesaSeleccionada.value = table.nr
  mesaSeleccionadaId.value = table.id
  cartStore.setTable(table.nr)
}

// Liberar mesa (Ruta SaaS)
const liberarMesa = async () => {
  if (!mesaSeleccionadaId.value || !localId.value) return
  if (!confirm(`¿Confirmas que la Mesa ${mesaSeleccionada.value} ha terminado su servicio?`)) return

  try {
    // Actualizamos el documento DENTRO de la subcolección del local
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaSeleccionadaId.value), {
      estado: 'libre'
    })
    
    cartStore.clear()
    mesaSeleccionada.value = null
    mesaSeleccionadaId.value = null
  } catch (error) {
    console.error('Error al liberar la mesa:', error)
    alert('No se pudo liberar la mesa.')
  }
}

// Enviar pedido (Ruta SaaS)
const enviarPedido = async () => {
  if (cartStore.items.length === 0) return alert('El pedido está vacío')
  if (!mesaSeleccionadaId.value || !currentUser.value || !localId.value) return

  isEnviando.value = true

  try {
    // 1. Guardamos la comanda en la subcolección del local
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

    // 2. Marcamos la mesa como ocupada en el archivador del local
    await updateDoc(doc(db, `locales/${localId.value}/mesas`, mesaSeleccionadaId.value), {
      estado: 'ocupada'
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
  <div class="pos-container">
    <aside class="panel-mesas">
      <div class="panel-header">
        <h1 class="brand-title">EasyOrder</h1>
        <div class="user-info">
          <span class="user-name">{{ currentUser?.email?.split('@')[0] }}</span>
          <span class="local-tag">{{ localId }}</span>
        </div>
        <button class="btn-logout-camarero" @click="logout">Cerrar sesión</button>
      </div>

      <div class="tables-grid">
        <button v-for="table in tables" :key="table.id" class="table-card"
          :class="[table.status, { 'seleccionada': mesaSeleccionada === table.nr }]" @click="openTable(table)">
          <span class="table-nr">{{ table.nr }}</span>
          <span class="table-seats">({{ table.capacity }} Seats)</span>

          <div class="table-status-label">
            <svg v-if="table.status === 'occupied'" class="status-icon" xmlns="http://www.w3.org/2000/svg" width="14"
              height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>{{ table.status === 'available' ? 'Available' : 'Occupied' }}</span>
          </div>
        </button>
      </div>
    </aside>

    <main class="panel-productos">
      <nav class="categories-tabs">
        <button v-for="cat in categorias" :key="cat"
          :class="{ active: categoriaSeleccionada === cat }" @click="categoriaSeleccionada = cat">
          {{ cat }}
        </button>
      </nav>

      <div class="products-grid">
        <div v-for="p in productosFiltrados" :key="p.id" class="product-card" @click="cartStore.addToCart(p)">
          <div class="product-img">{{ p.icon || '🍔' }}</div>
          <div class="product-info">
            <h3>{{ p.name }}</h3>
            <p class="price">{{ p.price }}€</p>
          </div>
        </div>
      </div>
    </main>

    <section class="panel-pedido">
      <div class="order-header">
        <h3>Pedido Actual</h3>
        <span v-if="mesaSeleccionada" class="mesa-tag">Mesa {{ mesaSeleccionada }}</span>
      </div>

      <div class="order-items">
        <div v-for="item in cartStore.items" :key="item.id" class="cart-item">
          <div class="item-details">
            <span class="qty">{{ item.quantity }}x</span>
            <span class="name">{{ item.name }}</span>
          </div>
          <div class="item-price">
            {{ (item.price * item.quantity).toFixed(2) }}€
            <button @click="cartStore.removeFromCart(item.id)" class="btn-remove">×</button>
          </div>
        </div>
      </div>

      <div class="order-footer">
        <div class="total-row">
          <span>Total</span>
          <span class="total-price">{{ cartStore.totalPrice.toFixed(2) }}€</span>
        </div>

        <button
          class="btn-liberar"
          @click="liberarMesa"
          :disabled="!mesaSeleccionada"
        >
          ✓ Finalizar Servicio
        </button>

        <button class="btn-send" @click="enviarPedido" :disabled="!mesaSeleccionada || isEnviando">
          <span v-if="!isEnviando">🚀 Enviar a Cocina</span>
          <span v-else>Enviando...</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
* {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  box-sizing: border-box;
}

/* Estilos adicionales para la cabecera multitenant */
.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.local-tag {
  background: #fef08a;
  color: #854d0e;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.btn-logout-camarero {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #64748b;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout-camarero:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.btn-liberar {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 10px;
  transition: all 0.2s;
}

.btn-liberar:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
}

.btn-liberar:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pos-container {
  display: grid;
  grid-template-columns: 280px 1fr 350px;
  height: 100vh;
  background: #f1f5f9;
  overflow: hidden;
}

.panel-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.brand-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.status-indicator {
  color: #22c55e;
  font-size: 0.9rem;
  font-weight: 600;
}

.panel-mesas {
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 15px;
}

.table-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 15px 10px;
  border: 3px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s, box-shadow 0.2s;
}

.table-card:active {
  transform: scale(0.96);
}

.table-card.available {
  background-color: #1b7a35;
}

.table-card.occupied {
  background-color: #a81c1c;
}

.table-card.seleccionada {
  transform: scale(1.05);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.5);
  border-color: #ffffff;
}

.table-nr {
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.table-seats {
  font-size: 0.8rem;
  opacity: 0.9;
  margin-bottom: 8px;
}

.table-status-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
  font-weight: 500;
}

.panel-productos {
  background: white;
  display: flex;
  flex-direction: column;
}

.categories-tabs {
  display: flex;
  gap: 10px;
  padding: 20px;
  border-bottom: 1px solid #f1f5f9;
  overflow-x: auto;
}

.categories-tabs button {
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: #f1f5f9;
  font-weight: 600;
  cursor: pointer;
  color: #475569;
  transition: 0.2s;
  white-space: nowrap;
}

.categories-tabs button.active {
  background: #4f46e5;
  color: white;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
  align-content: start;
}

.product-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px 15px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.product-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
}

.product-img {
  font-size: 3.5rem;
  margin-bottom: 10px;
  display: inline-block;
}

.product-info h3 {
  margin: 0 0 5px 0;
  font-size: 1rem;
  color: #0f172a;
}

.price {
  color: #4f46e5;
  font-weight: 700;
  margin: 0;
  font-size: 1.1rem;
}

.panel-pedido {
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.order-header {
  padding: 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #0f172a;
}

.mesa-tag {
  background: #fef3c7;
  color: #d97706;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.85rem;
  border: 1px solid #fde68a;
}

.order-items {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 15px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.item-details {
  display: flex;
  align-items: center;
  gap: 12px;
}

.qty {
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
  color: #475569;
  font-size: 0.9rem;
}

.name {
  font-weight: 600;
  color: #0f172a;
}

.item-price {
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: 700;
  color: #0f172a;
}

.btn-remove {
  background: #fee2e2;
  color: #ef4444;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-weight: bold;
}

.order-footer {
  padding: 20px;
  background: white;
  border-top: 1px solid #e2e8f0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 1.2rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 20px;
}

.total-price {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
}

.btn-send {
  width: 100%;
  padding: 18px;
  background: #22c55e;
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send:hover:not(:disabled) {
  background: #16a34a;
  transform: translateY(-2px);
}

.btn-send:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>