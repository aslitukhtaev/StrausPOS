import { describe, expect, it } from 'vitest'
import { BAR_ROOM, VIEW_ONLY_ERROR } from '../../electron/main/PosService'
import { HOUR, MIN, T0, productByName, serviceByName, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

function frozen(ctx: Ctx, sessionId: number) {
  return ctx.svc.db.get<{ kind: string; room_id: number | null; product_sales: number | null; waiter_commission: number | null; waiter_id: number | null }>(
    'SELECT kind, room_id, product_sales, waiter_commission, waiter_id FROM sessions WHERE id=?',
    [sessionId]
  )!
}

async function stockOf(ctx: Ctx, name: string): Promise<number> {
  return (await productByName(ctx.svc, name)).stock
}

describe('bar savdosi: to‘liq oqim', () => {
  it('ochish → mahsulot → X → naqd to‘lov → chek → ombor', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    await ctx.loginAs('cashier')
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const cola = await productByName(svc, 'Coca-Cola 1 L')
    const non = await productByName(svc, 'Non') // ombor kuzatilmaydi

    let v = await svc.barSales.open()
    const id = v.session.id
    expect(v.session).toMatchObject({ kind: 'bar', roomId: 0, status: 'open', waiterId: null, waiterPct: 0, openedBy: ctx.staff.cashier.id })
    expect(v.room).toEqual(BAR_ROOM)
    expect(v.room).toEqual({ id: 0, name: 'Bar', pricePerHour: 0, capacity: 0, active: true, sortOrder: 0 })
    expect(v.guests).toEqual([])
    expect(v.waiterName).toBeNull()
    expect(v).toMatchObject({ timeTotal: 0, linesTotal: 0, total: 0, paid: 0, due: 0 })
    expect(frozen(ctx, id)).toMatchObject({ kind: 'bar', room_id: null })

    v = await svc.lines.addProduct(id, pivo.id, 3, null)
    v = await svc.lines.addProduct(id, cola.id, 2, null)
    v = await svc.lines.addProduct(id, non.id, 2, null)
    v = await svc.lines.addProduct(id, pivo.id, 1, null) // o'sha qatorga qo'shiladi
    expect(v.lines.map((l) => [l.name, l.qty, l.guestId])).toEqual([
      ['Pivo 0.5 L', 4, null], ['Coca-Cola 1 L', 2, null], ['Non', 2, null]
    ])
    // 4×20 000 + 2×15 000 + 2×4 000
    expect(v.total).toBe(118_000)
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock - 4)
    expect(await stockOf(ctx, 'Coca-Cola 1 L')).toBe(cola.stock - 2)
    expect(await stockOf(ctx, 'Non')).toBe(non.stock)

    // X: kassirda line.return yo'q → admin qaytaradi
    const pivoLine = v.lines.find((l) => l.refId === pivo.id)!
    await expect(svc.lines.returnLine(pivoLine.id, 1, 'xato')).rejects.toThrow(DENIED)
    await ctx.loginAs('admin')
    v = await svc.lines.returnLine(pivoLine.id, 1, 'ochilmagan')
    expect(v.total).toBe(98_000)
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock - 3)
    expect(svc.listReturns(id)).toHaveLength(1)
    await ctx.loginAs('cashier')

    clock.advanceMin(7) // vaqt o'tishi summaga ta'sir qilmaydi
    expect((await svc.sessions.get(id)).total).toBe(98_000)
    const r = await svc.checkout.pay(id, [{ method: 'cash', amount: 98_000 }], null)
    expect(r).toMatchObject({
      receiptNo: 1, roomName: 'Bar', cashier: 'Kassir', guests: [], timeTotal: 0, linesTotal: 98_000, discount: 0, total: 98_000,
      payments: [{ method: 'cash', amount: 98_000 }], debtor: null, openedAt: T0, closedAt: T0 + 7 * MIN
    })
    expect(r.lines).toEqual([
      { name: 'Pivo 0.5 L', qty: 3, unitPrice: 20_000, amount: 60_000, guestLabel: null, providerName: null },
      { name: 'Coca-Cola 1 L', qty: 2, unitPrice: 15_000, amount: 30_000, guestLabel: null, providerName: null },
      { name: 'Non', qty: 2, unitPrice: 4_000, amount: 8_000, guestLabel: null, providerName: null }
    ])
    expect(frozen(ctx, id)).toMatchObject({ product_sales: 98_000, waiter_commission: 0, waiter_id: null })
    expect(await svc.checkout.receipt(id)).toEqual(r)
    const html = await svc.system.receiptHtml(r)
    expect(html).toContain('Bar')
    expect(html).not.toContain('Vaqt')
    expect(html).toContain('Buyurtmalar jami')

    expect(await svc.barSales.openList()).toEqual([])
    const closed = await svc.sessions.get(id)
    expect(closed.session).toMatchObject({ status: 'closed', kind: 'bar', roomId: 0 })
    await expect(svc.lines.addProduct(id, pivo.id, 1, null)).rejects.toThrow('Sessiya yopilgan')

    const hist = await svc.barSales.history({ from: T0, to: T0 + HOUR })
    expect(hist).toEqual([{ sessionId: id, receiptNo: 1, closedAt: T0 + 7 * MIN, items: 7, total: 98_000, cashier: 'Kassir' }])
  })

  it('aralash (naqd+karta) va qarz to‘lov; qarzdorsiz qarz rad etiladi; noto‘g‘ri summa atomik', async () => {
    const ctx = await setup()
    const { svc } = ctx
    await ctx.loginAs('cashier')
    const pivo = await productByName(svc, 'Pivo 0.5 L')

    const a = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(a, pivo.id, 2, null)
    await expect(svc.checkout.pay(a, [{ method: 'cash', amount: 30_000 }], null)).rejects.toThrow("jami summaga teng emas")
    expect((await svc.sessions.get(a)).session.status).toBe('open')
    const ra = await svc.checkout.pay(a, [{ method: 'cash', amount: 25_000 }, { method: 'card', amount: 15_000 }], null)
    expect(ra.payments).toEqual([{ method: 'cash', amount: 25_000 }, { method: 'card', amount: 15_000 }])

    const b = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(b, pivo.id, 1, null)
    await expect(svc.checkout.pay(b, [{ method: 'debt', amount: 20_000 }], null)).rejects.toThrow('Qarzdorning ismi va telefoni majburiy')
    expect((await svc.sessions.get(b)).payments).toEqual([])
    const rb = await svc.checkout.pay(b, [{ method: 'debt', amount: 20_000 }], { name: 'Ali', phone: '+998901234567' })
    expect(rb).toMatchObject({ roomName: 'Bar', debtor: { name: 'Ali', phone: '+998901234567' }, receiptNo: 2 })
    const debts = await svc.debts.list(true)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ sessionId: b, amount: 20_000, paid: 0, customerName: 'Ali' })
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock - 3)
  })

  it('chegirma (discount.apply) va ombor yetishmasa rad etiladi', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const pista = await productByName(svc, 'Pista') // 10 dona
    const id = (await svc.barSales.open()).session.id
    await expect(svc.lines.addProduct(id, pista.id, 11, null)).rejects.toThrow('Omborda yetarli emas (qoldi: 10)')
    await svc.lines.addProduct(id, pista.id, 2, null)
    const v = await svc.sessions.setDiscount(id, 5_000)
    expect(v.total).toBe(45_000)
    await ctx.loginAs('cashier')
    await expect(svc.sessions.setDiscount(id, 1_000)).rejects.toThrow(DENIED)
  })
})

