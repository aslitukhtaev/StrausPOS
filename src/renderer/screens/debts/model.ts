/** Qarzlar sahifasining filtr va hisoblash mantig'i (sof funksiyalar — testlanadi). */
import type { DebtJournalRow, DebtPayMethod, ReportRange } from '@shared/types'

export type DebtStatus = 'all' | 'open' | 'paid'

export interface DebtFilter {
  /** Qarz berilgan vaqt oralig'i [from, to) */
  range: ReportRange
  status: DebtStatus
  /** Qarzga bergan xodim */
  staffId: number | null
  source: 'all' | 'room' | 'bar'
  /** Ism, telefon yoki "№12" */
  q: string
  /** Chek raqami — kiritilsa qolgan filtrlar hisobga olinmaydi (chek aniq topiladi) */
  receipt: string
}

export const leftOf = (d: { amount: number; paid: number }) => Math.max(0, d.amount - d.paid)

export const receiptDigits = (s: string) => s.replace(/\D/g, '')

export function matchText(d: DebtJournalRow, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  // "№12" / "#12" — faqat chek raqami
  if (s.startsWith('№') || s.startsWith('#')) return String(d.receiptNo ?? '') === receiptDigits(s)
  const digits = s.replace(/\D/g, '')
  const onlyNumber = /^[\d\s+()-]+$/.test(s)
  if (onlyNumber && digits && String(d.receiptNo ?? '') === digits) return true
  return d.customerName.toLowerCase().includes(s) || (onlyNumber && digits.length >= 3 && d.phone.replace(/\D/g, '').includes(digits))
}

/** Davr va holatdan tashqari filtrlar (to'lovlar hisoboti uchun ham ishlatiladi) */
function matchWho(d: DebtJournalRow, f: DebtFilter): boolean {
  return (f.staffId == null || d.issuedById === f.staffId) && (f.source === 'all' || d.source === f.source) && matchText(d, f.q)
}

export function filterDebts(rows: DebtJournalRow[], f: DebtFilter): DebtJournalRow[] {
  const no = receiptDigits(f.receipt)
  if (no) return rows.filter((d) => String(d.receiptNo ?? '') === no)
  return rows.filter(
    (d) =>
      d.createdAt >= f.range.from && d.createdAt < f.range.to &&
      (f.status === 'all' || (f.status === 'open' ? leftOf(d) > 0 : leftOf(d) === 0)) &&
      matchWho(d, f)
  )
}

export interface Totals {
  count: number
  debtors: number
  amount: number
  paid: number
  left: number
}

export function totalsOf(rows: DebtJournalRow[]): Totals {
  return {
    count: rows.length,
    debtors: new Set(rows.map((d) => d.debtorId)).size,
    amount: rows.reduce((a, d) => a + d.amount, 0),
    paid: rows.reduce((a, d) => a + d.paid, 0),
    left: rows.reduce((a, d) => a + leftOf(d), 0)
  }
}

export interface Group extends Totals {
  key: number
  name: string
  phone: string
  /** Qarzga bergan xodimlar (takrorsiz) */
  issuers: string[]
  lastAt: number
}

function groupBy(rows: DebtJournalRow[], pick: (d: DebtJournalRow) => { key: number; name: string; phone: string }): Group[] {
  const m = new Map<number, { head: { key: number; name: string; phone: string }; rows: DebtJournalRow[] }>()
  for (const d of rows) {
    const head = pick(d)
    const x = m.get(head.key)
    if (x) x.rows.push(d)
    else m.set(head.key, { head, rows: [d] })
  }
  return Array.from(m.values()).map(({ head, rows: list }) => ({
    ...head,
    ...totalsOf(list),
    issuers: Array.from(new Set(list.map((d) => d.issuedByName).filter(Boolean))),
    lastAt: Math.max(...list.map((d) => d.createdAt))
  }))
}

export const byDebtor = (rows: DebtJournalRow[]) => groupBy(rows, (d) => ({ key: d.debtorId, name: d.customerName, phone: d.phone }))
export const byIssuer = (rows: DebtJournalRow[]) =>
  groupBy(rows, (d) => ({ key: d.issuedById ?? 0, name: d.issuedByName || 'Nomaʼlum', phone: '' })).sort((a, b) => b.amount - a.amount)

export interface Collection {
  id: number
  at: number
  method: DebtPayMethod
  amount: number
  byId: number
  byName: string
  debt: DebtJournalRow
}

/** Davrda QABUL QILINGAN to'lovlar (qarz qachon berilganidan qat'i nazar); xodim/manba/qidiruv/chek filtri qarzga qo'llanadi */
export function collections(rows: DebtJournalRow[], f: DebtFilter): Collection[] {
  const no = receiptDigits(f.receipt)
  const out: Collection[] = []
  for (const d of rows) {
    if (no ? String(d.receiptNo ?? '') !== no : !matchWho(d, f)) continue
    for (const p of d.payments) {
      if (!no && (p.at < f.range.from || p.at >= f.range.to)) continue
      out.push({ id: p.id, at: p.at, method: p.method, amount: p.amount, byId: p.by, byName: p.byName, debt: d })
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export const itemsText = (d: DebtJournalRow) => d.items.map((i) => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')
