/**
 * Oflayn litsenziya: 24 soatlik sinov, Ed25519 kalit, soat orqaga surilishi, qayta o'rnatish, IPC-darajasidagi majburlash.
 * Testlar O'Z vaqtinchalik kalit juftligini yaratadi (prod maxfiy kaliti kerak emas) va ochiq kalitni parametr qilib beradi.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PosService } from '../../electron/main/PosService'
import type { PosApi } from '../../src/shared/api'
import {
  DAY_MS, LICENSE_VERSION, base32Decode, base32Encode, dayOf, encodePayload, formatMachineCode, joinKey, parseMachineCode
} from '../../src/shared/license'
import { LicenseManager, KV_KEY, KV_SEEN, KV_TRIAL, TRIAL_MS } from '../../electron/main/license/manager'
import type { KvStore } from '../../electron/main/license/manager'
import { allowedWhenBlocked, createLicensedApi } from '../../electron/main/license/guard'
import { machineHash, parseRegValue, fallbackGuid } from '../../electron/main/license/machine'
import type { RegistryStore } from '../../electron/main/license/machine'
import { createTerminalApi } from '../../electron/main/lan/terminal'
import { MSG_KEY_EXPIRED, MSG_KEY_INVALID, MSG_KEY_OTHER_MACHINE } from '../../electron/main/license/verify'
import { HOUR, MIN, setup } from './helpers'
import type { Ctx } from './helpers'

const CONTACT = '+998 90 000 00 00'
const MACHINE = machineHash('11111111-2222-3333-4444-555555555555')
const OTHER = machineHash('99999999-8888-7777-6666-555555555555')
const BLOCKED = /^Litsenziya muddati tugagan\. Ishlab chiquvchiga murojaat qiling: \+998 90 000 00 00$/
const TAMPERED = /soati orqaga surilgan/

// ───── Test kalit juftligi (faqat shu test uchun) ─────
const pair = crypto.generateKeyPairSync('ed25519')
const PUB_B64 = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const stranger = crypto.generateKeyPairSync('ed25519')

function makeKey(opts: { machine?: Uint8Array; expiresDay?: number; issuedDay?: number; priv?: crypto.KeyObject; version?: number }): string {
  const payload = encodePayload({
    version: opts.version ?? LICENSE_VERSION,
    machine: opts.machine ?? MACHINE,
    expiresDay: opts.expiresDay ?? 0,
    issuedDay: opts.issuedDay ?? 20000
  })
  const sig = crypto.sign(null, Buffer.from(payload), opts.priv ?? pair.privateKey)
  return joinKey(payload, new Uint8Array(sig))
}

class FakeRegistry implements RegistryStore {
  m = new Map<string, string>()
  get = (n: string) => this.m.get(n) ?? null
  set = (n: string, v: string) => {
    this.m.set(n, v)
  }
}

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delfin-lic-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

interface Env {
  ctx: Ctx
  lic: LicenseManager
  api: PosApi
  reg: FakeRegistry
  file: string
}

function kvOf(svc: PosService): KvStore {
  return { get: (k) => svc.readKv(k), set: (k, v) => svc.writeKv(k, v) }
}

function manager(svc: PosService, clock: () => number, file: string | null, reg: RegistryStore | null, machine = MACHINE): LicenseManager {
  return new LicenseManager({
    clock,
    machine: { hash: machine, code: formatMachineCode(machine) },
    publicKey: PUB_B64,
    kv: kvOf(svc),
    file,
    registry: reg,
    contact: CONTACT
  })
}

async function env(opts: { reg?: FakeRegistry; file?: string } = {}): Promise<Env> {
  const ctx = await setup()
  const reg = opts.reg ?? new FakeRegistry()
  const file = opts.file ?? path.join(dir, '.dlic')
  const lic = manager(ctx.svc, ctx.clock.now, file, reg)
  ctx.svc.host.license = lic.api()
  return { ctx, lic, api: createLicensedApi(ctx.svc, lic), reg, file }
}

/** Litsenziya tugaganda ham ishlashi kerak bo'lgan o'qishlar */
async function readsWork(e: Env): Promise<void> {
  const { api, ctx } = e
  expect((await api.rooms.board()).length).toBeGreaterThan(0)
  expect(await api.rooms.list()).toHaveLength(3)
  await api.reports.sales({ from: 0, to: ctx.clock.t + DAY_MS })
  await api.debts.list(true)
  await api.catalog.products(true)
  await api.settings.get()
  expect(await api.system.now()).toBe(ctx.clock.t)
  await api.staff.list()
  await api.auth.logout()
  await api.auth.login(ctx.staff.cashier.id, ctx.pins.cashier)
  expect((await api.auth.current())!.staff.id).toBe(ctx.staff.cashier.id)
  await api.auth.logout()
  await api.auth.login(ctx.staff.owner.id, ctx.pins.owner)
  await api.connection.info()
  expect((await api.license.status()).machineCode).toBe(formatMachineCode(MACHINE))
}