describe('bar savdosi: rad etilgan amallar', () => {
  it('mehmon/vaqt/ofitsiant/xona/xizmat amallari tushunarli xato bilan rad etiladi (o‘zgarishsiz)', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    await ctx.loginAs('cashier')
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const massaj = await serviceByName(svc, 'Klassik massaj')
    const room = await svc.sessions.open(rooms.s1, 1, 60, null)
    const roomGuest = room.guests[0].id
    const id = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(id, pivo.id, 1, null)
    const before = await svc.sessions.get(id)

    await expect(svc.sessions.addGuest(id, 60)).rejects.toThrow("Bar savdosiga mehmon qo'shib bo'lmaydi")
    await expect(svc.sessions.extendAll(id, 60)).rejects.toThrow('Bar savdosida vaqt hisoblanmaydi')
    await expect(svc.sessions.setWaiter(id, staff.waiter.id)).rejects.toThrow('Bar savdosiga ofitsiant biriktirilmaydi')
    await expect(svc.sessions.setWaiter(id, null)).rejects.toThrow('Bar savdosiga ofitsiant biriktirilmaydi')
    await expect(svc.sessions.moveRoom(id, rooms.s2)).rejects.toThrow("Bar savdosini xonaga o'tkazib bo'lmaydi")
    await expect(svc.lines.addService(id, massaj.id, null, staff.provider.id)).rejects.toThrow("Bar savdosiga xizmat qo'shib bo'lmaydi")
    // Mahsulot mehmonga bog'lanmaydi (hatto boshqa sessiya mehmoni bilan ham)
    await expect(svc.lines.addProduct(id, pivo.id, 1, roomGuest)).rejects.toThrow("Bar savdosida mahsulot mehmonga bog'lanmaydi")
    // Bar savdosida mehmon yo'q — guest* amallari uchun mehmon topilmaydi
    await expect(svc.sessions.extendGuest(999, 60)).rejects.toThrow('Mehmon topilmadi')
    await expect(svc.sessions.guestPause(999)).rejects.toThrow('Mehmon topilmadi')
    // Xona ochishda "Bar" (id 0) xona emas
    await expect(svc.sessions.open(0, 1, 60, null)).rejects.toThrow('Xona topilmadi')

    expect(await svc.sessions.get(id)).toEqual(before)
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock - 1)
    // stopAll — zararsiz (to'lovga tayyorlash), summa o'zgarmaydi
    expect((await svc.sessions.stopAll(id)).total).toBe(20_000)

    // Xona sessiyasi odatdagidek ishlaydi
    expect((await svc.sessions.extendGuest(roomGuest, 60)).guests[0].paidMinutes).toBe(120)
    expect((await svc.sessions.setWaiter(room.session.id, staff.waiter.id)).waiterName).toBe('Sardor')
  })

  it('bazada ham: bar savdosida room_id yoki ofitsiant bo‘lishi mumkin emas (CHECK)', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    expect(() =>
      svc.db.run("INSERT INTO sessions(kind, room_id, status, opened_at, opened_by) VALUES('bar', ?, 'open', 0, ?)", [rooms.s1, staff.owner.id])
    ).toThrow()
    expect(() =>
      svc.db.run("INSERT INTO sessions(kind, room_id, status, opened_at, opened_by, waiter_id) VALUES('bar', NULL, 'open', 0, ?, ?)", [staff.owner.id, staff.waiter.id])
    ).toThrow()
    expect(() => svc.db.run("INSERT INTO sessions(kind, room_id, status, opened_at, opened_by) VALUES('room', NULL, 'open', 0, ?)", [staff.owner.id])).toThrow()
    expect(() => svc.db.run("INSERT INTO sessions(kind, room_id, status, opened_at, opened_by) VALUES('xona', ?, 'open', 0, ?)", [rooms.s1, staff.owner.id])).toThrow()
  })
})

