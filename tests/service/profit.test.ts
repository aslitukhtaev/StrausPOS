import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PosService } from '../../electron/main/PosService'
import { MIGRATIONS } from '../../electron/main/db/schema'
import { loadSqlJs } from '../../electron/main/db/sqljs'
import { hashPin } from '../../electron/main/pin'
import { createLicensedApi } from '../../electron/main/license/guard'
import { API_METHODS } from '../../electron/main/apiMethods'
import { FakeClock, HOUR, T0, kitchenSetup, productByName, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
const DAY = 24 * HOUR
const D15 = new Date(2026, 0, 15).getTime()
const RANGE = { from: D15, to: D15 + 2 * DAY } // 15 va 16 yanvar
const RANGE_WIDE = { from: D15 - DAY, to: D15 + 2 * DAY } // 14..16

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delfin-profit-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

async function catId(ctx: Ctx, prefix: string): Promise<number> {
  return (await ctx.svc.expenses.categories()).find((c) => c.name.startsWith(prefix))!.id
}

/**
 * 15-yanvar: Sauna 1, 1 mehmon × 60 daq (50 000). Sardor (10%) qo'shadi: Pivo ×3 (20 000, tannarx 12 000; 1 tasi qaytariladi),
 * Shashlik ×1 (25 000, tannarx 0), Lag'mon ×1 (oshxona 35 000, tannarx 20 000) → jami 50 000 + 100 000 = 150 000, naqd.
 * Bar savdosi: Suv ×3 (5 000, tannarx 3 000) = 15 000 naqd. Keyin Pivo tannarxi 15 000 ga o'zgaradi.
 * 16-yanvar: bar Pivo ×1 (20 000) qarzga.
 */
async function scenario() {
  const ctx = await setup()
  const { svc, clock, rooms } = ctx
  const k = await kitchenSetup(svc)
  const pivo = await productByName(svc, 'Pivo 0.5 L')
  const suv = await productByName(svc, 'Suv 0.5 L')
  const shashlik = await productByName(svc, 'Shashlik')
  await svc.catalog.saveProduct({ ...pivo, costPrice: 12_000 })
  await svc.catalog.saveProduct({ ...suv, costPrice: 3_000 })
  await svc.catalog.saveProduct({ ...k.lagmon, costPrice: 20_000 })

  const v0 = await svc.sessions.open(rooms.s1, 1, 60)
  await ctx.loginAs('waiter')
  await svc.lines.addProducts(v0.session.id, [
    { productId: pivo.id, qty: 3 }, { productId: shashlik.id, qty: 1 }, { productId: k.lagmon.id, qty: 1 }
  ], null)
  await ctx.loginAs('owner')
  const lines = (await svc.sessions.get(v0.session.id)).lines
  await svc.lines.returnLine(lines.find((l) => l.name === 'Pivo 0.5 L')!.id, 1, 'xato')
  clock.advance(HOUR)
  const v = await svc.sessions.get(v0.session.id)
  expect(v.total).toBe(150_000)
  await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 150_000 }], null)

  const b1 = await svc.barSales.open()
  await svc.lines.addProduct(b1.session.id, suv.id, 3, null)
  await svc.checkout.pay(b1.session.id, [{ method: 'cash', amount: 15_000 }], null)

  // tannarx keyin o'zgaradi — eski sotuv o'zgarmasligi kerak
  await svc.catalog.saveProduct({ ...pivo, costPrice: 15_000 })

  clock.advance(DAY)
  const b2 = await svc.barSales.open()
  await svc.lines.addProduct(b2.session.id, pivo.id, 1, null)
  await svc.checkout.pay(b2.session.id, [{ method: 'debt', amount: 20_000 }], { name: 'Jasur', phone: '+998 90 123 45 67' })
  clock.t = T0 + DAY + HOUR
  return { ...ctx, k, pivo, suv }
}

