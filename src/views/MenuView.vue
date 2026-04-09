<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CartStore } from '../stores/cart' //Conecting Pinia


const route = useRoute()
const router = useRouter()

const cart = CartStore()
const TableNR=Number(route.params.id)

//When we load the page we advice to cart of what table are we
cart.setTable(TableNR)

//Take the ID of the table of the URL that we see (ej: /menu/3 -> tableNumber = 3)
const tableNumber = route.params.id

const categories = ['All', 'Burgers', 'Drinks', 'Desserts']
const active = ref('All')

const products = ref([
  { id: 1, name: 'Classic Burger', price: 8.50, category: 'Burgers', icon: '🍔' },
  { id: 2, name: 'Double Cheese', price: 10.50, category: 'Burgers', icon: '🍔' },
  { id: 3, name: 'Vegan Burger', price: 9.00, category: 'Burgers', icon: '🥗' },
  { id: 4, name: 'Coca Cola', price: 2.50, category: 'Drinks', icon: '🥤' },
  { id: 5, name: 'Mineral Water', price: 1.50, category: 'Drinks', icon: '💧' },
  { id: 6, name: 'Craft Beer', price: 3.50, category: 'Drinks', icon: '🍺' },
  { id: 7, name: 'Cheesecake', price: 5.00, category: 'Desserts', icon: '🍰' },
  { id: 8, name: 'Brownie', price: 4.50, category: 'Desserts', icon: '🍫' }
])

const filteredProducts = computed(() => {
  if (active.value === 'All') return products.value
  return products.value.filter(product => product.category === active.value)
})

const goBack = () => {
  router.push('/tables')
}

const addToOrder = (product: any) => {
  //Saving data with Pinia
  cart.addToCart(product)
}
</script>

<template>
  <div class="app-container">
    <nav class="top-bar">
      <button class="icon-btn" @click="goBack">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </button>
      <h1 class="brand-title">Table {{ TableNR }}</h1>
      <div style="width: 24px;"></div>
    </nav>

    <div class="categories-container">
      <button 
        v-for="category in categories" 
        :key="category"
        class="category-chip"
        :class="{ active: active === category }"
        @click="active = category"
      >
        {{ category }}
      </button>
    </div>

    <div class="products-content">
      <main class="products-grid">
        <div 
          v-for="product in filteredProducts" 
          :key="product.id"
          class="product-card"
        >
          <span class="product-icon">{{ product.icon }}</span>
          <h3 class="product-name">{{ product.name }}</h3>
          <span class="product-price">€{{ product.price.toFixed(2) }}</span>
          <button class="add-btn" @click="addToOrder(product)">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add
          </button>
        </div>
      </main>
    </div>

    <div v-if="cart.totalItems>0" class="cart-summary">
      <div class="summary-info">
        <span class="total-label">TOTAL PRICE</span>
        <span class="total-amount">€{{ cart.totalPrice.toFixed(2) }}</span>
      </div>
      <button class="send-btn" @click="router.push('/checkout')">
        <span>Send to Kitchen</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh; 
  background-color: #f8f9fa;
  padding-bottom: 80px;
  }
.top-bar {
  display:flex;
  justify-content:space-between; 
  align-items: center; 
  padding: 15px 20px;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  position: sticky;
  top: 0;
  z-index: 10; 
    }
.brand-title {
  font-size: 1.25rem;
  font-weight: 600; 
  color: #1a1a1a; 
  margin: 0; 
}
.icon-btn { 
  background: none;
  border: none;
  cursor: pointer;
  color: #333;
  padding: 5px; }
.categories-container {
  display: flex;
  gap: 10px;
  padding: 15px 20px; 
  overflow-x: auto;
  white-space: nowrap; 
  background-color: white;
  border-bottom: 1px solid #eee;
}
.categories-container::-webkit-scrollbar { 
  display: none; 
}
.category-chip {
  padding: 10px 20px;
  border-radius: 25px; 
  border: 1px solid transparent;
  background-color: #f3f4f6; 
  color: #4b5563;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease; 
}
.category-chip.active {
  background-color: #1a1a1a; 
  color: white; 
  transform: scale(1.05);
  box-shadow: 0 4px 10px rgba(0,0,0,0.15); 
}
.products-content { 
  padding: 20px; 
  max-width: 800px; 
  margin: 0 auto; 
}
.products-grid {
  display: grid; 
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); 
  gap: 15px; 
  }
.product-card {
  background: white; 
  border-radius: 16px; 
  padding: 15px; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  text-align: center; 
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025); 
  transition: transform 0.2s ease, box-shadow 0.2s ease;  
}
.product-card:hover{
  transform: translateY(-4px);
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}
.product-icon {
  font-size: 3rem; 
  margin-bottom: 10px; 
}
.product-name {
  font-size: 0.95rem; 
  font-weight: 600; 
  color: #1f2937; 
  margin: 0 0 5px 0; 
}
.product-price {
  color: #1b7a35; 
  font-weight: 700; 
  margin-bottom: 15px; 
  }
.add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%; 
  justify-content: center; 
  padding: 10px; 
  background-color: #f3f4f6; 
  border: none; 
  border-radius: 12px; 
  color: #1f2937; 
  font-weight: 700; 
  cursor: pointer; 
  transition: all 0.2s ease; 
}
.add-btn:hover { 
  background-color: #e5e7eb;
}
.add-btn:active{
  transform: scale(0.95);
  background-color: #d1d5db;
}
.cart-summary{
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: white;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 -4px 10px rgba(0,0,0,0.1);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
}
.summary-info{
  display: flex;
  flex-direction: column;
}

.total-lable{
  font-size: 0.7rem;
  font-weight: 700;
  color:#6b7280;
}
.total-amount{
  font-size: 1.4rem;
  font-weight: 800;
  color: #1a1a1a;
}
.send-btn{
  background: linear-gradient(135deg, #006666 0%, #009999 100%);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 30px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.send-btn:active{
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(0,102,102,0.03);
}


</style>