describe('bar savdosi: bekor qilish', () => {
  it('bo‘sh bar savdosini istalgan kassir (vaqtdan qat’i nazar) bekor qila oladi; mahsulot bo‘lsa — yo‘q', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    await ctx.loginAs('cashier')
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const a = (await svc.barSales.open()).session.id
    const b = (await svc.barSales.open()).session.id
    clock.advance(3 * HOUR)
    await ctx.loginAs('waiter') // boshqa xodim ham (session.manage)
    await svc.sessions.cancel(a)
    await ctx.loginAs('cashier')
    await svc.lines.addProduct(b, pivo.id, 1, null)
    await expect(svc.sessions.cancel(b)).rejects.toThrow('Sessiyada buyurtmalar bor')
    await ctx.loginAs('admin')
    await svc.lines.returnLine((await svc.sessions.get(b)).lines[0].id, 1, '')
    await ctx.loginAs('cashier')
    await svc.sessions.cancel(b)
    expect(await svc.barSales.openList()).toEqual([])
    await expect(svc.checkout.receipt(a)).rejects.toThrow('Sessiya bekor qilingan')
    expect(await svc.barSales.history({ from: 0, to: clock.now() + 1 })).toEqual([])
    const rep = await svc.auth.login(ctx.staff.owner.id, '1234').then(() => svc.reports.sales({ from: 0, to: clock.now() + 1 }))
    expect(rep.barSales).toEqual({ count: 0, total: 0 })
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock)
  })
})