describe('tannarx', () => {
  it('saveProduct tannarxni qabul qiladi va tekshiradi', async () => {
    const { svc } = await setup()
    const cat = (await svc.catalog.categories())[0]
    const p = await svc.catalog.saveProduct({ name: 'Yangi', categoryId: cat.id, price: 10_000, costPrice: 6_000 })
    expect(p.costPrice).toBe(6_000)
    expect((await svc.catalog.saveProduct({ name: 'Yangi', categoryId: cat.id, price: 10_000 })).costPrice).toBe(0)
    const other = await svc.catalog.saveProduct({ name: 'Boshqa', categoryId: cat.id, price: 10_000 })
    expect(other.costPrice).toBe(0)
    // tahrirda costPrice berilmasa saqlanib qoladi
    expect((await svc.catalog.saveProduct({ id: p.id, name: 'Yangi', categoryId: cat.id, price: 11_000 })).costPrice).toBe(6_000)
    for (const bad of [-1, 1.5, NaN, '5' as unknown as number]) {
      await expect(svc.catalog.saveProduct({ name: 'X', categoryId: cat.id, price: 1, costPrice: bad })).rejects.toThrow("Tannarx 0 yoki musbat butun son bo'lishi kerak")
    }
  })

  it('qatorda muzlatiladi: mahsulot tannarxi keyin o‘zgarsa eski qator va hisobot o‘zgarmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms } = ctx
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    await svc.catalog.saveProduct({ ...pivo, costPrice: 12_000 })
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    const a = await svc.lines.addProduct(v0.session.id, pivo.id, 1, null)
    expect(a.lines[0].costPrice).toBe(12_000)
    await svc.catalog.saveProduct({ ...pivo, costPrice: 18_000 })
    const b = await svc.lines.addProducts(v0.session.id, [{ productId: pivo.id, qty: 2 }], null)
    // tannarxi farq qilgani uchun alohida qatorlar
    expect(b.lines.map((l) => [l.qty, l.costPrice])).toEqual([[1, 12_000], [2, 18_000]])
    // keyingi qo'shish yangi tannarxdagi qatorga qo'shiladi
    const c = await svc.lines.addProduct(v0.session.id, pivo.id, 1, null)
    expect(c.lines.map((l) => [l.qty, l.costPrice])).toEqual([[1, 12_000], [3, 18_000]])
  })
})

