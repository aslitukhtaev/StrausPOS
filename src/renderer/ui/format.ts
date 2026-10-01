/**
 * Format yordamchilari (o'zbekcha). Pul va davomiylik uchun `@shared/billing` dagi
 * `formatMoney` / `formatDuration` qayta eksport qilinadi — yagona manba.
 */
export { formatMoney, formatDuration } from '@shared/billing'

export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
export const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'
]

const p2 = (n: number) => (n < 10 ? '0' + n : '' + n)

/** 14:05 */
export function formatClock(ts: number, withSeconds = false): string {
  const d = new Date(ts)
  return p2(d.getHours()) + ':' + p2(d.getMinutes()) + (withSeconds ? ':' + p2(d.getSeconds()) : '')
}

/** 1-oktabr, Chorshanba  (withWeekday=false → "1-oktabr 2026") */
export function formatDate(ts: number, withWeekday = true): string {
  const d = new Date(ts)
  const base = d.getDate() + '-' + MONTHS[d.getMonth()]
  return withWeekday ? base + ', ' + WEEKDAYS[d.getDay()] : base + ' ' + d.getFullYear()
}

/** 01.10.2026 14:05 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + formatClock(ts)
}

/** 01.10.2026 */
export function formatDateShort(ts: number): string {
  const d = new Date(ts)
  return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear()
}

/** Daqiqalarni o'qiladigan ko'rinishga: 95 → "1 soat 35 daq" */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.floor(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return r + ' daq'
  return r === 0 ? h + ' soat' : h + ' soat ' + r + ' daq'
}

/** Telefon: 901234567 → "90 123 45 67" (faqat ko'rsatish uchun) */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  const local = d.length === 12 && d.indexOf('998') === 0 ? d.slice(3) : d
  if (local.length !== 9) return raw
  return local.slice(0, 2) + ' ' + local.slice(2, 5) + ' ' + local.slice(5, 7) + ' ' + local.slice(7)
}

/** Ism bosh harflari: "Jasur Karimov" → "JK" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0].charAt(0)
  const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return (a + b).toUpperCase()
}