async function writesBlocked(e: Env, msg: RegExp = BLOCKED): Promise<void> {
  const { api, ctx } = e
  await expect(api.sessions.open(ctx.rooms.s1, 2, 60)).rejects.toThrow(msg)
  await expect(api.rooms.save({ name: 'Yangi', pricePerHour: 10000, capacity: 2 })).rejects.toThrow(msg)
  await expect(api.settings.save(await api.settings.get())).rejects.toThrow(msg)
  await expect(api.barSales.open()).rejects.toThrow(msg)
  await expect(api.system.restore()).rejects.toThrow(msg)
  await expect(api.staff.save({ name: 'X', role: 'cashier', pin: '9999', isProvider: false, isWaiter: false, commissionPct: 0, active: true })).rejects.toThrow(msg)
}

describe('shartnoma formati', () => {
  it('base32 va kompyuter kodi ikki tomonlama', () => {
    const b = crypto.randomBytes(81)
    expect(Array.from(base32Decode(base32Encode(b))!)).toEqual(Array.from(b))
    const code = formatMachineCode(MACHINE)
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{3}$/)
    expect(Array.from(parseMachineCode(code)!)).toEqual(Array.from(MACHINE))
    // hash = sha256("delfin|"+guid)[0..8]
    const h = crypto.createHash('sha256').update('delfin|abc').digest().subarray(0, 8)
    expect(Array.from(machineHash('abc'))).toEqual(Array.from(h))
  })

  it('reg query chiqishi va fallback barqaror', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    abcd-ef01\r\n\r\n'
    expect(parseRegValue(out, 'MachineGuid')).toBe('abcd-ef01')
    expect(parseRegValue(out, 'Other')).toBeNull()
    expect(fallbackGuid()).toBe(fallbackGuid())
  })
})