describe('xarajatlar', () => {
  it('standart kategoriyalar; saqlash, ro‘yxat (kunlar oralig‘i), tahrirlash, o‘chirish', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    const cats = await svc.expenses.categories()
    expect(cats.map((c) => c.name)).toEqual(['Ijara', 'Kommunal (svet, gaz, suv)', 'Maosh', 'Mahsulot xaridi', "Ta'mirlash", 'Reklama', 'Boshqa'])
    expect(cats.every((c) => c.active)).toBe(true)
    const ijara = await catId(ctx, 'Ijara')
    const e1 = await svc.expenses.save({ day: '2026-01-15', categoryId: ijara, amount: 100_000, note: '  yanvar  ' })
    expect(e1).toMatchObject({ day: '2026-01-15', categoryName: 'Ijara', amount: 100_000, note: 'yanvar', createdBy: 'Ega', createdAt: clock.t })
    await svc.expenses.save({ day: '2026-01-14', categoryId: ijara, amount: 5_000, note: '' })
    await svc.expenses.save({ day: '2026-01-10', categoryId: ijara, amount: 7_000, note: '' })
    // 14-yanvar 00:00 .. 15-yanvar 23:59:59.999
    const l = await svc.expenses.list({ from: D15 - DAY, to: D15 + DAY - 1 })
    expect(l.map((x) => x.day)).toEqual(['2026-01-14', '2026-01-15'])
    expect((await svc.expenses.list({ from: D15 - 10 * DAY, to: D15 + DAY })).length).toBe(3)
    // to = keyingi kun boshi (ekskluziv) 15-yanvarni qamrab oladi, 16-yanvarni emas
    expect((await svc.expenses.list({ from: D15, to: D15 + DAY })).map((x) => x.amount)).toEqual([100_000])
    const e2 = await svc.expenses.save({ id: e1.id, day: '2026-01-13', categoryId: ijara, amount: 120_000, note: 'x' })
    expect(e2).toMatchObject({ id: e1.id, day: '2026-01-13', amount: 120_000, createdBy: 'Ega' })
    await svc.expenses.remove(e1.id)
    expect((await svc.expenses.list({ from: 0, to: D15 + DAY })).map((x) => x.amount)).toEqual([7_000, 5_000])
    await expect(svc.expenses.remove(e1.id)).rejects.toThrow('Xarajat topilmadi')
  })

  it('tekshiruvlar: kun formati, kelajak, summa, izoh, kategoriya', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const k = await catId(ctx, 'Maosh')
    const ok = { day: '2026-01-15', categoryId: k, amount: 1_000, note: '' }
    await expect(svc.expenses.save({ ...ok, day: '2026-01-16' })).rejects.toThrow("Kelajak kun uchun xarajat yozib bo'lmaydi")
    await expect(svc.expenses.save({ ...ok, day: '2027-01-01' })).rejects.toThrow('Kelajak kun')
    for (const d of ['15-01-2026', '2026-1-5', '2026-02-30', '', 'bugun']) {
      await expect(svc.expenses.save({ ...ok, day: d })).rejects.toThrow("Kun noto'g'ri")
    }
    // bugun (kun oxiri bo'lsa ham) mumkin
    ctx.clock.t = new Date(2026, 0, 15, 23, 59).getTime()
    await svc.expenses.save(ok)
    for (const a of [0, -5, 1.5, NaN]) {
      await expect(svc.expenses.save({ ...ok, amount: a })).rejects.toThrow("Summa musbat butun son bo'lishi kerak")
    }
    await expect(svc.expenses.save({ ...ok, note: 'a'.repeat(201) })).rejects.toThrow('Izoh juda uzun')
    await svc.expenses.save({ ...ok, note: 'a'.repeat(200) })
    await expect(svc.expenses.save({ ...ok, categoryId: 999 })).rejects.toThrow('Xarajat turi topilmadi')
    // nofaol kategoriya
    const nk = await svc.expenses.saveCategory({ id: k, name: 'Maosh', active: false })
    expect(nk.active).toBe(false)
    await expect(svc.expenses.save(ok)).rejects.toThrow('Xarajat turi faol emas')
    expect((await svc.expenses.categories()).find((c) => c.id === k)!.active).toBe(false)
  })

  it('saveCategory: bo‘sh nom va takror rad etiladi; yangi qo‘shiladi, nomi o‘zgaradi', async () => {
    const ctx = await setup()
    const { svc } = ctx
    await expect(svc.expenses.saveCategory({ name: '  ', active: true })).rejects.toThrow('Xarajat turi nomini kiriting')
    await expect(svc.expenses.saveCategory({ name: 'ijara', active: true })).rejects.toThrow('Bunday xarajat turi allaqachon bor')
    const n = await svc.expenses.saveCategory({ name: 'Soliq', active: true })
    expect(n).toMatchObject({ name: 'Soliq', active: true })
    await expect(svc.expenses.saveCategory({ id: n.id, name: 'Boshqa', active: true })).rejects.toThrow('allaqachon')
    expect((await svc.expenses.saveCategory({ id: n.id, name: 'Soliq', active: false })).active).toBe(false)
    expect((await svc.expenses.saveCategory({ id: n.id, name: 'Soliqlar', active: false })).name).toBe('Soliqlar')
  })

  it('ruxsatlar: ega va administrator yozadi; kassir/ofitsiant — yo‘q', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const k = await catId(ctx, 'Reklama')
    const body = { day: '2026-01-15', categoryId: k, amount: 1_000, note: '' }
    await ctx.loginAs('admin')
    const e = await svc.expenses.save(body)
    await svc.expenses.saveCategory({ name: 'Admin turi', active: true })
    expect((await svc.expenses.list(RANGE_WIDE)).length).toBe(1)
    await svc.expenses.remove(e.id)
    for (const who of ['cashier', 'waiter', 'waiter2'] as const) {
      await ctx.loginAs('owner')
      const e2 = await svc.expenses.save(body)
      await ctx.loginAs(who)
      await expect(svc.expenses.save(body)).rejects.toThrow(DENIED)
      await expect(svc.expenses.save({ ...body, id: e2.id, amount: 5 })).rejects.toThrow(DENIED)
      await expect(svc.expenses.remove(e2.id)).rejects.toThrow(DENIED)
      await expect(svc.expenses.saveCategory({ name: 'Y', active: true })).rejects.toThrow(DENIED)
      await expect(svc.expenses.list(RANGE_WIDE)).rejects.toThrow(DENIED)
      await expect(svc.expenses.categories()).rejects.toThrow(DENIED)
      await expect(svc.profit.report(RANGE_WIDE)).rejects.toThrow(DENIED)
    }
    // tizimga kirmagan
    await svc.auth.logout()
    await expect(svc.expenses.list(RANGE_WIDE)).rejects.toThrow()
  })

  it('administrator tannarxli mahsulot saqlay olmaydi (settings.manage), lekin hisobotni ko‘radi', async () => {
    const ctx = await setup()
    await ctx.loginAs('admin')
    await expect(ctx.svc.profit.report(RANGE)).resolves.toBeTruthy()
    const p = await productByName(ctx.svc, 'Suv 0.5 L')
    await expect(ctx.svc.catalog.saveProduct({ ...p, costPrice: 1 })).rejects.toThrow(DENIED)
  })
})

