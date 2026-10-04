/**
 * TERMINAL rejimi (ikkinchi kompyuter — ofitsiantlar monobloki): lokal konfiguratsiya (userData/connection.json),
 * PosApi proksisi va connection.* boshqaruvi. Electron'ga bog'liq emas — index.ts (Electron) va dev-server ishlatadi.
 *
 * Terminalda baza OCHILMAYDI. Barcha PosApi chaqiruvlari HTTP orqali asosiy kompyuterga (terminal tokeni bilan) boradi —
 * server har terminal uchun alohida login kontekstini saqlaydi. Lokal bajariladiganlar:
 *   connection.*            — shu kompyuterning ulanish sozlamasi;
 *   system.printReceipt     — terminalning O'Z printeriga (chek HTML lokal render qilinadi);
 *   system.listPrinters     — shu kompyuter printerlari;
 *   settings.get/save       — `receipt.printerName` terminalning lokal printeri (asosiynikiga tegmaydi);
 *   faqat asosiyga tegishli (network.*, system.backup/restore, license.activate, auth.setupOwner) — lokal rad.
 * license.status asosiydan proksi qilinadi (asosiy kompyuter litsenziyasi).
 */
import crypto from 'crypto'
import fs from 'fs'
import type { PosApi } from '../../../src/shared/api'
import type { AppMode, AppSettings, ConnectionInfo, DiscoveredServer, ReceiptData } from '../../../src/shared/types'
import { API_METHODS } from '../apiMethods'
import { PosError } from '../PosService'
import type { PosHost } from '../PosService'
import { writeFileAtomic } from '../db'
import { renderReceiptHtml } from '../receipt'
import { discover as udpDiscover, hello, rpc } from './client'
import type { RemoteTarget } from './client'
import { MAIN_ONLY_MESSAGE, MSG_NOT_FOUND, isTerminalDenied, isValidCode, isValidTerminalId } from './protocol'

export interface ConnectionConfig {
  mode: AppMode
  host: string | null
  port: number | null
  code: string | null
  /** Terminal identifikatori (UUID) — birinchi ulanishda yaratiladi va saqlanadi */
  terminalId: string | null
  /** Terminalning o'z kassa printeri ('' — tizim standarti) */
  printerName: string
}

export const MAIN_CONFIG: ConnectionConfig = { mode: 'main', host: null, port: null, code: null, terminalId: null, printerName: '' }

function validHost(h: unknown): h is string {
  return typeof h === 'string' && /^[A-Za-z0-9.\-:[\]]{1,253}$/.test(h)
}

function validPort(p: unknown): p is number {
  return typeof p === 'number' && Number.isInteger(p) && p >= 1 && p <= 65535
}

function cleanPrinter(p: unknown): string {
  return typeof p === 'string' ? p.slice(0, 200) : ''
}

export function newTerminalId(): string {
  return crypto.randomUUID()
}

/**
 * Fayl yo'q / buzilgan / to'liq emas → asosiy rejim. Eski 'viewer' (ko'rish rejimi) konfiguratsiyasi 'terminal' deb o'qiladi.
 * (Faylni o'zgartirmaydi — saqlash uchun loadConnectionConfig.)
 */
export function readConnectionConfig(file: string): ConnectionConfig {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    const terminalId = isValidTerminalId(j.terminalId) ? j.terminalId.toLowerCase() : null
    const printerName = cleanPrinter(j.printerName)
    if ((j.mode === 'terminal' || j.mode === 'viewer') && validHost(j.host) && validPort(j.port) && isValidCode(j.code)) {
      return { mode: 'terminal', host: j.host, port: j.port, code: j.code, terminalId, printerName }
    }
    return { ...MAIN_CONFIG, terminalId, printerName }
  } catch {
    /* yo'q yoki buzilgan */
  }
  return { ...MAIN_CONFIG }
}

export function writeConnectionConfig(file: string, cfg: ConnectionConfig): void {
  writeFileAtomic(file, new Uint8Array(Buffer.from(JSON.stringify(cfg, null, 2), 'utf8')))
}

/**
 * Ilova ochilganda: o'qish + migratsiya. Terminal rejimida identifikator bo'lmasa (eski 'viewer' fayli) —
 * yaratiladi va fayl yangi ko'rinishda ('terminal') atomik qayta yoziladi.
 */
