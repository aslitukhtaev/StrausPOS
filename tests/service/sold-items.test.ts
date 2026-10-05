import { describe, expect, it } from 'vitest'
import { HOUR, T0, productByName, serviceByName, setup } from './helpers'

const ALL = { from: T0 - HOUR, to: T0 + 24 * HOUR }

async function payAll(svc: any, id: number) {
  const v = await svc.sessions.get(id)
  await svc.checkout.pay(id, [{ method: 'cash', amount: v.total }], null)
}

describe('sessions.soldItems', () => {
  it('xodim filtri, bar, qaytarilgan qator, ofitsiant, oraliq', async () => {
    const { svc, rooms, clock, staff, loginAs } = await setup()
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    const cola = await productByName(svc, 'Coca-Cola 0.5 L').catch(() => productByName(svc, 'Pivo 0.5 L'))
    const massaj = (await svc.catalog.services(true))[0]

    // Kassir: xona, pivo x3 (1 tasi qaytariladi) + xizmat
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, pivo.id, 3, null)
    await svc.lines.addService(a.session.id, massaj.id, null, staff.provider.id)
    clock.advanceMin(1)
    // Admin: shu sessiyaga pivo x2 ofitsiant Bekzod bilan
    await loginAs('admin')
    await svc.lines.addProduct(a.session.id, pivo.id, 2, null, staff.waiter2.id)
    clock.advanceMin(1)
    const lines = (await svc.sessions.get(a.session.id)).lines
    const first = lines.find((l) => l.name === pivo.name && l.qty >= 3) ?? lines[0]
    await svc.lines.returnLine(first.id, 1, 'xato')
    clock.advanceMin(60)
    await payAll(svc, a.session.id)
    const rcpA = 1

    // Bar savdosi (admin)
    clock.advanceMin(1)
    const b = (await svc.barSales.open()).session.id
    await svc.lines.addProduct(b, pivo.id, 1, null)
    await payAll(svc, b)

    await loginAs('owner')
    const all = await svc.sessions.soldItems(ALL, null)
    expect(all).toHaveLength(4)
    // eng yangisi birinchi
    expect(all.map((r) => r.at)).toEqual([...all.map((r) => r.at)].sort((x, y) => y - x))
    expect(all[0]).toMatchObject({ receiptNo: 2, roomName: 'Bar', name: pivo.name, qty: 1, amount: pivo.price, staffId: staff.admin.id, waiterName: null })
    const ret = all.find((r) => r.returnedQty === 1)!
    expect(ret).toMatchObject({ qty: first.qty, amount: (first.qty - 1) * pivo.price, roomName: 'Sauna 1', receiptNo: rcpA })
    const w = all.find((r) => r.waiterName === 'Bekzod')!
    expect(w).toMatchObject({ qty: 2, amount: 2 * pivo.price, staffName: 'Admin', kind: 'product' })
    const svcRow = all.find((r) => r.kind === 'service')!
    expect(svcRow).toMatchObject({ staffName: 'Kassir', department: null, name: massaj.name })

    const cashierRows = await svc.sessions.soldItems(ALL, staff.cashier.id)
    expect(cashierRows.every((r) => r.staffId === staff.cashier.id)).toBe(true)
    expect(cashierRows).toHaveLength(all.filter((r) => r.staffId === staff.cashier.id).length)
    const adminRows = await svc.sessions.soldItems(ALL, staff.admin.id)
    expect(adminRows.length + cashierRows.length).toBe(4)
    expect(adminRows.map((r) => r.roomName).sort()).toContain('Bar')

    // oraliq: closed_at bo'yicha, to eksklyuziv
    const closedA = (await svc.sessions.get(a.session.id)).session.closedAt!
    expect((await svc.sessions.soldItems({ from: closedA, to: closedA + 1 }, null)).every((r) => r.sessionId === a.session.id)).toBe(true)
    expect(await svc.sessions.soldItems({ from: closedA + 1, to: closedA + 2 }, null).then((r) => r.some((x) => x.sessionId === a.session.id))).toBe(false)
    expect(await svc.sessions.soldItems({ from: closedA - 1, to: closedA }, null)).toEqual([])
    void cola
  })

  it('to‘liq qaytarilgan qator ham chiqadi (amount 0); ochiq/bekor sessiya chiqmaydi', async () => {
    const { svc, rooms, loginAs } = await setup()
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, pivo.id, 2, null)
    await svc.lines.addProduct(a.session.id, pivo.id, 1, null)
    const open = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.lines.addProduct(open.session.id, pivo.id, 5, null)
    const v = await svc.sessions.get(a.session.id)
    await svc.lines.returnLine(v.lines[0].id, v.lines[0].qty, 'hammasi')
    await payAll(svc, a.session.id)
    await loginAs('owner')
    const rows = await svc.sessions.soldItems(ALL, null)
    expect(rows.every((r) => r.sessionId === a.session.id)).toBe(true)
    expect(rows.find((r) => r.returnedQty === r.qty)).toMatchObject({ amount: 0 })
  })

  it('ruxsat: ofitsiant va kassir? reports.view yo‘q rollar rad etiladi', async () => {
    const { svc, loginAs } = await setup()
    await loginAs('waiter')
    await expect(svc.sessions.soldItems(ALL, null)).rejects.toThrow("ruxsatingiz yo'q")
  })

  it('reports.sessions: receiptNo va cashier', async () => {
    const { svc, rooms, clock, staff, loginAs } = await setup()
    const pivo = await productByName(svc, 'Pivo 0.5 L')
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, pivo.id, 1, null)
    clock.advanceMin(5)
    await loginAs('admin')
    await payAll(svc, a.session.id)
    const rows = await svc.reports.sessions(ALL)
    expect(rows[0]).toMatchObject({ receiptNo: 1, cashier: 'Admin', openedBy: 'Kassir' })
    void staff
    void serviceByName
  })
})
