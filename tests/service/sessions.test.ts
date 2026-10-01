import { describe, expect, it } from 'vitest'
import { setup } from './helpers'

describe('xonani ochish', () => {
  it('ochish: mehmonlar running, tarif = xona narxi, board yangilanadi', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    await loginAs('cashier')
    const v = await svc.sessions.open(rooms.s1, 3)
    expect(v.session.status).toBe('open')
    expect(v.guests.map((g) => g.label)).toEqual(['Mehmon 1', 'Mehmon 2', 'Mehmon 3'])
    expect(v.guests.every((g) => g.state === 'running' && g.runningRate === 50_000)).toBe(true)
    expect(v.total).toBe(0)
    expect(v.computedAt).toBe(clock.t)

    clock.advanceMin(60)
    const board = await svc.rooms.board()
    const card = board.find((c) => c.room.id === rooms.s1)!
    expect(card.session?.session.id).toBe(v.session.id)
    expect(card.guestsActive).toBe(3)
    expect(card.currentTotal).toBe(150_000)
    expect(board.find((c) => c.room.id === rooms.s2)!.session).toBeNull()
  })

  it('band xona va sig‘imdan oshish rad etiladi', async () => {
    const { svc, rooms } = await setup()
    await expect(svc.sessions.open(rooms.s1, 7)).rejects.toThrow("Xona sig'imi 6 kishi")
    await expect(svc.sessions.open(rooms.s1, 0)).rejects.toThrow('kamida 1')
    const v = await svc.sessions.open(rooms.s1, 6)
    await expect(svc.sessions.open(rooms.s1, 1)).rejects.toThrow('Xona band')
    await expect(svc.sessions.addGuest(v.session.id)).rejects.toThrow("Xona sig'imi 6 kishi")
    // Chiqib ketgan mehmon o'rni bo'shaydi
    await svc.sessions.guestFinish(v.guests[0].id)
    const v2 = await svc.sessions.addGuest(v.session.id)
    expect(v2.guests).toHaveLength(7)
    expect(v2.guests[6].label).toBe('Mehmon 7')
    // Endi chiqib ketganni qaytarish sig'imdan oshadi
    await expect(svc.sessions.guestResume(v.guests[0].id)).rejects.toThrow("sig'imi")
  })

  it('faol bo‘lmagan xona ochilmaydi', async () => {
    const { svc, rooms } = await setup()
    const r = (await svc.rooms.list()).find((x) => x.id === rooms.s2)!
    await svc.rooms.save({ ...r, active: false })
    await expect(svc.sessions.open(rooms.s2, 1)).rejects.toThrow('faol emas')
    expect((await svc.rooms.board()).some((c) => c.room.id === rooms.s2)).toBe(false)
  })
})

describe('mehmon vaqti: pauza / davom / tugatish', () => {
  it('har bir mehmon alohida hisoblanadi', async () => {
    const { svc, rooms, clock } = await setup()
    let v = await svc.sessions.open(rooms.s1, 2) // 50 000 so'm/soat
    const [g1, g2] = v.guests
    clock.advanceMin(30)
    v = await svc.sessions.guestPause(g1.id)
    expect(v.guests[0].state).toBe('paused')
    expect(v.guests[0].runningRate).toBe(0)
    clock.advanceMin(30)
    v = await svc.sessions.get(v.session.id)
    expect(v.guests[0].elapsedMs).toBe(30 * 60_000)
    expect(v.guests[0].timeAmount).toBe(25_000)
    expect(v.guests[1].timeAmount).toBe(50_000)

    v = await svc.sessions.guestResume(g1.id)
    expect(v.guests[0].intervals).toHaveLength(2)
    clock.advanceMin(15)
    v = await svc.sessions.get(v.session.id)
    // g1: 45 daqiqa = 37 500 → 38 000 (1000 ga yaxlitlash); g2: 75 daqiqa = 62 500 → 63 000
    expect(v.guests[0].timeAmount).toBe(38_000)
    expect(v.guests[1].timeAmount).toBe(63_000)
    expect(v.timeTotal).toBe(101_000)

    v = await svc.sessions.guestFinish(g2.id)
    expect(v.guests[1].state).toBe('finished')
    clock.advanceMin(60)
    v = await svc.sessions.get(v.session.id)
    expect(v.guests[1].timeAmount).toBe(63_000) // to'xtagan
    expect(v.guests[0].timeAmount).toBe(88_000) // 105 daqiqa = 87 500 → 88 000
  })

  it('noto‘g‘ri holat o‘tishlari rad etiladi', async () => {
    const { svc, rooms } = await setup()
    const v = await svc.sessions.open(rooms.s1, 1)
    const g = v.guests[0]
    await expect(svc.sessions.guestResume(g.id)).rejects.toThrow('allaqachon ishlayapti')
    await svc.sessions.guestPause(g.id)
    await expect(svc.sessions.guestPause(g.id)).rejects.toThrow('allaqachon')
    await svc.sessions.guestFinish(g.id)
    await expect(svc.sessions.guestFinish(g.id)).rejects.toThrow('allaqachon chiqib ketgan')
    await expect(svc.sessions.guestPause(9999)).rejects.toThrow('Mehmon topilmadi')
  })

  it('stopAll: hamma to‘xtaydi, vaqt o‘smaydi', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s2, 2) // 60 000
    clock.advanceMin(20)
    let v = await svc.sessions.stopAll(v0.session.id)
    expect(v.guests.every((g) => g.state === 'finished')).toBe(true)
    clock.advanceMin(100)
    v = await svc.sessions.get(v0.session.id)
    expect(v.timeTotal).toBe(40_000)
  })

  it('renameGuest', async () => {
    const { svc, rooms } = await setup()
    const v = await svc.sessions.open(rooms.s1, 1)
    const v2 = await svc.sessions.renameGuest(v.guests[0].id, '  Akmal ')
    expect(v2.guests[0].label).toBe('Akmal')
    await expect(svc.sessions.renameGuest(v.guests[0].id, ' ')).rejects.toThrow()
  })
})

