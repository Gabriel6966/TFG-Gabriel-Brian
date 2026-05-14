<script setup lang="ts">
import { useNotify } from '../composables/useNotify'

const { toasts, confirmState, dismissToast, resolveConfirm } = useNotify()

const iconFor = (type: string) => {
  switch (type) {
    case 'success': return '✓'
    case 'error':   return '✕'
    case 'warning': return '⚠'
    default:        return 'ⓘ'
  }
}
</script>

<template>
  <!-- ── TOAST STACK (centrado arriba) ── -->
  <transition-group name="toast" tag="div" class="notify-stack">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="notify-toast"
      :class="`notify-toast-${t.type}`"
      role="status"
      @click="dismissToast(t.id)"
    >
      <span class="notify-icon" :class="`notify-icon-${t.type}`">
        {{ iconFor(t.type) }}
      </span>
      <div class="notify-body">
        <strong class="notify-title">{{ t.title }}</strong>
        <span v-if="t.message" class="notify-message">{{ t.message }}</span>
      </div>
      <button class="notify-close" @click.stop="dismissToast(t.id)" aria-label="Cerrar">×</button>
    </div>
  </transition-group>

  <!-- ── CONFIRM MODAL ── -->
  <transition name="confirm-fade">
    <div
      v-if="confirmState.open"
      class="confirm-backdrop"
      @click.self="resolveConfirm(false)"
      role="dialog"
      aria-modal="true"
    >
      <div class="confirm-modal" :class="`confirm-${confirmState.variant}`">
        <div class="confirm-icon-wrap" :class="`confirm-icon-${confirmState.variant}`">
          <span class="confirm-icon">
            {{ confirmState.variant === 'danger' ? '⚠' : '?' }}
          </span>
        </div>
        <h3 class="confirm-title">{{ confirmState.title }}</h3>
        <p v-if="confirmState.message" class="confirm-message">{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="resolveConfirm(false)">
            {{ confirmState.cancelLabel }}
          </button>
          <button
            class="btn-confirm"
            :class="`btn-confirm-${confirmState.variant}`"
            @click="resolveConfirm(true)"
          >
            {{ confirmState.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* ── TOAST STACK ── */
.notify-stack {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10000;
  pointer-events: none;
  width: min(420px, 92vw);
}

.notify-toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 40px 1fr 24px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 12px 32px rgba(15, 23, 42, 0.18),
    0 2px 6px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  cursor: pointer;
  user-select: none;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

/* Barra lateral coloreada según tipo */
.notify-toast-success { border-left: 4px solid #16a34a; }
.notify-toast-error   { border-left: 4px solid #dc2626; }
.notify-toast-warning { border-left: 4px solid #d97706; }
.notify-toast-info    { border-left: 4px solid #2563eb; }

.notify-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}
.notify-icon-success { background: #16a34a; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.45); }
.notify-icon-error   { background: #dc2626; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.45); }
.notify-icon-warning { background: #d97706; box-shadow: 0 4px 14px rgba(217, 119, 6, 0.45); }
.notify-icon-info    { background: #2563eb; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45); }

.notify-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.notify-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.notify-message {
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.35;
  word-break: break-word;
}

.notify-close {
  background: transparent;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  transition: all 0.15s;
}
.notify-close:hover { background: rgba(15, 23, 42, 0.06); color: #0f172a; }

/* Animaciones */
.toast-enter-active {
  transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  transition: all 0.22s ease-in;
  position: absolute;
  width: 100%;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
.toast-move {
  transition: transform 0.28s ease;
}

/* ── CONFIRM MODAL ── */
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.confirm-modal {
  width: min(420px, 100%);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  padding: 28px;
  text-align: center;
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

.confirm-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: 900;
  color: white;
}
.confirm-icon-default { background: linear-gradient(135deg, #4f46e5, #7c3aed); box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4); }
.confirm-icon-danger  { background: linear-gradient(135deg, #dc2626, #b91c1c); box-shadow: 0 8px 20px rgba(220, 38, 38, 0.4); }

.confirm-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 8px;
}

.confirm-message {
  font-size: 0.92rem;
  color: #475569;
  margin: 0 0 22px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.confirm-actions button {
  flex: 1;
  padding: 12px 18px;
  border-radius: 12px;
  border: none;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s;
  font-family: inherit;
}

.btn-cancel {
  background: #f1f5f9;
  color: #475569;
}
.btn-cancel:hover { background: #e2e8f0; }

.btn-confirm-default {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
}
.btn-confirm-default:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 8px 18px rgba(79, 70, 229, 0.35); }

.btn-confirm-danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: white;
}
.btn-confirm-danger:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 8px 18px rgba(220, 38, 38, 0.35); }

/* Animación modal */
.confirm-fade-enter-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.confirm-fade-leave-active { transition: all 0.18s ease-in; }
.confirm-fade-enter-from   { opacity: 0; }
.confirm-fade-leave-to     { opacity: 0; }
.confirm-fade-enter-from .confirm-modal,
.confirm-fade-leave-to   .confirm-modal {
  transform: scale(0.94) translateY(10px);
  opacity: 0;
}
.confirm-fade-enter-active .confirm-modal,
.confirm-fade-leave-active .confirm-modal {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
