/**
 * Xonalar paneli ma'lumoti (rooms.board()) — RoomBoard va vaqt ogohlantirishlari (useTimeAlerts) uchun umumiy.
 * Yuklash `RoomsScreen` da har REFRESH_MS da; sessiya oynasidagi amallar natijasi `patchSession` bilan darhol
 * shu yerga ham yoziladi (masalan "+1 soat" dan keyin eskirgan ma'lumot bilan noto'g'ri ogohlantirish chiqmasin).
 */
import { create } from 'zustand'
import type { RoomCard, SessionView } from '@shared/types'
import { api } from '@/api'
import { getNow, toast } from '@/ui'
import { useApp } from '@/store/app'

export const REFRESH_MS = 10_000
/** Ko'ruvchi kompyuterda tezroq (faqat ko'radi — har 3 soniya) */
export const VIEWER_REFRESH_MS = 3_000

interface BoardState {
  cards: RoomCard[] | null
  /** Ma'lumot olingan payt (mahalliy soat bo'yicha, `getNow()`) */
  at: number
  error: string | null
  failStreak: number
  load(manual?: boolean): Promise<void>
  patchSession(v: SessionView): void
}

export const useBoard = create<BoardState>((set, get) => ({
  cards: null,
  at: 0,
  error: null,
  failStreak: 0,
  async load(manual = false) {
    try {
      const cards = await api.rooms.board()
      set({ cards, at: getNow(), error: null, failStreak: 0 })
      if (useApp.getState().readOnly) useApp.getState().setConnected(true)
    } catch (e) {
      if (useApp.getState().readOnly) {
        // Ko'ruvchida aloqa uzilishi — toast emas, butun eni bo'ylab banner (AppShell)
        useApp.getState().setConnected(false)
        set({ error: e instanceof Error ? e.message : String(e), failStreak: get().failStreak + 1 })
        return
      }
      const streak = get().failStreak + 1
      set({ error: e instanceof Error ? e.message : String(e), failStreak: streak })
      // Fon yangilanishida xatoni faqat bir marta ko'rsatamiz (spam bo'lmasin)
      if (manual || streak === 1) toast.error(e)
    }
  },
  patchSession(v) {
    const { cards, at } = get()
    if (!cards) return
    const now = getNow()
    // Turli `at` lar bo'lmasligi uchun: yangi view ni panel `at` iga moslab qo'yamiz (computedAt ni siljitamiz)
    const shifted: SessionView = { ...v, computedAt: v.computedAt - Math.max(0, now - at) }
    const open = v.session.status === 'open'
    const next = cards.map((c) => {
      const mine = !!c.session && c.session.session.id === v.session.id
      // Sessiya hozir turgan xona (xona almashsa — yangi xona)
      if (c.room.id === v.room.id && open && (mine || !c.session)) return { ...c, session: shifted }
      // Yopilgan yoki boshqa xonaga ko'chgan sessiya
      if (mine) return { ...c, session: null, guestsActive: 0, currentTotal: 0 }
      return c
    })
    set({ cards: next })
  }
}))
