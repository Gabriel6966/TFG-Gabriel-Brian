<script setup lang="ts">
import { useRouter } from 'vue-router';
import { CartStore } from '../stores/cart';

const router=useRouter()
const cart =CartStore()

const goBack=()=>{
    //Getting back route
    router.back()
}

const sendKitchen=()=>{
    if(cart.items.length===0)
    return

    //Sending to Firebase in the future
    alert('Comanda enviada a cocina exitosamente!')

    //Cleaning cart and getting back to the tables
    cart.clear()
    router.push('/tables')    

}

</script>

<template>
    <div class="app-container">
        <nav class="top-bar">
            <button class="icon-btn" @click="goBack">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <h1 class="brand-title">Order - Table {{ cart.currentTableID }}</h1>
            <div style="width: 24px;"></div>
        </nav>

        <main class="checkout-content">
            <div v-if="cart.items.length ===0" class="empty-cart">
                <p>Ther order is empty</p>
                <button class="back-btn" @click="goBack">Add Products</button>
            </div>

            <div v-else class="order-list">
                <div v-for="(item,index) in cart.items" :key="index" class="order-item">
                    <div class="item-header">
                        <span class="item-quantity">{{ item.quantity }}</span>
                        <span class="item-name">{{ item.name }}</span>
                        <span class="item-price">€{{ (item.price * item.quantity).toFixed(2) }}</span>
                    
                        <button class="delete-btn" @click="cart.removeFromCart(item.id)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>

                    <input
                    type="text"
                    class="notes-input"
                    placeholder="Add kitchen notes..."
                    v-model="item.notes"
                    >
                </div>
            </div>
        </main>

        <div v-if="cart.totalItems>0" class="cart-summary">
            <div class="summary-info">
                <span class="total-label">FINAL TOTAL</span>
                <span class="total-amount">€{{ cart.totalPrice.toFixed(2) }}</span>
            </div>
            <button class="confirm-btn" @click="sendKitchen">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Confirm Order
            </button>
        </div>
    </div>

</template>

<style scoped>

.app-container{
    min-height: 100vh;
    background-color: #f8f9fa;
    padding-bottom: 80px;
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
    padding: 5px; }

.checkout-content { 
    padding: 20px; 
    max-width: 600px; 
    margin: 0 auto; 
}
.empty-cart { 
    text-align: center; 
    padding: 40px 20px; 
    color: #6b7280; 
}
.back-btn { 
    margin-top: 15px; 
    padding: 10px 20px; 
    background-color: #1a1a1a; 
    color: white; 
    border: none; 
    border-radius: 8px; 
    font-weight: 600; 
    cursor: pointer; 
}

.order-list { 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
}
.order-item { 
    background: white; 
    padding: 15px; 
    border-radius: 12px; 
    box-shadow: 0 2px 5px rgba(0,0,0,0.05); 
}
.item-header { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    margin-bottom: 10px; }
.item-quantity { 
    background-color: #f3f4f6; 
    padding: 4px 8px; 
    border-radius: 6px; 
    font-weight: 700; 
    font-size: 0.9rem; 
    color: #1f2937; 
}
.item-name { 
    flex-grow: 1; 
    font-weight: 600; 
    color: #1f2937; 
}
.item-price { 
    font-weight: 700; 
    color: #1b7a35; 
}


.notes-input { 
    width: 100%; 
    padding: 10px; 
    border: 1px solid #e5e7eb; 
    border-radius: 8px; 
    font-size: 0.9rem; 
    background-color: #f9fafb; 
    transition: border-color 0.2s; 
    box-sizing: border-box;
}
.notes-input:focus { 
    outline: none; 
    border-color: #006666; 
    background-color: white; 
}

.cart-summary { 
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
.summary-info { 
    display: flex; 
    flex-direction: column; 
}
.total-label { 
    font-size: 0.7rem; 
    font-weight: 700; 
    color: #6b7280; 
}
.total-amount { 
    font-size: 1.4rem; 
    font-weight: 800; 
    color: #1a1a1a; 
}
.confirm-btn { 
    background-color: #1b7a35; 
    color: white; 
    border: none; 
    padding: 12px 24px; 
    border-radius: 30px; 
    font-weight: 700;
    display: flex; 
    align-items: center; 
    gap: 8px; 
    cursor: pointer; 
    font-size: 1rem; 
}
.delete-btn{
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    margin-left: 5px;
    transition: background-color 0.2s;
}

.delete-btn:hover{
    background-color: #fee2e2;
}
</style>