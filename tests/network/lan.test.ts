import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { setup } from '../service/helpers'
import type { Ctx } from '../service/helpers'
import { API_METHODS } from '../../electron/main/apiMethods'
import { NetworkManager } from '../../electron/main/lan/network'
import { discover, hello, rpc } from '../../electron/main/lan/client'
import { VIEWER_ALLOWLIST, MAX_CODE_FAILS } from '../../electron/main/lan/protocol'
import {
  createConnectionController, createViewerMode, readConnectionConfig, writeConnectionConfig
} from '../../electron/main/lan/viewer'
import type { ConnectionConfig } from '../../electron/main/lan/viewer'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function startMain(opts: { discoveryPort?: number | null } = {}): Promise<{ ctx: Ctx; net: NetworkManager; port: number; code: string }> {
  const ctx = await setup()
  const viewerCtx = ctx.svc.forViewer()
  // port 0 → tasodifiy; kod birinchi marta avtomatik yaratiladi
  ctx.svc.writeKv('network', JSON.stringify({ port: 0 }))
  const fresh = new NetworkManager({
    store: { load: () => ctx.svc.readKv('network'), save: (j) => ctx.svc.writeKv('network', j) },
    viewerApi: () => viewerCtx,
    name: () => ctx.svc.businessName(),
    version: '9.9.9',
    clock: ctx.clock.now,
    discoveryPort: opts.discoveryPort ?? null,
    bindHost: '127.0.0.1'
  })
  const st = await fresh.setEnabled(true)
  cleanups.push(() => fresh.shutdown())
  ctx.svc.host.network = fresh
  return { ctx, net: fresh, port: st.port, code: st.code }
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

describe('LAN server: kod, allowlist, brute-force', () => {
  it('network.*: settings.manage talab qilinadi; kod 6 raqam, saqlanadi', async () => {
    const { ctx, code } = await startMain()
    expect(code).toMatch(/^\d{6}$/)
    const st = await ctx.svc.network.status()
    expect(st.enabled).toBe(true)
    expect(JSON.parse(ctx.svc.readKv('network')!)).toMatchObject({ enabled: true, code })
    await ctx.loginAs('admin')
    await expect(ctx.svc.network.status()).rejects.toThrow("ruxsatingiz yo'q")
    await ctx.loginAs('cashier')
    await expect(ctx.svc.network.setEnabled(false)).rejects.toThrow("ruxsatingiz yo'q")
  })

  it('/hello kodsiz; /rpc kodsiz yoki noto\'g\'ri kod → 401', async () => {
    const { port, code } = await startMain()
    expect(await hello('127.0.0.1', port)).toEqual({ name: 'Delfin Sauna', version: '9.9.9' })
    expect((await raw(port, '/rpc', { method: 'rooms.list' })).status).toBe(401)
    const bad = code === '000000' ? '111111' : '000000'
    const r = await raw(port, '/rpc', { method: 'rooms.list' }, { 'X-Delfin-Code': bad })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe("Kod noto'g'ri")
    await expect(rpc({ host: '127.0.0.1', port, code: bad }, 'rooms.list', [])).rejects.toThrow("Kod noto'g'ri")
    const ok = await rpc({ host: '127.0.0.1', port, code }, 'rooms.list', [])
    expect(Array.isArray(ok)).toBe(true)
  })

  it('allowlist: allowlistdan tashqari BARCHA PosApi metodlari 403 (to\'g\'ri kod bilan ham)', async () => {
    const { port, code, ctx } = await startMain()
    const before = ctx.svc.exportBytes().length
    const denied = API_METHODS.map((m) => `${m.group}.${m.method}`).filter((n) => !VIEWER_ALLOWLIST.has(n))
    expect(denied.length).toBeGreaterThan(40)
    for (const name of denied) {
      const r = await raw(port, '/rpc', { method: name, args: [1, 1, 60, null] }, { 'X-Delfin-Code': code })
      expect(r.status, name).toBe(403)
      expect(r.body.error).toBe("Bu kompyuter faqat ko'rish rejimida")
    }
    // noma'lum / prototip nomlari ham
    for (const name of ['__proto__.x', 'constructor', 'rooms.board.x', 'x.y']) {
      expect((await raw(port, '/rpc', { method: name }, { 'X-Delfin-Code': code })).status).toBe(403)
    }
    expect((await ctx.svc.rooms.board()).every((c) => c.session === null)).toBe(true)
    expect(ctx.svc.exportBytes().length).toBe(before)
    // allowlist'dagilar ishlaydi
    for (const name of ['rooms.board', 'rooms.list', 'catalog.products', 'debts.list', 'staff.list', 'waiters.list', 'settings.get', 'system.now']) {
      expect((await raw(port, '/rpc', { method: name, args: [] }, { 'X-Delfin-Code': code })).status, name).toBe(200)
    }
    const rep = await raw(port, '/rpc', { method: 'reports.sales', args: [{ from: 0, to: ctx.clock.now() + 1 }] }, { 'X-Delfin-Code': code })
    expect(rep.status).toBe(200)
  })

  it('brute-force: 10 xato/daqiqa → to\'g\'ri kod bilan ham 429; daqiqadan keyin ochiladi', async () => {
    const { port, code, ctx } = await startMain()
    const bad = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_CODE_FAILS; i++) {
      expect((await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': bad })).status).toBe(401)
    }
    const blocked = await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/Juda ko'p/)
    ctx.clock.advance(61_000)
    expect((await raw(port, '/rpc', { method: 'system.now' }, { 'X-Delfin-Code': code })).status).toBe(200)
  })

  it('regenerateCode: eski kod ishlamaydi, ko\'ruvchilar ro\'yxati tozalanadi', async () => {
    const { port, code, ctx } = await startMain()
    await rpc({ host: '127.0.0.1', port, code }, 'system.now', [])
    const st1 = await ctx.svc.network.status()
    expect(st1.viewers).toHaveLength(1)
    expect(st1.viewers[0].ip).toBe('127.0.0.1')
    expect(st1.viewers[0].name).toBe(os.hostname().replace(/[^\w.\- ]/g, '').slice(0, 60))
    const st2 = await ctx.svc.network.regenerateCode()
    expect(st2.code).not.toBe(code)
    expect(st2.viewers).toHaveLength(0)
    await expect(rpc({ host: '127.0.0.1', port, code }, 'system.now', [])).rejects.toThrow("Kod noto'g'ri")
    expect(await rpc({ host: '127.0.0.1', port, code: st2.code }, 'system.now', [])).toBe(ctx.clock.now())
    // 2 daqiqadan keyin ro'yxatdan chiqadi
    ctx.clock.advance(3 * 60_000)
    expect((await ctx.svc.network.status()).viewers).toHaveLength(0)
  })

  it('setEnabled(false) serverni yopadi; qayta yoqish o\'sha kod bilan', async () => {
    const { port, code, ctx } = await startMain()
    await ctx.svc.network.setEnabled(false)
    await expect(hello('127.0.0.1', port, 1000)).rejects.toThrow('Asosiy kompyuter topilmadi')
    expect(JSON.parse(ctx.svc.readKv('network')!).enabled).toBe(false)
    const st = await ctx.svc.network.setEnabled(true)
    expect(st.code).toBe(code)
  })

  it('band port → o\'zbekcha xato, holat yoqilmaydi', async () => {
    const { port, ctx } = await startMain()
    const ctx2 = await setup()
    ctx2.svc.writeKv('network', JSON.stringify({ enabled: false, port, code: '123456' }))
    const n2 = new NetworkManager({
      store: { load: () => ctx2.svc.readKv('network'), save: (j) => ctx2.svc.writeKv('network', j) },
      viewerApi: () => ctx2.svc.forViewer(), name: () => 'x', version: '1', discoveryPort: null, bindHost: '127.0.0.1'
    })
    await expect(n2.setEnabled(true)).rejects.toThrow(`Port ${port} band`)
    expect(JSON.parse(ctx2.svc.readKv('network')!).enabled).toBe(false)
    void ctx
  })

  it('ilova ochilganda enabled bo\'lsa init() serverni avtomatik ko\'taradi', async () => {
    const ctx = await setup()
    ctx.svc.writeKv('network', JSON.stringify({ enabled: true, port: 0, code: '654321' }))
    const n = new NetworkManager({
      store: { load: () => ctx.svc.readKv('network'), save: (j) => ctx.svc.writeKv('network', j) },
      viewerApi: () => ctx.svc.forViewer(), name: () => 'x', version: '1', discoveryPort: null, bindHost: '127.0.0.1'
    })
    cleanups.push(() => n.shutdown())
    await n.init()
    expect(n.server.running).toBe(true)
    expect(await rpc({ host: '127.0.0.1', port: n.server.port, code: '654321' }, 'system.now', [])).toBe(ctx.clock.now())
  })
})

describe("Ko'ruvchi konteksti", () => {
  it('asosiy login holatiga ta\'sir qilmaydi va unga bog\'liq emas', async () => {
    const { ctx, port, code } = await startMain()
    const t = { host: '127.0.0.1', port, code }
    await ctx.loginAs('cashier')
    await rpc(t, 'rooms.board', [])
    await rpc(t, 'reports.sales', [{ from: 0, to: ctx.clock.now() + 1 }])
    expect((await ctx.svc.auth.current())!.staff.id).toBe(ctx.staff.cashier.id)
    // Asosiy kompyuterda hech kim kirmagan (qulf yoqilgan) — ko'ruvchi baribir o'qiydi
    await ctx.svc.auth.logout()
    const s = await ctx.svc.settings.get()
    expect(s.lockEnabled).toBe(true)
    expect(Array.isArray(await rpc(t, 'rooms.board', []))).toBe(true)
    expect(Array.isArray(await rpc(t, 'debts.list', [false]))).toBe(true)
    expect(await ctx.svc.auth.current()).toBeNull()
  })

  it('forViewer: yozish amallari servis darajasida ham rad etiladi', async () => {
    const ctx = await setup()
    const v = ctx.svc.forViewer()
    expect(await v.auth.current()).toEqual({ staff: expect.objectContaining({ id: 0, name: "Ko'ruvchi", role: 'cashier' }), permissions: ['reports.view'] })
    await expect(v.sessions.open(ctx.rooms.s1, 1, 60, null)).rejects.toThrow("faqat ko'rish")
    await expect(v.settings.save(await v.settings.get())).rejects.toThrow("faqat ko'rish")
    await expect(v.auth.login(ctx.staff.owner.id, '1234')).rejects.toThrow("faqat ko'rish")
    await expect(v.staff.changePin(ctx.staff.owner.id, '9999')).rejects.toThrow("faqat ko'rish")
    await expect(v.network.status()).rejects.toThrow("faqat ko'rish")
    expect((await ctx.svc.auth.current())!.staff.id).toBe(ctx.staff.owner.id)
  })

  it('jonli ma\'lumot: asosiy xona ochsa ko\'ruvchi board\'da ko\'radi', async () => {
    const { ctx, port, code } = await startMain()
    const dir = tmpDir()
    const cfg: ConnectionConfig = { mode: 'viewer', host: '127.0.0.1', port, code }
    const viewer = createViewerMode(cfg, { file: path.join(dir, 'connection.json'), onChange: () => undefined })
    writeConnectionConfig(path.join(dir, 'connection.json'), cfg)
    const b0 = await viewer.api.rooms.board()
    expect(b0.find((c) => c.room.id === ctx.rooms.s1)!.session).toBeNull()
    await ctx.svc.sessions.open(ctx.rooms.s1, 3, 60, null)
    ctx.clock.advanceMin(10)
    const b1 = await viewer.api.rooms.board()
    const card = b1.find((c) => c.room.id === ctx.rooms.s1)!
    expect(card.session).not.toBeNull()
    expect(card.guestsActive).toBe(3)
    expect(await viewer.api.system.now()).toBe(ctx.clock.now())
    // ko'ruvchi proksisi: lokal auth, yozish lokal rad
    expect((await viewer.api.auth.current())!.permissions).toEqual(['reports.view'])
    expect(await viewer.api.auth.needsSetup()).toBe(false)
    expect(await viewer.api.auth.listLoginStaff()).toEqual([])
    await expect(viewer.api.sessions.open(ctx.rooms.s2, 1, 60, null)).rejects.toThrow("Bu kompyuter faqat ko'rish rejimida")
    await expect(viewer.api.network.status()).rejects.toThrow("faqat ko'rish")
    expect(await viewer.api.connection.info()).toEqual({ mode: 'viewer', host: '127.0.0.1', port, connected: true })
    // aloqa uzildi
    await ctx.svc.network.setEnabled(false)
    await expect(viewer.api.rooms.board()).rejects.toThrow("Asosiy kompyuter bilan aloqa yo'q")
    expect((await viewer.api.connection.info()).connected).toBe(false)
  })
})

describe('Discovery (UDP, localhost)', () => {
  it('DELFIN? so\'roviga {name, port} javob', async () => {
    const udp = 40000 + Math.floor(Math.random() * 20000)
    const { port, ctx } = await startMain({ discoveryPort: udp })
    const s = await ctx.svc.settings.get()
    s.receipt.businessName = 'Delfin Test'
    await ctx.svc.settings.save(s)
    const found = await discover({ port: udp, targets: ['127.0.0.1'], timeoutMs: 500 })
    expect(found).toEqual([{ host: '127.0.0.1', port, name: 'Delfin Test' }])
    // server o'chsa — topilmaydi
    await ctx.svc.network.setEnabled(false)
    expect(await discover({ port: udp, targets: ['127.0.0.1'], timeoutMs: 300 })).toEqual([])
  })
})

describe('connection.json oqimi', () => {
  it('yo\'q/buzilgan fayl → asosiy rejim; main info', async () => {
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    expect(readConnectionConfig(file).mode).toBe('main')
    fs.writeFileSync(file, '{buzuq')
    expect(readConnectionConfig(file).mode).toBe('main')
    fs.writeFileSync(file, JSON.stringify({ mode: 'viewer', host: '1.2.3.4', port: 47321, code: '12' }))
    expect(readConnectionConfig(file).mode).toBe('main')
    const c = createConnectionController({ file, onChange: () => undefined })
    expect(await c.info()).toEqual({ mode: 'main', host: null, port: null, connected: true })
  })

  it('connectViewer: xatolar o\'zbekcha, muvaffaqiyatda saqlanadi va onChange; disconnect → main', async () => {
    const { port, code } = await startMain()
    const dir = tmpDir()
    const file = path.join(dir, 'connection.json')
    const changes: ConnectionConfig[] = []
    const c = createConnectionController({ file, onChange: (cfg) => void changes.push(cfg), timeoutMs: 1500 })
    const bad = code === '000000' ? '111111' : '000000'
    await expect(c.connectViewer('127.0.0.1', port, bad)).rejects.toThrow("Kod noto'g'ri")
    await expect(c.connectViewer('127.0.0.1', 1, code)).rejects.toThrow('Asosiy kompyuter topilmadi')
    await expect(c.connectViewer('127.0.0.1', port, '12ab')).rejects.toThrow('6 ta raqam')
    await expect(c.connectViewer('bad host!', port, code)).rejects.toThrow("Manzil noto'g'ri")
    expect(changes).toHaveLength(0)
    expect(fs.existsSync(file)).toBe(false)

    await c.connectViewer(' 127.0.0.1 ', port, code)
    expect(readConnectionConfig(file)).toEqual({ mode: 'viewer', host: '127.0.0.1', port, code })
    expect(changes).toEqual([{ mode: 'viewer', host: '127.0.0.1', port, code }])

    await c.disconnect()
    expect(readConnectionConfig(file).mode).toBe('main')
    expect(changes[1].mode).toBe('main')
  })

  it('PosService.connection: sozlangan asosiy kompyuterda connectViewer faqat settings.manage bilan', async () => {
    const ctx = await setup()
    const calls: string[] = []
    ctx.svc.host.connection = {
      info: async () => ({ mode: 'main', host: null, port: null, connected: true }),
      discover: async () => [],
      connectViewer: async () => void calls.push('c'),
      disconnect: async () => void calls.push('d')
    }
    await ctx.loginAs('cashier')
    await expect(ctx.svc.connection.connectViewer('1.2.3.4', 47321, '123456')).rejects.toThrow("ruxsatingiz yo'q")
    await ctx.loginAs('owner')
    await ctx.svc.connection.connectViewer('1.2.3.4', 47321, '123456')
    expect(calls).toEqual(['c'])
    expect((await ctx.svc.connection.info()).mode).toBe('main')
  })
})
