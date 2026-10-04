/**
 * LAN TERMINAL rejimi: server (kod, terminal tokeni, alohida login kontekstlari, denylist, brute-force, litsenziya),
 * terminal proksisi (lokal chek/printer, denylist), connection.json (eski 'viewer' migratsiyasi), discovery.
 * Vaqt — soxta soat (FakeClock).
 */
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { productByName, setup } from '../service/helpers'
import type { Ctx } from '../service/helpers'
import { API_METHODS } from '../../electron/main/apiMethods'
import { NetworkManager } from '../../electron/main/lan/network'
import { discover, hello, rpc } from '../../electron/main/lan/client'
import type { RemoteTarget } from '../../electron/main/lan/client'
import { MAX_CODE_FAILS, isTerminalDenied } from '../../electron/main/lan/protocol'
import {
  createConnectionController, createTerminalApi, createTerminalMode, loadConnectionConfig, readConnectionConfig, writeConnectionConfig
} from '../../electron/main/lan/terminal'
import type { ConnectionConfig, TerminalApiOptions } from '../../electron/main/lan/terminal'
import { ALWAYS_ACTIVE, createLicensedApi } from '../../electron/main/license/guard'
import type { LicenseGate } from '../../electron/main/license/guard'
import type { PosApi } from '../../src/shared/api'
import type { ReceiptData, ReceiptSettings } from '../../src/shared/types'

const T1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const T2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const MAIN_ONLY = 'Bu amal faqat asosiy kompyuterda bajariladi'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

interface Main {
  ctx: Ctx
  net: NetworkManager
  port: number
  code: string
  gate: { blocked: boolean }
}

async function startMain(opts: { discoveryPort?: number | null; port?: number } = {}): Promise<Main> {
  const ctx = await setup()
  const gate = { blocked: false }
  const lic: LicenseGate = { ...ALWAYS_ACTIVE, isBlocked: () => gate.blocked, blockedMessage: () => 'Litsenziya muddati tugagan' }
  // port 0 → tasodifiy; kod birinchi marta avtomatik yaratiladi
  ctx.svc.writeKv('network', JSON.stringify({ port: opts.port ?? 0 }))
  const net = new NetworkManager({
    store: { load: () => ctx.svc.readKv('network'), save: (j) => ctx.svc.writeKv('network', j) },
    createTerminal: () => createLicensedApi(ctx.svc.forTerminal(), lic),
    name: () => ctx.svc.businessName(),
    version: '9.9.9',
    clock: ctx.clock.now,
    discoveryPort: opts.discoveryPort ?? null,
    bindHost: '127.0.0.1'
  })
  const st = await net.setEnabled(true)
  cleanups.push(() => net.shutdown())
  ctx.svc.host.network = net
  return { ctx, net, port: st.port, code: st.code, gate }
}

const noConn: PosApi['connection'] = {
  info: async () => ({ mode: 'terminal', host: '127.0.0.1', port: 1, connected: true }),
  discover: async () => [],
  connectTerminal: async () => undefined,
  disconnect: async () => undefined
}

/** Terminal proksisi (Electron'dagi kabi) — asosiyga HTTP orqali, o'z tokeni bilan */
function terminal(m: Main, id: string, host?: TerminalApiOptions['host']) {
  const target: RemoteTarget = { host: '127.0.0.1', port: m.port, code: m.code, terminalId: id }
  return createTerminalApi(target, noConn, { timeoutMs: 2000, host })
}

function raw(port: number, p: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body)
    const req = http.request({ host: '127.0.0.1', port, path: p, method: data ? 'POST' : 'GET', headers, agent: false }, (res) => {
      const c: Buffer[] = []
      res.on('data', (x: Buffer) => c.push(x))
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(c).toString() || '{}') }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'delfin-net-'))
  cleanups.push(() => fs.rmSync(d, { recursive: true, force: true }))
  return d
}

