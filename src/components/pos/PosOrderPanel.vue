<script setup lang="ts">
import { CartStore } from '../../stores/cart'

const cartStore = CartStore()

defineProps<{
    mesaSeleccionada: number | null
    isEnviando: boolean
}>()

const emit = defineEmits(['enviar'])
</script>

<template>
    <div class="order-panel-wrapper">
        <!-- Cabecera -->
        <div class="op-header">
            <h3>Pedido Actual</h3>
            <span v-if="mesaSeleccionada" class="mesa-badge">Mesa {{ mesaSeleccionada }}</span>
        </div>

        <!-- Zona central -->
        <div class="op-content">

            <div v-if="cartStore.items.length === 0" class="empty-state">
                <div class="empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none"
                        stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </div>
                <p class="empty-title">No hay productos en el pedido</p>
                <p class="empty-subtitle">Selecciona productos del menú para agregarlos</p>
            </div>

            <div v-else class="items-list">
                <div v-for="item in cartStore.items" :key="item.id" class="cart-item">
                    <div class="item-qty">{{ item.quantity }}</div>
                    <div class="item-details">
                        <span class="item-name">{{ item.name }}</span>
                        <span class="item-price">{{ (item.price * item.quantity).toFixed(2) }}€</span>
                    </div>
                    <button class="btn-remove" @click="cartStore.removeFromCart(item.id)" title="Eliminar producto">
                        ✕
                    </button>
                </div>
            </div>

        </div>

        <!-- Footer modificado (Solo botón enviar) -->
        <div class="op-footer">
            <div class="total-row">
                <span class="total-label">Total</span>
                <span class="total-amount">{{ cartStore.totalPrice.toFixed(2) }}€</span>
            </div>

            <div class="action-buttons">
                <button class="btn-primary" @click="emit('enviar')"
                    :disabled="!mesaSeleccionada || cartStore.items.length === 0 || isEnviando">
                    <span v-if="!isEnviando">🚀 Enviar a Cocina</span>
                    <span v-else class="loading-text">Enviando...</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.order-panel-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #ffffff;
}

.op-header {
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
}

.op-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 800;
    color: #0f172a;
}

.mesa-badge {
    background: #fef3c7;
    color: #d97706;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    border: 1px solid #fde68a;
}

.op-content {
    flex: 1;
    overflow-y: auto;
    position: relative;
}

.empty-state {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    padding: 0 30px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.empty-icon {
    margin-bottom: 16px;
    opacity: 0.8;
}

.empty-title {
    margin: 0 0 8px 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #64748b;
}

.empty-subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.4;
}

.items-list {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.cart-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f8fafc;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
    transition: all 0.2s;
}

.cart-item:hover {
    border-color: #e2e8f0;
}

.item-qty {
    background: white;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-acento, #4f46e5);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    flex-shrink: 0;
}

.item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.item-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 2px;
}

.item-price {
    font-size: 0.85rem;
    font-weight: 700;
    color: #475569;
}

.btn-remove {
    background: transparent;
    border: none;
    color: #94a3b8;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition: all 0.2s;
}

.btn-remove:hover {
    background: #fee2e2;
    color: #ef4444;
}

.op-footer {
    padding: 24px;
    background: white;
    border-top: 1px solid #e2e8f0;
}

.total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.total-label {
    font-size: 1.1rem;
    font-weight: 600;
    color: #475569;
}

.total-amount {
    font-size: 1.6rem;
    font-weight: 800;
    color: #0f172a;
}

.action-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.btn-primary {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    background: #cbd5e1;
    color: white;
}

.btn-primary:not(:disabled) {
    background: var(--color-acento, #4f46e5);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
}

.btn-primary:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
}

.btn-primary:disabled {
    cursor: not-allowed;
}

.loading-text {
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0.6;
    }

    100% {
        opacity: 1;
    }
}
</style>