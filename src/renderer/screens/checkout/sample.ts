/**
 * sampleReceiptData(settings) — chek sozlamalarida jonli ko'rinish uchun namunaviy ReceiptData.
 * Raqamlar qat'iy (namuna), hisob-kitob emas.
 */
import type { AppSettings, ReceiptData, ReceiptSettings } from '@shared/types'

export function sampleReceiptData(settings: AppSettings | ReceiptSettings): ReceiptData {
  const rs: ReceiptSettings = 'receipt' in settings ? settings.receipt : settings
  const closedAt = Date.now()
  const openedAt = closedAt - (2 * 60 + 15) * 60_000
  return {
    settings: rs,
    receiptNo: 128,
    roomName: 'VIP xona',
    openedAt,
    closedAt,
    cashier: 'Kassir',
    guests: [
      { label: 'Mehmon 1', elapsedMs: (2 * 60 + 15) * 60_000, timeAmount: 135_000 },
      { label: 'Mehmon 2', elapsedMs: (1 * 60 + 40) * 60_000, timeAmount: 100_000 }
    ],
    lines: [
      { name: 'Choy (choynak)', qty: 2, unitPrice: 15_000, amount: 30_000, guestLabel: null, providerName: null },
      { name: 'Coca-Cola 0.5', qty: 3, unitPrice: 10_000, amount: 30_000, guestLabel: 'Mehmon 1', providerName: null },
      { name: 'Klassik massaj', qty: 1, unitPrice: 150_000, amount: 150_000, guestLabel: 'Mehmon 2', providerName: 'Massajchi' }
    ],
    timeTotal: 235_000,
    linesTotal: 210_000,
    discount: 15_000,
    total: 430_000,
    payments: [
      { method: 'cash', amount: 300_000 },
      { method: 'terminal', amount: 130_000 }
    ],
    debtor: null,
    provisional: false
  }
}
