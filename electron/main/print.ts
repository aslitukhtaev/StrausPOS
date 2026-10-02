/**
 * Chekni yashirin BrowserWindow orqali jim (silent) chop etish. Faqat Electron main jarayonida.
 *
 * Electron 22 (Chromium 108) `webContents.print` eslatmalari:
 *  - `pageSize` obyekt bo'lsa — MIKRONDA ({ width: 80000, height: … }). Ikkala tomoni ≥ 353 mikron bo'lishi kerak.
 *  - `silent: true` va `deviceName` berilmasa — tizimdagi standart printer olinadi; standart printer yo'q bo'lsa
 *    Chromium jim xato beradi. Shuning uchun printerni o'zimiz aniqlab, `deviceName` ni har doim beramiz.
 *  - Termal printerlar: 80 mm qog'oz (bosiladigan kenglik ~72 mm), 58 mm qog'oz (~48 mm). Chek HTML'i (receipt.ts)
 *    tanani qog'oz kengligida, ichki maydonni bosiladigan kenglikda chizadi; shu yerda `margins: none`.
 *  - Uzunlik: kontent balandligi o'lchanadi (rulon qog'oz) — bitta uzun sahifa, keyin printer drayveri kesadi.
 */
import { BrowserWindow } from 'electron'
import type { PrinterInfo } from 'electron'
import type { ReceiptSettings } from '../../src/shared/types'

const PRINT_TIMEOUT_MS = 30_000
const MM_TO_PX = 96 / 25.4
const MICRONS_PER_PX = 25_400 / 96
/** Juda uzun chekda ham drayver qabul qiladigan chegarada qolish uchun (≈ 5 m). */
const MAX_HEIGHT_MICRONS = 5_000_000
const MIN_HEIGHT_MICRONS = 50_000

/** Chek ichida skript ishlamasin: hech qanday JS, tashqi resurs, forma yoki navigatsiya yo'q. */
const RECEIPT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"

function reasonText(reason: string): string {
  const r = (reason || '').toLowerCase()
  if (r.includes('cancel')) return 'Chop etish bekor qilindi'
  if (r.includes('no printer') || r.includes('invalid printer') || r.includes('invalid devicename') || r.includes('no valid printer'))
    return 'Printer topilmadi yoki ulanmagan. Printer yoqilganini va kabelini tekshiring'
  if (r.includes('settings')) return "Printer sozlamalari qabul qilinmadi. Printer drayverida qog'oz o'lchamini (58/80 mm) tekshiring"
  return `Chop etishda xato: ${reason || "noma'lum sabab"}. Printer yoqilganini va qog'oz borligini tekshiring`
}

/** HTML ga Content-Security-Policy meta tegini qo'shadi (inline skriptlar bloklanadi). */
export function withReceiptCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${RECEIPT_CSP}">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + meta)
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
}

/** Sozlamadagi nom bo'yicha yoki standart printerni tanlaydi; topilmasa tushunarli xato. */
export function pickPrinter(printers: Pick<PrinterInfo, 'name' | 'displayName' | 'isDefault'>[], wantedName: string | undefined | null): string {
  if (printers.length === 0) throw new Error("Kompyuterda printer topilmadi. Printerni ulang, drayverini o'rnating va qayta urinib ko'ring")
  const wanted = (wantedName || '').trim()
  if (wanted) {
    const exact = printers.find((x) => x.name === wanted || x.displayName === wanted)
    const loose = exact ?? printers.find((x) => x.name.toLowerCase() === wanted.toLowerCase() || x.displayName.toLowerCase() === wanted.toLowerCase())
    if (!loose) throw new Error(`"${wanted}" printeri topilmadi. Sozlamalar → Chek bo'limida printerni qayta tanlang`)
    return loose.name
  }
  const def = printers.find((p) => p.isDefault)
  if (def) return def.name
  if (printers.length === 1) return printers[0].name
  throw new Error("Standart printer tanlanmagan. Sozlamalar → Chek bo'limida chek printerini tanlang")
}

/** Kontent balandligi (px) → sahifa balandligi (mikron), zaxira bo'sh joy bilan, chegaralangan. */
export function pageHeightMicrons(contentPx: number): number {
  const px = Number.isFinite(contentPx) && contentPx > 0 ? contentPx : 1000
  return Math.min(MAX_HEIGHT_MICRONS, Math.max(MIN_HEIGHT_MICRONS, Math.ceil(px * MICRONS_PER_PX) + 10_000))
}

/** Mavjud printerlar ro'yxati (sozlamalar uchun). */
export async function listPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  try {
    const list = await win.webContents.getPrintersAsync()
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }))
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export async function printHtml(html: string, settings: Pick<ReceiptSettings, 'printerName' | 'paperWidth'>): Promise<void> {
  const paperMm = settings.paperWidth === 58 ? 58 : 80
  const win = new BrowserWindow({
    show: false,
    // Oyna kengligi = qog'oz kengligi: balandlik aynan bosiladigan ko'rinishda o'lchanadi
    width: Math.ceil(paperMm * MM_TO_PX),
    height: 800,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // executeJavaScript (balandlikni o'lchash) uchun kerak; sahifa ichidagi skriptlarni CSP bloklaydi
      javascript: true,
      spellcheck: false
    }
  })
  try {
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const printers = await win.webContents.getPrintersAsync()
    const deviceName = pickPrinter(printers, settings.printerName)

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(withReceiptCsp(html)))
    const heightPx = Number(
      await win.webContents.executeJavaScript(
        '(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){var d=document.documentElement,b=document.body;return Math.max(d.scrollHeight,b?b.scrollHeight:0)})',
        true
      )
    )

    await new Promise<void>((resolve, reject) => {
      let done = false
      const timer = setTimeout(() => {
        done = true
        reject(new Error('Printer javob bermadi (vaqt tugadi). Printer yoqilganini va qog\'oz borligini tekshiring'))
      }, PRINT_TIMEOUT_MS)
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          color: false,
          copies: 1,
          scaleFactor: 100,
          landscape: false,
          deviceName,
          margins: { marginType: 'none' },
          pageSize: { width: paperMm * 1000, height: pageHeightMicrons(heightPx) }
        },
        (success, failureReason) => {
          if (done) return
          done = true
          clearTimeout(timer)
          if (success) resolve()
          else reject(new Error(reasonText(failureReason)))
        }
      )
    })
  } finally {
    // Spooler'ga topshirilgandan keyin oynani yopamiz (callback'dan oldin yopilsa ish bekor bo'lishi mumkin)
    if (!win.isDestroyed()) win.destroy()
  }
}
