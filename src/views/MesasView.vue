<script setup lang="ts">
import {ref} from  'vue'


//Simulation of the data that gonna be in the Firebase

const tables=ref([
    {id:1, nr:1,status:'available', capacity:4},
    {id:2, nr:2,status:'occupied', capacity:2},
    {id:3, nr:3,status:'paying', capacity:4},
    {id:4, nr:4,status:'available', capacity:6},
    {id:5, nr:5,status:'occupied', capacity:2},
    {id:6, nr:6,status:'available', capacity:8},
])

//Function clicking a table
const openTable = (table:any) =>{
    if(table.status === 'available'){
        alert(`Opening new order for Table ${table.nr}`)
        //Future navegation screen
    }else{
        alert(`Viewing current order for Table ${table.nr}`)
    }
}
</script>

<template>
    <div class="tables-screen">
        <header class="header">
            <h1>Main Dining Room</h1>

            <div class="legend">
                <span class="dot available"></span> Available
                <span class="dot occupied"></span> Occupied
                <span class="dot paying"></span> Paying
            </div>
        </header>

        <main class="tables-grid">
            <button
            v-for="table in tables"
            :key="table.id"
            class="table-card"
            :class="table.status"
            @click="openTable(table)"
            >
            <span class="table-nr">{{ table.nr }}</span>
            <span class="table-info">Seats: {{ table.capacity }}</span>
        </button>
        </main>
    </div>
</template>

<style scoped>

.tables-screen{
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
}

.header{
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 2rem;
    text-align: center;
}

h1{
    color:#1f2937;
    margin-bottom: 1rem;
}
.legend{
    display: flex;
    gap:15px;
    font-size: 0.9rem;
    color:#4b5563;
}
.dot{
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.tables-grid{
    display: grid;
    /*Responsive columns */
    grid-template-columns: repeat(auto-fit,minmax(120px,1fr));
    gap:20px
}

.table-card{
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    aspect-ratio: 1;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: transform 0.2s,box-shadow 0.2s;
    color:white
}

.table-card:hover{
    transform:translateY(-5px);
    box-shadow: 0 8px 12px rgba(0,0,0,0.15); 
}

.table-nr{
    font-size: 2.5rem;
    font-weight: bold;
}

.table-info{
    font-size: 0.8rem;
    margin-top: 5px;
    opacity: 0.9;
}

.available {
    background-color: #10b981;
}
.occupied { 
    background-color: #ef4444; 
}
.paying { 
    background-color: #f59e0b;
}
.dot.available {
    background-color: #10b981;
}
.dot.occupied { 
    background-color: #ef4444; 
}
.dot.paying { 
    background-color: #f59e0b;
}



</style>