describe('sinov (24 soat)', () => {
  it('birinchi ishga tushish — sinov, 24 soat davomida hamma narsa ishlaydi', async () => {
    const e = await env()
    const t0 = e.ctx.clock.t
    const st = await e.api.license.status()
    expect(st).toMatchObject({ state: 'trial', trialEndsAt: t0 + TRIAL_MS, expiresAt: null, permanent: false, contact: CONTACT })
    // 3 joyda saqlangan
    expect(e.ctx.svc.readKv(KV_TRIAL)).toBe(String(t0))
    expect(e.reg.m.get('t')).toBe(String(t0))
    expect(fs.existsSync(e.file)).toBe(true)
    e.ctx.clock.advance(TRIAL_MS - MIN)
    expect((await e.api.license.status()).state).toBe('trial')
    const v = await e.api.sessions.open(e.ctx.rooms.s1, 2, 60)
    expect(v.guests).toHaveLength(2)
  })

  it('sinov tugashi → yozish rad etiladi, o\'qish ishlaydi, ma\'lumot o\'chmaydi', async () => {
    const e = await env()
    const v = await e.api.sessions.open(e.ctx.rooms.s1, 2, 60)
    e.ctx.clock.advance(TRIAL_MS)
    const st = await e.api.license.status()
    expect(st.state).toBe('expired')
    expect(st.trialEndsAt).toBe(e.ctx.clock.t)
    await writesBlocked(e)
    await expect(e.api.checkout.pay(v.session.id, [{ method: 'cash', amount: 100000 }], null)).rejects.toThrow(BLOCKED)
    await expect(e.api.lines.returnLine(1, 1, 'x')).rejects.toThrow(BLOCKED)
    await readsWork(e)
    // Ochiq sessiya joyida (o'chirilmagan, o'zgarmagan)
    const again = await e.api.sessions.get(v.session.id)
    expect(again.session.status).toBe('open')
    expect(again.guests).toHaveLength(2)
  })

  it('zaxira nusxa olish muddat tugaganda ham ishlaydi', async () => {
    const e = await env()
    let saved: Uint8Array | null = null
    e.ctx.svc.host.saveBackup = async (b) => {
      saved = b
      return '/tmp/x.db'
    }
    e.ctx.clock.advance(TRIAL_MS + HOUR)
    expect(await e.api.system.backup()).toEqual({ path: '/tmp/x.db' })
    expect(saved).not.toBeNull()
  })

  it('allowlist: faqat o\'qish / auth / license / connection / backup', () => {
    for (const m of ['rooms.board', 'reports.sales', 'auth.login', 'auth.setupOwner', 'license.activate', 'connection.connectTerminal', 'system.backup', 'system.now', 'settings.get', 'sessions.get'])
      expect(allowedWhenBlocked(m)).toBe(true)
    for (const m of ['rooms.save', 'sessions.open', 'checkout.pay', 'checkout.receipt', 'settings.save', 'system.restore', 'system.printReceipt', 'network.setEnabled', 'debts.pay', 'waiters.payout', 'barSales.open'])
      expect(allowedWhenBlocked(m)).toBe(false)
  })
})