describe('profit.report', () => {
  it('qo‘lda hisoblangan summalar: tushum, tannarx, ofitsiant, oshxona, xarajat, foyda, byDay', async () => {
    const ctx = await scenario()
    const { svc } = ctx
    const ijara = await catId(ctx, 'Ijara')
    const kom = await catId(ctx, 'Kommunal')
    await svc.expenses.save({ day: '2026-01-15', categoryId: ijara, amount: 100_000, note: '' })
    await svc.expenses.save({ day: '2026-01-16', categoryId: kom, amount: 30_000, note: '' })
    await svc.expenses.save({ day: '2026-01-16', categoryId: ijara, amount: 20_000, note: '' })
    await svc.expenses.save({ day: '2026-01-14', categoryId: ijara, amount: 7_000, note: '' }) // oraliqdan tashqarida

    const r = await svc.profit.report(RANGE)
    expect(r.range).toEqual(RANGE)
    // 150 000 + 15 000 + 20 000
    expect(r.revenue).toBe(185_000)
    expect(r.serviceCharge).toBe(0)
    // Pivo 2×12 000 + Lag'mon 20 000 + Suv 3×3 000 + Pivo(16-yan) 1×15 000
    expect(r.cogs).toBe(24_000 + 20_000 + 9_000 + 15_000)
    // Shashlik (tannarxsiz)
    expect(r.noCostSales).toBe(25_000)
    // Sardor 10%: Pivo 2×20 000 + Shashlik 25 000 + Lag'mon 35 000 = 100 000
    expect(r.waiterCommission).toBe(10_000)
    expect(r.kitchenDue).toBe(35_000)
    expect(r.expenses).toBe(150_000)
    expect(r.expensesByCategory).toEqual([
      { categoryId: ijara, name: 'Ijara', amount: 120_000 },
      { categoryId: kom, name: 'Kommunal (svet, gaz, suv)', amount: 30_000 }
    ])
    expect(r.netProfit).toBe(r.revenue - r.cogs - r.waiterCommission - r.kitchenDue - r.expenses)
    expect(r.netProfit).toBe(-78_000)
    expect(r.marginPct).toBe(-42.2)
    expect(r.debtIssued).toBe(20_000)
    expect(r.byDay).toEqual([
      { day: '2026-01-15', revenue: 165_000, expenses: 100_000, profit: -33_000 },
      { day: '2026-01-16', revenue: 20_000, expenses: 50_000, profit: -45_000 }
    ])
    expect(r.byDay.reduce((s, d) => s + d.profit, 0)).toBe(r.netProfit)
    // Mavjud hisobotlar bilan mos
    const sales = await svc.reports.sales(RANGE)
    expect(r.revenue).toBe(sales.total)
    expect(r.waiterCommission).toBe(sales.byWaiter.reduce((s, w) => s + w.commission, 0))
    const kd = await svc.kitchen.daily('2026-01')
    expect(r.kitchenDue).toBe(kd.reduce((s, d) => s + d.due, 0))
  })

  it('tannarx muzlatilgan: mahsulot tannarxi o‘zgarsa avvalgi oraliq hisoboti o‘zgarmaydi', async () => {
    const { svc, pivo } = await scenario()
    const day15 = { from: D15, to: D15 + DAY }
    const before = await svc.profit.report(day15)
    expect(before.cogs).toBe(24_000 + 20_000 + 9_000)
    await svc.catalog.saveProduct({ ...pivo, costPrice: 99_000 })
    expect(await svc.profit.report(day15)).toEqual(before)
  })

  it('xarajatsiz yoki tushumsiz kunlar ham byDay da (agar biri bo‘lsa); bo‘sh oraliq — nollar', async () => {
    const ctx = await scenario()
    const { svc } = ctx
    const k = await catId(ctx, 'Boshqa')
    await svc.expenses.save({ day: '2026-01-14', categoryId: k, amount: 7_000, note: '' })
    const r = await svc.profit.report(RANGE_WIDE)
    expect(r.byDay.map((d) => d.day)).toEqual(['2026-01-14', '2026-01-15', '2026-01-16'])
    expect(r.byDay[0]).toEqual({ day: '2026-01-14', revenue: 0, expenses: 7_000, profit: -7_000 })
    expect(r.byDay[2]).toMatchObject({ revenue: 20_000, expenses: 0, profit: 5_000 })
    const empty = await svc.profit.report({ from: D15 + 10 * DAY, to: D15 + 11 * DAY })
    expect(empty).toMatchObject({ revenue: 0, cogs: 0, expenses: 0, netProfit: 0, marginPct: 0, debtIssued: 0, byDay: [], expensesByCategory: [] })
    await expect(svc.profit.report({ from: 5, to: 1 })).rejects.toThrow("Hisobot oralig'i noto'g'ri")
  })

  it('obsluga tushumga kiradi; bekor qilingan sessiya kirmaydi', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { svc, rooms, clock } = ctx
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advance(HOUR)
    // 50 000 + 5 000 obsluga
    await svc.checkout.pay(v0.session.id, [{ method: 'card', amount: 55_000 }], null)
    const v1 = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.sessions.cancel(v1.session.id)
    const r = await svc.profit.report({ from: D15, to: D15 + DAY })
    expect(r).toMatchObject({ revenue: 55_000, serviceCharge: 5_000, cogs: 0, netProfit: 55_000, marginPct: 100 })
    expect(r.revenue).toBe((await svc.reports.sales({ from: D15, to: D15 + DAY })).total)
  })
})

