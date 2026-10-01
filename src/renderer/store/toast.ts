/**
 * Toast (bildirishnoma) holati.
 *
 *   import { toast, errorMessage } from '@/store/toast'   // yoki '@/ui'
 *   toast.success("Xona ochildi")
 *   toast.error(e)                     // Error yoki matn — Error.message ko'rsatiladi
 *   toast.info("Saqlanmoqda...", { duration: 2000 })
 *
 * Ekranda <ToastViewport/> (App.tsx da bir marta o'rnatilgan) ko'rsatadi.
 */
import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  description?: string
  duration: number
}

export interface ToastOptions {
  description?: string
  /** ms, standart: error 5000, boshqalar 3000. 0 = qo'lda yopilguncha */
  duration?: number
}

interface ToastState {
  items: ToastItem[]
  push(kind: ToastKind, title: string, opts?: ToastOptions): number
  dismiss(id: number): void
  clear(): void
}

let seq = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push(kind, title, opts) {
    const id = seq++
    const duration = opts?.duration ?? (kind === 'error' ? 5000 : 3000)
    const item: ToastItem = { id, kind, title, description: opts?.description, duration }
    // Bir xil matn ketma-ket chiqsa — takrorlamaymiz
    const items = get().items.filter((t) => !(t.title === title && t.kind === kind))
    set({ items: [...items, item].slice(-4) })
    if (duration > 0) timers.set(id, setTimeout(() => get().dismiss(id), duration))
    return id
  },
  dismiss(id) {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    set({ items: get().items.filter((x) => x.id !== id) })
  },
  clear() {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    set({ items: [] })
  }
}))

/** Har qanday xatodan foydalanuvchiga ko'rsatiladigan o'zbekcha matn. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return "Kutilmagan xatolik yuz berdi"
}

const push = (kind: ToastKind) => (msg: unknown, opts?: ToastOptions) =>
  useToastStore.getState().push(kind, kind === 'error' ? errorMessage(msg) : String(msg), opts)

export const toast = {
  success: push('success'),
  error: push('error'),
  info: push('info'),
  warning: push('warning'),
  dismiss: (id: number) => useToastStore.getState().dismiss(id)
}
