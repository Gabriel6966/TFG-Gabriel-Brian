<script setup lang="ts">
import AppNotifications from './components/AppNotifications.vue'
</script>

<template>
  <router-view />
  <AppNotifications />
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

/* ── Design tokens globales ── */
:root {
  /* Color principal del negocio (se sobrescribe desde useNegocio.ts) */
  --color-acento: #4f46e5;

  /* Border radius */
  --radius-sm:  8px;
  --radius-md:  12px;
  --radius-lg:  16px;
  --radius-xl:  22px;

  /* Sombras dispersas (no las "afiladas" tradicionales) */
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm: 0 2px 6px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03);
  --shadow-md: 0 8px 24px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);
  --shadow-glow: 0 8px 24px color-mix(in srgb, var(--color-acento) 28%, transparent);

  /* Colores neutros base (escala slate) */
  --bg:         #f8fafc;
  --surface:    #ffffff;
  --border:     #e2e8f0;
  --text:       #0f172a;
  --text-muted: #64748b;
}

html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  overscroll-behavior: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'; /* Inter contextual */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg);
  color: var(--text);
}
</style>