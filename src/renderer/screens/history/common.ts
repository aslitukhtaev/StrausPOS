import type { ReportRange } from '@shared/types'

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export const startOfDay = (ts: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
export const addDays = (ts: number, n: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}
const p2 = (n: number) => (n < 10 ? '0' + n : '' + n)
export const toInput = (ts: number) => {
  const d = new Date(ts)
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
}
export const fromInput = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null
}
export function presetRange(p: Exclude<Preset, 'custom'>, now: number): ReportRange {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  if (p === 'today') return { from: today, to: tomorrow }
  if (p === 'yesterday') return { from: addDays(today, -1), to: today }
  if (p === 'week') return { from: addDays(today, -6), to: tomorrow }
  const d = new Date(today)
  return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: tomorrow }
}

export const METHOD_LABEL: Record<string, string> = { cash: 'Naqd', card: 'Karta', terminal: 'Terminal', debt: 'Qarz' }
export const roomLabel = (r: { roomId: number; roomName: string }) => (r.roomId === 0 ? 'Bar' : r.roomName)

/** paymentMethods ("cash,card" yoki "Naqd, Karta") ni yorliqlarga aylantiradi */
export function methodBadges(s: string): string[] {
  return s
    .split(/[,+/]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => METHOD_LABEL[x.toLowerCase()] || x)
}
