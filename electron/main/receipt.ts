/**
 * ReceiptData → chek HTML (termal printer 58/80 mm). Toza funksiya: main, dev-server va testlarda bir xil.
 * Skript yo'q, tashqi resurs yo'q; barcha matn HTML-escape qilinadi.
 */
import type { PayMethod, ReceiptData } from '../../src/shared/types'
import { formatDuration, formatMoney } from '../../src/shared/billing'

export const PAY_METHOD_LABELS: Record<PayMethod, string> = { cash: 'Naqd', card: 'Karta', terminal: 'Terminal', debt: 'Qarz' }

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function p2(n: number): string {
  return n.toString().padStart(2, '0')
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function money(n: number): string {
  return `${formatMoney(n)} so'm`
}

export function renderReceiptHtml(data: ReceiptData): string {
  const s = data.settings
  const width = s.paperWidth === 58 ? 58 : 80
  // Chop etiladigan maydon (printer chetlari hisobga olingan)
  const contentMm = width === 58 ? 48 : 72
  const fontPx = width === 58 ? 11 : 13
  const e = escapeHtml

  const row = (left: string, right: string, cls = '') =>
    `<div class="row${cls ? ' ' + cls : ''}"><span class="l">${left}</span><span class="r">${right}</span></div>`

  const parts: string[] = []
  parts.push(`<div class="center title">${e(s.businessName || 'Delfin Sauna')}</div>`)
  if (s.address) parts.push(`<div class="center">${e(s.address)}</div>`)
  if (s.phone) parts.push(`<div class="center">Tel: ${e(s.phone)}</div>`)
  parts.push('<div class="sep"></div>')
  // Oraliq hisob (sessiya yopilmagan): raqamsiz, katta ogohlantirish
  if (data.provisional) parts.push(`<div class="center provisional">TO'LANMAGAN · ORALIQ HISOB</div>`)
  parts.push(row(!data.provisional && data.receiptNo > 0 ? `Chek № ${data.receiptNo}` : data.provisional ? 'Oraliq hisob' : 'Oldindan hisob', e(data.roomName)))
  if (s.showTimes) {
    parts.push(row('Kirish:', e(formatDateTime(data.openedAt))))
    parts.push(row(data.provisional ? 'Hozir:' : 'Chiqish:', e(formatDateTime(data.closedAt))))
  }
  if (s.showStaff && data.cashier) parts.push(row('Kassir:', e(data.cashier)))
  parts.push('<div class="sep"></div>')

  // Vaqt
  if (s.showGuestBreakdown && data.guests.length > 0) {
    parts.push('<div class="h">Vaqt</div>')
    for (const g of data.guests) {
      parts.push(row(`${e(g.label)} <span class="muted">${e(formatDuration(g.elapsedMs))}</span>`, e(formatMoney(g.timeAmount))))
    }
  }
  // Xonasiz bar savdosi chekida (mehmon va vaqt yo'q) vaqt bo'limi chiqmaydi
  if (data.guests.length > 0 || data.timeTotal !== 0) parts.push(row('Vaqt jami:', e(money(data.timeTotal)), 'b'))

  // Qatorlar
  if (data.lines.length > 0) {
    parts.push('<div class="sep"></div>')
    parts.push('<div class="h">Buyurtmalar</div>')
    for (const l of data.lines) {
      const sub: string[] = []
      if (s.showGuestBreakdown && l.guestLabel) sub.push(e(l.guestLabel))
      if (s.showStaff && l.providerName) sub.push(e(l.providerName))
      parts.push(`<div class="item">${e(l.name)}${sub.length ? ` <span class="muted">(${sub.join(', ')})</span>` : ''}</div>`)
      parts.push(row(`<span class="muted">${l.qty} × ${e(formatMoney(l.unitPrice))}</span>`, e(formatMoney(l.amount))))
    }
    parts.push(row('Buyurtmalar jami:', e(money(data.linesTotal)), 'b'))
  }

  parts.push('<div class="sep"></div>')
  if (data.discount > 0) parts.push(row('Chegirma:', '−' + e(money(data.discount))))
  parts.push(row('JAMI:', e(money(data.total)), 'total'))

  if (data.payments.length > 0) {
    parts.push('<div class="sep"></div>')
    for (const p of data.payments) parts.push(row(e(PAY_METHOD_LABELS[p.method] ?? p.method) + ':', e(money(p.amount))))
  }
  if (data.debtor) {
    parts.push(row('Qarzdor:', e(data.debtor.name)))
    parts.push(row('Telefon:', e(data.debtor.phone)))
  }
  if (data.provisional) {
    parts.push('<div class="sep"></div>')
    parts.push(`<div class="center provisional">TO'LANMAGAN · ORALIQ HISOB</div>`)
  }
  if (s.footer) {
    parts.push('<div class="sep"></div>')
    parts.push(`<div class="center footer">${e(s.footer)}</div>`)
  }
  const ig = data.instagram
  if (ig && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(ig.qrCodeBase64)) {
    parts.push('<div class="sep"></div>')
    parts.push(`<div class="center"><img class="qr" src="${ig.qrCodeBase64}" alt=""></div>`)
    parts.push(`<div class="center footer">Bizning Instagram${ig.handle ? ': ' + e(ig.handle) : ''}</div>`)
  }

  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><title>${data.provisional ? 'Oraliq hisob' : `Chek ${data.receiptNo || ''}`}</title>
<style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${width}mm; padding: 2mm ${(width - contentMm) / 2}mm 6mm; font-family: "Consolas", "Courier New", monospace; font-size: ${fontPx}px; line-height: 1.3; }
.center { text-align: center; }
.title { font-size: ${fontPx + 5}px; font-weight: 700; margin-bottom: 1mm; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.row .l { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.row .r { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.b { font-weight: 700; }
.total { font-weight: 700; font-size: ${fontPx + 4}px; margin: 1mm 0; }
.h { font-weight: 700; margin: 1mm 0 0.5mm; }
.item { overflow-wrap: anywhere; }
.muted { color: #333; }
.sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
.footer { margin-top: 1mm; }
.qr { width: 32mm; height: 32mm; image-rendering: pixelated; }
.provisional { font-weight: 700; font-size: ${fontPx + 6}px; border: 2px solid #000; padding: 1mm; margin: 1mm 0; }
</style></head>
<body>
${parts.join('\n')}
</body></html>`
}

// ───────────── Oshxona cheki ─────────────
export interface KitchenTicketData {
  /** order — yangi buyurtma; cancel — qaytarish ("BEKOR"); reprint — qayta chop etish */
  kind: 'order' | 'cancel' | 'reprint'
  /** Buyurtma № (oshxona cheklari jurnali) */
  orderNo: number
  /** Xona nomi; xonasiz bar savdosi — "Bar" */
  roomName: string
  items: { name: string; qty: number }[]
  /** Olib boruvchi ofitsiant (yo'q bo'lsa null) */
  waiterName: string | null
  /** Kim qo'shdi: "Ali (Kassir)" */
  addedBy: string
  at: number
}

/** Oshxona cheki HTML: katta shrift, narxsiz (oshxona uchun faqat nima va qancha). */
export function renderKitchenHtml(data: KitchenTicketData & { paperWidth: 58 | 80 }): string {
  const width = data.paperWidth === 58 ? 58 : 80
  const contentMm = width === 58 ? 48 : 72
  const fontPx = width === 58 ? 13 : 15
  const e = escapeHtml
  const title = data.kind === 'cancel' ? 'BEKOR' : 'OSHXONA'
  const parts: string[] = []
  parts.push(`<div class="center title">${title}</div>`)
  if (data.kind === 'cancel') parts.push('<div class="center b">Quyidagilar BEKOR qilindi</div>')
  if (data.kind === 'reprint') parts.push('<div class="center">(qayta chop etildi)</div>')
  parts.push(`<div class="center room">${e(data.roomName)}</div>`)
  parts.push('<div class="sep"></div>')
  for (const it of data.items) {
    parts.push(`<div class="item"><span class="q">${data.kind === 'cancel' ? '−' : ''}${it.qty} ×</span> <span class="n">${e(it.name)}</span></div>`)
  }
  parts.push('<div class="sep"></div>')
  if (data.waiterName) parts.push(`<div>Ofitsiant: <b>${e(data.waiterName)}</b></div>`)
  parts.push(`<div>Qo'shdi: ${e(data.addedBy)}</div>`)
  parts.push(`<div>Vaqt: ${e(formatDateTime(data.at))}</div>`)
  parts.push(`<div>Buyurtma № <b>${data.orderNo}</b></div>`)
  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><title>${title} ${data.orderNo}</title>
<style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${width}mm; padding: 2mm ${(width - contentMm) / 2}mm 8mm; font-family: "Consolas", "Courier New", monospace; font-size: ${fontPx}px; line-height: 1.3; }
.center { text-align: center; }
.b { font-weight: 700; }
.title { font-size: ${fontPx + 12}px; font-weight: 700; letter-spacing: 2px; }
.room { font-size: ${fontPx + 8}px; font-weight: 700; margin: 1mm 0; }
.item { font-size: ${fontPx + 6}px; font-weight: 700; margin: 1mm 0; overflow-wrap: anywhere; }
.item .q { white-space: nowrap; }
.sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
</style></head>
<body>
${parts.join('\n')}
</body></html>`
}
