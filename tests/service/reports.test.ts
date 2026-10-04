import { describe, expect, it } from 'vitest'
import { HOUR, T0, productByName, serviceByName, setup } from './helpers'

describe('hisobotlar', () => {
  it('sotuv hisoboti: vaqt/mahsulot/xizmat, usullar, kunlar, xonalar, xodimlar, qaytarishlar', async () => {
    const { svc, rooms, clock, staff, loginAs } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const massage = await serviceByName(svc, 'Klassik massaj')

    // 1-kun: Sauna 1, kassir yopadi
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 2, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 3, null)
    await svc.lines.addService(a.session.id, massage.id, null, staff.provider.id)
    await loginAs('admin')
    await svc.lines.returnLine((await svc.sessions.get(a.session.id)).lines[0].id, 1, 'Iliq')
    clock.advanceMin(60)
    let v = await svc.sessions.setDiscount(a.session.id, 5_000)
    // vaqt 100 000 + pivo 40 000 + massaj 150 000 − 5 000 = 285 000
    expect(v.total).toBe(285_000)
    await loginAs('cashier')
    await svc.checkout.pay(a.session.id, [{ method: 'cash', amount: 85_000 }, { method: 'debt', amount: 200_000 }], { name: 'Olim', phone: '901112233' })

    // 2-kun: VIP, ega yopadi
    clock.t = T0 + 24 * HOUR
    await loginAs('owner')
    const b = await svc.sessions.open(rooms.vip, 1, 30) // 30 daqiqa olingan
    await svc.lines.addProduct(b.session.id, beer.id, 1, null)
    clock.advanceMin(30)
    v = await svc.sessions.get(b.session.id)
    expect(v.total).toBe(70_000)
    await svc.checkout.pay(b.session.id, [{ method: 'card', amount: 70_000 }], null)

    // Bekor qilingan va ochiq sessiyalar hisobga kirmaydi
    const c = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.sessions.cancel(c.session.id)
    await svc.sessions.open(rooms.s2, 1, 60)

    const rep = await svc.reports.sales({ from: T0 - HOUR, to: T0 + 48 * HOUR })
    expect(rep.sessionsCount).toBe(2)
    expect(rep.timeRevenue).toBe(150_000)
    expect(rep.productRevenue).toBe(60_000)
    expect(rep.serviceRevenue).toBe(150_000)
    expect(rep.discounts).toBe(5_000)
    expect(rep.total).toBe(355_000)
    expect(rep.byMethod).toEqual({ cash: 85_000, card: 70_000, terminal: 0, debt: 200_000 })
    expect(rep.debtPayments).toEqual({ cash: 0, card: 0, terminal: 0 })
    expect(rep.returnsAmount).toBe(20_000)
    expect(rep.byDay).toEqual([
      { day: '2026-01-15', total: 285_000 },
      { day: '2026-01-16', total: 70_000 }
    ])
    expect(rep.byRoom).toEqual([
      { roomId: rooms.s1, roomName: 'Sauna 1', sessions: 1, total: 285_000 },
      { roomId: rooms.vip, roomName: 'VIP xona', sessions: 1, total: 70_000 }
    ])
    expect(rep.byProduct).toEqual([{ name: 'Pivo 0.5 L', qty: 3, amount: 60_000 }])
    expect(rep.byProvider).toEqual([{ staffId: staff.provider.id, name: 'Massajchi', count: 1, amount: 150_000 }])
    expect(rep.byStaff).toEqual([
      { staffId: staff.cashier.id, name: 'Kassir', sessions: 1, total: 285_000 },
      { staffId: staff.owner.id, name: 'Ega', sessions: 1, total: 70_000 }
    ])

    // Oraliq bo'yicha filtr: faqat 2-kun
    const rep2 = await svc.reports.sales({ from: T0 + 12 * HOUR, to: T0 + 48 * HOUR })
    expect(rep2.sessionsCount).toBe(1)
    expect(rep2.total).toBe(70_000)
    expect(rep2.returnsAmount).toBe(0)

    const rets = await svc.reports.returns({ from: T0 - HOUR, to: T0 + 48 * HOUR })
    expect(rets).toEqual([{ at: T0, productName: 'Pivo 0.5 L', qty: 1, amount: 20_000, reason: 'Iliq', by: 'Admin', roomName: 'Sauna 1' }])

    await expect(svc.reports.sales({ from: 10, to: 5 })).rejects.toThrow("oralig'i")
  })

  it('yopilgandan keyin yaxlitlash sozlamasi o‘zgarsa ham hisobot o‘zgarmaydi', async () => {
    const { svc, rooms, clock } = await setup()
    const a = await svc.sessions.open(rooms.s1, 1, 7) // 7 daqiqa: 5 833 → 6 000
    clock.advanceMin(7)
    await svc.checkout.pay(a.session.id, [{ method: 'cash', amount: 6_000 }], null)
    const s = await svc.settings.get()
    await svc.settings.save({ ...s, roundTo: 1 })
    const rep = await svc.reports.sales({ from: 0, to: clock.t + 1 })
    expect(rep.total).toBe(6_000)
  })
})
