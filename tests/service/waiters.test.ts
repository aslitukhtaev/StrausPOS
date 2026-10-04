import { describe, expect, it } from 'vitest'
import { HOUR, T0, kitchenSetup, productByName, serviceByName, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

/** Sessiyani to'liq to'lab yopish */
async function payAll(ctx: Ctx, sessionId: number) {
  const v = await ctx.svc.sessions.get(sessionId)
  return ctx.svc.checkout.pay(sessionId, [{ method: 'cash', amount: v.total }], null)
}

function frozen(ctx: Ctx, sessionId: number) {
  return ctx.svc.db.get<{ product_sales: number | null; waiter_commission: number | null; waiter_pct: number; waiter_id: number | null }>(
    'SELECT product_sales, waiter_commission, waiter_pct, waiter_id FROM sessions WHERE id=?',
    [sessionId]
  )!
}

describe('ofitsiant qatorda (2026-10: xonaga biriktirilmaydi)', () => {
  it('xona ofitsiantsiz ochiladi; kassir/ega qo‘shganda "kim olib bordi" ixtiyoriy — qatorga yoziladi', async () => {
    const { svc, rooms, staff } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    expect(v0.session).toMatchObject({ waiterId: null, waiterPct: 0 })
    expect(v0.waiterName).toBeNull()
    await svc.lines.addProduct(v0.session.id, beer.id, 2, null, staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, beer.id, 1, null, staff.waiter.id) // o'sha qatorga qo'shiladi
    await svc.lines.addProduct(v0.session.id, beer.id, 1, null) // ofitsiantsiz — alohida qator
    const v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null, staff.waiter2.id) // boshqa ofitsiant — alohida
    expect(v.lines.map((l) => [l.qty, l.waiterId, l.waiterPct, l.department])).toEqual([
      [3, staff.waiter.id, 10, 'bar'],
      [1, null, 0, 'bar'],
      [1, staff.waiter2.id, 12, 'bar']
    ])
    expect(v.session.waiterId).toBeNull()
  })

  it('faqat faol ofitsiant tanlanadi (xato atomik: qator ham, ombor ham o‘zgarmaydi)', async () => {
    const { svc, rooms, staff } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await expect(svc.lines.addProduct(v0.session.id, beer.id, 1, null, staff.cashier.id)).rejects.toThrow('Ofitsiant topilmadi')
    await expect(svc.lines.addProduct(v0.session.id, beer.id, 1, null, 99999)).rejects.toThrow('Ofitsiant topilmadi')
    await svc.staff.save({ ...staff.waiter2, pin: '', active: false })
    await expect(svc.lines.addProducts(v0.session.id, [{ productId: beer.id, qty: 1 }], null, staff.waiter2.id)).rejects.toThrow('faol emas')
    expect((await svc.sessions.get(v0.session.id)).lines).toEqual([])
    expect((await productByName(svc, 'Pivo 0.5 L')).stock).toBe(beer.stock)
  })

  it('ofitsiant o‘zi kirsa — qator unga yoziladi (parametr e’tiborsiz); kassir+isWaiter ham o‘zi', async () => {
    const { svc, rooms, staff, loginAs } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    await loginAs('waiter')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    let v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null, staff.waiter2.id)
    expect(v.lines[0]).toMatchObject({ waiterId: staff.waiter.id, waiterPct: 10, createdBy: staff.waiter.id })
    v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null, 99999) // noto'g'ri id ham e'tiborsiz
    expect(v.lines).toHaveLength(1)
    expect(v.lines[0].qty).toBe(2)
    await loginAs('waiter2')
    v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null, null)
    expect(v.lines[1]).toMatchObject({ waiterId: staff.waiter2.id, waiterPct: 12 })
  })

  it('xonasiz bar savdosida ofitsiant yo‘q (waiterId e’tiborsiz, ofitsiant o‘zi qo‘shsa ham)', async () => {
    const { svc, staff, loginAs } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const b = await svc.barSales.open()
    let v = await svc.lines.addProduct(b.session.id, beer.id, 1, null, staff.waiter.id)
    expect(v.lines[0]).toMatchObject({ waiterId: null, waiterPct: 0 })
    await loginAs('waiter2')
    v = await svc.lines.addProduct(b.session.id, beer.id, 1, null)
    expect(v.lines.every((l) => l.waiterId === null)).toBe(true)
  })
})

