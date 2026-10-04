/**
 * Hisob-kitob mexanizmi — toza funksiyalar (DB ham, UI ham shuni ishlatadi).
 *
 * Qoidalar (Delfin Sauna — "qattiq" tizim):
 *  - Har bir mehmonning vaqti ALOHIDA: intervallar yig'indisi. Pauza = interval yopiladi, davom = yangi interval.
 *  - Xona ochilganda mehmonga vaqt OLINADI (paidMinutes, masalan 60/120). Taymer orqaga sanaydi.
 *    Mehmon 5 daqiqa o'tirsa ham olingan vaqt TO'LIQ to'lanadi.
 *  - Olingan vaqtdan oshsa: `graceMinutes` dan keyin har boshlangan `blockMinutes` (standart 60) to'liq qo'shiladi.
 *  - Summa: hisoblanadigan daqiqalar intervallar bo'ylab xronologik taqsimlanadi (har intervalning o'z tarifi bilan —
 *    xona almashsa eski narx eski vaqtda qoladi); ishlatilmay qolgan (oldindan olingan) daqiqalar oxirgi tarif bilan.
 *  - Natija `roundTo` ga yaxlitlanadi.
 */
import type { Guest, GuestView, LineView, OrderLine, TimeInterval } from './types'

export const MS_MIN = 60_000
export const MS_HOUR = 3_600_000

export interface BillingOptions {
  roundTo: number
  blockMinutes: number
  graceMinutes: number
}

export const DEFAULT_BILLING: BillingOptions = { roundTo: 1000, blockMinutes: 1, graceMinutes: 0 }

/** Intervalning davomiyligi (ms). end=null bo'lsa `now` gacha. */
export function intervalMs(iv: TimeInterval, now: number): number {
  const end = iv.end ?? now
  return Math.max(0, end - iv.start)
}

export function guestElapsedMs(intervals: TimeInterval[], now: number): number {
  return intervals.reduce((s, iv) => s + intervalMs(iv, now), 0)
}

/** Hisoblanadigan daqiqalar: max(olingan, olingan + boshlangan bloklar). */
export function billedMinutes(elapsedMs: number, paidMinutes: number, opts: Pick<BillingOptions, 'blockMinutes' | 'graceMinutes'>): number {
  const paid = Math.max(0, paidMinutes || 0)
  const over = Math.max(0, elapsedMs) / MS_MIN - paid
  if (over <= Math.max(0, opts.graceMinutes || 0)) return paid
  const block = opts.blockMinutes > 0 ? opts.blockMinutes : 1
  return paid + Math.ceil(over / block - 1e-9) * block
}

/** Qolgan vaqt (ms). Manfiy = oshib ketgan. */
export function remainingMs(intervals: TimeInterval[], paidMinutes: number, now: number): number {
  return Math.max(0, paidMinutes || 0) * MS_MIN - guestElapsedMs(intervals, now)
}

/** Vaqt summasi (yaxlitlashdan oldin) berilgan hisoblanadigan daqiqalar uchun. */
export function guestTimeRaw(intervals: TimeInterval[], billedMin: number, now: number): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  if (sorted.length === 0 || billedMin <= 0) return 0
  let budget = billedMin
  let sum = 0
  for (const iv of sorted) {
    if (budget <= 0) break
    const take = Math.min(intervalMs(iv, now) / MS_MIN, budget)
    sum += (take * iv.rate) / 60
    budget -= take
  }
  if (budget > 0) sum += (budget * sorted[sorted.length - 1].rate) / 60
  return sum
}

export function roundAmount(amount: number, roundTo: number): number {
  if (!Number.isFinite(amount)) return 0
  if (roundTo <= 1) return Math.round(amount)
  return Math.round(amount / roundTo) * roundTo
}

export function guestTimeAmount(intervals: TimeInterval[], paidMinutes: number, now: number, opts: BillingOptions): number {
  const billed = billedMinutes(guestElapsedMs(intervals, now), paidMinutes, opts)
  return roundAmount(guestTimeRaw(intervals, billed, now), opts.roundTo)
}

export function lineActiveQty(l: Pick<OrderLine, 'qty' | 'returnedQty'>): number {
  return Math.max(0, l.qty - l.returnedQty)
}

export function lineAmount(l: Pick<OrderLine, 'qty' | 'returnedQty' | 'unitPrice'>): number {
  return lineActiveQty(l) * l.unitPrice
}

export function buildGuestView(g: Guest, lines: OrderLine[], now: number, opts: BillingOptions): GuestView {
  const open = g.intervals.find((iv) => iv.end === null)
  const elapsed = guestElapsedMs(g.intervals, now)
  const billed = billedMinutes(elapsed, g.paidMinutes, opts)
  return {
    ...g,
    elapsedMs: elapsed,
    timeAmount: roundAmount(guestTimeRaw(g.intervals, billed, now), opts.roundTo),
    remainingMs: Math.max(0, g.paidMinutes || 0) * MS_MIN - elapsed,
    billedMinutes: billed,
    runningRate: g.state === 'running' && open ? open.rate : 0,
    linesAmount: lines.filter((l) => l.guestId === g.id).reduce((s, l) => s + lineAmount(l), 0)
  }
}

/** Ofitsiant haqi asosi: bar va oshxona MAHSULOTLARI (xizmatlar emas), qaytarishlar ayirilgan. */
export function waiterProductSales(lines: Pick<OrderLine, 'kind' | 'qty' | 'returnedQty' | 'unitPrice'>[]): number {
  return lines.filter((l) => l.kind === 'product').reduce((s, l) => s + lineAmount(l), 0)
}

export function waiterCommission(productSales: number, pct: number): number {
  const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0
  return Math.round((productSales * p) / 100)
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
  const linesTotal = lines.reduce((s, l) => s + Math.max(0, l.amount), 0)
  const gross = timeTotal + linesTotal
  const d = Number.isFinite(discount) ? Math.min(Math.max(0, discount), gross) : 0
  return { timeTotal, linesTotal, discount: d, total: timeTotal + linesTotal - d }
}

// ───────────── Format yordamchilari (UI va chek uchun) ─────────────
export function formatMoney(n: number): string {
  const s = Math.round(n).toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (x: number) => x.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}`
}

/** Orqaga sanovchi taymer: qolgan vaqt "01:23:45"; oshib ketgan bo'lsa "+00:05:12" */
export function formatCountdown(remaining: number): string {
  if (remaining >= 0) return formatDuration(Math.ceil(remaining / 1000) * 1000)
  return '+' + formatDuration(-remaining)
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} soat ${m} daq`
  if (h) return `${h} soat`
  return `${m} daq`
}
