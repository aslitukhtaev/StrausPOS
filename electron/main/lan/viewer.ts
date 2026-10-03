/**
 * Ko'ruvchi rejimi: lokal konfiguratsiya (userData/connection.json), PosApi proksi va connection.* boshqaruvi.
 * Electron'ga bog'liq emas — index.ts (Electron) va dev-server ishlatadi.
 */
import fs from 'fs'
import type { PosApi } from '../../../src/shared/api'
import type { AppMode, ConnectionInfo, DiscoveredServer } from '../../../src/shared/types'
import { API_METHODS } from '../apiMethods'
import { PosError, VIEWER_PERMISSIONS, VIEWER_STAFF } from '../PosService'
import { writeFileAtomic } from '../db'
import { discover as udpDiscover, hello, rpc } from './client'
import type { RemoteTarget } from './client'
import { MSG_NOT_FOUND, VIEW_ONLY_MESSAGE, isValidCode, isViewerAllowed } from './protocol'

export interface ConnectionConfig {
  mode: AppMode
  host: string | null
  port: number | null
  code: string | null
}

export const MAIN_CONFIG: ConnectionConfig = { mode: 'main', host: null, port: null, code: null }

function validHost(h: unknown): h is string {
  return typeof h === 'string' && /^[A-Za-z0-9.\-:[\]]{1,253}$/.test(h)
}

function validPort(p: unknown): p is number {
  return typeof p === 'number' && Number.isInteger(p) && p >= 1 && p <= 65535
}

/** Fayl yo'q / buzilgan / to'liq emas → asosiy rejim */
export function readConnectionConfig(file: string): ConnectionConfig {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ConnectionConfig>
    if (j.mode === 'viewer' && validHost(j.host) && validPort(j.port) && isValidCode(j.code)) {
      return { mode: 'viewer', host: j.host, port: j.port, code: j.code }
    }
  } catch {
    /* yo'q yoki buzilgan */
  }
  return { ...MAIN_CONFIG }
}

export function writeConnectionConfig(file: string, cfg: ConnectionConfig): void {
  writeFileAtomic(file, new Uint8Array(Buffer.from(JSON.stringify(cfg, null, 2), 'utf8')))
}

function viewOnly(): never {
  throw new PosError(VIEW_ONLY_MESSAGE)
}

export interface ViewerApi {
  api: PosApi
  /** null — hali so'rov bo'lmagan */
  lastOk(): boolean | null
}

/**
 * Ko'ruvchi PosApi: allowlist'dagi o'qish metodlari HTTP orqali asosiyga; auth.* lokal sintetik;
 * connection.* — berilgan controller; qolgan hammasi lokal rad etiladi.
 */
export function createViewerApi(target: RemoteTarget, connection: PosApi['connection'], timeoutMs?: number): ViewerApi {
  let ok: boolean | null = null
  const api: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> = {}
  for (const { group, method } of API_METHODS) {
    const name = `${group}.${method}`
    if (!api[group]) api[group] = {}
    if (isViewerAllowed(name)) {
      api[group][method] = async (...args: unknown[]) => {
        try {
          const r = await rpc(target, name, args, timeoutMs)
          ok = true
          return r
        } catch (e) {
          // Server javob bergan (masalan 400 amal xatosi) — aloqa bor; 401/aloqa yo'q — uzilgan
          const st = (e as { status?: number }).status
          ok = st !== undefined && st !== 0 && st !== 401 && st !== 429
          throw e
        }
      }
    } else {
      api[group][method] = async () => viewOnly()
    }
  }
  api.auth.current = async () => ({ staff: { ...VIEWER_STAFF }, permissions: [...VIEWER_PERMISSIONS] })
  api.auth.listLoginStaff = async () => []
  api.auth.needsSetup = async () => false
  api.connection = connection as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  return { api: api as unknown as PosApi, lastOk: () => ok }
}

/** connectViewer uchun: /hello + kod bilan bitta o'qish so'rovi */
export async function verifyServer(host: string, port: number, code: string, timeoutMs?: number): Promise<{ name: string }> {
  const h = await hello(host, port, timeoutMs)
  try {
    await rpc({ host, port, code }, 'system.now', [], timeoutMs)
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
  /** viewer rejimida: aloqa holati (oxirgi so'rov) */
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
      return { mode: 'viewer', host: cfg.host, port: cfg.port, connected }
    },
    discover: async (): Promise<DiscoveredServer[]> => udpDiscover(opts.discoverOpts),
    connectViewer: async (host, port, code) => {
      const h = typeof host === 'string' ? host.trim() : ''
      if (!validHost(h)) throw new PosError("Manzil noto'g'ri (masalan 192.168.1.10)")
      if (!validPort(port)) throw new PosError("Port noto'g'ri")
      const c = typeof code === 'string' ? code.trim() : ''
      if (!isValidCode(c)) throw new PosError("Kod 6 ta raqamdan iborat bo'lishi kerak")
      await verifyServer(h, port, c, opts.timeoutMs)
      const cfg: ConnectionConfig = { mode: 'viewer', host: h, port, code: c }
      writeConnectionConfig(opts.file, cfg)
      await opts.onChange(cfg)
    },
    disconnect: async () => {
      writeConnectionConfig(opts.file, { ...MAIN_CONFIG })
      await opts.onChange({ ...MAIN_CONFIG })
    }
  }
}

/**
 * Ko'ruvchi rejimini to'liq yig'ish: controller + proksi API. info() → oxirgi so'rov holati
 * (hali so'rov bo'lmagan bo'lsa — bitta yengil so'rov bilan tekshiriladi).
 */
export function createViewerMode(cfg: ConnectionConfig, opts: Omit<ConnectionControllerOptions, 'probe'>): ViewerApi {
  const target: RemoteTarget = { host: cfg.host as string, port: cfg.port as number, code: cfg.code as string }
  let viewer: ViewerApi | null = null
  const controller = createConnectionController({
    ...opts,
    probe: async () => {
      if (!viewer) return false
      if (viewer.lastOk() === null) {
        try {
          await viewer.api.system.now()
        } catch {
          /* lastOk yangilandi */
        }
      }
      return viewer.lastOk() === true
    }
  })
  viewer = createViewerApi(target, controller, opts.timeoutMs)
  return viewer
}