describe('ofitsiant haqi', () => {
  it('bar + oshxona mahsulotlari qatorlari: xizmat va vaqt kirmaydi, qaytarish ayiriladi, chegirma ta’sir qilmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms, staff, clock, loginAs } = ctx
    const k = await kitchenSetup(svc)
    const beer = await productByName(svc, 'Pivo 0.5 L') // 20 000
    const chips = await productByName(svc, 'Chips') // 12 000
    const massage = await serviceByName(svc, 'Klassik massaj') // 150 000
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    await svc.lines.addProduct(v0.session.id, beer.id, 3, null, staff.waiter.id) // Sardor 10%
    await svc.lines.addProduct(v0.session.id, k.lagmon.id, 1, v0.guests[0].id, staff.waiter.id) // 35 000
    await svc.lines.addProduct(v0.session.id, chips.id, 1, null, staff.waiter2.id) // Bekzod 12%
    await svc.lines.addProduct(v0.session.id, chips.id, 1, null) // ofitsiantsiz
    await svc.lines.addService(v0.session.id, massage.id, null, staff.provider.id)
    await loginAs('admin')
    const lineId = (await svc.sessions.get(v0.session.id)).lines[0].id
    await svc.lines.returnLine(lineId, 1, 'Iliq') // Sardor pivosi: 2 × 20 000 = 40 000
    await svc.sessions.setDiscount(v0.session.id, 10_000)
    clock.advanceMin(30)
    const r = await payAll(ctx, v0.session.id)
    expect(r.total).toBe(100_000 + 40_000 + 35_000 + 12_000 + 12_000 + 150_000 - 10_000)
    // Sardor: (40 000 + 35 000) × 10% = 7 500; Bekzod: 12 000 × 12% = 1 440
    expect(frozen(ctx, v0.session.id)).toMatchObject({ product_sales: 99_000, waiter_commission: 7_500 + 1_440, waiter_id: null })

    const rep = await svc.reports.sales({ from: T0 - HOUR, to: T0 + HOUR })
    expect(rep.byWaiter).toEqual([
      { staffId: staff.waiter.id, name: 'Sardor', sessions: 1, productSales: 75_000, commission: 7_500 },
      { staffId: staff.waiter2.id, name: 'Bekzod', sessions: 1, productSales: 12_000, commission: 1_440 }
    ])
    expect(await svc.waiters.sessions(staff.waiter.id, '2026-01')).toEqual([
      { sessionId: v0.session.id, closedAt: clock.t, roomName: 'Sauna 1', productSales: 75_000, pct: 10, commission: 7_500 }
    ])
    expect((await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter2.id)).toMatchObject({
      sessions: 1, productSales: 12_000, commission: 1_440
    })
  })

  it('ofitsiantsiz sessiya: savdo yoziladi, haq 0, byWaiter ga kirmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms } = ctx
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(v0.session.id, (await productByName(svc, 'Suv 0.5 L')).id, 2, null)
    await payAll(ctx, v0.session.id)
    expect(frozen(ctx, v0.session.id)).toMatchObject({ product_sales: 10_000, waiter_commission: 0, waiter_id: null })
    expect((await svc.reports.sales({ from: 0, to: T0 + HOUR })).byWaiter).toEqual([])
  })

  it('foiz qatorda muzlatiladi: xodim foizi keyin o‘zgarsa eski qator o‘zgarmaydi, yangisi alohida qator', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 5, null, staff.waiter.id) // 100 000 × 10%
    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 20 })
    const v = await svc.lines.addProduct(a.session.id, beer.id, 1, null, staff.waiter.id) // 20 000 × 20%
    expect(v.lines.map((l) => [l.qty, l.waiterPct])).toEqual([[5, 10], [1, 20]])
    await payAll(ctx, a.session.id)
    expect(frozen(ctx, a.session.id).waiter_commission).toBe(10_000 + 4_000)
    // sessiyada ikki xil foiz → samarali foiz 14 000 / 120 000 = 11.67%
    expect(await svc.waiters.sessions(staff.waiter.id, '2026-01')).toEqual([
      expect.objectContaining({ productSales: 120_000, pct: 11.67, commission: 14_000 })
    ])
    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 50 })
    const m = (await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter.id)!
    expect(m).toMatchObject({ commissionPct: 50, sessions: 1, productSales: 120_000, commission: 14_000 })
  })

  it('kasr foiz qator bo‘yicha yaxlitlanadi (butun so‘m)', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 3.33 })
    const water = await productByName(svc, 'Suv 0.5 L') // 5 000
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    await svc.lines.addProduct(v0.session.id, water.id, 1, v0.guests[0].id, staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, water.id, 1, v0.guests[1].id, staff.waiter.id)
    await payAll(ctx, v0.session.id)
    // har qator: 5 000 × 3.33% = 166.5 → 167; jami 334 (umumiy summadan 10 000 × 3.33% = 333 emas)
    expect(frozen(ctx, v0.session.id).waiter_commission).toBe(334)
    expect((await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter.id)!.commission).toBe(334)
  })

  it('eski sessiyalar (sessiyaga biriktirilgan, muzlatilgan haq) hisobotlarga kiradi', async () => {
    const ctx = await setup()
    const { svc, rooms, staff, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const old = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(old.session.id, beer.id, 2, null)
    await payAll(ctx, old.session.id)
    // 2026-10 gacha yopilgan sessiya ko'rinishi: sessiya darajasida ofitsiant va muzlatilgan haq
    svc.db.run('UPDATE sessions SET waiter_id=?, waiter_pct=10, product_sales=40000, waiter_commission=4000 WHERE id=?', [staff.waiter.id, old.session.id])
    clock.advanceMin(5)
    const now = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.lines.addProduct(now.session.id, beer.id, 1, null, staff.waiter.id) // 2 000
    await payAll(ctx, now.session.id)
    expect((await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter.id)).toMatchObject({
      sessions: 2, productSales: 60_000, commission: 6_000
    })
    expect((await svc.waiters.sessions(staff.waiter.id, '2026-01')).map((r) => [r.sessionId, r.roomName, r.commission])).toEqual([
      [old.session.id, 'Sauna 1', 4_000],
      [now.session.id, 'Sauna 2', 2_000]
    ])
    expect((await svc.reports.sales({ from: 0, to: T0 + HOUR })).byWaiter).toEqual([
      { staffId: staff.waiter.id, name: 'Sardor', sessions: 2, productSales: 60_000, commission: 6_000 }
    ])
    expect((await svc.sessions.get(old.session.id)).waiterName).toBe('Sardor')
  })
})