export function loadConnectionConfig(file: string): ConnectionConfig {
  const cfg = readConnectionConfig(file)
  if (cfg.mode !== 'terminal') return cfg
  let rewrite = false
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    rewrite = raw.mode !== 'terminal'
  } catch {
    rewrite = true
  }
  if (!cfg.terminalId) {
    cfg.terminalId = newTerminalId()
    rewrite = true
  }
  if (rewrite) writeConnectionConfig(file, cfg)
  return cfg
}

function mainOnly(): never {
  throw new PosError(MAIN_ONLY_MESSAGE)
}

/** Terminalning lokal printer tanlovi (connection.json da) */
export interface LocalPrinterStore {
  get(): string
  set(name: string): void
}

export function filePrinterStore(file: string): LocalPrinterStore {
  return {
    get: () => readConnectionConfig(file).printerName,
    set: (name) => {
      const cfg = readConnectionConfig(file)
      writeConnectionConfig(file, { ...cfg, printerName: cleanPrinter(name) })
    }
  }
}

export interface TerminalApi {
  api: PosApi
  /** null — hali so'rov bo'lmagan */
  lastOk(): boolean | null
}

export interface TerminalApiOptions {
  timeoutMs?: number
  /** Lokal chop etish / printerlar (Electron: print.ts; dev-server: bo'sh) */
  host?: Pick<PosHost, 'printReceipt' | 'listPrinters'>
  printer?: LocalPrinterStore
}

type Fn = (...a: unknown[]) => Promise<unknown>

/**
 * Terminal PosApi: hamma narsa HTTP orqali asosiyga (terminal tokeni bilan), lokal istisnolar fayl boshida.
 */
export function createTerminalApi(target: RemoteTarget, connection: PosApi['connection'], opts: TerminalApiOptions = {}): TerminalApi {
  let ok: boolean | null = null
  const host = opts.host ?? {}
  let memPrinter = ''
  const printer: LocalPrinterStore = opts.printer ?? { get: () => memPrinter, set: (n) => void (memPrinter = cleanPrinter(n)) }

  const call = async (name: string, args: unknown[]): Promise<unknown> => {
    try {
      const r = await rpc(target, name, args, opts.timeoutMs)
      ok = true
      return r
    } catch (e) {
      // Server javob bergan (masalan 400 amal xatosi, 403) — aloqa bor; 401/429/aloqa yo'q — uzilgan
      const st = (e as { status?: number }).status
      ok = st !== undefined && st !== 0 && st !== 401 && st !== 429
      throw e
    }
  }

  const api: Record<string, Record<string, Fn>> = {}
  for (const { group, method } of API_METHODS) {
    const name = `${group}.${method}`
    if (!api[group]) api[group] = {}
    api[group][method] = isTerminalDenied(name) ? async () => mainOnly() : async (...args: unknown[]) => call(name, args)
  }

  const withLocalPrinter = (s: AppSettings): AppSettings =>
    s && s.receipt ? { ...s, receipt: { ...s.receipt, printerName: printer.get() } } : s

  api.settings.get = async () => withLocalPrinter((await call('settings.get', [])) as AppSettings)
  api.settings.save = async (...args: unknown[]) => {
    const s = args[0] as AppSettings
    const want = s && s.receipt && typeof s.receipt.printerName === 'string' ? s.receipt.printerName : null
    let toSend: unknown = s
    if (s && typeof s === 'object' && s.receipt && typeof s.receipt === 'object') {
      // Asosiy kompyuterning printeri o'zgarmaydi — terminal tanlovi lokal saqlanadi
      const cur = (await call('settings.get', [])) as AppSettings
      toSend = { ...s, receipt: { ...s.receipt, printerName: cur.receipt.printerName } }
    }
    const saved = (await call('settings.save', [toSend])) as AppSettings
    if (want !== null) printer.set(want)
    return withLocalPrinter(saved)
  }
  api.system.printReceipt = async (...args: unknown[]) => {
    const data = args[0] as ReceiptData
    if (!data || typeof data !== 'object' || !data.settings) throw new PosError("Chek ma'lumotlari noto'g'ri")
    if (!host.printReceipt) return
    await host.printReceipt(renderReceiptHtml(data), { ...data.settings, printerName: printer.get() })
  }
  api.system.listPrinters = async () => (host.listPrinters ? host.listPrinters() : [])
  api.connection = connection as unknown as Record<string, Fn>
  return { api: api as unknown as PosApi, lastOk: () => ok }
}