describe('bar savdosi: xonalar paneli va bir nechta ochiq savdo', () => {
  it('rooms.board bar savdolarini ko‘rsatmaydi; xona band/bo‘sh holatiga ta’sir qilmaydi', async () => {
    const ctx = await setup()
    const { svc, rooms } = ctx
    await svc.barSales.open()
    await svc.barSales.open()
    let board = await svc.rooms.board()
    expect(board).toHaveLength(3)
    expect(board.every((c) => c.session === null && c.currentTotal === 0)).toBe(true)
    // Xonalar odatdagidek ochiladi va boshqariladi
    const room = await svc.sessions.open(rooms.s1, 2, 60, null)
    board = await svc.rooms.board()
    expect(board.filter((c) => c.session).map((c) => c.session!.session.id)).toEqual([room.session.id])
    await svc.rooms.save({ id: rooms.s2, name: 'Sauna 2', pricePerHour: 60_000, capacity: 8, active: false })
    await svc.rooms.remove(rooms.vip)
    expect((await svc.rooms.board()).map((c) => c.room.id)).toEqual([rooms.s1])
    expect(await svc.barSales.openList()).toHaveLength(2)
  })

  it('bir vaqtda bir nechta ochiq bar savdosi: alohida hisob, openList eng yangisi birinchi, xona sessiyalari kirmaydi', async () => {
    const ctx = await setup()
    const { svc, clock, rooms } = ctx
    await ctx.loginAs('cashier')
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const cola = await productByName(svc, 'Coca-Cola 1 L')
    await svc.sessions.open(rooms.s1, 1, 60, null)
    const a = (await svc.barSales.open()).session.id
    clock.advanceMin(1)
    const b = (await svc.barSales.open()).session.id
    clock.advanceMin(1)
    const c = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(a, pivo.id, 1, null)
    await svc.lines.addProduct(b, cola.id, 2, null)
    await svc.lines.addProduct(c, pivo.id, 2, null)
    let list = await svc.barSales.openList()
    expect(list.map((v) => v.session.id)).toEqual([c, b, a])
    expect(list.map((v) => v.total)).toEqual([40_000, 30_000, 20_000])
    expect(list.every((v) => v.session.kind === 'bar' && v.room.name === 'Bar')).toBe(true)
    expect(list[0].computedAt).toBe(clock.now())

    await svc.checkout.pay(b, [{ method: 'card', amount: 30_000 }], null)
    list = await svc.barSales.openList()
    expect(list.map((v) => v.session.id)).toEqual([c, a])
    expect((await svc.sessions.get(a)).total).toBe(20_000)
    expect((await svc.sessions.get(c)).total).toBe(40_000)
    expect(await stockOf(ctx, 'Pivo 0.5 L')).toBe(pivo.stock - 3)
  })
})

describe('bar savdosi: ofitsiant haqi yo‘q', () => {
  it('waiter_commission = 0; waiters.monthly / sessions / byWaiter faqat xona sessiyalaridan', async () => {
    const ctx = await setup()
    const { svc, rooms, staff } = ctx
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    // Xona: Sardor (10%), Pivo 2 → 40 000 mahsulot → haq 4 000
    const room = await svc.sessions.open(rooms.s1, 1, 60, staff.waiter.id)
    await svc.lines.addProduct(room.session.id, pivo.id, 2, null)
    const rv = await svc.sessions.get(room.session.id)
    await svc.checkout.pay(room.session.id, [{ method: 'cash', amount: rv.total }], null)
    // Bar: ofitsiant (Sardor) o'zi sotsa ham haq yo'q
    await ctx.loginAs('waiter')
    const bar = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(bar, pivo.id, 5, null)
    await ctx.loginAs('cashier')
    await svc.checkout.pay(bar, [{ method: 'cash', amount: 100_000 }], null)
    expect(frozen(ctx, bar)).toMatchObject({ product_sales: 100_000, waiter_commission: 0, waiter_id: null })

    await ctx.loginAs('owner')
    const m = (await svc.waiters.monthly('2026-01')).find((w) => w.staffId === staff.waiter.id)!
    expect(m).toMatchObject({ sessions: 1, productSales: 40_000, commission: 4_000, balance: 4_000 })
    expect((await svc.waiters.monthly('2026-01')).find((w) => w.staffId === staff.waiter2.id)).toMatchObject({ sessions: 0, commission: 0 })
    const ws = await svc.waiters.sessions(staff.waiter.id, '2026-01')
    expect(ws.map((x) => x.sessionId)).toEqual([room.session.id])
    const rep = await svc.reports.sales({ from: T0, to: T0 + HOUR })
    expect(rep.byWaiter).toEqual([{ staffId: staff.waiter.id, name: 'Sardor', sessions: 1, productSales: 40_000, commission: 4_000 }])
    expect(rep.barSales).toEqual({ count: 1, total: 100_000 })
  })
})