describe('LAN server: kod, terminal tokeni, denylist, brute-force', () => {
  it('network.*: settings.manage talab qilinadi; kod 6 raqam, saqlanadi', async () => {
    const { ctx, code } = await startMain()
    expect(code).toMatch(/^\d{6}$/)
    const st = await ctx.svc.network.status()
    expect(st.enabled).toBe(true)
    expect(st.terminals).toEqual([])
    expect(JSON.parse(ctx.svc.readKv('network')!)).toMatchObject({ enabled: true, code })
    await ctx.loginAs('admin')
    await expect(ctx.svc.network.status()).rejects.toThrow("ruxsatingiz yo'q")
    await ctx.loginAs('cashier')
    await expect(ctx.svc.network.setEnabled(false)).rejects.toThrow("ruxsatingiz yo'q")
  })

  it("/hello kodsiz; /rpc kodsiz yoki noto'g'ri kod → 401; tokensiz → 400", async () => {
    const m = await startMain()
    const { port, code } = m
    expect(await hello('127.0.0.1', port)).toEqual({ name: 'Delfin Sauna', version: '9.9.9' })
    expect((await raw(port, '/rpc', { method: 'system.now' })).status).toBe(401)
    const bad = code === '000000' ? '111111' : '000000'
    const r = await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': bad, 'X-Delfin-Terminal': T1 })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe("Kod noto'g'ri")
    // eski (ko'ruvchi) mijoz: tokensiz
    const old = await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code })
    expect(old.status).toBe(400)
    expect(old.body.error).toMatch(/Terminal identifikatori/)
    expect((await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code, 'X-Delfin-Terminal': 'abc' })).status).toBe(400)
    await expect(rpc({ host: '127.0.0.1', port, code: bad, terminalId: T1 }, 'system.now', [])).rejects.toThrow("Kod noto'g'ri")
    expect(await rpc({ host: '127.0.0.1', port, code, terminalId: T1 }, 'system.now', [])).toBe(m.ctx.clock.now())
  })

  it('denylist: network.*, connection.*, system.backup/restore, license.activate, auth.setupOwner → 403; qolganlari ruxsat', async () => {
    const { port, code, ctx } = await startMain()
    const names = API_METHODS.map((x) => `${x.group}.${x.method}`)
    const denied = names.filter((n) => isTerminalDenied(n))
    expect(denied.sort()).toEqual(
      [
        'auth.setupOwner', 'license.activate', 'system.backup', 'system.restore',
        ...names.filter((n) => n.startsWith('network.') || n.startsWith('connection.'))
      ].sort()
    )
    let backups = 0
    ctx.svc.host.saveBackup = async () => {
      backups++
      return '/tmp/x'
    }
    const h = { 'X-Delfin-Code': code, 'X-Delfin-Terminal': T1 }
    // terminalda ega kirgan bo'lsa ham rad etiladi
    expect((await raw(port, '/rpc', { method: 'auth.login', args: [ctx.staff.owner.id, '1234'] }, h)).status).toBe(200)
    for (const name of denied) {
      const r = await raw(port, '/rpc', { method: name, args: [true] }, h)
      expect(r.status, name).toBe(403)
      expect(r.body.error).toBe(MAIN_ONLY)
    }
    expect(backups).toBe(0)
    expect((await ctx.svc.network.status()).enabled).toBe(true)
    // noma'lum / prototip nomlari → 400
    for (const name of ['__proto__.x', 'constructor', 'rooms.board.x', 'x.y', 42]) {
      const r = await raw(port, '/rpc', { method: name }, h)
      expect(r.status).toBe(400)
      expect(r.body.error).toBe("Noma'lum amal")
    }
    // yozish amallari ham ruxsat (403 emas): ega terminaldan xona saqlaydi
    const room = await rpc({ host: '127.0.0.1', port, code, terminalId: T1 }, 'rooms.save', [{ name: 'Terminal xona', pricePerHour: 40_000, capacity: 4 }])
    expect((room as { name: string }).name).toBe('Terminal xona')
    expect((await ctx.svc.rooms.list()).some((r) => r.name === 'Terminal xona')).toBe(true)
  })

  it("brute-force: 10 xato/daqiqa → to'g'ri kod bilan ham 429; daqiqadan keyin ochiladi", async () => {
    const { port, code, ctx } = await startMain()
    const bad = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_CODE_FAILS; i++) {
      expect((await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': bad, 'X-Delfin-Terminal': T1 })).status).toBe(401)
    }
    const blocked = await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code, 'X-Delfin-Terminal': T1 })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/Juda ko'p/)
    ctx.clock.advance(61_000)
    expect((await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code, 'X-Delfin-Terminal': T1 })).status).toBe(200)
  })

  it("PIN brute-force terminal va asosiy uchun umumiy (yangi token bilan chetlab o'tib bo'lmaydi)", async () => {
    const m = await startMain()
    const a = terminal(m, T1).api
    for (let i = 0; i < 5; i++) await expect(a.auth.login(m.ctx.staff.cashier.id, '0000')).rejects.toThrow("PIN noto'g'ri")
    await expect(a.auth.login(m.ctx.staff.cashier.id, '3333')).rejects.toThrow("Juda ko'p")
    const b = terminal(m, T2).api
    await expect(b.auth.login(m.ctx.staff.cashier.id, '3333')).rejects.toThrow("Juda ko'p")
    await expect(m.ctx.svc.auth.login(m.ctx.staff.cashier.id, '3333')).rejects.toThrow("Juda ko'p")
    m.ctx.clock.advance(31_000)
    expect((await b.auth.login(m.ctx.staff.cashier.id, '3333')).staff.name).toBe('Kassir')
  })

  it("regenerateCode: eski kod ishlamaydi, terminal login'lari bekor bo'ladi", async () => {
    const m = await startMain()
    const a = terminal(m, T1).api
    await a.auth.login(m.ctx.staff.waiter.id, '5555')
    const st2 = await m.ctx.svc.network.regenerateCode()
    expect(st2.code).not.toBe(m.code)
    expect(st2.terminals).toEqual([])
    expect(m.net.server.terminalCount).toBe(0)
    await expect(a.rooms.board()).rejects.toThrow("Kod noto'g'ri")
    const again = createTerminalApi({ host: '127.0.0.1', port: m.port, code: st2.code, terminalId: T1 }, noConn).api
    expect(await again.auth.current()).toBeNull()
    await expect(again.rooms.board()).rejects.toThrow('Avval tizimga kiring')
  })

  it("setEnabled(false) serverni yopadi; qayta yoqish o'sha kod bilan", async () => {
    const { port, code, ctx } = await startMain()
    await ctx.svc.network.setEnabled(false)
    await expect(hello('127.0.0.1', port, 1000)).rejects.toThrow('Asosiy kompyuter topilmadi')
    expect(JSON.parse(ctx.svc.readKv('network')!).enabled).toBe(false)
    const st = await ctx.svc.network.setEnabled(true)
    expect(st.code).toBe(code)
  })

  it("band port → o'zbekcha xato, holat yoqilmaydi", async () => {
    const { port } = await startMain()
    const ctx2 = await setup()
    ctx2.svc.writeKv('network', JSON.stringify({ enabled: false, port, code: '123456' }))
    const n2 = new NetworkManager({
      store: { load: () => ctx2.svc.readKv('network'), save: (j) => ctx2.svc.writeKv('network', j) },
      createTerminal: () => ctx2.svc.forTerminal(), name: () => 'x', version: '1', discoveryPort: null, bindHost: '127.0.0.1'
    })
    await expect(n2.setEnabled(true)).rejects.toThrow(`Port ${port} band`)
    expect(JSON.parse(ctx2.svc.readKv('network')!).enabled).toBe(false)
  })

  it("ilova ochilganda enabled bo'lsa init() serverni avtomatik ko'taradi", async () => {
    const ctx = await setup()
    ctx.svc.writeKv('network', JSON.stringify({ enabled: true, port: 0, code: '654321' }))
    const n = new NetworkManager({
      store: { load: () => ctx.svc.readKv('network'), save: (j) => ctx.svc.writeKv('network', j) },
      createTerminal: () => ctx.svc.forTerminal(), name: () => 'x', version: '1', discoveryPort: null, bindHost: '127.0.0.1'
    })
    cleanups.push(() => n.shutdown())
    await n.init()
    expect(n.server.running).toBe(true)
    expect(await rpc({ host: '127.0.0.1', port: n.server.port, code: '654321', terminalId: T1 }, 'system.now', [])).toBe(ctx.clock.now())
  })
})

