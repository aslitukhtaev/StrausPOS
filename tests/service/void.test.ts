import { describe, expect, it } from 'vitest'
import { productByName, setup, T0, HOUR } from './helpers'

const RANGE = { from: T0 - HOUR, to: T0 + 24 * HOUR }

async function paidSession(method: 'cash' | 'card' | 'debt' = 'cash') {
  const ctx = await setup()
  const { svc, rooms, clock } = ctx
  const v0 = await svc.sessions.open(rooms.s1, 1, 60) // 50 000
  const beer = await productByName(svc, 'Pivo 0.5 L') // 20 000
  await svc.lines.addProduct(v0.session.id, beer.id, 2, v0.guests[0].id) // 40 000
  clock.advanceMin(60)
  const total = (await svc.sessions.get(v0.session.id)).total // 90 000
  const debtor = method === 'debt' ? { debtorId: null, name: 'Ali', phone: '+998901234567' } : null
  await svc.checkout.pay(v0.session.id, [{ method, amount: total }], debtor)
  return { ...ctx, sessionId: v0.session.id, beerId: beer.id, total }
}

describe('yopilgan hisobni bekor qilish (parol bilan)', () => {
  it('noto‘g‘ri parol rad etiladi; to‘g‘risi hisobni hisobotdan chiqaradi va qaytarilgan pulni yozadi', async () => {
    const { svc, sessionId, total } = await paidSession('cash')
    expect(total).toBe(90_000)
    expect((await svc.reports.sales(RANGE)).total).toBe(90_000)

    await expect(svc.sessions.void(sessionId, '1', 'xato')).rejects.toThrow("noto'g'ri")
    expect((await svc.reports.sales(RANGE)).total).toBe(90_000)

    await svc.sessions.void(sessionId, '2', 'mijoz qaytdi')
    expect((await svc.reports.sales(RANGE)).total).toBe(0)
    expect(await svc.reports.sessions(RANGE)).toHaveLength(0)

    const voided = await svc.sessions.voided(RANGE)
    expect(voided).toHaveLength(1)
    expect(voided[0]).toMatchObject({ sessionId, total: 90_000, refund: 90_000, reason: 'mijoz qaytdi', voidedBy: 'Ega' })

    // ikkinchi marta bekor qilib bo'lmaydi
    await expect(svc.sessions.void(sessionId, '2', '')).rejects.toThrow('yopilgan va bekor qilinmagan')
  })

  it('mahsulotlar omborga qaytadi', async () => {
    const ctx = await setup()
    const { svc, rooms, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    await svc.catalog.adjustStock(beer.id, 10, 'test')
    const before = (await productByName(svc, 'Pivo 0.5 L')).stock
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(v0.session.id, beer.id, 3, v0.guests[0].id)
    const mid = (await productByName(svc, 'Pivo 0.5 L')).stock
    expect(mid).toBe(before - 3)
    clock.advanceMin(60)
    const total = (await svc.sessions.get(v0.session.id)).total
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: total }], null)
    await svc.sessions.void(v0.session.id, '2', '')
    expect((await productByName(svc, 'Pivo 0.5 L')).stock).toBe(before)
  })

  it('qarzga yozilgan hisob: qarz o‘chadi, qaytarilgan pul 0; qisman to‘langan qarz bekor qilinmaydi', async () => {
    const a = await paidSession('debt')
    expect(await a.svc.debts.list(false)).toHaveLength(1)
    await a.svc.sessions.void(a.sessionId, '2', '')
    expect(await a.svc.debts.list(false)).toHaveLength(0)
    expect((await a.svc.sessions.voided(RANGE))[0].refund).toBe(0)

    const b = await paidSession('debt')
    const debt = (await b.svc.debts.list(false))[0]
    await b.svc.debts.pay(debt.id, 'cash', 10_000)
    await expect(b.svc.sessions.void(b.sessionId, '2', '')).rejects.toThrow("qisman to'langan")
    expect((await b.svc.reports.sales(RANGE)).total).toBe(90_000)
  })

  it('parolni almashtirish; 5 marta xato — vaqtincha to‘siq; kassir ruxsatsiz', async () => {
    const { svc, sessionId, loginAs } = await paidSession('cash')
    await expect(svc.sessions.setVoidPassword('x', 'yangi')).rejects.toThrow("noto'g'ri")
    await svc.sessions.setVoidPassword('2', 'yangi')
    await expect(svc.sessions.void(sessionId, '2', '')).rejects.toThrow("noto'g'ri")
    for (let i = 0; i < 4; i++) await expect(svc.sessions.void(sessionId, 'q', '')).rejects.toThrow()
    await expect(svc.sessions.void(sessionId, 'yangi', '')).rejects.toThrow("ko'p marta")

    await loginAs('cashier')
    await expect(svc.sessions.void(sessionId, 'yangi', '')).rejects.toThrow()
  })

  it('hisobot: kassadagi naqd, eski qarzlardan kirim (qarz sanasi bilan), bekor qilingan hisoblar', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    // 1) 15-yanvar: 90 000 qarzga yoziladi
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 2, a.guests[0].id)
    clock.advanceMin(60)
    const totalA = (await svc.sessions.get(a.session.id)).total
    await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: totalA }], { debtorId: null, name: 'Ali', phone: '+998901234567' })
    // 2) ertasi: naqd 90 000 savdo, xarajat 10 000, eski qarzdan 30 000 naqd undirildi, 90 000 savdo bekor qilinadi
    clock.t = T0 + 24 * HOUR
    const b = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(b.session.id, beer.id, 2, b.guests[0].id)
    clock.advanceMin(60)
    const totalB = (await svc.sessions.get(b.session.id)).total
    await svc.checkout.pay(b.session.id, [{ method: 'cash', amount: totalB }], null)
    const day2 = { from: T0 + 24 * HOUR - HOUR, to: T0 + 48 * HOUR }
    await svc.expenses.save({ day: '2026-01-16', categoryId: (await svc.expenses.categories())[0].id, amount: 10_000, note: '' })
    await svc.debts.pay((await svc.debts.list(false))[0].id, 'cash', 30_000)
    let r = await svc.reports.sales(day2)
    expect(r.cashDrawer).toMatchObject({ sales: 90_000, debtCollected: 30_000, refunds: 0, expenses: 10_000, expected: 110_000 })
    expect(r.debtCollections).toHaveLength(1)
    expect(r.debtCollections[0]).toMatchObject({ debtorName: 'Ali', amount: 30_000, method: 'cash', debtDate: T0 + 60 * 60_000 })
    expect(r.debtPayments.cash).toBe(30_000)
    await loginAs('owner')
    await svc.sessions.void(b.session.id, '2', '')
    r = await svc.reports.sales(day2)
    expect(r.voided).toEqual({ count: 1, refund: 90_000, cashRefund: 90_000 })
    expect(r.cashDrawer).toMatchObject({ sales: 0, refunds: 90_000, expected: 30_000 - 10_000 - 90_000 })
  })

  it('hisobot filtri: xona, kassir, to‘lov usuli', async () => {
    const { svc, rooms, loginAs, staff } = await setup()
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 1, 60) // 50 000
    await svc.checkout.pay(a.session.id, [{ method: 'cash', amount: 50_000 }], null)
    await loginAs('admin')
    const b = await svc.sessions.open(rooms.s2, 1, 60) // 60 000
    await svc.checkout.pay(b.session.id, [{ method: 'card', amount: 60_000 }], null)
    const range = { from: T0 - HOUR, to: T0 + 24 * HOUR }
    expect((await svc.reports.sales(range)).total).toBe(110_000)
    expect((await svc.reports.sales(range, { roomId: rooms.s1 })).total).toBe(50_000)
    expect((await svc.reports.sales(range, { cashierId: staff.admin.id })).total).toBe(60_000)
    const click = await svc.reports.sales(range, { method: 'card' })
    expect(click.total).toBe(60_000)
    expect(click.byMethod).toEqual({ cash: 0, card: 60_000, terminal: 0, debt: 0 })
    expect((await svc.reports.sales(range, { roomId: rooms.s1, method: 'card' })).total).toBe(0)
    await expect(svc.reports.sales(range, { method: 'bitcoin' as 'cash' })).rejects.toThrow("noto'g'ri")
  })
})