describe('xona almashtirish', () => {
  it('ishlayotganlar yangi narxga o‘tadi, pauzadagilar keyingi davomda yangi narxni oladi', async () => {
    const { svc, rooms, clock } = await setup()
    let v = await svc.sessions.open(rooms.s1, 2) // 50 000
    const [g1, g2] = v.guests
    clock.advanceMin(60)
    await svc.sessions.guestPause(g2.id)
    v = await svc.sessions.moveRoom(v.session.id, rooms.vip) // 100 000
    expect(v.room.id).toBe(rooms.vip)
    expect(v.session.roomId).toBe(rooms.vip)
    const gv1 = v.guests.find((g) => g.id === g1.id)!
    expect(gv1.intervals).toHaveLength(2)
    expect(gv1.intervals[0]).toMatchObject({ roomId: rooms.s1, rate: 50_000, end: clock.t })
    expect(gv1.intervals[1]).toMatchObject({ roomId: rooms.vip, rate: 100_000, end: null })
    expect(gv1.runningRate).toBe(100_000)
    // pauzadagi mehmonning oralig'i o'zgarmaydi
    expect(v.guests.find((g) => g.id === g2.id)!.intervals).toHaveLength(1)

    clock.advanceMin(30)
    v = await svc.sessions.guestResume(g2.id)
    expect(v.guests.find((g) => g.id === g2.id)!.runningRate).toBe(100_000)
    clock.advanceMin(30)
    v = await svc.sessions.get(v.session.id)
    // g1: 60 daq × 50k + 60 daq × 100k = 150 000; g2: 60 daq × 50k + 30 daq × 100k = 100 000
    expect(v.guests.find((g) => g.id === g1.id)!.timeAmount).toBe(150_000)
    expect(v.guests.find((g) => g.id === g2.id)!.timeAmount).toBe(100_000)
    expect(v.total).toBe(250_000)

    // eski xona bo'shadi
    const board = await svc.rooms.board()
    expect(board.find((c) => c.room.id === rooms.s1)!.session).toBeNull()
    expect(board.find((c) => c.room.id === rooms.vip)!.session?.session.id).toBe(v.session.id)
  })

  it('band xonaga, sig‘imi kichik xonaga va o‘sha xonaga ko‘chirish rad etiladi', async () => {
    const { svc, rooms } = await setup()
    const a = await svc.sessions.open(rooms.s2, 7)
    await svc.sessions.open(rooms.vip, 1)
    await expect(svc.sessions.moveRoom(a.session.id, rooms.vip)).rejects.toThrow('Xona band')
    await expect(svc.sessions.moveRoom(a.session.id, rooms.s1)).rejects.toThrow("sig'imi 6")
    await expect(svc.sessions.moveRoom(a.session.id, rooms.s2)).rejects.toThrow('allaqachon shu xonada')
    // xato atomik: hech narsa o'zgarmagan
    const v = await svc.sessions.get(a.session.id)
    expect(v.room.id).toBe(rooms.s2)
    expect(v.guests.every((g) => g.intervals.length === 1)).toBe(true)
  })
})

describe('chegirma va bekor qilish', () => {
  it('chegirma jami summadan oshmaydi', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 1)
    clock.advanceMin(60)
    const v = await svc.sessions.setDiscount(v0.session.id, 10_000)
    expect(v.discount).toBe(10_000)
    expect(v.total).toBe(40_000)
    await expect(svc.sessions.setDiscount(v0.session.id, 60_000)).rejects.toThrow('oshmasligi')
    await expect(svc.sessions.setDiscount(v0.session.id, -1)).rejects.toThrow()
  })

  it('bo‘sh sessiyani bekor qilish; buyurtma bo‘lsa yoki kassir vaqt hisoblangandan keyin — rad', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    const a = await svc.sessions.open(rooms.s1, 1)
    await svc.sessions.cancel(a.session.id)
    expect((await svc.rooms.board()).find((c) => c.room.id === rooms.s1)!.session).toBeNull()
    await expect(svc.checkout.receipt(a.session.id)).rejects.toThrow('bekor qilingan')

    const b = await svc.sessions.open(rooms.s1, 1)
    const p = (await svc.catalog.products()).find((x) => x.trackStock)!
    await svc.lines.addProduct(b.session.id, p.id, 1, null)
    await expect(svc.sessions.cancel(b.session.id)).rejects.toThrow('buyurtmalar bor')

    await loginAs('cashier')
    const c = await svc.sessions.open(rooms.s2, 1)
    clock.advanceMin(30)
    await expect(svc.sessions.cancel(c.session.id)).rejects.toThrow('administrator')
  })
})
