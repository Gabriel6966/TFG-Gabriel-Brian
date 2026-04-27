<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const currentTab = ref('mesas')
const mesas = ref<any[]>([])
const cantidadMesas = ref(10)
const isLoading = ref(false)

// Formulario de Productos
const nuevoProducto = ref({ name: '', price: 0, category: 'Burgers', icon: '🍔' })

// 1. Escuchar mesas en tiempo real
onMounted(() => {
    const q = query(collection(db, 'mesas'), orderBy('numero'))
    onSnapshot(q, (snapshot) => {
        mesas.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    })
})

// 2. Generar Mesas (Añade a las existentes)
const generarMesas = async () => {
    isLoading.value = true
    const ultimaMesa = mesas.value.length > 0 ? mesas.value[mesas.value.length - 1].numero : 0
    for (let i = 1; i <= cantidadMesas.value; i++) {
        await addDoc(collection(db, 'mesas'), {
            numero: ultimaMesa + i,
            estado: 'libre',
            capacidad: 4
        })
    }
    isLoading.value = false
}

// 3. Borrar TODAS las mesas (Para resetear el local)
const resetearMesas = async () => {
    if (!confirm("¿Seguro que quieres borrar todas las mesas?")) return
    mesas.value.forEach(async (mesa) => {
        await deleteDoc(doc(db, 'mesas', mesa.id))
    })
}

// 4. Editar capacidad de una mesa
const cambiarCapacidad = async (id: string, nuevaCap: number) => {
    await updateDoc(doc(db, 'mesas', id), { capacidad: nuevaCap })
}

// 5. Añadir Producto al Menú
const guardarProducto = async () => {
    if (!nuevoProducto.value.name) return
    await addDoc(collection(db, 'productos'), nuevoProducto.value)
    alert("Producto añadido al menú")
    nuevoProducto.value = { name: '', price: 0, category: 'Burgers', icon: '🍔' }
}
</script>

<template>
    <div class="admin-layout">
        <aside class="sidebar">
            <h2>EasyOrder Admin</h2>
            <button :class="{ active: currentTab === 'mesas' }" @click="currentTab = 'mesas'">🪑 Mesas</button>
            <button :class="{ active: currentTab === 'productos' }" @click="currentTab = 'productos'">🍔 Menú</button>
            <button class="exit-btn" @click="$router.push('/')">Salir</button>
        </aside>

        <main class="content">
            <div v-if="currentTab === 'mesas'">
                <div class="header-actions">
                    <h1>Gestión de Mesas</h1>
                    <div class="controls">
                        <input type="number" v-model="cantidadMesas" min="1" max="20">
                        <button @click="generarMesas" class="btn-add">Añadir Mesas</button>
                        <button @click="resetearMesas" class="btn-danger">Borrar Todo</button>
                    </div>
                </div>

                <div class="tables-list">
                    <div v-for="mesa in mesas" :key="mesa.id" class="mesa-item">
                        <span>Mesa {{ mesa.numero }}</span>
                        <div class="edit-cap">
                            <label>Capacidad:</label>
                            <input type="number" v-model="mesa.capacidad"
                                @change="cambiarCapacidad(mesa.id, mesa.capacidad)">
                        </div>
                        <span :class="mesa.estado">{{ mesa.estado }}</span>
                    </div>
                </div>
            </div>

            <div v-if="currentTab === 'productos'">
                <h1>Añadir al Menú</h1>
                <div class="product-form">
                    <input v-model="nuevoProducto.name" placeholder="Nombre del plato">
                    <input type="number" v-model="nuevoProducto.price" placeholder="Precio">
                    <select v-model="nuevoProducto.category">
                        <option>Burgers</option>
                        <option>Drinks</option>
                        <option>Desserts</option>
                    </select>
                    <input v-model="nuevoProducto.icon" placeholder="Icono (Emoji)">
                    <button @click="guardarProducto" class="btn-add">Guardar en Menú</button>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
.admin-layout {
    display: flex;
    min-height: 100vh;
    font-family: sans-serif;
}

.sidebar {
    width: 250px;
    background: #1a1a1a;
    color: white;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sidebar button {
    padding: 12px;
    background: none;
    border: none;
    color: #aaa;
    text-align: left;
    cursor: pointer;
    font-size: 1rem;
    border-radius: 8px;
}

.sidebar button.active {
    background: #4f46e5;
    color: white;
}

.content {
    flex: 1;
    padding: 40px;
    background: #f3f4f6;
}

.header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
}

.controls {
    display: flex;
    gap: 10px;
}

.tables-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
}

.mesa-item {
    background: white;
    padding: 15px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.product-form {
    background: white;
    padding: 30px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    max-width: 500px;
}

.product-form input,
.product-form select {
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
}

.btn-add {
    background: #4f46e5;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-danger {
    background: #dc2626;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
}

.libre {
    color: green;
    font-weight: bold;
}

.ocupada {
    color: red;
    font-weight: bold;
}
</style>