describe('litsenziya va API ro‘yxati', () => {
  it('expenses/profit apiMethods da; muddat tugaganda faqat o‘qish ishlaydi', async () => {
    const names = API_METHODS.map((m) => m.group + '.' + m.method)
    for (const n of ['expenses.list', 'expenses.save', 'expenses.remove', 'expenses.categories', 'expenses.saveCategory', 'profit.report']) {
      expect(names).toContain(n)
    }
    const ctx = await setup()
    const k = await catId(ctx, 'Ijara')
    const gate = { isBlocked: () => true, blockedMessage: () => 'Litsenziya muddati tugagan', touch: () => undefined, sync: () => undefined }
    const api = createLicensedApi(ctx.svc, gate)
    await api.expenses.list(RANGE)
    await api.expenses.categories()
    await api.profit.report(RANGE)
    await expect(api.expenses.save({ day: '2026-01-15', categoryId: k, amount: 1, note: '' })).rejects.toThrow('Litsenziya muddati tugagan')
    await expect(api.expenses.remove(1)).rejects.toThrow('Litsenziya muddati tugagan')
    await expect(api.expenses.saveCategory({ name: 'Z', active: true })).rejects.toThrow('Litsenziya muddati tugagan')
  })
})

describe('migratsiya v5 → v6 va zaxira', () => {
  async function buildV5(): Promise<Uint8Array> {
    const SQL = await loadSqlJs()
    const db = new SQL.Database()
    db.run('PRAGMA foreign_keys = ON')
    for (let i = 0; i < 5; i++) db.exec(MIGRATIONS[i])
    db.run('PRAGMA user_version = 5')
    db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(1,'Ega','owner',?,1,0,0,0,0)", [hashPin('1234')])
    db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(1,'Sauna 1',60000,6,1,1)")
    db.run("INSERT INTO categories(id, name, sort_order) VALUES(1,'Ichimliklar',1)")
    db.run("INSERT INTO products(id, category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(1,1,'Pivo',20000,10,1,2,1)")
    db.run(
      `INSERT INTO sessions(id, kind, room_id, status, opened_at, closed_at, opened_by, closed_by, cancelled, receipt_no, time_total, lines_total,
         discount_applied, total, service_charge_pct, service_charge) VALUES(1,'room',1,'closed',?,?,1,1,0,1,60000,40000,0,100000,0,0)`,
      [T0 - 3 * HOUR, T0 - 2 * HOUR]
    )
    db.run("INSERT INTO order_lines(session_id, kind, ref_id, name, unit_price, qty, returned_qty, created_at, created_by, department) VALUES(1,'product',1,'Pivo',20000,2,0,?,1,'bar')", [T0 - 3 * HOUR])
    db.run("INSERT INTO payments(session_id, method, amount, at, by) VALUES(1,'cash',100000,?,1)", [T0 - 2 * HOUR])
    const b = db.export()
    db.close()
    return b
  }

  it('eski ma‘lumot saqlanadi, tannarx 0, standart kategoriyalar, hisobot ishlaydi', async () => {
    const file = path.join(dir, 'delfin.db')
    fs.writeFileSync(file, await buildV5())
    const svc = await PosService.create({ file, clock: new FakeClock().now })
    expect(svc.db.version).toBeGreaterThanOrEqual(6)
    await svc.auth.login(1, '1234')
    const p = (await svc.catalog.products(true))[0]
    expect(p).toMatchObject({ name: 'Pivo', price: 20_000, stock: 10, costPrice: 0 })
    expect((await svc.expenses.categories()).length).toBe(7)
    expect(await svc.expenses.list({ from: 0, to: T0 })).toEqual([])
    const r = await svc.profit.report({ from: T0 - DAY, to: T0 })
    expect(r).toMatchObject({ revenue: 100_000, cogs: 0, noCostSales: 40_000, netProfit: 100_000 })
    expect((await svc.sessions.detail(1)).view.lines[0].costPrice).toBe(0)
    svc.db.close()
    // qayta ochilganda migratsiya takrorlanmaydi
    const again = await PosService.create({ file, clock: new FakeClock().now })
    await again.auth.login(1, '1234')
    expect((await again.expenses.categories()).length).toBe(7)
    again.db.close()
  })

  it('zaxira nusxa/tiklash xarajatlar, kategoriyalar va tannarxni qamraydi', async () => {
    const ctx = await scenario()
    const { svc } = ctx
    const nk = await svc.expenses.saveCategory({ name: 'Soliq', active: true })
    await svc.expenses.save({ day: '2026-01-15', categoryId: nk.id, amount: 9_000, note: 'zaxira' })
    const before = await svc.profit.report(RANGE)
    const bytes = svc.exportBytes()
    await svc.expenses.remove((await svc.expenses.list(RANGE))[0].id)
    await svc.expenses.saveCategory({ id: nk.id, name: 'Soliq', active: false })
    await svc.restoreBytes(bytes)
    await ctx.loginAs('owner')
    expect(await svc.profit.report(RANGE)).toEqual(before)
    expect((await svc.expenses.categories()).find((c) => c.name === 'Soliq')!.active).toBe(true)
    expect((await svc.expenses.list(RANGE))[0]).toMatchObject({ amount: 9_000, note: 'zaxira' })
  })
})