describe('bar savdosi: hisobotlar (qo‘lda hisoblangan)', () => {
  it('umumiy tushum, byMethod, byProduct, byDay, byStaff, byRoom ("Bar (xonasiz)"), barSales, qaytarishlar', async () => {
    const ctx = await setup()
    const { svc, clock, rooms, staff } = ctx
    const pivo = await productByName(svc, 'Pivo 0.5 L') // 20 000
    const cola = await productByName(svc, 'Coca-Cola 1 L') // 15 000
    const non = await productByName(svc, 'Non') // 4 000

    // 1) Xona (ega yopadi): 1 mehmon × 1 soat × 50 000 + Pivo 1 = 70 000, karta, ofitsiant Bekzod 12%
    const room = (await svc.sessions.open(rooms.s1, 1, 60, staff.waiter2.id)).session.id
    await svc.lines.addProduct(room, pivo.id, 1, null)
    clock.advanceMin(30)
    expect((await svc.sessions.get(room)).total).toBe(70_000)
    await svc.checkout.pay(room, [{ method: 'card', amount: 70_000 }], null)

    await ctx.loginAs('cashier')
    // 2) Bar A: Pivo 2 + Cola 1 = 55 000 naqd (kassir)
    const a = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(a, pivo.id, 2, null)
    await svc.lines.addProduct(a, cola.id, 1, null)
    await svc.checkout.pay(a, [{ method: 'cash', amount: 55_000 }], null)
    // 3) Bar B: Non 3 + Cola 2 (−1 qaytarildi) = 27 000, chegirma 2 000 → 25 000 = naqd 10 000 + karta 15 000 (admin)
    const b = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(b, non.id, 3, null)
    let bv = await svc.lines.addProduct(b, cola.id, 2, null)
    await ctx.loginAs('admin')
    bv = await svc.lines.returnLine(bv.lines.find((l) => l.refId === cola.id)!.id, 1, 'issiq')
    bv = await svc.sessions.setDiscount(b, 2_000)
    expect(bv.total).toBe(25_000)
    await svc.checkout.pay(b, [{ method: 'cash', amount: 10_000 }, { method: 'card', amount: 15_000 }], null)
    // 4) Bar C: Pivo 1 = 20 000 qarz (kassir)
    await ctx.loginAs('cashier')
    const c = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(c, pivo.id, 1, null)
    await svc.checkout.pay(c, [{ method: 'debt', amount: 20_000 }], { name: 'Vali', phone: '+998 90 111 22 33' })
    // Hisobotga kirmaydi: bekor qilingan va ochiq bar savdolari
    const d = (await svc.barSales.open()).session.id
    await svc.sessions.cancel(d)
    const e = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(e, pivo.id, 3, null)

    await ctx.loginAs('owner')
    const rep = await svc.reports.sales({ from: T0, to: T0 + 2 * HOUR })
    expect(rep.sessionsCount).toBe(4)
    expect(rep.total).toBe(70_000 + 55_000 + 25_000 + 20_000)
    expect(rep.timeRevenue).toBe(50_000)
    expect(rep.productRevenue).toBe(20_000 + 55_000 + 27_000 + 20_000)
    expect(rep.serviceRevenue).toBe(0)
    expect(rep.discounts).toBe(2_000)
    expect(rep.byMethod).toEqual({ cash: 65_000, card: 85_000, debt: 20_000 })
    expect(rep.returnsAmount).toBe(15_000)
    expect(rep.barSales).toEqual({ count: 3, total: 100_000 })
    expect(rep.byDay).toEqual([{ day: '2026-01-15', total: 170_000 }])
    expect(rep.byRoom).toEqual([
      { roomId: 0, roomName: 'Bar (xonasiz)', sessions: 3, total: 100_000 },
      { roomId: rooms.s1, roomName: 'Sauna 1', sessions: 1, total: 70_000 }
    ])
    expect(rep.byProduct).toEqual([
      { name: 'Pivo 0.5 L', qty: 4, amount: 80_000 },
      { name: 'Coca-Cola 1 L', qty: 2, amount: 30_000 },
      { name: 'Non', qty: 3, amount: 12_000 }
    ])
    expect(rep.byStaff).toEqual([
      { staffId: staff.cashier.id, name: 'Kassir', sessions: 2, total: 75_000 },
      { staffId: staff.owner.id, name: 'Ega', sessions: 1, total: 70_000 },
      { staffId: staff.admin.id, name: 'Admin', sessions: 1, total: 25_000 }
    ])
    // Faqat xona sessiyasi: 20 000 × 12% = 2 400
    expect(rep.byWaiter).toEqual([{ staffId: staff.waiter2.id, name: 'Bekzod', sessions: 1, productSales: 20_000, commission: 2_400 }])

    const ret = await svc.reports.returns({ from: T0, to: T0 + 2 * HOUR })
    expect(ret).toEqual([
      { at: clock.now(), productName: 'Coca-Cola 1 L', qty: 1, amount: 15_000, reason: 'issiq', by: 'Admin', roomName: 'Bar' }
    ])

    const hist = await svc.barSales.history({ from: T0, to: T0 + 2 * HOUR })
    expect(hist.map((h) => [h.sessionId, h.items, h.total, h.cashier])).toEqual([
      [c, 1, 20_000, 'Kassir'], [b, 4, 25_000, 'Admin'], [a, 3, 55_000, 'Kassir']
    ])
    expect(hist.map((h) => h.receiptNo)).toEqual([4, 3, 2])
    // Oraliqdan tashqari
    expect(await svc.barSales.history({ from: T0 + 2 * HOUR, to: T0 + 3 * HOUR })).toEqual([])
    await expect(svc.barSales.history({ from: 10, to: 5 })).rejects.toThrow("Hisobot oralig'i noto'g'ri")
  })
})