describe('oylik hisob-kitob', () => {
  async function scenario() {
    const ctx = await setup()
    const { svc, rooms, staff, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    // Yanvar: Sardor 2 sessiya, Bekzod 1 sessiya
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 2, null, staff.waiter.id) // 40 000 → 4 000
    await payAll(ctx, a.session.id)
    const b = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.lines.addProduct(b.session.id, beer.id, 5, null, staff.waiter2.id) // 100 000 → 12 000
    await payAll(ctx, b.session.id)
    // Yanvarning oxirgi daqiqasi (mahalliy vaqt) — yanvarga
    clock.t = new Date(2026, 0, 31, 23, 0).getTime()
    const c = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(c.session.id, beer.id, 1, null, staff.waiter.id) // 20 000 → 2 000
    clock.t = new Date(2026, 0, 31, 23, 59, 59).getTime()
    await payAll(ctx, c.session.id)
    // Fevral 1 00:00 — fevralga
    const d = await svc.sessions.open(rooms.vip, 1, 60)
    await svc.lines.addProduct(d.session.id, beer.id, 3, null, staff.waiter.id) // 60 000 → 6 000
    clock.t = new Date(2026, 1, 1, 0, 0, 0).getTime()
    await payAll(ctx, d.session.id)
    // Bekor qilingan va ochiq sessiyalar hisobga kirmaydi
    const e = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.sessions.cancel(e.session.id)
    const f = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.lines.addProduct(f.session.id, beer.id, 1, null, staff.waiter.id)
    return { ...ctx, ids: { a: a.session.id, c: c.session.id, d: d.session.id } }
  }

  it('monthly: oy mahalliy vaqt bo‘yicha, faqat yopilgan va bekor qilinmagan sessiyalar', async () => {
    const { svc, staff, ids } = await scenario()
    const jan = await svc.waiters.monthly('2026-01')
    expect(jan).toEqual([
      { staffId: staff.waiter2.id, name: 'Bekzod', commissionPct: 12, sessions: 1, productSales: 100_000, commission: 12_000, paid: 0, balance: 12_000 },
      { staffId: staff.waiter.id, name: 'Sardor', commissionPct: 10, sessions: 2, productSales: 60_000, commission: 6_000, paid: 0, balance: 6_000 }
    ])
    const feb = await svc.waiters.monthly('2026-02')
    expect(feb.find((x) => x.staffId === staff.waiter.id)).toMatchObject({ sessions: 1, productSales: 60_000, commission: 6_000 })
    // faol ofitsiantlar savdosiz oyda ham ko'rinadi (0 bilan)
    expect(feb.find((x) => x.staffId === staff.waiter2.id)).toMatchObject({ sessions: 0, commission: 0, balance: 0 })
    const rows = await svc.waiters.sessions(staff.waiter.id, '2026-01')
    expect(rows.map((r) => r.sessionId)).toEqual([ids.a, ids.c])
    expect((await svc.waiters.sessions(staff.waiter.id, '2026-02')).map((r) => r.sessionId)).toEqual([ids.d])
    expect(await svc.waiters.sessions(staff.waiter.id, '2025-12')).toEqual([])
  })

  it('payout: balans kamayadi, oyga bog‘lanadi, ro‘yxat; tekshiruvlar', async () => {
    const { svc, staff, clock } = await scenario()
    const p1 = await svc.waiters.payout(staff.waiter.id, '2026-01', 4_000, '  avans ')
    expect(p1).toMatchObject({ staffId: staff.waiter.id, month: '2026-01', amount: 4_000, note: 'avans', at: clock.t, by: staff.owner.id })
    await svc.waiters.payout(staff.waiter.id, '2026-01', 2_500, '')
    const jan = (await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter.id)!
    expect(jan).toMatchObject({ commission: 6_000, paid: 6_500, balance: -500 })
    expect((await svc.waiters.monthly('2026-02')).find((x) => x.staffId === staff.waiter.id)).toMatchObject({ paid: 0, balance: 6_000 })
    expect((await svc.waiters.payouts(staff.waiter.id, '2026-01')).map((p) => p.amount)).toEqual([4_000, 2_500])
    expect(await svc.waiters.payouts(staff.waiter.id, '2026-02')).toEqual([])

    await expect(svc.waiters.payout(staff.waiter.id, '2026-1', 1000, '')).rejects.toThrow('Oy noto')
    await expect(svc.waiters.payout(staff.waiter.id, '2026-13', 1000, '')).rejects.toThrow('Oy noto')
    await expect(svc.waiters.monthly('yanvar')).rejects.toThrow('Oy noto')
    await expect(svc.waiters.payout(staff.waiter.id, '2026-01', 0, '')).rejects.toThrow('Summa')
    await expect(svc.waiters.payout(staff.waiter.id, '2026-01', 10.5, '')).rejects.toThrow('Summa')
    await expect(svc.waiters.payout(staff.cashier.id, '2026-01', 1000, '')).rejects.toThrow('ofitsiant emas')
    await expect(svc.waiters.payout(99999, '2026-01', 1000, '')).rejects.toThrow('Xodim topilmadi')
    expect(await svc.waiters.payouts(staff.waiter.id, '2026-01')).toHaveLength(2)
  })

  it('faolsizlantirilgan ofitsiant: hisobi bor oyda ko‘rinadi, waiters.list da yo‘q', async () => {
    const { svc, staff } = await scenario()
    await svc.staff.save({ ...staff.waiter2, pin: '', active: false })
    expect((await svc.waiters.list()).map((s) => s.name)).toEqual(['Sardor'])
    expect((await svc.waiters.monthly('2026-01')).some((x) => x.staffId === staff.waiter2.id)).toBe(true)
    expect((await svc.waiters.monthly('2026-02')).some((x) => x.staffId === staff.waiter2.id)).toBe(false)
  })
})

