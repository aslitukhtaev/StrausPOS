/**
 * Chekni yashirin BrowserWindow orqali jim (silent) chop etish. Faqat Electron main jarayonida.
 */
import { BrowserWindow } from 'electron'
import type { ReceiptSettings } from '../../src/shared/types'

const PRINT_TIMEOUT_MS = 30_000

function reasonText(reason: string): string {
  const r = (reason || '').toLowerCase()
  if (r.includes('cancel')) return 'Chop etish bekor qilindi'
  if (r.includes('no printer') || r.includes('invalid printer')) return 'Printer topilmadi yoki ulanmagan'
  return `Chop etishda xato: ${reason || "noma'lum sabab"}. Printer yoqilganini va qog'oz borligini tekshiring`
}

/** Mavjud printerlar ro'yxati (sozlamalar uchun). */
export async function listPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    const list = await win.webContents.getPrintersAsync()
    return list.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }))
  } finally {
    win.destroy()
  }
}

export async function printHtml(html: string, settings: Pick<ReceiptSettings, 'printerName' | 'paperWidth'>): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
  })
  try {
    // Chek ichida tashqi havolalar bo'lmaydi; baribir navigatsiyani bloklaymiz
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const printers = await win.webContents.getPrintersAsync()
    if (printers.length === 0) throw new Error('Kompyuterda printer topilmadi. Printerni ulang va qayta urinib ko‘ring')
    let deviceName: string | undefined
    const wanted = (settings.printerName || '').trim()
    if (wanted) {
      const p = printers.find((x) => x.name === wanted || x.displayName === wanted)
      if (!p) throw new Error(`"${wanted}" printeri topilmadi. Sozlamalarda printer nomini tekshiring`)
      deviceName = p.name
    }

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const heightPx = Number(await win.webContents.executeJavaScript('document.body.scrollHeight', true)) || 1000
    const widthMicrons = (settings.paperWidth === 58 ? 58 : 80) * 1000
    // px → mikron (96 dpi), oxiriga zaxira bo'sh joy
    const heightMicrons = Math.max(50_000, Math.ceil((heightPx * 25_400) / 96) + 10_000)

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Printer javob bermadi (vaqt tugadi)')), PRINT_TIMEOUT_MS)
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName,
          margins: { marginType: 'none' },
          pageSize: { width: widthMicrons, height: heightMicrons }
        },
        (success, failureReason) => {
          clearTimeout(timer)
          if (success) resolve()
          else reject(new Error(reasonText(failureReason)))
        }
      )
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
