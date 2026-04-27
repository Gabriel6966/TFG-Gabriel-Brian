<script setup lang="ts">
import { useRouter } from 'vue-router'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { CartStore } from '../stores/cart'

const router = useRouter()
const cartStore = CartStore()

const enviarPedidoACocina = async () => {
    if (cartStore.items.length === 0) {
        alert("¡El carrito está vacío!")
        return
    }

    if (!cartStore.currentTableID) {
        alert("Error: No hay mesa seleccionada.")
        return
    }

    try {
        await addDoc(collection(db, 'pedidos'), {
            mesa: cartStore.currentTableID,
            productos: cartStore.items.map(item => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                notes: item.notes
            })),
            totalPrecio: cartStore.totalPrice,
            estado: 'pendiente',
            horaPedido: serverTimestamp() 
        })

        alert(`¡Comanda enviada a cocina para la mesa ${cartStore.currentTableID}!`)
        cartStore.clear()
        router.push('/mesas')

    } catch (error) {
        console.error("Error al mandar la comanda:", error)
        alert("Hubo un error al enviar el pedido.")
    }
}
</script>

<template>
    <div class="checkout-container">
        <h2>Pedido de la Mesa {{ cartStore.currentTableID }}</h2>

        <ul>
            <li v-for="item in cartStore.items" :key="item.id">
                {{ item.quantity }}x {{ item.name }} - {{ item.price * item.quantity }}€
                <p v-if="item.notes" class="notas">Nota: {{ item.notes }}</p>
            </li>
        </ul>

        <h3>Total: {{ cartStore.totalPrice }}€</h3>

        <button class="btn-enviar" @click="enviarPedidoACocina">
            🧑‍🍳 Enviar a Cocina
        </button>
    </div>
</template>

<style scoped>
.checkout-container {
    padding: 20px;
    font-family: sans-serif;
}

.notas {
    color: red;
    font-size: 0.8rem;
    margin: 0;
}

.btn-enviar {
    background-color: #f59e0b;
    color: white;
    padding: 15px 20px;
    border: none;
    border-radius: 8px;
    font-size: 1.2rem;
    cursor: pointer;
    width: 100%;
    margin-top: 20px;
}
</style>