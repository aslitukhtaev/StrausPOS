/**
 * Jonli hisob: serverdan kelgan SessionView ni `useNow()` bilan har soniya lokal yangilash.
 * Mantiq yo'q — faqat `billing.ts` funksiyalari. Vaqt: `computedAt + (hozir − qabul qilingan payt)`,
 * shuning uchun server soati UI soatidan farq qilsa ham (test soati) summalar to'g'ri yuradi.
 */
import { useMemo } from 'react'
import type { GuestView, SessionView } from '@shared/types'
import { DEFAULT_BILLING, MS_MIN, buildGuestView, computeTotals, guestElapsedMs, type BillingOptions } from '@shared/billing'
import { useNow } from '@/ui'
import { useApp } from '@/store/app'

/** Mehmon vaqt bosqichi: ok — vaqt bor; warn — `warnBeforeMinutes` qoldi; over — olingan vaqt tugadi; finished — chiqib ketgan */
export type TimePhase = 'ok' | 'warn' | 'over' | 'finished'

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
  /** Eng kam qolgan vaqt (ishlayotganlar, bo'lmasa pauzadagilar orasida); faol mehmon yo'q — null */
  minRemainingMs: number | null
  /** Eng kam vaqti qolgan mehmon */
  minGuest: GuestView | null
  /** Xonaning eng "yomon" bosqichi (faol mehmonlar bo'yicha) */
  phase: TimePhase
}

/** Sozlamalardagi hisob-kitob parametrlari (roundTo / blockMinutes / graceMinutes) — barqaror obyekt */
export function useBillingOptions(): BillingOptions {
  const roundTo = useApp((s) => (s.settings ? s.settings.roundTo : DEFAULT_BILLING.roundTo))
  const blockMinutes = useApp((s) => (s.settings ? s.settings.blockMinutes : DEFAULT_BILLING.blockMinutes))
  const graceMinutes = useApp((s) => (s.settings ? s.settings.graceMinutes : DEFAULT_BILLING.graceMinutes))
  return useMemo(() => ({ roundTo, blockMinutes, graceMinutes }), [roundTo, blockMinutes, graceMinutes])
}

/** "Vaqt tugashiga necha daqiqa qolganda ogohlantirilsin" — ms da */
export function useWarnMs(): number {
  return useApp((s) => (s.settings ? s.settings.warnBeforeMinutes : 10)) * MS_MIN
}

export function useDefaultHours(): number {
  return useApp((s) => Math.max(1, s.settings ? s.settings.defaultHours : 1))
}

export function guestPhase(g: Pick<GuestView, 'state' | 'remainingMs'>, warnMs: number): TimePhase {
  if (g.state === 'finished') return 'finished'
  if (g.remainingMs <= 0) return 'over'
  if (warnMs > 0 && g.remainingMs <= warnMs) return 'warn'
  return 'ok'
}

export function liveTotals(view: SessionView, anchor: number, now: number, opts: BillingOptions, warnMs = 0): LiveTotals {
  // Yopilgan sessiya — server qiymatlari muzlagan
  const t = view.session.status === 'closed' ? view.computedAt : view.computedAt + Math.max(0, now - anchor)
  const guests = view.guests.map((g) => buildGuestView(g, view.lines, t, opts))
  const totals = computeTotals(guests, view.lines, view.session.discount)
  let running = 0
  let paused = 0
  let finished = 0
  let longestRun = -1
  let longestAny = 0
  let minRun: GuestView | null = null
  let minPaused: GuestView | null = null
  let phase: TimePhase = 'finished'
  const rank: Record<TimePhase, number> = { finished: 0, ok: 1, warn: 2, over: 3 }
  for (const g of guests) {
    if (g.state === 'running') {
      running++
      if (!minRun || g.remainingMs < minRun.remainingMs) minRun = g
      const p = guestPhase(g, warnMs)
      if (rank[p] > rank[phase]) phase = p
    } else if (g.state === 'paused') {
      paused++
      if (!minPaused || g.remainingMs < minPaused.remainingMs) minPaused = g
      if (rank.ok > rank[phase]) phase = 'ok'
    } else finished++
    const ms = guestElapsedMs(g.intervals, t)
    if (g.state === 'running' && ms > longestRun) longestRun = ms
    if (ms > longestAny) longestAny = ms
  }
  const minGuest = minRun || minPaused
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
    anyRunning: running > 0,
    minRemainingMs: minGuest ? minGuest.remainingMs : null,
    minGuest,
    phase
  }
}

export function useLive(view: SessionView | null, anchor: number): LiveTotals | null {
  const now = useNow()
  const opts = useBillingOptions()
  const warnMs = useWarnMs()
  return useMemo(() => (view ? liveTotals(view, anchor, now, opts, warnMs) : null), [view, anchor, now, opts, warnMs])
}

/**
 * Xona holati (rang): bo'sh / band (feruza) / tugayapti (amber) / oshdi (qizil) /
 * alert — hamma vaqt to'xtagan yoki to'lov kutilmoqda (qizil).
 */
export type RoomTone = 'free' | 'busy' | 'warn' | 'over' | 'alert'

export function roomTone(live: LiveTotals | null): RoomTone {
  if (!live) return 'free'
  if (!live.anyRunning) return 'alert'
  if (live.phase === 'over') return 'over'
  if (live.phase === 'warn') return 'warn'
  return 'busy'
}

export function alertLabel(live: LiveTotals): string {
  if (live.guests.length > 0 && live.finished === live.guests.length) return "To'lov kutilmoqda"
  return "Vaqt to'xtagan"
}

