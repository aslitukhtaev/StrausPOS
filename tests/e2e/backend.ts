/**
 * e2e backend boshqaruvi: `scripts/dev-server.ts` jarayonini ishga tushirish / to'xtatish / qayta ishga tushirish
 * va test endpointlari (`/__test/reset`, `/__test/clock`, `/rpc`).
 */
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/** Playwright repo ildizidan ishga tushiriladi */
export const ROOT = process.cwd()
export const E2E_TZ = 'Asia/Tashkent'
export const DATA_ROOT = path.join(os.tmpdir(), 'straus-e2e')

export type Who = 'owner' | 'admin' | 'cashier' | 'provider'

export const PINS: Record<Who, string> = { owner: '1234', admin: '2222', cashier: '3333', provider: '4444' }
export const NAMES: Record<Who, string> = { owner: 'Ega', admin: 'Administrator', cashier: 'Kassir', provider: 'Massajchi' }

export class Backend {
  proc: ChildProcess | null = null
  log = ''
  readonly url: string
  readonly dataDir: string

  constructor(readonly port: number, name: string) {
    this.url = 'http://127.0.0.1:' + port
    this.dataDir = path.join(DATA_ROOT, name)
  }

  /** reset=true → `--reset` (toza baza). reset=false → mavjud faylni ochadi (saqlanish testi). */
  async start(reset = true): Promise<void> {
    if (this.proc) return
    fs.mkdirSync(this.dataDir, { recursive: true })
    const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx')
    const args = [path.join(ROOT, 'scripts', 'dev-server.ts')]
    if (reset) args.push('--reset')
    const p = spawn(tsx, args, {
      cwd: ROOT,
      env: { ...process.env, PORT: String(this.port), STRAUS_DATA_DIR: this.dataDir, TZ: E2E_TZ, RESET: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc = p
    const onData = (b: Buffer) => {
      this.log += b.toString()
    }
    p.stdout?.on('data', onData)
    p.stderr?.on('data', onData)
    p.on('exit', () => {
      if (this.proc === p) this.proc = null
    })
    const until = Date.now() + 30_000
    for (;;) {
      try {
        const r = await fetch(this.url + '/__test/state')
        if (r.ok) return
      } catch {
        /* hali ko'tarilmadi */
      }
      if (!this.proc) throw new Error('dev-server ishga tushmadi:\n' + this.log)
      if (Date.now() > until) throw new Error('dev-server kutish vaqti tugadi:\n' + this.log)
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  async stop(): Promise<void> {
    const p = this.proc
    if (!p) return
    this.proc = null
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        p.kill('SIGKILL')
      }, 3000)
      p.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      p.kill('SIGTERM')
    })
  }

  /** Jarayonni o'ldirib, xuddi shu bazani qayta ochish (ma'lumot saqlanishi testi). */
  async restart(): Promise<void> {
    await this.stop()
    await this.start(false)
  }

  async post<T = unknown>(p: string, body: unknown): Promise<T> {
    const r = await fetch(this.url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json()) as T & { error?: string }
    if (!r.ok) throw new Error(`${p} → ${r.status}: ${j.error}`)
    return j
  }

  /** Toza baza. setup=true → Ega/Admin/Kassir/Massajchi + standart xonalar/katalog. Server sessiyasi chiqarilgan holda qoladi. */
  async reset(setup = true): Promise<Record<Who, number> | null> {
    const r = await this.post<{ ids: Record<Who, number> | null }>('/__test/reset', { setup, login: null })
    return r.ids
  }

  async setClock(now: number | null): Promise<number> {
    return (await this.post<{ now: number }>('/__test/clock', { now })).now
  }

  async advance(ms: number): Promise<number> {
    return (await this.post<{ now: number }>('/__test/clock', { advanceMs: ms })).now
  }

  /** To'g'ridan-to'g'ri RPC (UI ni chetlab — faqat tayyorlash/tekshirish uchun). Xato bo'lsa Error. */
  async rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const r = await fetch(this.url + '/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, args }) })
    const j = (await r.json()) as { result?: T; error?: string }
    if (!r.ok || j.error) throw new Error(j.error || 'rpc ' + r.status)
    return j.result as T
  }

  /** RPC xatosini kutish: xato matnini qaytaradi (xato bo'lmasa — test yiqiladi). */
  async rpcError(method: string, ...args: unknown[]): Promise<string> {
    try {
      await this.rpc(method, ...args)
    } catch (e) {
      return (e as Error).message
    }
    throw new Error(`${method} xato berishi kerak edi, lekin muvaffaqiyatli bajarildi`)
  }

  async loginAs(who: Who, ids: Record<Who, number>): Promise<void> {
    await this.rpc('auth.login', ids[who], PINS[who])
  }
}
