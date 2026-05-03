import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { watch } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Iniciamos el listener de Firebase Auth antes de montar la app.
// Esto evita el "flash" de redirección al login cuando ya hay sesión activa.
const { initAuthListener, authReady } = useAuth()
initAuthListener()

// Esperamos la primera respuesta de Firebase antes de renderizar nada
const stopWatch = watch(authReady, (ready) => {
  if (ready) {
    app.mount('#app')
    stopWatch() // cancelamos el watcher, ya no lo necesitamos
  }
})