/**
 * Navigatsiya (qaysi ekran ochiq). Router yo'q — oddiy holat.
 *
 *   const go = useNav((s) => s.go)
 *   go('debts')                       // ekranga o'tish
 *   go('rooms', { roomId: 3 })        // ixtiyoriy parametr — ekran `useNav(s => s.params)` bilan o'qiydi
 */
import { create } from 'zustand'
import type { ScreenId } from '../layout/routes'

interface NavState {
  screen: ScreenId
  params: Record<string, unknown>
  go(screen: ScreenId, params?: Record<string, unknown>): void
}

export const useNav = create<NavState>((set) => ({
  screen: 'rooms',
  params: {},
  go(screen, params) {
    set({ screen, params: params ?? {} })
  }
}))