/** connectTerminal uchun: /hello + kod bilan bitta yengil so'rov (login talab qilmaydi) */
export async function verifyServer(host: string, port: number, code: string, terminalId: string, timeoutMs?: number): Promise<{ name: string }> {
  const h = await hello(host, port, timeoutMs)
  try {
    await rpc({ host, port, code, terminalId }, 'system.now', [], timeoutMs)
  } catch (e) {
    const st = (e as { status?: number }).status
    if (st === 0) throw new PosError(MSG_NOT_FOUND)
    throw e
  }
  return { name: h.name }
}

export interface ConnectionControllerOptions {
  file: string
  /** Rejim o'zgarganda (fayl yozilgandan keyin): main jarayon qayta ishga tushiradi va oynani qayta yuklaydi */
  onChange: (cfg: ConnectionConfig) => void | Promise<void>
  /** terminal rejimida: aloqa holati (oxirgi so'rov) */
  probe?: () => Promise<boolean>
  discoverOpts?: { port?: number; timeoutMs?: number; targets?: string[] }
  timeoutMs?: number
}

export function createConnectionController(opts: ConnectionControllerOptions): PosApi['connection'] {
  return {
    info: async (): Promise<ConnectionInfo> => {
      const cfg = readConnectionConfig(opts.file)
      if (cfg.mode === 'main') return { mode: 'main', host: null, port: null, connected: true }
      const connected = opts.probe ? await opts.probe() : false
      return { mode: 'terminal', host: cfg.host, port: cfg.port, connected }
    },
    discover: async (): Promise<DiscoveredServer[]> => udpDiscover(opts.discoverOpts),
    connectTerminal: async (host, port, code) => {
      const h = typeof host === 'string' ? host.trim() : ''
      if (!validHost(h)) throw new PosError("Manzil noto'g'ri (masalan 192.168.1.10)")
      if (!validPort(port)) throw new PosError("Port noto'g'ri")
      const c = typeof code === 'string' ? code.trim() : ''
      if (!isValidCode(c)) throw new PosError("Kod 6 ta raqamdan iborat bo'lishi kerak")
      const prev = readConnectionConfig(opts.file)
      const terminalId = prev.terminalId ?? newTerminalId()
      await verifyServer(h, port, c, terminalId, opts.timeoutMs)
      const cfg: ConnectionConfig = { mode: 'terminal', host: h, port, code: c, terminalId, printerName: prev.printerName }
      writeConnectionConfig(opts.file, cfg)
      await opts.onChange(cfg)
    },
    disconnect: async () => {
      const prev = readConnectionConfig(opts.file)
      const cfg: ConnectionConfig = { ...MAIN_CONFIG, terminalId: prev.terminalId, printerName: prev.printerName }
      writeConnectionConfig(opts.file, cfg)
      await opts.onChange(cfg)
    }
  }
}

/**
 * Terminal rejimini to'liq yig'ish: controller + proksi API. info() → oxirgi so'rov holati
 * (hali so'rov bo'lmagan yoki aloqa uzilgan bo'lsa — bitta yengil so'rov bilan qayta tekshiriladi).
 * cfg — loadConnectionConfig natijasi (terminalId bor).
 */
export function createTerminalMode(
  cfg: ConnectionConfig,
  opts: Omit<ConnectionControllerOptions, 'probe'> & { host?: TerminalApiOptions['host'] }
): TerminalApi {
  if (cfg.mode !== 'terminal' || !cfg.host || !cfg.port || !cfg.code || !cfg.terminalId) throw new Error('Terminal konfiguratsiyasi to‘liq emas')
  const target: RemoteTarget = { host: cfg.host, port: cfg.port, code: cfg.code, terminalId: cfg.terminalId }
  let term: TerminalApi | null = null
  const controller = createConnectionController({
    ...opts,
    probe: async () => {
      if (!term) return false
      // Hali so'rov bo'lmagan yoki oxirgisi muvaffaqiyatsiz — yengil so'rov bilan qayta tekshirish (qayta ulanish)
      if (term.lastOk() !== true) {
        try {
          await term.api.system.now()
        } catch {
          /* lastOk yangilandi */
        }
      }
      return term.lastOk() === true
    }
  })
  term = createTerminalApi(target, controller, { timeoutMs: opts.timeoutMs, host: opts.host, printer: filePrinterStore(opts.file) })
  return term
}
