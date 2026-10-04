/**
 * LicenseManager — oflayn litsenziya holati (sinov, kalit, soat orqaga surilishi).
 *
 *  - Sinov boshlanishi va `lastSeen` UCH joyda: DB (kv), `userData/.dlic` fayl, Windows HKCU registry.
 *    O'qishda sinov uchun ENG ERTA, lastSeen uchun ENG KECH qiymat olinadi — ilovani qayta o'rnatish
 *    (yangi DB) yoki bitta joyni o'chirish sinovni qayta boshlamaydi.
 *  - Soat: now < lastSeen − 2 soat → 'tampered' (doimiy kalit bo'lsa e'tiborsiz — muddat soatga bog'liq emas).
 *  - Kalit: DB + fayl zaxirasi; oxirgi kiritilgan (`at` eng katta) amal qiladi. Muddati o'tgan kalit qabul qilinmaydi.
 *  - Ma'lumotlar HECH QACHON o'chirilmaydi/shifrlanmaydi — faqat yozish amallari bloklanadi (guard.ts).
 * Electron'ga bog'liq emas: Electron main, dev-server va testlar ishlatadi.
 */
import fs from 'fs'
import type { KeyObject } from 'crypto'
import type { PosApi } from '../../../src/shared/api'
import type { LicenseState, LicenseStatus } from '../../../src/shared/types'
import { writeFileAtomic } from '../db'
import { PosError } from '../PosService'
import type { RegistryStore } from './machine'
import {
  MSG_KEY_EXPIRED, MSG_KEY_INVALID, MSG_KEY_OTHER_MACHINE, isKeyExpired, toPublicKey, verifyLicenseKey
} from './verify'
import type { PublicKeyInput, VerifiedKey } from './verify'

export const TRIAL_MS = 24 * 3_600_000
/** Soat shunchadan ko'proq orqaga ketsa — buzilgan */
export const TAMPER_TOLERANCE_MS = 2 * 3_600_000
/** lastSeen ni saqlash oralig'i (har daqiqada; mutatsiyalar orasida tez-tez yozmaslik uchun) */
export const SEEN_PERSIST_MS = 60_000

export const KV_TRIAL = 'license.trial'
export const KV_SEEN = 'license.seen'
export const KV_KEY = 'license.key'
export const REG_TRIAL = 't'
export const REG_SEEN = 's'

export function blockedMessage(state: LicenseState, contact: string): string {
  if (state === 'tampered') {
    return `Kompyuter soati orqaga surilgan. Soat va sanani to'g'rilang yoki ishlab chiquvchiga murojaat qiling: ${contact}`
  }
  return `Litsenziya muddati tugagan. Ishlab chiquvchiga murojaat qiling: ${contact}`
}

export interface KvStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

interface KeyRecord {
  key: string
  at: number
}

interface FileData {
  t: number | null
  s: number | null
  k: KeyRecord | null
}

export interface LicenseManagerOptions {
  clock: () => number
  machine: { hash: Uint8Array; code: string }
  /** Ed25519 ochiq kalit (SPKI DER base64 yoki KeyObject) */
  publicKey: PublicKeyInput
  /** DB kalit-qiymat (har chaqiruvda joriy baza — tiklashdan keyin ham to'g'ri) */
  kv: KvStore
  /** `.dlic` fayl yo'li; null → ishlatilmaydi */
  file: string | null
  registry: RegistryStore | null
  contact: string
  trialMs?: number
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

function minOf(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null)
  return xs.length ? Math.min(...xs) : null
}

function maxOf(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null)
  return xs.length ? Math.max(...xs) : null
}

function parseKeyRecord(v: unknown): KeyRecord | null {
  if (!v || typeof v !== 'object') return null
  const r = v as { key?: unknown; at?: unknown }
  if (typeof r.key !== 'string' || r.key.length > 1000) return null
  return { key: r.key, at: num(r.at) ?? 0 }
}

