/**
 * Asosiy kompyuterning LAN serveri (Node 16 `http` + `dgram`) — TERMINALLAR uchun.
 *   GET  /hello            → {name, version}            (kodsiz)
 *   POST /rpc {method,args} → {result} | {error}        (X-Delfin-Code + X-Delfin-Terminal)
 *   UDP  DISCOVERY_PORT: "DELFIN?" → {"app":"delfin","name","port"}
 * Har bir terminal (X-Delfin-Terminal UUID) uchun ALOHIDA PosService login konteksti saqlanadi:
 * terminaldagi kirish/chiqish asosiy kompyuterdagi login'ga ta'sir qilmaydi (va aksincha).
 * Barcha PosApi metodlari ruxsat etiladi (ruxsat — kontekstdagi xodim roliga qarab, PosService ichida),
 * faqat TERMINAL_DENYLIST (network.*, connection.*, system.backup/restore, license.activate, auth.setupOwner) → 403.
 * Statuslar: 401 kod noto'g'ri, 403 faqat asosiy kompyuterda, 429 brute-force bloki, 400 amal xatosi.
 */
import http from 'http'
import dgram from 'dgram'
import crypto from 'crypto'
import type { AddressInfo } from 'net'
import type { PosApi } from '../../../src/shared/api'
import { invokeApi, parseMethod } from '../apiMethods'
import {
  CODE_FAIL_WINDOW_MS, CODE_HEADER, DISCOVERY_QUERY, MAIN_ONLY_MESSAGE, MAX_CODE_FAILS, MAX_TERMINALS, MSG_BAD_CODE,
  MSG_NO_TERMINAL, MSG_TOO_MANY, MSG_UNKNOWN, TERMINAL_HEADER, TERMINAL_SESSION_TTL_MS, TERMINAL_TTL_MS,
  isTerminalDenied, isValidTerminalId, nameFromUserAgent
} from './protocol'

export interface LanServerOptions {
  /**
   * Yangi terminal uchun alohida login konteksti (masalan litsenziya o'ramidagi PosService.forTerminal()).
   * Terminal birinchi so'rov yuborganda bir marta chaqiriladi.
   */
  createTerminal: () => PosApi
  /** So'rovlarni ketma-ket bajarish (dev-server: umumiy sql.js navbati). Standart — to'g'ridan-to'g'ri. */
  run?: <T>(fn: () => Promise<T>) => Promise<T>
  name: () => string
  version: string
  /** Joriy ulanish kodi */
  code: () => string
  clock?: () => number
  /** UDP discovery porti; null → o'chirilgan */
  discoveryPort?: number | null
}

export interface TerminalSeen {
  ip: string
  name: string
  staffName: string | null
  lastSeen: number
}

interface TerminalEntry {
  id: string
  ip: string
  name: string
  lastSeen: number
  api: PosApi
}

const MAX_BODY = 256 * 1024

function cleanIp(ip: string | undefined): string {
  const s = ip || '?'
  return s.startsWith('::ffff:') ? s.slice(7) : s
}

