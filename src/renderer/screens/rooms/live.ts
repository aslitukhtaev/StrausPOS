/**
 * Jonli hisob: serverdan kelgan SessionView ni `useNow()` bilan har soniya lokal yangilash.
 * Mantiq yo'q — faqat `billing.ts` funksiyalari. Vaqt: `computedAt + (hozir − qabul qilingan payt)`,
 * shuning uchun server soati UI soatidan farq qilsa ham (test soati) summalar to'g'ri yuradi.
 */
import { useMemo } from 'react'
import type { GuestView, SessionView } from '@shared/types'
import { DEFAULT_BILLING, buildGuestView, computeTotals, guestElapsedMs, type BillingOptions } from '@shared/billing'
import { useNow } from '@/ui'
import { useApp } from '@/store/app'

export interface LiveTotals {
  /** Hisoblash vaqti (server vaqti bo'yicha) */
  t: number
  guests: GuestView[]
  timeTotal: number
  linesTotal: number
  discount: number
  total: number
  paid: number
  due: number
  running: number
  paused: number
  finished: number
  /** Eng uzoq ishlayotgan mehmon vaqti (ishlayotgan bo'lmasa — eng kattasi) */
  longestMs: number
  anyRunning: boolean
}

/** Sozlamalardagi hisob-kitob parametrlari (roundTo / blockMinutes / graceMinutes) — barqaror obyekt */
export function useBillingOptions(): BillingOptions {
  const roundTo = useApp((s) => (s.settings ? s.settings.roundTo : DEFAULT_BILLING.roundTo))
  const blockMinutes = useApp((s) => (s.settings ? s.settings.blockMinutes : DEFAULT_BILLING.blockMinutes))
  const graceMinutes = useApp((s) => (s.settings ? s.settings.graceMinutes : DEFAULT_BILLING.graceMinutes))
  return useMemo(() => ({ roundTo, blockMinutes, graceMinutes }), [roundTo, blockMinutes, graceMinutes])
}

export function liveTotals(view: SessionView, anchor: number, now: number, opts: BillingOptions): LiveTotals {
  // Yopilgan sessiya — server qiymatlari muzlagan
  const t = view.session.status === 'closed' ? view.computedAt : view.computedAt + Math.max(0, now - anchor)
  const guests = view.guests.map((g) => buildGuestView(g, view.lines, t, opts))
  const totals = computeTotals(guests, view.lines, view.session.discount)
  let running = 0
  let paused = 0
  let finished = 0
  let longestRun = -1
  let longestAny = 0
  for (const g of guests) {
    if (g.state === 'running') running++
    else if (g.state === 'paused') paused++
    else finished++
    const ms = guestElapsedMs(g.intervals, t)
    if (g.state === 'running' && ms > longestRun) longestRun = ms
    if (ms > longestAny) longestAny = ms
  }
  return {
    t,
    guests,
    ...totals,
    paid: view.paid,
    due: Math.max(0, totals.total - view.paid),
    running,
    paused,
    finished,
    longestMs: longestRun >= 0 ? longestRun : longestAny,
    anyRunning: running > 0
  }
}

export function useLive(view: SessionView | null, anchor: number): LiveTotals | null {
  const now = useNow()
  const opts = useBillingOptions()
  return useMemo(() => (view ? liveTotals(view, anchor, now, opts) : null), [view, anchor, now, opts])
}

/** Xona holati (rang) — bo'sh / band / qizil (hamma vaqt to'xtagan yoki to'lov kutilmoqda) */
export type RoomTone = 'free' | 'busy' | 'alert'

export function roomTone(live: LiveTotals | null): RoomTone {
  if (!live) return 'free'
  return live.anyRunning ? 'busy' : 'alert'
}

export function alertLabel(live: LiveTotals): string {
  if (live.guests.length > 0 && live.finished === live.guests.length) return "To'lov kutilmoqda"
  return "Vaqt to'xtagan"
}
