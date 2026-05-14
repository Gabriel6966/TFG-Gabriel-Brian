import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  notes: string
  sirveCamarero?: boolean
}

// Producto tal como llega de Firestore (sin quantity/notes).
type Producto = Omit<CartItem, 'quantity' | 'notes'>

export const CartStore = defineStore('cart', () => {
  const currentTableID = ref<number | null>(null)
  const items = ref<CartItem[]>([])

  const totalItems = computed(() =>
    items.value.reduce((acc, item) => acc + item.quantity, 0)
  )

  const totalPrice = computed(() =>
    items.value.reduce((acc, item) => acc + item.price * item.quantity, 0)
  )

  const setTable = (tableId: number) => {
    currentTableID.value = tableId
  }

  const addToCart = (product: Producto) => {
    const existItem = items.value.find(item => item.id === product.id)
    if (existItem) {
      existItem.quantity++
    } else {
      items.value.push({ ...product, quantity: 1, notes: '' })
    }
  }

  const removeFromCart = (productId: string) => {
    items.value = items.value.filter(item => item.id !== productId)
  }

  const increment = (productId: string) => {
    const item = items.value.find(i => i.id === productId)
    if (item) item.quantity++
  }

  const decrement = (productId: string) => {
    const item = items.value.find(i => i.id === productId)
    if (!item) return
    if (item.quantity <= 1) {
      removeFromCart(productId)
    } else {
      item.quantity--
    }
  }

  // Setea cantidad directamente (input editable en el carrito).
  // Cualquier valor <= 0 o no numérico elimina el ítem.
  const setQuantity = (productId: string, qty: number) => {
    const n = Math.floor(Number(qty))
    if (!Number.isFinite(n) || n <= 0) {
      removeFromCart(productId)
      return
    }
    const item = items.value.find(i => i.id === productId)
    if (item) item.quantity = Math.min(n, 999)
  }

  const clear = () => {
    items.value = []
    currentTableID.value = null
  }

  return {
    items, currentTableID, totalItems, totalPrice,
    addToCart, setTable, clear, removeFromCart,
    increment, decrement, setQuantity
  }
})