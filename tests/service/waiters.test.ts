import { describe, expect, it } from 'vitest'
import { HOUR, T0, productByName, serviceByName, setup } from './helpers'
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

describe('ofitsiant biriktirish', () => {
  it('open bilan biriktirish: foiz muzlatiladi, waiterName ko‘rinadi', async () => {
    const { svc, rooms, staff } = await setup()
    const v = await svc.sessions.open(rooms.s1, 2, 60, staff.waiter.id)
    expect(v.session).toMatchObject({ waiterId: staff.waiter.id, waiterPct: 10 })
    expect(v.waiterName).toBe('Sardor')
    const card = (await svc.rooms.board()).find((c) => c.room.id === rooms.s1)!
    expect(card.session?.waiterName).toBe('Sardor')
  })

  it('faqat faol ofitsiant biriktiriladi (xato atomik)', async () => {
    const { svc, rooms, staff } = await setup()
    await expect(svc.sessions.open(rooms.s1, 1, 60, staff.cashier.id)).rejects.toThrow('Ofitsiant topilmadi')
    await expect(svc.sessions.open(rooms.s1, 1, 60, 99999)).rejects.toThrow('Ofitsiant topilmadi')
    await svc.staff.save({ ...staff.waiter2, pin: '', active: false })
    await expect(svc.sessions.open(rooms.s1, 1, 60, staff.waiter2.id)).rejects.toThrow('faol emas')
    expect((await svc.rooms.board()).every((c) => c.session === null)).toBe(true)
  })

  it('setWaiter: almashtirish (yangi foiz muzlatiladi), olib tashlash, noto‘g‘ri xodim', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    const v0 = await svc.sessions.open(rooms.s1, 1, 60, null)
    let v = await svc.sessions.setWaiter(v0.session.id, staff.waiter.id)
    expect(v.session).toMatchObject({ waiterId: staff.waiter.id, waiterPct: 10 })
    v = await svc.sessions.setWaiter(v0.session.id, staff.waiter2.id) // kassir + isWaiter
    expect(v.session).toMatchObject({ waiterId: staff.waiter2.id, waiterPct: 12 })
    expect(v.waiterName).toBe('Bekzod')
    await expect(svc.sessions.setWaiter(v0.session.id, staff.admin.id)).rejects.toThrow('Ofitsiant topilmadi')
    expect((await svc.sessions.get(v0.session.id)).session.waiterId).toBe(staff.waiter2.id)
    v = await svc.sessions.setWaiter(v0.session.id, null)
    expect(v.session).toMatchObject({ waiterId: null, waiterPct: 0 })
    expect(v.waiterName).toBeNull()
    await payAll(ctx, v0.session.id)
    await expect(svc.sessions.setWaiter(v0.session.id, staff.waiter.id)).rejects.toThrow('Sessiya yopilgan')
  })
})

