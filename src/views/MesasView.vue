<script setup lang="ts">
import {ref} from  'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
//Simulation of the data that gonna be in the Firebase

const tables = ref([
  { id: 1, nr: 1, status: 'available', capacity: 2 },
  { id: 2, nr: 2, status: 'occupied', capacity: 4 },
  { id: 3, nr: 3, status: 'available', capacity: 2 },
  { id: 4, nr: 4, status: 'occupied', capacity: 4 },
  { id: 5, nr: 5, status: 'available', capacity: 6 },
  { id: 6, nr: 6, status: 'available', capacity: 2 },
  { id: 7, nr: 7, status: 'occupied', capacity: 8 },
  { id: 8, nr: 8, status: 'available', capacity: 2 },
  { id: 9, nr: 9, status: 'available', capacity: 4 },
  { id: 10, nr: 10, status: 'occupied', capacity: 2 }
])
//Function clicking a table
const openTable = (table:any) =>{
    if(table.status === 'available'){
        router.push(`/menu/${table.nr}`)
        //Future navegation screen
    }else{
        alert(`Viewing current order for Table ${table.nr}`)
    }
}
</script>

<template>
  <div class="app-container">
    <nav class="top-bar">
      <button class="icon-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      <h1 class="brand-title">EasyOrder</h1>
      <button class="icon-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      </button>
    </nav>

    <div class="tables-content">
      <h2 class="section-title">Select a Table</h2>

      
      <main class="tables-grid">
        <button 
          v-for="table in tables" 
          :key="table.id"
          class="table-card"
          :class="table.status"
          @click="openTable(table)"
        >
          <span class="table-nr">{{ table.nr }}</span>
          <span class="table-name">Table {{ table.nr }}</span>
          <span class="table-seats">({{ table.capacity }} Seats)</span>
          
          <div class="table-status-label">
            <svg v-if="table.status === 'occupied'" class="status-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>{{ table.status === 'available' ? 'Available' : 'Occupied' }}</span>
          </div>
        </button>
      </main>
    </div>
  </div>
</template>
<style scoped>
.app-container {
  min-height: 100vh;
  background-color: #f8f9fa;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}


.top-bar {
  display: flex;
  justify-content: space-between;
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
}

.tables-content {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.section-title {
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-top: 0;
  margin-bottom: 20px;
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}


.table-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 15px 10px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: transform 0.1s, filter 0.2s;
}

.table-card:active {
  transform: scale(0.96); 
}

.table-nr {
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.table-name {
  font-size: 0.9rem;
  font-weight: 600;
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

.status-icon {
  opacity: 0.9;
}

.available { 
  background-color: #1b7a35; 
}

.occupied { 
  background-color: #a81c1c;
}
</style>