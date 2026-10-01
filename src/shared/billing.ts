/**
 * Hisob-kitob mexanizmi — toza funksiyalar (DB ham, UI ham shuni ishlatadi).
 *
 * Qoidalar:
 *  - Har bir mehmonning vaqti ALOHIDA hisoblanadi: intervallar yig'indisi.
 *  - Pauza = joriy intervalni yopish; davom ettirish = yangi interval (joriy xona narxi bilan).
 *  - Xona almashtirish = ishlayotgan mehmonlarning intervali yopilib, yangi xona narxi bilan yangi interval ochiladi.
 *  - Vaqt summasi: jami minut (butun, pastga) * tarif / 60, keyin `roundTo` ga yaxlitlanadi.
 *    Tarif har interval uchun alohida (xona almashganda eski narx eski vaqtga qoladi).
 */
import type { Guest, GuestView, LineView, OrderLine, TimeInterval } from './types'

export const MS_MIN = 60_000
export const MS_HOUR = 3_600_000

/** Intervalning davomiyligi (ms). end=null bo'lsa `now` gacha. */
export function intervalMs(iv: TimeInterval, now: number): number {
  const end = iv.end ?? now
  return Math.max(0, end - iv.start)
}

export function guestElapsedMs(intervals: TimeInterval[], now: number): number {
  return intervals.reduce((s, iv) => s + intervalMs(iv, now), 0)
}

/** Vaqt summasi (yaxlitlashdan oldin). Butun minutlar bo'yicha, interval darajasida emas — mehmon darajasida. */
export function guestTimeRaw(intervals: TimeInterval[], now: number): number {
  // Tarif bo'yicha guruhlab, har bir tarif uchun butun minut hisoblaymiz (interval chegaralarida yo'qotish bo'lmasligi uchun
  // umumiy ms ni tarif bo'yicha yig'amiz, so'ng pastga yaxlitlaymiz).
  const msByRate = new Map<number, number>()
  for (const iv of intervals) msByRate.set(iv.rate, (msByRate.get(iv.rate) ?? 0) + intervalMs(iv, now))
  let sum = 0
  for (const [rate, ms] of msByRate) sum += (Math.floor(ms / MS_MIN) * rate) / 60
  return sum
}

export function roundAmount(amount: number, roundTo: number): number {
  if (roundTo <= 1) return Math.round(amount)
  return Math.round(amount / roundTo) * roundTo
}

export function guestTimeAmount(intervals: TimeInterval[], now: number, roundTo: number): number {
  return roundAmount(guestTimeRaw(intervals, now), roundTo)
}

export function lineActiveQty(l: Pick<OrderLine, 'qty' | 'returnedQty'>): number {
  return l.qty - l.returnedQty
}

export function lineAmount(l: Pick<OrderLine, 'qty' | 'returnedQty' | 'unitPrice'>): number {
  return lineActiveQty(l) * l.unitPrice
}

export function buildGuestView(g: Guest, lines: OrderLine[], now: number, roundTo: number): GuestView {
  const open = g.intervals.find((iv) => iv.end === null)
  return {
    ...g,
    elapsedMs: guestElapsedMs(g.intervals, now),
    timeAmount: guestTimeAmount(g.intervals, now, roundTo),
    runningRate: g.state === 'running' && open ? open.rate : 0,
    linesAmount: lines.filter((l) => l.guestId === g.id).reduce((s, l) => s + lineAmount(l), 0)
  }
}

export function buildLineView(l: OrderLine, providerName: string | null): LineView {
  return { ...l, activeQty: lineActiveQty(l), amount: lineAmount(l), providerName }
}

export interface Totals {
  timeTotal: number
  linesTotal: number
  discount: number
  total: number
}

export function computeTotals(guests: GuestView[], lines: LineView[], discount: number): Totals {
  const timeTotal = guests.reduce((s, g) => s + g.timeAmount, 0)
  const linesTotal = lines.reduce((s, l) => s + l.amount, 0)
  const d = Math.min(Math.max(0, discount), timeTotal + linesTotal)
  return { timeTotal, linesTotal, discount: d, total: timeTotal + linesTotal - d }
}

// ───────────── Format yordamchilari (UI va chek uchun) ─────────────
export function formatMoney(n: number): string {
  const s = Math.round(n).toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (x: number) => x.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}`
}
