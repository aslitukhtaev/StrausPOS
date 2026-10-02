/**
 * Electron main: oyna, xavfsizlik, DB va PosService ni ishga tushirish, IPC.
 * Electron 22 / Node 16 (CJS bundle).
 */
import { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { PosService } from './PosService'
import type { PosHost } from './PosService'
import { registerIpc } from './ipc'
import { listPrinters, printHtml } from './print'
import { writeFileAtomic } from './db'

let mainWindow: BrowserWindow | null = null
let service: PosService | null = null

const APP_NAME = 'Delfin Sauna'
const USER_DATA_DIR = 'DelfinSauna'
const DB_FILE_NAME = 'delfin.db'
/** Oldingi nom (StrausPOS) bilan o'rnatilgan dasturning bazasi — birinchi ishga tushishda ko'chiriladi. */
const LEGACY_DIR = 'StrausPOS'
const LEGACY_DB = 'straus.db'
const BG = { dark: '#04223a', light: '#eaf7fd' }

// Brend va ma'lumotlar papkasi: app ready dan OLDIN (single-instance qulfi ham shu papkaga bog'liq)
app.setName(APP_NAME)
app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIR))

/** Eski versiya bazasini yangi papkaga nusxalash (agar yangisi hali yo'q bo'lsa). Asl fayl o'chirilmaydi. */
function importLegacyDb(dbFile: string): void {
  if (fs.existsSync(dbFile)) return
  const legacy = path.join(app.getPath('appData'), LEGACY_DIR, LEGACY_DB)
  if (!fs.existsSync(legacy)) return
  try {
    writeFileAtomic(dbFile, fs.readFileSync(legacy))
  } catch (e) {
    console.error('[main] eski bazani ko‘chirib bo‘lmadi:', e)
  }
}

/** Sozlamadagi rejim (auto = tizim) bo'yicha oyna fon rangi — yuklanishda "oq chaqnash" bo'lmasin. */
function windowBackground(): string {
  let theme: 'light' | 'dark' | 'auto' = 'auto'
  try {
    theme = service?.currentTheme() ?? 'auto'
  } catch {
    /* standart */
  }
  const dark = theme === 'dark' || (theme === 'auto' && nativeTheme.shouldUseDarkColors)
  return dark ? BG.dark : BG.light
}

const DEV_URL = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || ''

function preloadPath(): string {
  const dir = path.join(__dirname, '../preload')
  for (const f of ['index.js', 'index.cjs', 'index.mjs']) {
    const p = path.join(dir, f)
    if (fs.existsSync(p)) return p
  }
  return path.join(dir, 'index.js')
}

function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (DEV_URL) {
      const d = new URL(DEV_URL)
      if (u.origin === d.origin) return true
    }
    return u.protocol === 'file:'
  } catch {
    return false
  }
}

function createHost(): PosHost {
  return {
    printReceipt: (html, settings) => printHtml(html, settings),
    listPrinters: () => listPrinters(),

    saveBackup: async (bytes, suggestedName) => {
      const opts = {
        title: 'Zaxira nusxani saqlash',
        defaultPath: path.join(app.getPath('documents'), suggestedName),
        filters: [{ name: 'Delfin Sauna zaxira', extensions: ['db'] }]
      }
      const res = mainWindow ? await dialog.showSaveDialog(mainWindow, opts) : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return null
      writeFileAtomic(res.filePath, bytes)
      return res.filePath
    },

    openBackup: async () => {
      const opts = {
        title: 'Zaxiradan tiklash',
        properties: ['openFile' as const],
        filters: [{ name: 'Delfin Sauna zaxira', extensions: ['db'] }]
      }
      const res = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || res.filePaths.length === 0) return null
      const confirmOpts = {
        type: 'warning' as const,
        buttons: ['Tiklash', 'Bekor qilish'],
        defaultId: 1,
        cancelId: 1,
        title: 'Tiklash',
        message: "Joriy ma'lumotlar tanlangan zaxira bilan almashtiriladi. Davom etasizmi?",
        detail: "Joriy holat avtomatik ravishda 'backups' papkasiga saqlanadi."
      }
      const c = mainWindow ? await dialog.showMessageBox(mainWindow, confirmOpts) : await dialog.showMessageBox(confirmOpts)
      if (c.response !== 0) return null
      const bytes = fs.readFileSync(res.filePaths[0])
      // Xavfsizlik uchun: tiklashdan oldin joriy bazani saqlab qo'yamiz
      if (service) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        writeFileAtomic(path.join(app.getPath('userData'), 'backups', `oldin-tiklash-${stamp}.db`), service.exportBytes())
      }
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: windowBackground(),
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // Tizim rejimi o'zgarsa (auto) — fon rangini ham moslaymiz
  const onTheme = (): void => mainWindow?.setBackgroundColor(windowBackground())
  nativeTheme.on('updated', onTheme)
  mainWindow.on('closed', () => nativeTheme.removeListener('updated', onTheme))

  if (DEV_URL) void mainWindow.loadURL(DEV_URL)
  else void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function bootstrap(): Promise<void> {
  const dbFile = path.join(app.getPath('userData'), DB_FILE_NAME)
  importLegacyDb(dbFile)
  service = await PosService.create({ file: dbFile, clock: () => Date.now(), host: createHost() })
  registerIpc(service, (e) => {
    const url = e.senderFrame?.url ?? ''
    return isAppUrl(url)
  })
  createWindow()
}

// ───── Xavfsizlik: tashqi navigatsiya va yangi oynalar bloklanadi ─────
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.setWindowOpenHandler(({ url }) => {
    // Tashqi havolalar (masalan yordam sahifasi) tizim brauzerida — faqat https
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null)
      // Oflayn ilova: Chromium'ning DNS-over-HTTPS (dns.google) tekshiruvlari o'chiriladi
      try {
        app.configureHostResolver({ secureDnsMode: 'off' })
      } catch {
        /* eski/yangi API farqi — muhim emas */
      }
      // Kamera, mikrofon va h.k. ruxsat so'rovlari rad etiladi
      session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
      await bootstrap()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      dialog.showErrorBox(`${APP_NAME} ishga tushmadi`, msg)
      app.quit()
    })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
