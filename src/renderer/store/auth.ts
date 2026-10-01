/**
 * Joriy xodim va ruxsatlar.
 *
 *   const staff = useAuth((s) => s.staff)        // Staff | null
 *   const canPay = useCan('session.pay')          // hook (reaktiv)
 *   if (useAuth.getState().can('line.return')) …  // React tashqarisida
 *
 * Eslatma: ruxsatni UI faqat KO'RSATISH uchun tekshiradi (tugmani yashirish/o'chirish);
 * haqiqiy tekshiruv PosService da.
 */
import { create } from 'zustand'
import type { Permission, Staff } from '@shared/types'

interface AuthState {
  staff: Staff | null
  permissions: Permission[]
  set(session: { staff: Staff; permissions: Permission[] } | null): void
  can(p: Permission): boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  staff: null,
  permissions: [],
  set(session) {
    set(session ? { staff: session.staff, permissions: session.permissions } : { staff: null, permissions: [] })
  },
  can(p) {
    return get().permissions.indexOf(p) >= 0
  }
}))

/** Reaktiv ruxsat tekshiruvi */
export function useCan(p: Permission): boolean {
  return useAuth((s) => s.permissions.indexOf(p) >= 0)
}

/** Joriy xodim (kirmagan bo'lsa null) */
export function useStaff(): Staff | null {
  return useAuth((s) => s.staff)
}
