/**
 * Joriy smena (kassir sessiyasi) holati: `shifts.current` ni vaqti-vaqti bilan yangilaydi.
 * Smena ochilmaguncha to'lov qabul qilinmaydi (server rad etadi) — shuning uchun tepada doim ko'rinib turadi.
 */
import { create } from 'zustand'
import type { ShiftRow } from '@shared/types'
import { api } from '../api'

interface ShiftState {
  row: ShiftRow | null
  loaded: boolean
  refresh: () => Promise<void>
}

export const useShift = create<ShiftState>((set) => ({
  row: null,
  loaded: false,
  refresh: async () => {
    try {
      const row = await api.shifts.current()
      set({ row, loaded: true })
    } catch {
      /* tarmoq/ruxsat xatosi — oldingi holat qoladi */
    }
  }
}))
