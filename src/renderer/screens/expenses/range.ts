import type { ReportRange } from '@shared/types'
import { MONTHS } from '@/ui'

export type RangePreset = 'today' | 'week' | 'month' | 'lastMonth' | 'custom'

const p2 = (n: number) => (n < 10 ? '0' + n : '' + n)
export const startOfDay = (ts: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
export const addDays = (ts: number, n: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}
export const toInput = (ts: number) => {
  const d = new Date(ts)
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
}
export const fromInput = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null
}
/** [from, to) — to = oxirgi kunning ertasi */
export function presetRange(p: Exclude<RangePreset, 'custom'>, now: number): ReportRange {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const d = new Date(today)
  if (p === 'today') return { from: today, to: tomorrow }
  if (p === 'week') return { from: addDays(today, -6), to: tomorrow }
  if (p === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: tomorrow }
  return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), to: new Date(d.getFullYear(), d.getMonth(), 1).getTime() }
}

const dayDate = (day: string) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
/** '2026-10-04' → "4-oktabr" */
export const dayLabel = (day: string) => {
  const d = dayDate(day)
  return d.getDate() + '-' + MONTHS[d.getMonth()]
}
export const dayShort = (day: string) => p2(Number(day.slice(8, 10))) + '.' + day.slice(5, 7)
export const dayDMY = (day: string) => day.slice(8, 10) + '.' + day.slice(5, 7) + '.' + day.slice(0, 4)

export const CAT_COLORS = ['var(--accent-fill)', 'var(--busy-fill)', 'var(--warning-fill)', 'var(--free-fill)', 'var(--danger)', 'var(--paused)']