describe('xodimlar: ofitsiant maydonlari', () => {
  it('waiter roli avtomatik isWaiter; admin/kassir ham ofitsiant bo‘la oladi; foiz 0..100', async () => {
    const { svc, staff } = await setup()
    expect(staff.waiter).toMatchObject({ role: 'waiter', isWaiter: true, commissionPct: 10 })
    expect(staff.waiter2).toMatchObject({ role: 'cashier', isWaiter: true, commissionPct: 12 })
    expect(staff.cashier).toMatchObject({ isWaiter: false, commissionPct: 0 })
    const w = await svc.staff.save({ name: 'Ali', role: 'waiter', pin: '8888', isProvider: false, isWaiter: false, commissionPct: 5, active: true })
    expect(w.isWaiter).toBe(true)
    const adm = await svc.staff.save({ ...staff.admin, pin: '', isWaiter: true, commissionPct: 3 })
    expect(adm).toMatchObject({ role: 'admin', isWaiter: true, commissionPct: 3 })
    for (const bad of [-1, 100.5, NaN, Infinity])
      await expect(svc.staff.save({ ...staff.admin, pin: '', commissionPct: bad })).rejects.toThrow('Foiz 0 dan 100')
    await expect(svc.staff.save({ ...staff.admin, pin: '', role: 'boss' as 'admin' })).rejects.toThrow('Lavozim')
    // maydonlar yuborilmasa — eski qiymat saqlanadi
    const { isWaiter: _i, commissionPct: _c, ...rest } = staff.waiter2
    const kept = await svc.staff.save({ ...(rest as typeof staff.waiter2), pin: '' })
    expect(kept).toMatchObject({ isWaiter: true, commissionPct: 12 })
    expect((await svc.waiters.list()).map((s) => s.name)).toEqual(['Admin', 'Ali', 'Bekzod', 'Sardor'])
    expect((await svc.auth.listLoginStaff()).at(-1)?.role).toBe('waiter')
  })
})