describe('bar savdosi: ruxsatlar va ko‘ruvchi', () => {
  it('open: session.open; history: session.pay; kirmagan foydalanuvchi rad etiladi', async () => {
    const ctx = await setup()
    const { svc } = ctx
    await ctx.loginAs('waiter')
    const v = await svc.barSales.open()
    expect(v.session.openedBy).toBe(ctx.staff.waiter.id)
    expect(await svc.barSales.openList()).toHaveLength(1)
    await expect(svc.barSales.history({ from: 0, to: T0 + HOUR })).rejects.toThrow(DENIED)
    await expect(svc.checkout.pay(v.session.id, [], null)).rejects.toThrow(DENIED)
    await ctx.loginAs('cashier')
    expect(await svc.barSales.history({ from: 0, to: T0 + HOUR })).toEqual([])
    await svc.auth.logout()
    await expect(svc.barSales.open()).rejects.toThrow('Avval tizimga kiring')
    await expect(svc.barSales.openList()).rejects.toThrow('Avval tizimga kiring')
    await expect(svc.barSales.history({ from: 0, to: 1 })).rejects.toThrow('Avval tizimga kiring')
  })

  it('ko‘ruvchi konteksti: openList/history o‘qiladi, open rad etiladi', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const a = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(a, pivo.id, 1, null)
    await svc.checkout.pay(a, [{ method: 'cash', amount: 20_000 }], null)
    const b = (await svc.barSales.open()).session.id
    const viewer = svc.forViewer()
    expect((await viewer.barSales.openList()).map((x) => x.session.id)).toEqual([b])
    expect((await viewer.barSales.history({ from: 0, to: T0 + HOUR })).map((x) => x.sessionId)).toEqual([a])
    await expect(viewer.barSales.open()).rejects.toThrow(VIEW_ONLY_ERROR)
    await expect(viewer.lines.addProduct(b, pivo.id, 1, null)).rejects.toThrow(VIEW_ONLY_ERROR)
    await expect(viewer.sessions.cancel(b)).rejects.toThrow(VIEW_ONLY_ERROR)
    expect(await svc.barSales.openList()).toHaveLength(1)
  })
})