describe('Terminal kontekstlari: alohida login, ruxsatlar, sinxronlik', () => {
  it("ikki terminal + asosiy bir vaqtda turli xodimlar bilan; login'lar bir-biriga ta'sir qilmaydi", async () => {
    const m = await startMain()
    const { ctx } = m
    const t1 = terminal(m, T1).api
    const t2 = terminal(m, T2).api
    // Boshida terminallarda hech kim kirmagan (asosiyda ega kirgan bo'lsa ham)
    expect((await ctx.svc.auth.current())!.staff.role).toBe('owner')
    expect(await t1.auth.current()).toBeNull()
    await expect(t1.rooms.board()).rejects.toThrow('Avval tizimga kiring')
    // Qulf ekrani: xodimlar ro'yxati asosiydan
    expect((await t1.auth.listLoginStaff()).map((s) => s.name)).toContain('Sardor')

    const w = await t1.auth.login(ctx.staff.waiter.id, '5555')
    expect(w.staff.name).toBe('Sardor')
    expect(w.permissions).toEqual(['session.open', 'session.manage'])
    await t2.auth.login(ctx.staff.cashier.id, '3333')
    await ctx.loginAs('admin')

    expect((await t1.auth.current())!.staff.name).toBe('Sardor')
    expect((await t2.auth.current())!.staff.name).toBe('Kassir')
    expect((await ctx.svc.auth.current())!.staff.name).toBe('Admin')

    // Ruxsatlar har kontekstda o'z xodimiga qarab
    const range = { from: 0, to: ctx.clock.now() + 1 }
    await expect(t1.reports.sales(range)).rejects.toThrow("ruxsatingiz yo'q")
    await expect(t2.reports.sales(range)).rejects.toThrow("ruxsatingiz yo'q")
    expect(await ctx.svc.reports.sales(range)).toBeTruthy()
    await expect(t1.rooms.save({ name: 'X', pricePerHour: 1000, capacity: 2 })).rejects.toThrow("ruxsatingiz yo'q")
    await expect(t2.settings.save(await t2.settings.get())).rejects.toThrow("ruxsatingiz yo'q")

    // Terminal chiqishi boshqalarga ta'sir qilmaydi
    await t1.auth.logout()
    expect(await t1.auth.current()).toBeNull()
    expect((await t2.auth.current())!.staff.name).toBe('Kassir')
    expect((await ctx.svc.auth.current())!.staff.name).toBe('Admin')
    // Asosiy chiqishi terminallarga ta'sir qilmaydi
    await ctx.svc.auth.logout()
    expect(await ctx.svc.auth.current()).toBeNull()
    expect((await t2.auth.current())!.staff.name).toBe('Kassir')
    expect(Array.isArray(await t2.rooms.board())).toBe(true)
  })

  it('qulf o\'chirilgan bo\'lsa ham terminalda avtomatik kirish yo\'q (PIN shart)', async () => {
    const m = await startMain()
    const s = await m.ctx.svc.settings.get()
    await m.ctx.svc.settings.save({ ...s, lockEnabled: false })
    await m.ctx.svc.auth.logout()
    expect((await m.ctx.svc.auth.current())!.staff.role).toBe('owner') // asosiyda avtomatik ega
    const t = terminal(m, T1).api
    expect(await t.auth.current()).toBeNull()
    await expect(t.rooms.board()).rejects.toThrow('Avval tizimga kiring')
  })

  it("sinxron: terminal ofitsianti xona ochib mahsulot qo'shsa — asosiy board'da; asosiy qo'shgani — terminalda", async () => {
    const m = await startMain()
    const { ctx } = m
    const t1 = terminal(m, T1).api
    const t2 = terminal(m, T2).api
    await t1.auth.login(ctx.staff.waiter.id, '5555')
    await t2.auth.login(ctx.staff.cashier.id, '3333')
    const pivo = await productByName(ctx.svc, 'Pivo 0.5 L')

    const opened = await t1.sessions.open(ctx.rooms.s1, 2, 60)
    const sid = opened.session.id
    await t1.lines.addProduct(sid, pivo.id, 2, null)
    ctx.clock.advanceMin(5)

    const card = (await ctx.svc.rooms.board()).find((c) => c.room.id === ctx.rooms.s1)!
    expect(card.session!.session.id).toBe(sid)
    expect(card.guestsActive).toBe(2)
    expect(card.session!.lines.map((l) => [l.name, l.activeQty])).toEqual([['Pivo 0.5 L', 2]])
    expect(card.session!.lines[0].createdBy).toBe(ctx.staff.waiter.id)

    // Asosiy (ega) qo'shadi → ikkinchi terminal (kassir) ko'radi
    await ctx.svc.lines.addProduct(sid, pivo.id, 1, null)
    const v2 = await t2.sessions.get(sid)
    expect(v2.lines.reduce((n, l) => n + l.activeQty, 0)).toBe(3)
    expect(v2.computedAt).toBe(ctx.clock.now())
    // Kassir terminali to'lov qiladi → asosiyda xona bo'shaydi
    const r = await t2.checkout.pay(sid, [{ method: 'cash', amount: v2.total }], null)
    expect(r.total).toBe(v2.total)
    expect(r.cashier).toBe('Kassir')
    expect((await ctx.svc.rooms.board()).find((c) => c.room.id === ctx.rooms.s1)!.session).toBeNull()
    expect((await t1.rooms.board()).find((c) => c.room.id === ctx.rooms.s1)!.session).toBeNull()
  })

  it("network.status().terminals: ip, kompyuter nomi, kirgan xodim, lastSeen; 2 daqiqadan keyin chiqadi", async () => {
    const m = await startMain()
    const t1 = terminal(m, T1).api
    const t2 = terminal(m, T2).api
    await t1.auth.login(m.ctx.staff.waiter.id, '5555')
    m.ctx.clock.advance(1000)
    await t2.system.now()
    const st = await m.ctx.svc.network.status()
    const host = os.hostname().replace(/[^\w.\- ]/g, '').slice(0, 60)
    expect(st.terminals).toEqual([
      { ip: '127.0.0.1', name: host, staffName: null, lastSeen: m.ctx.clock.now() },
      { ip: '127.0.0.1', name: host, staffName: 'Sardor', lastSeen: m.ctx.clock.now() - 1000 }
    ])
    m.ctx.clock.advance(3 * 60_000)
    expect((await m.ctx.svc.network.status()).terminals).toEqual([])
    // Konteksti saqlanadi (login o'chmaydi) — yana so'rov yuborsa ro'yxatga qaytadi
    expect((await t1.auth.current())!.staff.name).toBe('Sardor')
    expect((await m.ctx.svc.network.status()).terminals.map((t) => t.staffName)).toEqual(['Sardor'])
  })

  it('12 soat ishlatilmagan terminal konteksti (login) o\'chiriladi', async () => {
    const m = await startMain()
    const t1 = terminal(m, T1).api
    await t1.auth.login(m.ctx.staff.waiter.id, '5555')
    m.ctx.clock.advance(13 * 3_600_000)
    await terminal(m, T2).api.system.now()
    expect(m.net.server.terminalCount).toBe(1)
    expect(await t1.auth.current()).toBeNull()
  })

  it('litsenziya guard serverda ham: muddat tugasa terminal yozolmaydi, o\'qiy oladi; status asosiydan', async () => {
    const m = await startMain()
    m.ctx.svc.host.license = {
      status: async () => ({ state: 'trial', machineCode: 'MAIN1-MAIN2-XYZ', trialEndsAt: 123, expiresAt: null, permanent: false, contact: 'x' }),
      activate: async () => {
        throw new Error('chaqirilmasligi kerak')
      }
    }
    const t = terminal(m, T1).api
    await t.auth.login(m.ctx.staff.cashier.id, '3333')
    expect((await t.license.status()).machineCode).toBe('MAIN1-MAIN2-XYZ')
    await expect(t.license.activate('kalit')).rejects.toThrow(MAIN_ONLY)
    m.gate.blocked = true
    await expect(t.sessions.open(m.ctx.rooms.s1, 1, 60)).rejects.toThrow('Litsenziya muddati tugagan')
    expect(Array.isArray(await t.rooms.board())).toBe(true)
    m.gate.blocked = false
    expect((await t.sessions.open(m.ctx.rooms.s1, 1, 60)).guests).toHaveLength(1)
  })
})

