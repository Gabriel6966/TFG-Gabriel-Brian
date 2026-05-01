<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'

const cartStore = CartStore()

const tables = ref<any[]>([])
const productos = ref<any[]>([])
const categoriaSeleccionada = ref('Burgers')
const mesaSeleccionada = ref<number | null>(null)

onMounted(() => {
  const qMesas = query(collection(db, 'mesas'), orderBy('numero'))
  onSnapshot(qMesas, (snapshot) => {
    tables.value = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        nr: data.numero,
        capacity: data.capacidad,
        status: data.estado === 'libre' ? 'available' : 'occupied'
      }
    })
  })
  onSnapshot(collection(db, 'productos'), (snapshot) => {
    productos.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  })
})
const openTable = (table: any) => {
  // En vez de hacer router.push, ahora cargamos la mesa en la misma pantalla
  mesaSeleccionada.value = table.nr
  cartStore.setTable(table.nr)

  if (table.status === 'occupied' && cartStore.items.length === 0) {
    alert(`Mesa ${table.nr} ya está ocupada. Mostrando pedido actual...`)
    // Aquí en el futuro cargaremos el pedido de la base de datos
  }
}

const productosFiltrados = computed(() => {
  return productos.value.filter(p => p.category === categoriaSeleccionada.value)
})

const enviarPedido = () => {
  if (cartStore.items.length === 0) return alert("El pedido está vacío")
  alert(`¡Comanda enviada a cocina para la Mesa ${mesaSeleccionada.value}!`)
  cartStore.clear()
}
</script>

<template>
  <div class="pos-container">
    <aside class="panel-mesas">
      <div class="panel-header">
        <h1 class="brand-title">EasyOrder</h1>
        <span class="status-indicator">● Live</span>
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
        <button v-for="cat in ['Burgers', 'Drinks', 'Desserts']" :key="cat"
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
        <button class="btn-send" @click="enviarPedido" :disabled="!mesaSeleccionada">
          🚀 Enviar a Cocina
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