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

/**
 * Vaqt summasi (yaxlitlashdan oldin).
 * Mehmonning jami vaqti butun minutga PASTGA kesiladi (oxirgi to'liq bo'lmagan minut hisoblanmaydi),
 * summa esa intervallar bo'yicha xronologik tarzda, har intervalning o'z tarifi bilan yig'iladi.
 * Shunday qilib tarif almashganda (xona almashtirish) minut yo'qolmaydi va eski narx eski vaqtda qoladi.
 */
export function guestTimeRaw(intervals: TimeInterval[], now: number): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let budgetMin = Math.floor(guestElapsedMs(sorted, now) / MS_MIN)
  let sum = 0
  for (const iv of sorted) {
    if (budgetMin <= 0) break
    const take = Math.min(intervalMs(iv, now) / MS_MIN, budgetMin)
    sum += (take * iv.rate) / 60
    budgetMin -= take
  }
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
  return Math.max(0, l.qty - l.returnedQty)
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