describe('Terminal proksisi: lokal amallar', () => {
  const sample = (settings: ReceiptSettings): ReceiptData =>
    ({
      settings, receiptNo: 7, roomName: 'Sauna 1', openedAt: 0, closedAt: 60_000, cashier: 'Kassir', guests: [], lines: [],
      timeTotal: 0, linesTotal: 0, discount: 0, total: 0, payments: [], debtor: null, provisional: false
    }) as unknown as ReceiptData

  it("chek terminalning o'z printeriga; printerlar lokal; settings.save asosiy printerini o'zgartirmaydi", async () => {
    const m = await startMain()
    const printed: { html: string; printer: string }[] = []
    const term = terminal(m, T1, {
      printReceipt: async (html, s) => void printed.push({ html, printer: s.printerName }),
      listPrinters: async () => [{ name: 'TERM-58', displayName: 'Terminal printer', isDefault: true }]
    })
    const t = term.api
    let mainPrints = 0
    m.ctx.svc.host.printReceipt = async () => void mainPrints++
    // Asosiy kompyuter printeri
    const base = await m.ctx.svc.settings.get()
    await m.ctx.svc.settings.save({ ...base, receipt: { ...base.receipt, printerName: 'MAIN-80' } })

    await t.auth.login(m.ctx.staff.owner.id, '1234')
    expect(await t.system.listPrinters()).toEqual([{ name: 'TERM-58', displayName: 'Terminal printer', isDefault: true }])
    // Terminal printer tanlanmagan → '' (tizim standarti), asosiyniki ko'rinmaydi
    const s0 = await t.settings.get()
    expect(s0.receipt.printerName).toBe('')
    const saved = await t.settings.save({ ...s0, receipt: { ...s0.receipt, printerName: 'TERM-58', footer: 'Rahmat!' } })
    expect(saved.receipt.printerName).toBe('TERM-58')
    expect(saved.receipt.footer).toBe('Rahmat!')
    const mainS = await m.ctx.svc.settings.get()
    expect(mainS.receipt.printerName).toBe('MAIN-80')
    expect(mainS.receipt.footer).toBe('Rahmat!')

    await t.system.printReceipt(sample(mainS.receipt))
    expect(printed).toHaveLength(1)
    expect(printed[0].printer).toBe('TERM-58')
    expect(printed[0].html).toContain('Sauna 1')
    expect(mainPrints).toBe(0)
    await expect(t.system.printReceipt(null as unknown as ReceiptData)).rejects.toThrow("Chek ma'lumotlari noto'g'ri")
  })

  it("faqat asosiyga tegishli amallar so'rov yubormasdan lokal rad etiladi", async () => {
    const term = createTerminalApi({ host: '127.0.0.1', port: 1, code: '123456', terminalId: T1 }, noConn, { timeoutMs: 300 })
    for (const p of [term.api.network.status(), term.api.system.backup(), term.api.system.restore(), term.api.auth.setupOwner('a', '1234', 'b'), term.api.license.activate('k')]) {
      await expect(p).rejects.toThrow(MAIN_ONLY)
    }
    expect(term.lastOk()).toBeNull()
    await expect(term.api.rooms.board()).rejects.toThrow("Asosiy kompyuter bilan aloqa yo'q")
    expect(term.lastOk()).toBe(false)
  })
})