describe('aktivatsiya kaliti', () => {
  it("to'g'ri 30 kunlik kalit → active, muddat tugashi → expired", async () => {
    const e = await env()
    const today = dayOf(e.ctx.clock.t)
    const st = await e.api.license.activate(makeKey({ expiresDay: today + 30, issuedDay: today }))
    expect(st).toMatchObject({ state: 'active', permanent: false, expiresAt: (today + 31) * DAY_MS, trialEndsAt: null })
    // sinov muddati o'tgan bo'lsa ham kalit ishlaydi
    e.ctx.clock.advance(5 * DAY_MS)
    expect((await e.api.license.status()).state).toBe('active')
    await e.api.sessions.open(e.ctx.rooms.s1, 1, 60)
    // tugash kuni oxirigacha amal qiladi
    e.ctx.clock.t = (today + 31) * DAY_MS - 1
    expect((await e.api.license.status()).state).toBe('active')
    e.ctx.clock.t = (today + 31) * DAY_MS
    expect((await e.api.license.status()).state).toBe('expired')
    await writesBlocked(e)
    await readsWork(e)
    // yangi doimiy kalit → yana ishlaydi
    const p = await e.api.license.activate(makeKey({ expiresDay: 0 }))
    expect(p).toMatchObject({ state: 'active', permanent: true, expiresAt: null })
    await e.api.sessions.open(e.ctx.rooms.s2, 1, 60)
  })

  it('doimiy kalit → active, sinov tugagandan keyin ham', async () => {
    const e = await env()
    e.ctx.clock.advance(TRIAL_MS * 3)
    expect((await e.api.license.status()).state).toBe('expired')
    const st = await e.api.license.activate('  ' + makeKey({}).toLowerCase() + '\n')
    expect(st).toMatchObject({ state: 'active', permanent: true, expiresAt: null })
    e.ctx.clock.advance(3650 * DAY_MS)
    expect((await e.api.license.status()).state).toBe('active')
    await e.api.rooms.save({ name: 'Yangi', pricePerHour: 10000, capacity: 2 })
  })

  it('boshqa kompyuter kaliti rad etiladi', async () => {
    const e = await env()
    await expect(e.api.license.activate(makeKey({ machine: OTHER }))).rejects.toThrow(MSG_KEY_OTHER_MACHINE)
    expect((await e.api.license.status()).state).toBe('trial')
  })

  it("buzilgan imzo / begona kalit / noto'g'ri format → \"Kalit noto'g'ri\"", async () => {
    const e = await env()
    const good = makeKey({})
    // imzo qismidagi bitta belgini almashtirish
    const i = good.length - 3
    const bad = good.slice(0, i) + (good[i] === 'A' ? 'B' : 'A') + good.slice(i + 1)
    await expect(e.api.license.activate(bad)).rejects.toThrow(MSG_KEY_INVALID)
    // payload buzilgan (tugash kuni o'zgartirilgan) — imzo mos kelmaydi
    const pl = good.replace(/-/g, '')
    const bytes = base32Decode(pl)!
    bytes[12] ^= 1
    await expect(e.api.license.activate(base32Encode(bytes))).rejects.toThrow(MSG_KEY_INVALID)
    await expect(e.api.license.activate(makeKey({ priv: stranger.privateKey }))).rejects.toThrow(MSG_KEY_INVALID)
    await expect(e.api.license.activate(makeKey({ version: 2 }))).rejects.toThrow(MSG_KEY_INVALID)
    await expect(e.api.license.activate('salom')).rejects.toThrow(MSG_KEY_INVALID)
    await expect(e.api.license.activate('')).rejects.toThrow(MSG_KEY_INVALID)
    await expect(e.api.license.activate(123 as unknown as string)).rejects.toThrow(MSG_KEY_INVALID)
    expect((await e.api.license.status()).state).toBe('trial')
    expect(e.ctx.svc.readKv(KV_KEY)).toBeNull()
  })

  it("muddati o'tgan kalit qabul qilinmaydi", async () => {
    const e = await env()
    const today = dayOf(e.ctx.clock.t)
    await expect(e.api.license.activate(makeKey({ expiresDay: today - 1 }))).rejects.toThrow(MSG_KEY_EXPIRED)
    expect((await e.api.license.status()).state).toBe('trial')
    // bugun tugaydigan kalit — hali amal qiladi
    expect((await e.api.license.activate(makeKey({ expiresDay: today }))).state).toBe('active')
  })

  it('oxirgi kiritilgan kalit amal qiladi (qisqaroq bo\'lsa ham)', async () => {
    const e = await env()
    const today = dayOf(e.ctx.clock.t)
    await e.api.license.activate(makeKey({ expiresDay: 0 }))
    const st = await e.api.license.activate(makeKey({ expiresDay: today + 3 }))
    expect(st).toMatchObject({ state: 'active', permanent: false, expiresAt: (today + 4) * DAY_MS })
    // qayta ishga tushirishda ham o'sha kalit
    const lic2 = manager(e.ctx.svc, e.ctx.clock.now, e.file, e.reg)
    expect(lic2.status()).toMatchObject({ permanent: false, expiresAt: (today + 4) * DAY_MS })
  })

  it('kalit DB va faylda saqlanadi: yangi DB + eski fayl → active', async () => {
    const e = await env()
    await e.api.license.activate(makeKey({}))
    expect(e.ctx.svc.readKv(KV_KEY)).toContain('"key"')
    // "Qayta o'rnatish": yangi baza, lekin .dlic qolgan
    const fresh = await PosService.create({ clock: e.ctx.clock.now })
    e.ctx.clock.advance(10 * DAY_MS)
    const lic2 = manager(fresh, e.ctx.clock.now, e.file, null)
    expect(lic2.status()).toMatchObject({ state: 'active', permanent: true })
    expect(fresh.readKv(KV_KEY)).toContain('"key"')
  })

  it('aktivatsiya login talab qilmaydi', async () => {
    const e = await env()
    await e.api.auth.logout()
    expect((await e.api.license.activate(makeKey({}))).state).toBe('active')
  })
})

