/**
 * Telegram bot (serverdagi oddiy PHP, cron bilan) uchun sinxronizatsiya — asosiy kompyuterda.
 *
 * Dastur offline POS; bot esa internetdagi serverda ishlaydi. Shuning uchun dastur o'zi serverga (receive.php) HTTPS POST yuboradi:
 *   - har daqiqada holat nusxasi (smena, xonalar, bar qoldig'i, bugungi tushum, oxirgi smenalar) — bot buyruqlariga javob beradi;
 *   - smena ochilganda/yopilganda voqea (bot Telegramga xabar yuboradi). Aloqa bo'lmasa voqealar navbatda turadi va keyin yuboriladi.
 * Maxfiy kalit (`X-Bot-Secret`) va manzil faqat shu kompyuterning bazasida (kv 'botSync') saqlanadi; UI ga qiymati qaytarilmaydi.
 * Node 16: global fetch yo'q — http/https moduli.
 */
import http from 'http'
import https from 'https'
import type { PosApi } from '../../../src/shared/api'
import type { BotSnapshot, BotStatus, ShiftRow } from '../../../src/shared/types'
import type { PosService } from '../PosService'

export interface BotEvent {
  type: 'shift_opened' | 'shift_closed'
  at: number
  row: ShiftRow
}

export interface BotPayload {
  v: 1
  sentAt: number
  snapshot: BotSnapshot
  events: BotEvent[]
}

/** Serverga POST: muvaffaqiyatli bo'lsa resolve, aks holda tushunarli Error */
export type Transport = (url: string, secret: string, body: string) => Promise<void>

export function httpPost(url: string, secret: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      reject(new Error("Manzil noto'g'ri"))
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      u,
      { method: 'POST', timeout: 15_000, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'X-Bot-Secret': secret } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 300)
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve()
          else if (res.statusCode === 403) reject(new Error('Server maxfiy kalitni qabul qilmadi (403)'))
          else reject(new Error('Server javobi: ' + res.statusCode + (text ? ' ' + text : '')))
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('Server javob bermadi (vaqt tugadi)')))
    req.on('error', (e) => reject(new Error('Aloqa xatosi: ' + e.message)))
    req.write(body)
    req.end()
  })
}

interface Stored {
  enabled: boolean
  url: string
  secret: string
  queue: BotEvent[]
  lastOkAt: number | null
  lastError: string | null
}

const EMPTY: Stored = { enabled: false, url: '', secret: '', queue: [], lastOkAt: null, lastError: null }
const MAX_QUEUE = 30
const INTERVAL_MS = 60_000

export interface BotSyncOptions {
  svc: PosService
  store: { load(): string | null; save(json: string): void }
  transport?: Transport
  clock?: () => number
  /** Davriy yuborish (ms). 0 = o'chiq (testlar) */
  intervalMs?: number
}

type BotApi = PosApi['bot']

export class BotSync implements BotApi {
  private st: Stored
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private again = false
  private readonly transport: Transport
  private readonly clock: () => number
  private readonly interval: number

  constructor(private readonly o: BotSyncOptions) {
    this.transport = o.transport ?? httpPost
    this.clock = o.clock ?? (() => Date.now())
    this.interval = o.intervalMs ?? INTERVAL_MS
    this.st = this.load()
  }

  private load(): Stored {
    try {
      const j = this.o.store.load()
      if (j) return { ...EMPTY, ...(JSON.parse(j) as Partial<Stored>) }
    } catch {
      /* buzilgan yozuv — bo'sh holat */
    }
    return { ...EMPTY }
  }

  private persist(): void {
    this.o.store.save(JSON.stringify(this.st))
  }

  start(): void {
    this.o.svc.events.on('shiftOpened', (row: ShiftRow) => this.enqueue({ type: 'shift_opened', at: this.clock(), row }))
    this.o.svc.events.on('shiftClosed', (row: ShiftRow) => this.enqueue({ type: 'shift_closed', at: this.clock(), row }))
    if (this.interval > 0) this.timer = setInterval(() => void this.tick(), this.interval)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private enqueue(ev: BotEvent): void {
    if (!this.st.enabled) return
    this.st.queue.push(ev)
    if (this.st.queue.length > MAX_QUEUE) this.st.queue.splice(0, this.st.queue.length - MAX_QUEUE)
    this.persist()
    void this.tick()
  }

  /** Bir marta yuborish (navbatdagi voqealar + holat nusxasi). Bir vaqtda bitta. */
  async tick(): Promise<boolean> {
    if (!this.st.enabled || !this.st.url || !this.st.secret) return false
    if (this.busy) {
      this.again = true
      return false
    }
    this.busy = true
    try {
      const sending = this.st.queue.slice()
      const payload: BotPayload = { v: 1, sentAt: this.clock(), snapshot: this.o.svc.botSnapshot(), events: sending }
      await this.transport(this.st.url, this.st.secret, JSON.stringify(payload))
      this.st.queue.splice(0, sending.length)
      this.st.lastOkAt = this.clock()
      this.st.lastError = null
      this.persist()
      return true
    } catch (e) {
      this.st.lastError = e instanceof Error ? e.message : String(e)
      this.persist()
      return false
    } finally {
      this.busy = false
      if (this.again) {
        this.again = false
        void this.tick()
      }
    }
  }

  private status_(): BotStatus {
    return {
      enabled: this.st.enabled, url: this.st.url, secretSet: this.st.secret.length > 0,
      lastOkAt: this.st.lastOkAt, lastError: this.st.lastError, pending: this.st.queue.length
    }
  }

  status = async (): Promise<BotStatus> => this.status_()

  save = async (input: { enabled: boolean; url: string; secret?: string }): Promise<BotStatus> => {
    const url = typeof input.url === 'string' ? input.url.trim() : ''
    if (input.enabled && !/^https?:\/\/\S+$/i.test(url)) throw new Error("Server manzili http:// yoki https:// bilan boshlanishi kerak")
    if (typeof input.enabled !== 'boolean') throw new Error("Qiymat noto'g'ri")
    if (input.secret !== undefined) {
      if (typeof input.secret !== 'string' || input.secret.length > 200) throw new Error("Maxfiy kalit noto'g'ri")
      if (input.secret.trim() !== '') this.st.secret = input.secret.trim()
    }
    if (input.enabled && !this.st.secret) throw new Error('Maxfiy kalitni kiriting')
    this.st.enabled = input.enabled
    this.st.url = url
    if (!input.enabled) this.st.queue = []
    this.persist()
    if (input.enabled) void this.tick()
    return this.status_()
  }

  test = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!this.st.url || !this.st.secret) return { ok: false, error: 'Manzil va maxfiy kalitni kiriting' }
    try {
      const payload: BotPayload = { v: 1, sentAt: this.clock(), snapshot: this.o.svc.botSnapshot(), events: [] }
      await this.transport(this.st.url, this.st.secret, JSON.stringify(payload))
      this.st.lastOkAt = this.clock()
      this.st.lastError = null
      this.persist()
      return { ok: true }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.st.lastError = error
      this.persist()
      return { ok: false, error }
    }
  }
}