function sameCode(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export class LanServer {
  private http: http.Server | null = null
  private udp: dgram.Socket | null = null
  private fails = new Map<string, number[]>()
  private terms = new Map<string, TerminalEntry>()
  private boundPort = 0
  private readonly clock: () => number

  constructor(private readonly opts: LanServerOptions) {
    this.clock = opts.clock ?? (() => Date.now())
  }

  get port(): number {
    return this.boundPort
  }

  get running(): boolean {
    return this.http !== null
  }

  /** Server ko'tarish. port=0 → tasodifiy (testlar). Natija: haqiqiy port. */
  async start(port: number, hostname = '0.0.0.0'): Promise<number> {
    if (this.http) return this.boundPort
    const srv = http.createServer((req, res) => {
      this.handle(req, res).catch((e: unknown) => {
        console.error('[lan]', e)
        if (!res.headersSent) this.send(res, 500, { error: 'Ichki xato' })
      })
    })
    srv.headersTimeout = 10_000
    srv.requestTimeout = 15_000
    await new Promise<void>((resolve, reject) => {
      const onErr = (e: NodeJS.ErrnoException): void => {
        srv.removeListener('listening', onOk)
        reject(new Error(e.code === 'EADDRINUSE' ? `Port ${port} band — boshqa dastur ishlatmoqda` : `Serverni ochib bo'lmadi: ${e.message}`))
      }
      const onOk = (): void => {
        srv.removeListener('error', onErr)
        resolve()
      }
      srv.once('error', onErr)
      srv.once('listening', onOk)
      srv.listen(port, hostname)
    })
    srv.on('error', (e) => console.error('[lan] http:', e))
    this.http = srv
    this.boundPort = (srv.address() as AddressInfo).port
    const dp = this.opts.discoveryPort === undefined ? null : this.opts.discoveryPort
    if (dp !== null) await this.startDiscovery(dp)
    return this.boundPort
  }

  private startDiscovery(port: number): Promise<void> {
    return new Promise((resolve) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sock.on('message', (msg, rinfo) => {
        if (msg.toString('utf8').trim() !== DISCOVERY_QUERY || !this.http) return
        const reply = Buffer.from(JSON.stringify({ app: 'delfin', name: this.safeName(), port: this.boundPort }), 'utf8')
        sock.send(reply, rinfo.port, rinfo.address, () => undefined)
      })
      sock.once('error', (e) => {
        // Discovery ishlamasa ham server ishlayveradi (manzilni qo'lda kiritish mumkin)
        console.error('[lan] udp:', e.message)
        try {
          sock.close()
        } catch {
          /* yopilgan */
        }
        if (this.udp === sock) this.udp = null
        resolve()
      })
      sock.bind(port, () => {
        this.udp = sock
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const srv = this.http
    this.http = null
    this.boundPort = 0
    if (this.udp) {
      try {
        this.udp.close()
      } catch {
        /* yopilgan */
      }
      this.udp = null
    }
    if (srv) {
      await new Promise<void>((resolve) => {
        srv.close(() => resolve())
        // Node 16: ochiq keep-alive ulanishlarni yopish (closeAllConnections Node 18.2+)
        for (const s of this.sockets) s.destroy()
      })
    }
    this.sockets.clear()
  }

  private sockets = new Set<import('net').Socket>()

  /** Oxirgi 2 daqiqada so'rov yuborgan terminallar (kirgan xodim ismi bilan) */
  async terminals(): Promise<TerminalSeen[]> {
    const now = this.clock()
    const list = [...this.terms.values()].filter((t) => now - t.lastSeen <= TERMINAL_TTL_MS).sort((a, b) => b.lastSeen - a.lastSeen)
    const out: TerminalSeen[] = []
    for (const t of list) {
      let staffName: string | null = null
      try {
        const cur = await t.api.auth.current()
        staffName = cur ? cur.staff.name : null
      } catch {
        staffName = null
      }
      out.push({ ip: t.ip, name: t.name, staffName, lastSeen: t.lastSeen })
    }
    return out
  }

  /** Terminal kontekstlari soni (testlar/diagnostika) */
  get terminalCount(): number {
    return this.terms.size
  }

  /**
   * Barcha terminal kontekstlarini o'chirish (kod almashdi / server o'chirildi / baza almashdi):
   * terminallardagi login'lar bekor bo'ladi — qayta kirish kerak.
   */
  clearTerminals(): void {
    this.terms.clear()
  }

  /** Terminal konteksti (yo'q bo'lsa yaratiladi); uzoq ishlatilmaganlar va ortiqchalari o'chiriladi */
  private terminal(id: string, ip: string, name: string): TerminalEntry {
    const now = this.clock()
    for (const [k, t] of this.terms) if (now - t.lastSeen > TERMINAL_SESSION_TTL_MS) this.terms.delete(k)
    let t = this.terms.get(id)
    if (!t) {
      while (this.terms.size >= MAX_TERMINALS) {
        let oldest: TerminalEntry | null = null
        for (const x of this.terms.values()) if (!oldest || x.lastSeen < oldest.lastSeen) oldest = x
        if (!oldest) break
        this.terms.delete(oldest.id)
      }
      t = { id, ip, name, lastSeen: now, api: this.opts.createTerminal() }
      this.terms.set(id, t)
    }
    t.ip = ip
    t.name = name
    t.lastSeen = now
    return t
  }

  private safeName(): string {
    try {
      return this.opts.name()
    } catch {
      return 'Delfin Sauna'
    }
  }

  private send(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  private blocked(ip: string): boolean {
    const now = this.clock()
    const list = (this.fails.get(ip) ?? []).filter((t) => now - t < CODE_FAIL_WINDOW_MS)
    if (list.length) this.fails.set(ip, list)
    else this.fails.delete(ip)
    return list.length >= MAX_CODE_FAILS
  }

  private addFail(ip: string): void {
    const list = this.fails.get(ip) ?? []
    list.push(this.clock())
    this.fails.set(ip, list)
    if (this.fails.size > 1000) this.fails.delete(this.fails.keys().next().value as string)
  }

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new Error("So'rov juda katta"))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new Error("JSON noto'g'ri"))
        }
      })
      req.on('error', reject)
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.sockets.add(req.socket)
    req.socket.once('close', () => this.sockets.delete(req.socket))
    const ip = cleanIp(req.socket.remoteAddress)
    const url = (req.url || '/').split('?')[0]

    if (req.method === 'GET' && url === '/hello') {
      return this.send(res, 200, { app: 'delfin', name: this.safeName(), version: this.opts.version })
    }
    if (req.method !== 'POST' || url !== '/rpc') return this.send(res, 404, { error: 'Topilmadi' })

    // 1) Brute-force bloki (to'g'ri kod bilan ham — oyna tugaguncha)
    if (this.blocked(ip)) return this.send(res, 429, { error: MSG_TOO_MANY })
    // 2) Kod
    const hdr = req.headers[CODE_HEADER]
    const given = Array.isArray(hdr) ? hdr[0] : hdr
    const code = this.opts.code()
    if (typeof given !== 'string' || !code || !sameCode(given, code)) {
      this.addFail(ip)
      return this.send(res, 401, { error: MSG_BAD_CODE })
    }
    // 3) Terminal identifikatori
    const th = req.headers[TERMINAL_HEADER]
    const tid = Array.isArray(th) ? th[0] : th
    if (!isValidTerminalId(tid)) return this.send(res, 400, { error: MSG_NO_TERMINAL })
    let body: Record<string, unknown>
    try {
      body = (await this.readBody(req)) as Record<string, unknown>
    } catch (e) {
      return this.send(res, 400, { error: e instanceof Error ? e.message : "So'rov noto'g'ri" })
    }
    if (!body || typeof body !== 'object') return this.send(res, 400, { error: "So'rov noto'g'ri" })
    const term = this.terminal(tid.toLowerCase(), ip, nameFromUserAgent(req.headers['user-agent']))
    // 4) Metod: noma'lum → 400; faqat asosiy kompyuterga tegishli → 403
    const m = parseMethod(body.method)
    if (!m) return this.send(res, 400, { error: MSG_UNKNOWN })
    if (isTerminalDenied(`${m.group}.${m.method}`)) return this.send(res, 403, { error: MAIN_ONLY_MESSAGE })

    const args = Array.isArray(body.args) ? body.args : []
    const run = this.opts.run ?? (<T>(fn: () => Promise<T>) => fn())
    try {
      const result = await run(() => invokeApi(term.api, m.group, m.method, args))
      return this.send(res, 200, { result: result === undefined ? null : result })
    } catch (e) {
      const isPos = e instanceof Error && e.name === 'PosError'
      if (!isPos) console.error(`[lan] ${String(body.method)}:`, e)
      return this.send(res, 400, { error: isPos ? (e as Error).message : 'Ichki xato' })
    }
  }
}
