/**
 * Terminal tomoni: asosiy kompyuterga HTTP so'rovlar (Node 16 `http`; fetch yo'q) va UDP qidiruv.
 */
import http from 'http'
import dgram from 'dgram'
import os from 'os'
import type { DiscoveredServer } from '../../../src/shared/types'
import {
  CODE_HEADER, DISCOVERY_PORT, DISCOVERY_QUERY, DISCOVER_MS, MSG_BAD_CODE, MSG_NO_LINK, MSG_NOT_FOUND, RPC_TIMEOUT_MS,
  TERMINAL_HEADER, userAgent
} from './protocol'

export interface RemoteTarget {
  host: string
  port: number
  code: string
  /** Terminal identifikatori (UUID) — serverdagi alohida login konteksti */
  terminalId: string
}

/** Tarmoq xatosi (aloqa yo'q) va server javobidagi xato farqlanadi */
export class RemoteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    // ipc.ts PosError'ni log qilmaydi — foydalanuvchi xatosi
    this.name = 'PosError'
  }
}

let clientVersion = '0.0.0'
export function setClientVersion(v: string): void {
  clientVersion = v
}

function request(
  host: string, port: number, method: 'GET' | 'POST', path: string, body: unknown, code: string | null, timeoutMs: number,
  terminalId: string | null = null
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
    const headers: Record<string, string | number> = { 'User-Agent': userAgent(clientVersion, os.hostname()), Accept: 'application/json' }
    if (payload) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = payload.length
    }
    if (code !== null) headers[CODE_HEADER] = code
    if (terminalId !== null) headers[TERMINAL_HEADER] = terminalId
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      fn()
    }
    const req = http.request({ host, port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () =>
        finish(() => {
          let parsed: Record<string, unknown> = {}
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
          } catch {
            return reject(new RemoteError(MSG_NOT_FOUND, 0))
          }
          resolve({ status: res.statusCode || 0, body: parsed })
        })
      )
      res.on('error', (e) => finish(() => reject(e)))
    })
    const timer = setTimeout(() => {
      finish(() => reject(new RemoteError(MSG_NO_LINK, 0)))
      req.destroy()
    }, timeoutMs)
    req.on('error', () => finish(() => reject(new RemoteError(MSG_NO_LINK, 0))))
    if (payload) req.write(payload)
    req.end()
  })
}

/** GET /hello — bu haqiqatan Delfin Sauna serverimi */
export async function hello(host: string, port: number, timeoutMs = RPC_TIMEOUT_MS): Promise<{ name: string; version: string }> {
  try {
    const r = await request(host, port, 'GET', '/hello', undefined, null, timeoutMs)
    if (r.status !== 200 || r.body.app !== 'delfin' || typeof r.body.name !== 'string') throw new Error('bad')
    return { name: r.body.name, version: String(r.body.version ?? '') }
  } catch {
    throw new RemoteError(MSG_NOT_FOUND, 0)
  }
}

/** POST /rpc. Xatolar o'zbekcha: aloqa yo'q / kod noto'g'ri / serverning o'z xabari. */
export async function rpc(target: RemoteTarget, method: string, args: unknown[], timeoutMs = RPC_TIMEOUT_MS): Promise<unknown> {
  const r = await request(target.host, target.port, 'POST', '/rpc', { method, args }, target.code, timeoutMs, target.terminalId)
  if (r.status === 200) return r.body.result
  if (r.status === 401) throw new RemoteError(MSG_BAD_CODE, 401)
  const msg = typeof r.body.error === 'string' && r.body.error ? r.body.error : MSG_NOT_FOUND
  throw new RemoteError(msg, r.status)
}

/** Barcha IPv4 (ichki emas) interfeyslarning broadcast manzillari */
export function broadcastAddresses(): string[] {
  const out = new Set<string>(['255.255.255.255'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      // Node 16: family 'IPv4' (18.0–18.3 da raqam 4 bo'lgan)
      if ((a.family as unknown) !== 'IPv4' && (a.family as unknown) !== 4) continue
      if (a.internal) continue
      const ip = a.address.split('.').map(Number)
      const mask = a.netmask.split('.').map(Number)
      if (ip.length !== 4 || mask.length !== 4) continue
      out.add(ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join('.'))
    }
  }
  return [...out]
}

/** UDP broadcast bilan asosiy kompyuterlarni qidirish (~2 s yig'ish) */
export function discover(opts: { port?: number; timeoutMs?: number; targets?: string[] } = {}): Promise<DiscoveredServer[]> {
  const port = opts.port ?? DISCOVERY_PORT
  const targets = opts.targets ?? broadcastAddresses()
  const timeoutMs = opts.timeoutMs ?? DISCOVER_MS
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredServer>()
    const sock = dgram.createSocket('udp4')
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      try {
        sock.close()
      } catch {
        /* yopilgan */
      }
      resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.host.localeCompare(b.host)))
    }
    sock.on('error', () => close())
    sock.on('message', (msg, rinfo) => {
      try {
        const j = JSON.parse(msg.toString('utf8')) as { app?: unknown; name?: unknown; port?: unknown }
        if (j.app !== 'delfin' || typeof j.port !== 'number' || !Number.isInteger(j.port)) return
        const name = typeof j.name === 'string' ? j.name.slice(0, 100) : 'Delfin Sauna'
        found.set(`${rinfo.address}:${j.port}`, { host: rinfo.address, port: j.port, name })
      } catch {
        /* begona paket */
      }
    })
    sock.bind(0, () => {
      try {
        sock.setBroadcast(true)
      } catch {
        /* ba'zi interfeyslarda */
      }
      const q = Buffer.from(DISCOVERY_QUERY, 'utf8')
      for (const t of targets) sock.send(q, port, t, () => undefined)
    })
    setTimeout(close, timeoutMs)
  })
}