describe('soat orqaga surilishi', () => {
  it('2 soatdan ko\'p orqaga → tampered: yozish rad, o\'qish ishlaydi; soat to\'g\'rilansa — tiklanadi', async () => {
    const e = await env()
    e.ctx.clock.advance(5 * HOUR)
    await e.api.sessions.open(e.ctx.rooms.s1, 1, 60) // mutatsiya → lastSeen
    const seen = e.ctx.clock.t
    expect(e.ctx.svc.readKv(KV_SEEN)).toBe(String(seen))
    expect(e.reg.m.get('s')).toBe(String(seen))
    // 1 soat orqaga — ruxsat (vaqt zonasi/sinxronlash)
    e.ctx.clock.t = seen - HOUR
    expect((await e.api.license.status()).state).toBe('trial')
    // 3 soat orqaga — buzilgan
    e.ctx.clock.t = seen - 3 * HOUR
    expect((await e.api.license.status()).state).toBe('tampered')
    await writesBlocked(e, TAMPERED)
    await readsWork(e)
    // lastSeen orqaga ketmaydi
    expect(e.ctx.svc.readKv(KV_SEEN)).toBe(String(seen))
    // soat to'g'rilandi
    e.ctx.clock.t = seen + MIN
    expect((await e.api.license.status()).state).toBe('trial')
  })

  it('orqaga surib sinovni uzaytirib bo\'lmaydi', async () => {
    const e = await env()
    e.ctx.clock.advance(TRIAL_MS + 30 * MIN)
    e.lic.touch()
    expect((await e.api.license.status()).state).toBe('expired')
    // 1 soat orqaga (tolerantlik ichida) — baribir expired (max(now, lastSeen) bo'yicha)
    e.ctx.clock.advance(-HOUR)
    expect((await e.api.license.status()).state).toBe('expired')
    e.ctx.clock.advance(-5 * HOUR)
    expect((await e.api.license.status()).state).toBe('tampered')
  })

  it('muddatli kalitda soat orqaga → tampered; doimiy kalitda soatga bog\'liq emas', async () => {
    const e = await env()
    const today = dayOf(e.ctx.clock.t)
    await e.api.license.activate(makeKey({ expiresDay: today + 2 }))
    e.ctx.clock.advance(3 * DAY_MS)
    e.lic.touch()
    expect((await e.api.license.status()).state).toBe('expired')
    e.ctx.clock.advance(-2 * DAY_MS)
    expect((await e.api.license.status()).state).toBe('tampered')
    await expect(e.api.license.activate(makeKey({ expiresDay: today - 1 }))).rejects.toThrow(MSG_KEY_EXPIRED)
    await e.api.license.activate(makeKey({ expiresDay: 0 }))
    expect((await e.api.license.status()).state).toBe('active')
  })

  it("qayta ishga tushganda ham lastSeen eslab qolinadi (fayl/registry/DB'ning eng kechi)", async () => {
    const e = await env()
    e.ctx.clock.advance(10 * HOUR)
    e.lic.touch()
    e.ctx.clock.t -= 4 * HOUR
    const lic2 = manager(e.ctx.svc, e.ctx.clock.now, e.file, e.reg)
    expect(lic2.status().state).toBe('tampered')
  })

  it('lastSeen har mutatsiyada (daqiqa aniqligida) yangilanadi, o\'qishda emas', async () => {
    const e = await env()
    const t0 = e.ctx.clock.t
    e.ctx.clock.advance(10 * MIN)
    await e.api.rooms.board()
    expect(e.ctx.svc.readKv(KV_SEEN)).toBe(String(t0))
    await e.api.rooms.save({ name: 'Yangi', pricePerHour: 10000, capacity: 2 })
    expect(e.ctx.svc.readKv(KV_SEEN)).toBe(String(t0 + 10 * MIN))
  })
})

