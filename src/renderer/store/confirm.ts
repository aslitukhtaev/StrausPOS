/**
 * Imperativ tasdiqlash oynasi (Promise asosida).
 *
 *   import { confirmDialog } from '@/ui'
 *   if (await confirmDialog({ title: "Sessiyani bekor qilasizmi?", danger: true, confirmText: "Bekor qilish" })) { ... }
 *
 * <ConfirmHost/> App.tsx da bir marta o'rnatilgan.
 */
import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { IconName } from '../ui/Icon'

export interface ConfirmOptions {
  title: ReactNode
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  /** Qizil tasdiq tugmasi (o'chirish, bekor qilish kabi xavfli amallar) */
  danger?: boolean
  icon?: IconName
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve(v: boolean): void }) | null
  open(o: ConfirmOptions): Promise<boolean>
  close(v: boolean): void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  open(o) {
    get().current?.resolve(false)
    return new Promise<boolean>((resolve) => set({ current: { ...o, resolve } }))
  },
  close(v) {
    const c = get().current
    set({ current: null })
    c?.resolve(v)
  }
}))

export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(o)
}
