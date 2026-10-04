/**
 * To'lov usullari — yorliq va ikonkalar (to'lov oynasi, qarzlar, hisobot ekranlarida bir xil).
 * Naqd · Karta (o'tkazma) · Terminal (POS) · Qarz.
 */
import type { DebtPayMethod, PayMethod } from '@shared/types'
import type { IconName } from '@/ui'

export const PAY_METHODS: PayMethod[] = ['cash', 'card', 'terminal', 'debt']
export const DEBT_PAY_METHODS: DebtPayMethod[] = ['cash', 'card', 'terminal']

export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'Naqd', card: 'Karta', terminal: 'Terminal', debt: 'Qarz' }
export const METHOD_ICON: Record<PayMethod, IconName> = { cash: 'cash', card: 'card', terminal: 'receipt', debt: 'wallet' }

/** Segmented uchun (qarzni to'lash usullari) */
export const DEBT_PAY_OPTIONS = DEBT_PAY_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m], icon: METHOD_ICON[m] }))

/** Telefon: faqat raqamlar, mahalliy 9 ta (998 prefiksi olib tashlanadi) */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length > 9 && d.indexOf('998') === 0) d = d.slice(3)
  return d.slice(0, 9)
}