describe('ofitsiant haqi', () => {
  it('faqat bar mahsulotlaridan: xizmat va vaqt kirmaydi, qaytarish ayiriladi, chegirma ta’sir qilmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms, staff, clock, loginAs } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L') // 20 000
    const massage = await serviceByName(svc, 'Klassik massaj') // 150 000
    const v0 = await svc.sessions.open(rooms.s1, 2, 60, staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, beer.id, 3, null)
    await svc.lines.addProduct(v0.session.id, beer.id, 1, v0.guests[0].id)
    await svc.lines.addService(v0.session.id, massage.id, null, staff.provider.id)
    await loginAs('admin')
    const lineId = (await svc.sessions.get(v0.session.id)).lines[0].id
    await svc.lines.returnLine(lineId, 1, 'Iliq') // 3 ta bar mahsuloti qoladi = 60 000
    await svc.sessions.setDiscount(v0.session.id, 10_000)
    clock.advanceMin(30)
    const r = await payAll(ctx, v0.session.id)
    expect(r.total).toBe(100_000 + 60_000 + 150_000 - 10_000)
    expect(frozen(ctx, v0.session.id)).toMatchObject({ product_sales: 60_000, waiter_commission: 6_000, waiter_pct: 10 })

    const rep = await svc.reports.sales({ from: T0 - HOUR, to: T0 + HOUR })
    expect(rep.byWaiter).toEqual([{ staffId: staff.waiter.id, name: 'Sardor', sessions: 1, productSales: 60_000, commission: 6_000 }])
    const rows = await svc.waiters.sessions(staff.waiter.id, '2026-01')
    expect(rows).toEqual([{ sessionId: v0.session.id, closedAt: clock.t, roomName: 'Sauna 1', productSales: 60_000, pct: 10, commission: 6_000 }])
  })

  it('ofitsiantsiz sessiya: savdo yoziladi, haq 0, byWaiter ga kirmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms } = ctx
    const v0 = await svc.sessions.open(rooms.s1, 1, 60, null)
    await svc.lines.addProduct(v0.session.id, (await productByName(svc, 'Suv 0.5 L')).id, 2, null)
    await payAll(ctx, v0.session.id)
    expect(frozen(ctx, v0.session.id)).toMatchObject({ product_sales: 10_000, waiter_commission: 0, waiter_id: null })
    expect((await svc.reports.sales({ from: 0, to: T0 + HOUR })).byWaiter).toEqual([])
  })

  it('foiz muzlatiladi: xodim foizi keyin o‘zgarsa ham eski sessiya o‘zgarmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const a = await svc.sessions.open(rooms.s1, 1, 60, staff.waiter.id) // 10%
    await svc.lines.addProduct(a.session.id, beer.id, 5, null) // 100 000
    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 20 })
    // ochiq sessiyada ham biriktirish paytidagi foiz
    expect((await svc.sessions.get(a.session.id)).session.waiterPct).toBe(10)
    await payAll(ctx, a.session.id)
    expect(frozen(ctx, a.session.id).waiter_commission).toBe(10_000)

    const b = await svc.sessions.open(rooms.s2, 1, 60, staff.waiter.id) // endi 20%
    await svc.lines.addProduct(b.session.id, beer.id, 1, null)
    await payAll(ctx, b.session.id)
    expect(frozen(ctx, b.session.id).waiter_commission).toBe(4_000)

    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 50 })
    const m = (await svc.waiters.monthly('2026-01')).find((x) => x.staffId === staff.waiter.id)!
    expect(m).toMatchObject({ commissionPct: 50, sessions: 2, productSales: 120_000, commission: 14_000 })
  })

  it('kasr foiz yaxlitlanadi (butun so‘m)', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    await svc.staff.save({ ...staff.waiter, pin: '', commissionPct: 7.5 })
    const v0 = await svc.sessions.open(rooms.s1, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, (await productByName(svc, 'Chips')).id, 1, null) // 12 000
    await payAll(ctx, v0.session.id)
    expect(frozen(ctx, v0.session.id).waiter_commission).toBe(900)
  })
})

describe('oylik hisob-kitob', () => {
  async function scenario() {
    const ctx = await setup()
    const { svc, rooms, staff, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    // Yanvar: Sardor 2 sessiya, Bekzod 1 sessiya
    const a = await svc.sessions.open(rooms.s1, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(a.session.id, beer.id, 2, null) // 40 000 → 4 000
    await payAll(ctx, a.session.id)
    const b = await svc.sessions.open(rooms.s2, 1, 60, staff.waiter2.id)
    await svc.lines.addProduct(b.session.id, beer.id, 5, null) // 100 000 → 12 000
    await payAll(ctx, b.session.id)
    // Yanvarning oxirgi daqiqasi (mahalliy vaqt) — yanvarga
    clock.t = new Date(2026, 0, 31, 23, 0).getTime()
    const c = await svc.sessions.open(rooms.s1, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(c.session.id, beer.id, 1, null) // 20 000 → 2 000
    clock.t = new Date(2026, 0, 31, 23, 59, 59).getTime()
    await payAll(ctx, c.session.id)
    // Fevral 1 00:00 — fevralga
    const d = await svc.sessions.open(rooms.vip, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(d.session.id, beer.id, 3, null) // 60 000 → 6 000
    clock.t = new Date(2026, 1, 1, 0, 0, 0).getTime()
    await payAll(ctx, d.session.id)
    // Bekor qilingan va ochiq sessiyalar hisobga kirmaydi
    const e = await svc.sessions.open(rooms.s2, 1, 60, staff.waiter.id)
    await svc.sessions.cancel(e.session.id)
    const f = await svc.sessions.open(rooms.s2, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(f.session.id, beer.id, 1, null)
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
    const v0 = await svc.sessions.open(rooms.s1, 2, 60, staff.waiter.id)
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v = await svc.lines.addProduct(v0.session.id, beer.id, 1, null)
    await svc.sessions.extendAll(v0.session.id, 60)
    await svc.sessions.setWaiter(v0.session.id, staff.waiter2.id)
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