describe("qayta o'rnatish sinovni qayta boshlamaydi", () => {
  it('yangi DB, lekin fayl va registry\'da eski sana → expired', async () => {
    const e = await env()
    const t0 = e.ctx.clock.t
    e.ctx.clock.advance(TRIAL_MS + HOUR)
    const fresh = await PosService.create({ clock: e.ctx.clock.now })
    const lic2 = manager(fresh, e.ctx.clock.now, e.file, e.reg)
    expect(lic2.status()).toMatchObject({ state: 'expired', trialEndsAt: t0 + TRIAL_MS })
    // eski sana yangi bazaga ham yozildi
    expect(fresh.readKv(KV_TRIAL)).toBe(String(t0))
  })

  it("faqat registry qolgan (DB va fayl o'chirilgan) → expired", async () => {
    const e = await env()
    e.ctx.clock.advance(TRIAL_MS + HOUR)
    fs.rmSync(e.file)
    const fresh = await PosService.create({ clock: e.ctx.clock.now })
    const lic2 = manager(fresh, e.ctx.clock.now, path.join(dir, 'boshqa', '.dlic'), e.reg)
    expect(lic2.status().state).toBe('expired')
  })

  it("faqat fayl qolgan (registry yo'q — Windows emas) → expired", async () => {
    const e = await env()
    e.ctx.clock.advance(TRIAL_MS + HOUR)
    const fresh = await PosService.create({ clock: e.ctx.clock.now })
    const lic2 = manager(fresh, e.ctx.clock.now, e.file, null)
    expect(lic2.status().state).toBe('expired')
  })

  it("eng erta sana olinadi (bir joyda keyinroq sana bo'lsa ham)", async () => {
    const e = await env()
    const t0 = e.ctx.clock.t
    e.ctx.svc.writeKv(KV_TRIAL, String(t0 + 20 * HOUR)) // DB'da keyingi sana (masalan qo'lda o'zgartirilgan)
    const lic2 = manager(e.ctx.svc, e.ctx.clock.now, e.file, e.reg)
    expect(lic2.status().trialEndsAt).toBe(t0 + TRIAL_MS)
    expect(e.ctx.svc.readKv(KV_TRIAL)).toBe(String(t0))
  })

  it('zaxiradan tiklash (eski/bo\'sh litsenziya yozuvlari) sinovni uzaytirmaydi', async () => {
    const e = await env()
    const t0 = e.ctx.clock.t
    const other = await setup()
    const bytes = other.svc.exportBytes() // litsenziya yozuvlarisiz baza
    e.ctx.svc.host.openBackup = async () => bytes
    e.ctx.clock.advance(2 * HOUR)
    expect(await e.api.system.restore()).toBe(true)
    expect(e.ctx.svc.readKv(KV_TRIAL)).toBe(String(t0))
    e.ctx.clock.advance(TRIAL_MS)
    expect((await e.api.license.status()).state).toBe('expired')
  })
})

describe('terminal rejimi', () => {
  it("license.activate terminalda lokal rad etiladi; status asosiydan (aloqa yo'q → xato)", async () => {
    const conn = { info: async () => ({ mode: 'terminal' as const, host: '127.0.0.1', port: 1, connected: false }), discover: async () => [], connectTerminal: async () => undefined, disconnect: async () => undefined }
    const v = createTerminalApi({ host: '127.0.0.1', port: 1, code: '123456', terminalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }, conn, { timeoutMs: 200 })
    await expect(v.api.license.activate(makeKey({}))).rejects.toThrow(/faqat asosiy kompyuterda/)
    await expect(v.api.license.status()).rejects.toThrow("Asosiy kompyuter bilan aloqa yo'q")
  })

  it("host.license yo'q (dev-server standarti) → active", async () => {
    const ctx = await setup()
    expect((await ctx.svc.license.status()).state).toBe('active')
  })
})
