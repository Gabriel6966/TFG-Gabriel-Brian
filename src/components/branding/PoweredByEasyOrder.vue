<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'light' | 'dark'
  compact?: boolean
  label?: boolean
}>(), {
  tone: 'light',
  compact: false,
  label: false
})
</script>

<template>
  <div class="powered-by" :class="[`tone-${tone}`, { compact }]">
    <span v-if="label" class="powered-copy">Powered by</span>
    <div class="powered-logo-shell">
      <img
        src="/EasyOrderLogo-transparent.png"
        alt="EasyOrder"
        class="powered-logo"
      >
    </div>
  </div>
</template>

<style scoped>
.powered-by {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.powered-copy {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.powered-logo {
  height: 28px;
  width: auto;
  display: block;
  object-fit: contain;
}

.powered-logo-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(6px);
}

.tone-light .powered-copy {
  color: #94a3b8;
}

.tone-light .powered-logo-shell {
  background: rgba(248, 250, 252, 0.92);
}

.tone-dark .powered-copy {
  color: rgba(226, 232, 240, 0.72);
}

.tone-dark .powered-logo-shell {
  background: rgba(15, 23, 42, 0.34);
  border-color: rgba(148, 163, 184, 0.22);
}

.compact {
  gap: 8px;
}

.compact .powered-copy {
  font-size: 0.62rem;
}

.compact .powered-logo-shell {
  padding: 3px 8px;
}

.compact .powered-logo {
  height: 22px;
}
</style>