describe('ruxsatlar: ofitsiant roli', () => {
  it('ofitsiant: xona ochadi, mahsulot qo‘shadi, vaqt qo‘shadi; to‘lov/qaytarish/chegirma/hisobot — yo‘q', async () => {
    const { svc, rooms, staff, clock, loginAs } = await setup()
    const login = await svc.auth.login(staff.waiter.id, '5555')
    expect(login.permissions).toEqual(['session.open', 'session.manage'])
    await loginAs('waiter')
    expect((await svc.waiters.list()).length).toBe(2)
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null)
    expect(v.lines[0].waiterId).toBe(staff.waiter.id)
    await svc.lines.addProducts(v0.session.id, [{ productId: beer.id, qty: 1 }], null)
    await svc.sessions.extendAll(v0.session.id, 60)
    await svc.checkout.preBill(v0.session.id)
    clock.advanceMin(10)
    await expect(svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 1 }], null)).rejects.toThrow(DENIED)
    await expect(svc.lines.returnLine(v.lines[0].id, 1, '')).rejects.toThrow(DENIED)
    await expect(svc.sessions.setDiscount(v0.session.id, 1000)).rejects.toThrow(DENIED)
    await expect(svc.reports.sales({ from: 0, to: 1 })).rejects.toThrow(DENIED)
    await expect(svc.waiters.monthly('2026-01')).rejects.toThrow(DENIED)
    await expect(svc.waiters.sessions(staff.waiter.id, '2026-01')).rejects.toThrow(DENIED)
    await expect(svc.waiters.payouts(staff.waiter.id, '2026-01')).rejects.toThrow(DENIED)
    await expect(svc.waiters.payout(staff.waiter.id, '2026-01', 1000, '')).rejects.toThrow(DENIED)
    await expect(svc.debts.list(true)).rejects.toThrow(DENIED)
    await expect(svc.catalog.adjustStock(beer.id, 1, '')).rejects.toThrow(DENIED)
    await expect(svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 99 })).rejects.toThrow(DENIED)
    await expect(svc.sessions.cancel(v0.session.id)).rejects.toThrow('buyurtmalar bor')
  })

  it('admin: oylik hisobni ko‘radi, lekin pul bera olmaydi; kassir — hech biri', async () => {
    const { svc, staff, loginAs } = await setup()
    await loginAs('admin')
    await expect(svc.waiters.monthly('2026-01')).resolves.toBeTruthy()
    await expect(svc.waiters.payouts(staff.waiter.id, '2026-01')).resolves.toEqual([])
    await expect(svc.waiters.payout(staff.waiter.id, '2026-01', 1000, '')).rejects.toThrow(DENIED)
    await loginAs('cashier')
    await expect(svc.waiters.list()).resolves.toHaveLength(2)
    await expect(svc.waiters.monthly('2026-01')).rejects.toThrow(DENIED)
    await svc.auth.logout()
    await expect(svc.waiters.list()).rejects.toThrow('Avval tizimga kiring')
  })
})
