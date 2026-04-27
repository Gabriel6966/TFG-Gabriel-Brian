<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'

const route = useRoute()
const mesaId = route.params.id
const cartStore = CartStore()

const productos = ref<any[]>([])
const categoriaActual = ref('Burgers')
const categorias = ['Burgers', 'Drinks', 'Desserts']

onMounted(() => {
  const q = query(collection(db, 'productos'))
  const numeroMesa = Number(route.params.id) 
  cartStore.setTable(numeroMesa)

  onSnapshot(q, (snapshot) => {
    productos.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  })
})

const productosFiltrados = computed(() => {
  return productos.value.filter(p => p.category === categoriaActual.value)
})

const addToCart = (producto: any) => {
  console.log(`Añadido al carrito de Pinia: ${producto.name}`)
  cartStore.addToCart(producto)
}
</script>

<template>
  <div class="menu-container">
    <header class="menu-header">
      <h1>Mesa {{ mesaId }}</h1>
      <div class="categories-nav">
        <button v-for="cat in categorias" :key="cat" :class="{ active: categoriaActual === cat }"
          @click="categoriaActual = cat">
          {{ cat }}
        </button>
      </div>
    </header>

    <main class="products-grid">
      <div v-for="item in productosFiltrados" :key="item.id" class="product-card">
        <span class="product-icon">{{ item.icon }}</span>
        <div class="product-info">
          <h3>{{ item.name }}</h3>
          <p class="price">{{ item.price }}€</p>
        </div>
        <button class="add-btn" @click="addToCart(item)">+</button>
      </div>
    </main>

    <button class="view-order-btn" @click="$router.push('/checkout')">
      Ver Pedido
    </button>
  </div>
</template>

<style scoped>
.menu-container {
  padding: 20px;
  background: #f8f9fa;
  min-height: 100vh;
}

.categories-nav {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  overflow-x: auto;
}

.categories-nav button {
  padding: 8px 15px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
}

.categories-nav button.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.products-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.product-card {
  background: white;
  padding: 15px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 15px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.product-icon {
  font-size: 2rem;
}

.product-info {
  flex: 1;
}

.product-info h3 {
  margin: 0;
  font-size: 1.1rem;
}

.price {
  color: #4f46e5;
  font-weight: bold;
  margin: 5px 0 0;
}

.add-btn {
  background: #4f46e5;
  color: white;
  border: none;
  width: 35px;
  height: 35px;
  border-radius: 10px;
  font-size: 1.5rem;
  cursor: pointer;
}

.view-order-btn {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  color: white;
  padding: 15px 30px;
  border-radius: 30px;
  border: none;
  font-weight: bold;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}
</style>