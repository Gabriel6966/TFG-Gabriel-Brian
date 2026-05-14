import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  type: ToastType
  title: string
  message?: string
}

export interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  variant: 'default' | 'danger'
  resolve: ((v: boolean) => void) | null
}

// Estado global (singleton) — un único stack de toasts y una sola confirm a la vez.
const toasts = ref<Toast[]>([])
let nextId = 1

const confirmState = ref<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Aceptar',
  cancelLabel: 'Cancelar',
  variant: 'default',
  resolve: null
})

const TOAST_DURATION_MS = 4000

const pushToast = (type: ToastType, title: string, message?: string) => {
  const id = nextId++
  toasts.value.push({ id, type, title, message })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, TOAST_DURATION_MS)
  return id
}

const dismissToast = (id: number) => {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useNotify() {
  const toast = {
    success: (title: string, message?: string) => pushToast('success', title, message),
    error:   (title: string, message?: string) => pushToast('error',   title, message),
    warning: (title: string, message?: string) => pushToast('warning', title, message),
    info:    (title: string, message?: string) => pushToast('info',    title, message),
  }

  const confirm = (opts: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'danger'
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmState.value = {
        open: true,
        title: opts.title,
        message: opts.message ?? '',
        confirmLabel: opts.confirmLabel ?? 'Aceptar',
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        variant: opts.variant ?? 'default',
        resolve
      }
    })
  }

  const resolveConfirm = (value: boolean) => {
    confirmState.value.resolve?.(value)
    confirmState.value.open = false
    confirmState.value.resolve = null
  }

  return { toast, confirm, toasts, confirmState, dismissToast, resolveConfirm }
}