describe('connection.json oqimi', () => {
  it("yo'q/buzilgan fayl → asosiy rejim; main info", async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    expect(readConnectionConfig(file).mode).toBe('main')
    fs.writeFileSync(file, '{buzuq')
    expect(readConnectionConfig(file).mode).toBe('main')
    fs.writeFileSync(file, JSON.stringify({ mode: 'terminal', host: '1.2.3.4', port: 47321, code: '12' }))
    expect(readConnectionConfig(file).mode).toBe('main')
    const c = createConnectionController({ file, onChange: () => undefined })
    expect(await c.info()).toEqual({ mode: 'main', host: null, port: null, connected: true })
  })

  it("eski 'viewer' konfiguratsiyasi → 'terminal': identifikator yaratiladi va fayl atomik qayta yoziladi", () => {
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    fs.writeFileSync(file, JSON.stringify({ mode: 'viewer', host: '192.168.1.10', port: 47321, code: '123456' }))
    expect(readConnectionConfig(file)).toMatchObject({ mode: 'terminal', host: '192.168.1.10', port: 47321, code: '123456', terminalId: null })
    const cfg = loadConnectionConfig(file)
    expect(cfg.mode).toBe('terminal')
    expect(cfg.terminalId).toMatch(/^[0-9a-f-]{36}$/)
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(disk).toEqual({ mode: 'terminal', host: '192.168.1.10', port: 47321, code: '123456', terminalId: cfg.terminalId, printerName: '' })
    // qayta o'qish — o'sha identifikator
    expect(loadConnectionConfig(file).terminalId).toBe(cfg.terminalId)
    expect(fs.readdirSync(dir)).toEqual(['connection.json'])
  })

  it("connectTerminal: xatolar o'zbekcha; muvaffaqiyatda saqlanadi, token qayta ulanishda o'zgarmaydi; disconnect → main", async () => {
    const { port, code } = await startMain()
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    const changes: ConnectionConfig[] = []
    const c = createConnectionController({ file, onChange: (cfg) => void changes.push(cfg), timeoutMs: 1500 })
    const bad = code === '000000' ? '111111' : '000000'
    await expect(c.connectTerminal('127.0.0.1', port, bad)).rejects.toThrow("Kod noto'g'ri")
    await expect(c.connectTerminal('127.0.0.1', 1, code)).rejects.toThrow('Asosiy kompyuter topilmadi')
    await expect(c.connectTerminal('127.0.0.1', port, '12ab')).rejects.toThrow('6 ta raqam')
    await expect(c.connectTerminal('bad host!', port, code)).rejects.toThrow("Manzil noto'g'ri")
    expect(changes).toHaveLength(0)
    expect(fs.existsSync(file)).toBe(false)

    await c.connectTerminal(' 127.0.0.1 ', port, code)
    const cfg = readConnectionConfig(file)
    expect(cfg).toMatchObject({ mode: 'terminal', host: '127.0.0.1', port, code, printerName: '' })
    expect(cfg.terminalId).toMatch(/^[0-9a-f-]{36}$/)
    expect(changes).toEqual([cfg])

    await c.disconnect()
    expect(readConnectionConfig(file).mode).toBe('main')
    expect(changes[1].mode).toBe('main')
    await c.connectTerminal('127.0.0.1', port, code)
    expect(readConnectionConfig(file).terminalId).toBe(cfg.terminalId)
  })

  it("createTerminalMode: info() aloqa holati; uzilsa false, qayta yoqilsa avtomatik true", async () => {
    // qayta yoqilganda o'sha port bo'lishi uchun aniq port
    const m = await startMain({ port: 20000 + Math.floor(Math.random() * 20000) })
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    writeConnectionConfig(file, { mode: 'viewer' as never, host: '127.0.0.1', port: m.port, code: m.code, terminalId: null, printerName: '' })
    const cfg = loadConnectionConfig(file)
    const term = createTerminalMode(cfg, { file, onChange: () => undefined, timeoutMs: 1500 })
    expect(await term.api.connection.info()).toEqual({ mode: 'terminal', host: '127.0.0.1', port: m.port, connected: true })
    await term.api.auth.login(m.ctx.staff.waiter.id, '5555')
    expect((await m.ctx.svc.network.status()).terminals.map((t) => t.staffName)).toEqual(['Sardor'])
    await m.ctx.svc.network.setEnabled(false)
    await expect(term.api.rooms.board()).rejects.toThrow("Asosiy kompyuter bilan aloqa yo'q")
    expect((await term.api.connection.info()).connected).toBe(false)
    await m.ctx.svc.network.setEnabled(true)
    expect((await term.api.connection.info()).connected).toBe(true)
    // Server o'chib-yongan: terminal login'i bekor — qayta kirish kerak
    expect(await term.api.auth.current()).toBeNull()
  })

  it('PosService.connection: sozlangan asosiy kompyuterda connectTerminal faqat settings.manage bilan', async () => {
    const ctx = await setup()
    const calls: string[] = []
    ctx.svc.host.connection = {
      info: async () => ({ mode: 'main', host: null, port: null, connected: true }),
      discover: async () => [],
      connectTerminal: async () => void calls.push('c'),
      disconnect: async () => void calls.push('d')
    }
    await ctx.loginAs('cashier')
    await expect(ctx.svc.connection.connectTerminal('1.2.3.4', 47321, '123456')).rejects.toThrow("ruxsatingiz yo'q")
    await ctx.svc.auth.logout()
    await expect(ctx.svc.connection.connectTerminal('1.2.3.4', 47321, '123456')).rejects.toThrow('Avval tizimga kiring')
    await ctx.loginAs('owner')
    await ctx.svc.connection.connectTerminal('1.2.3.4', 47321, '123456')
    expect(calls).toEqual(['c'])
  })
})

describe('Discovery (UDP, localhost)', () => {
  it("DELFIN? so'roviga {name, port} javob", async () => {
    const udp = 40000 + Math.floor(Math.random() * 20000)
    const { port, ctx } = await startMain({ discoveryPort: udp })
    const s = await ctx.svc.settings.get()
    s.receipt.businessName = 'Delfin Test'
    await ctx.svc.settings.save(s)
    const found = await discover({ port: udp, targets: ['127.0.0.1'], timeoutMs: 500 })
    expect(found).toEqual([{ host: '127.0.0.1', port, name: 'Delfin Test' }])
    await ctx.svc.network.setEnabled(false)
    expect(await discover({ port: udp, targets: ['127.0.0.1'], timeoutMs: 300 })).toEqual([])
  })
})
