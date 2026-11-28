import { describe, expect, it } from 'vitest'
import type { ShiftRow } from '../../src/shared/types'
import { HOUR, MIN, productByName, setup } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

describe('smena (kassir sessiyasi)', () => {
  it('smenasiz to‘lov qabul qilinmaydi; ochilgach qilinadi', async () => {
    const { svc, rooms, loginAs } = await setup()
    await svc.shifts.close()
    await loginAs('cashier')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await expect(svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 50_000 }], null)).rejects.toThrow('Avval smenani oching')
    expect(await svc.shifts.current()).toBeNull()
    const o = await svc.shifts.open()
    expect(o.closed).toBeNull()
    expect(o.shift.shift).toMatchObject({ openedByName: 'Kassir', closedAt: null, autoClosed: false })
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 50_000 }], null)
    // qarz to'lovi ham smenani talab qiladi
    await svc.shifts.close()
    await expect(svc.debts.pay(1, 'cash', 1)).rejects.toThrow('Avval smenani oching')
  })

  it('yangi smena ochilsa oldingisi avtomatik yopiladi; xulosa smena oralig‘i bo‘yicha', async () => {
    const { svc, rooms, clock, loginAs } = await setup() // ega smenasi (setup ochgan)
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const opened: ShiftRow[] = []
    const closed: ShiftRow[] = []
    svc.events.on('shiftOpened', (r: ShiftRow) => opened.push(r))
    svc.events.on('shiftClosed', (r: ShiftRow) => closed.push(r))

    // 1-smena (ega): Sauna 1 — 50 000 + 2 pivo 40 000 = 90 000 naqd
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 2, null)
    clock.advanceMin(60)
    await svc.checkout.pay(a.session.id, [{ method: 'cash', amount: 90_000 }], null)
    clock.advanceMin(5)

    // 2-smena: kassir keldi — oldingi (ega) avtomatik yopiladi
    await loginAs('cashier')
    const o = await svc.shifts.open()
    expect(o.closed!.shift).toMatchObject({ openedByName: 'Ega', closedByName: 'Kassir', autoClosed: true })
    expect(o.closed!.summary).toMatchObject({ total: 90_000, expectedCash: 90_000, byMethod: { cash: 90_000, card: 0, terminal: 0, debt: 0 }, sessionsCount: 1 })
    expect(closed).toHaveLength(1)
    expect(opened.map((x) => x.shift.openedByName)).toEqual(['Kassir'])

    // 2-smena: Sauna 2 — 60 000 Click
    clock.advanceMin(10)
    const b = await svc.sessions.open(rooms.s2, 1, 60)
    await svc.checkout.pay(b.session.id, [{ method: 'card', amount: 60_000 }], null)
    const cur = (await svc.shifts.current())!
    expect(cur.summary).toMatchObject({ total: 60_000, expectedCash: 0, byMethod: { card: 60_000 } })

    // qo'lda yopish
    clock.advance(30 * MIN)
    const c = await svc.shifts.close()
    expect(c.shift).toMatchObject({ closedByName: 'Kassir', autoClosed: false })
    expect(c.summary!.total).toBe(60_000)
    expect(await svc.shifts.current()).toBeNull()
    await expect(svc.shifts.close()).rejects.toThrow("Ochiq smena yo'q")

    await loginAs('owner')
    const list = await svc.shifts.list()
    expect(list.map((r) => r.shift.openedByName)).toEqual(['Kassir', 'Ega'])
    expect(list.map((r) => r.summary!.total)).toEqual([60_000, 90_000])
    expect(HOUR).toBeGreaterThan(0)
  })

  it('ruxsatlar: ofitsiant smena ocha olmaydi va summani ko‘rmaydi; ro‘yxat — hisobot ruxsati bilan', async () => {
    const { svc, loginAs } = await setup()
    await loginAs('waiter')
    await expect(svc.shifts.open()).rejects.toThrow(DENIED)
    await expect(svc.shifts.close()).rejects.toThrow(DENIED)
    await expect(svc.shifts.list()).rejects.toThrow(DENIED)
    const cur = await svc.shifts.current()
    expect(cur!.summary).toBeNull()
    await loginAs('cashier')
    expect((await svc.shifts.current())!.summary).not.toBeNull()
    await expect(svc.shifts.list()).rejects.toThrow(DENIED)
  })
})