export class LicenseManager {
  private readonly clock: () => number
  private readonly pub: KeyObject
  private readonly trialMs: number
  private trialStart = 0
  private lastSeen = 0
  private persistedSeen = 0
  private keyRec: KeyRecord | null = null
  private verified: VerifiedKey | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly opts: LicenseManagerOptions) {
    this.clock = opts.clock
    this.pub = toPublicKey(opts.publicKey)
    this.trialMs = opts.trialMs ?? TRIAL_MS
    this.init()
  }

  get contact(): string {
    return this.opts.contact
  }

  get machineCode(): string {
    return this.opts.machine.code
  }

  // ───── Saqlash joylari ─────
  private readFile(): FileData {
    const empty: FileData = { t: null, s: null, k: null }
    if (!this.opts.file) return empty
    try {
      const raw = fs.readFileSync(this.opts.file, 'utf8').trim()
      const j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<string, unknown>
      return { t: num(j.t), s: num(j.s), k: parseKeyRecord(j.k) }
    } catch {
      return empty
    }
  }

  private writeFile(d: FileData): void {
    if (!this.opts.file) return
    const raw = Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
    try {
      writeFileAtomic(this.opts.file, new Uint8Array(Buffer.from(raw, 'utf8')))
    } catch (e) {
      console.error('[license] fayl yozilmadi:', e)
    }
  }

  private kvGet(key: string): string | null {
    try {
      return this.opts.kv.get(key)
    } catch {
      return null
    }
  }

  private kvSet(key: string, value: string): void {
    try {
      if (this.opts.kv.get(key) !== value) this.opts.kv.set(key, value)
    } catch (e) {
      console.error('[license] DB yozilmadi:', e)
    }
  }

  private kvKey(): KeyRecord | null {
    const raw = this.kvGet(KV_KEY)
    if (!raw) return null
    try {
      return parseKeyRecord(JSON.parse(raw))
    } catch {
      return null
    }
  }

  private regGet(name: string): number | null {
    try {
      return this.opts.registry ? num(this.opts.registry.get(name)) : null
    } catch {
      return null
    }
  }

  private regSet(name: string, value: number): void {
    try {
      this.opts.registry?.set(name, String(value))
    } catch {
      /* boshqa joylarda saqlangan */
    }
  }

  /** Kalit yozuvi: imzo + kompyuter mos bo'lsagina */
  private verifyRecord(r: KeyRecord | null): VerifiedKey | null {
    if (!r) return null
    const v = verifyLicenseKey(r.key, this.pub, this.opts.machine.hash)
    return v.ok ? v.value : null
  }

  /** Birinchi ishga tushish: barcha joylardan o'qish (registry ham), birlashtirish va qayta yozish */
  private init(): void {
    const now = this.clock()
    const f = this.readFile()
    const trial = minOf([num(this.kvGet(KV_TRIAL)), f.t, this.regGet(REG_TRIAL)])
    const seen = maxOf([num(this.kvGet(KV_SEEN)), f.s, this.regGet(REG_SEEN)])
    this.trialStart = trial ?? now
    this.lastSeen = seen ?? 0
    this.pickKey([this.kvKey(), f.k])
    if (now > this.lastSeen && !this.isTampered(now)) this.lastSeen = now
    this.persist(true)
  }

  /** Yaroqli yozuvlardan eng oxirgi kiritilganini tanlash */
  private pickKey(records: (KeyRecord | null)[]): void {
    let best: { rec: KeyRecord; v: VerifiedKey } | null = this.keyRec && this.verified ? { rec: this.keyRec, v: this.verified } : null
    for (const r of records) {
      const v = this.verifyRecord(r)
      if (r && v && (!best || r.at > best.rec.at)) best = { rec: r, v }
    }
    this.keyRec = best ? best.rec : null
    this.verified = best ? best.v : null
  }

  /** Xotiradagi holatni DB + fayl (+ registry) ga yozish (faqat farq bo'lsa) */
  private persist(withRegistry: boolean): void {
    this.kvSet(KV_TRIAL, String(this.trialStart))
    if (this.lastSeen > 0) this.kvSet(KV_SEEN, String(this.lastSeen))
    if (this.keyRec) this.kvSet(KV_KEY, JSON.stringify(this.keyRec))
    const f = this.readFile()
    const next: FileData = { t: this.trialStart, s: this.lastSeen || null, k: this.keyRec }
    if (f.t !== next.t || f.s !== next.s || JSON.stringify(f.k) !== JSON.stringify(next.k)) this.writeFile(next)
    if (withRegistry && this.opts.registry) {
      this.regSet(REG_TRIAL, this.trialStart)
      if (this.lastSeen > 0) this.regSet(REG_SEEN, this.lastSeen)
    }
    this.persistedSeen = this.lastSeen
  }

  /**
   * DB va fayldan qayta o'qish va birlashtirish (masalan zaxiradan tiklangandan keyin: yangi DB'da
   * yozuvlar yo'q yoki eski bo'lishi mumkin — xotiradagi eng erta/eng kech qiymatlar saqlanadi).
   */
  sync(): void {
    const f = this.readFile()
    this.trialStart = minOf([this.trialStart, num(this.kvGet(KV_TRIAL)), f.t]) ?? this.trialStart
    this.lastSeen = maxOf([this.lastSeen, num(this.kvGet(KV_SEEN)), f.s]) ?? this.lastSeen
    this.pickKey([this.kvKey(), f.k])
    this.persist(true)
  }

  /** Faollik: lastSeen ni oldinga surish (har mutatsiyada va har daqiqada). Soat orqaga ketgan bo'lsa — o'zgarmaydi. */
  touch(): void {
    const now = this.clock()
    if (now <= this.lastSeen) return
    this.lastSeen = now
    if (now - this.persistedSeen >= SEEN_PERSIST_MS) this.persist(true)
  }

  /** Har daqiqada touch + sync (Electron main / dev-server) */
  start(intervalMs = 60_000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      try {
        this.touch()
        this.sync()
      } catch (e) {
        console.error('[license]', e)
      }
    }, intervalMs)
    const t = this.timer as unknown as { unref?: () => void }
    if (t.unref) t.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private isTampered(now: number): boolean {
    return this.lastSeen > 0 && now < this.lastSeen - TAMPER_TOLERANCE_MS
  }

  /** Joriy holat */
  status(): LicenseStatus {
    const now = this.clock()
    const k = this.verified
    const trialEndsAt = this.trialStart + this.trialMs
    const base = { machineCode: this.opts.machine.code, contact: this.opts.contact }
    if (k && k.permanent) return { ...base, state: 'active', trialEndsAt: null, expiresAt: null, permanent: true }
    if (this.isTampered(now)) {
      return { ...base, state: 'tampered', trialEndsAt: k ? null : trialEndsAt, expiresAt: k ? k.expiresAt : null, permanent: false }
    }
    // Kichik orqaga surishlar (≤2 soat) muddatni uzaytirmasin: hisobda max(now, lastSeen)
    const eff = Math.max(now, this.lastSeen)
    if (k) {
      return { ...base, state: isKeyExpired(k, eff) ? 'expired' : 'active', trialEndsAt: null, expiresAt: k.expiresAt, permanent: false }
    }
    return { ...base, state: eff < trialEndsAt ? 'trial' : 'expired', trialEndsAt, expiresAt: null, permanent: false }
  }

  isBlocked(): boolean {
    const s = this.status().state
    return s === 'expired' || s === 'tampered'
  }

  blockedMessage(): string {
    return blockedMessage(this.status().state, this.opts.contact)
  }

  /** Kalitni kiritish. Xato bo'lsa PosError (o'zbekcha). Oxirgi kiritilgan kalit amal qiladi. */
  activate(text: unknown): LicenseStatus {
    const v = verifyLicenseKey(text, this.pub, this.opts.machine.hash)
    if (!v.ok) throw new PosError(v.error === 'machine' ? MSG_KEY_OTHER_MACHINE : MSG_KEY_INVALID)
    const now = this.clock()
    if (isKeyExpired(v.value, Math.max(now, this.lastSeen))) throw new PosError(MSG_KEY_EXPIRED)
    this.keyRec = { key: v.value.key, at: Math.max(now, this.lastSeen, (this.keyRec?.at ?? 0) + 1) }
    this.verified = v.value
    if (now > this.lastSeen && !this.isTampered(now)) this.lastSeen = now
    this.persist(true)
    return this.status()
  }

  /** PosApi['license'] ko'rinishi (login talab qilinmaydi) */
  api(): PosApi['license'] {
    return {
      status: async () => this.status(),
      activate: async (key) => this.activate(key)
    }
  }
}
