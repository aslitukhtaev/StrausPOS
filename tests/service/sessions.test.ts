import { describe, expect, it } from 'vitest'
import { MIN, setup } from './helpers'

describe('xonani ochish', () => {
  it('ochish: olingan vaqt darhol hisoblanadi, taymer orqaga sanaydi, board yangilanadi', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    await loginAs('cashier')
    const v = await svc.sessions.open(rooms.s1, 3, 60)
    expect(v.session.status).toBe('open')
    expect(v.session.waiterId).toBeNull()
    expect(v.waiterName).toBeNull()
    expect(v.guests.map((g) => g.label)).toEqual(['Mehmon 1', 'Mehmon 2', 'Mehmon 3'])
    expect(v.guests.every((g) => g.state === 'running' && g.runningRate === 50_000)).toBe(true)
    expect(v.guests.every((g) => g.paidMinutes === 60 && g.billedMinutes === 60 && g.remainingMs === 60 * MIN)).toBe(true)
    // 5 daqiqa o'tirsa ham 1 soat to'liq to'lanadi
    expect(v.total).toBe(150_000)
    expect(v.computedAt).toBe(clock.t)

    clock.advanceMin(60)
    let board = await svc.rooms.board()
    const card = board.find((c) => c.room.id === rooms.s1)!
    expect(card.session?.session.id).toBe(v.session.id)
    expect(card.guestsActive).toBe(3)
    expect(card.currentTotal).toBe(150_000)
    expect(card.session!.guests[0].remainingMs).toBe(0)
    expect(board.find((c) => c.room.id === rooms.s2)!.session).toBeNull()

    // 1 daqiqa oshdi → aynan o'tirilgan daqiqa (blockMinutes=1): 61 daq × 50 000/60 = 50 833 → 51 000 (yaxlitlash 1000)
    clock.advanceMin(1)
    board = await svc.rooms.board()
    const c2 = board.find((c) => c.room.id === rooms.s1)!
    expect(c2.currentTotal).toBe(3 * 51_000)
    expect(c2.session!.guests[0]).toMatchObject({ billedMinutes: 61, remainingMs: -MIN })
  })

  it('paidMinutes tekshiruvi: 1..1440 butun son', async () => {
    const { svc, rooms } = await setup()
    for (const bad of [0, -60, 1.5, 1441, NaN, '60' as unknown as number])
      await expect(svc.sessions.open(rooms.s1, 1, bad)).rejects.toThrow('Olingan vaqt 1 dan 1440')
    expect((await svc.rooms.board()).every((c) => c.session === null)).toBe(true)
    const v = await svc.sessions.open(rooms.s1, 1, 1440)
    await expect(svc.sessions.addGuest(v.session.id, 0)).rejects.toThrow('Olingan vaqt')
    const v2 = await svc.sessions.addGuest(v.session.id, 120)
    expect(v2.guests[1]).toMatchObject({ label: 'Mehmon 2', paidMinutes: 120, timeAmount: 100_000 })
  })

  it('band xona va sig‘imdan oshish rad etiladi', async () => {
    const { svc, rooms } = await setup()
    await expect(svc.sessions.open(rooms.s1, 7, 60)).rejects.toThrow("Xona sig'imi 6 kishi")
    await expect(svc.sessions.open(rooms.s1, 0, 60)).rejects.toThrow('kamida 1')
    const v = await svc.sessions.open(rooms.s1, 6, 60)
    await expect(svc.sessions.open(rooms.s1, 1, 60)).rejects.toThrow('Xona band')
    await expect(svc.sessions.addGuest(v.session.id, 60)).rejects.toThrow("Xona sig'imi 6 kishi")
    // Chiqib ketgan mehmon o'rni bo'shaydi
    await svc.sessions.guestFinish(v.guests[0].id)
    const v2 = await svc.sessions.addGuest(v.session.id, 60)
    expect(v2.guests).toHaveLength(7)
    expect(v2.guests[6].label).toBe('Mehmon 7')
    // Endi chiqib ketganni qaytarish sig'imdan oshadi
    await expect(svc.sessions.guestResume(v.guests[0].id)).rejects.toThrow("sig'imi")
  })

  it('faol bo‘lmagan xona ochilmaydi', async () => {
    const { svc, rooms } = await setup()
    const r = (await svc.rooms.list()).find((x) => x.id === rooms.s2)!
    await svc.rooms.save({ ...r, active: false })
    await expect(svc.sessions.open(rooms.s2, 1, 60)).rejects.toThrow('faol emas')
    expect((await svc.rooms.board()).some((c) => c.room.id === rooms.s2)).toBe(false)
  })
})

describe('mehmon vaqti: pauza / davom / tugatish', () => {
  it('har bir mehmon alohida hisoblanadi (pauza taymerni to‘xtatadi, oshsa soatbay blok)', async () => {
    const { svc, rooms, clock } = await setup()
    let v = await svc.sessions.open(rooms.s1, 2, 60) // 50 000 so'm/soat, 1 soat olingan
    const [g1, g2] = v.guests
    clock.advanceMin(30)
    v = await svc.sessions.guestPause(g1.id)
    expect(v.guests[0].state).toBe('paused')
    expect(v.guests[0].runningRate).toBe(0)
    clock.advanceMin(30)
    v = await svc.sessions.get(v.session.id)
    expect(v.guests[0].elapsedMs).toBe(30 * MIN)
    expect(v.guests[0].remainingMs).toBe(30 * MIN) // pauzada taymer turibdi
    expect(v.guests[0].timeAmount).toBe(50_000) // olingan soat to'liq
    expect(v.guests[1].timeAmount).toBe(50_000)
    expect(v.guests[1].remainingMs).toBe(0)

    v = await svc.sessions.guestResume(g1.id)
    expect(v.guests[0].intervals).toHaveLength(2)
    expect(v.guests[0].paidMinutes).toBe(60)
    clock.advanceMin(15)
    v = await svc.sessions.get(v.session.id)
    // g1: 45 daq (< 60) → 50 000; g2: 75 daq → 75 × 50 000/60 = 62 500 → 63 000 (yaxlitlash 1000)
    expect(v.guests[0].timeAmount).toBe(50_000)
    expect(v.guests[1].timeAmount).toBe(63_000)
    expect(v.timeTotal).toBe(113_000)

    v = await svc.sessions.guestFinish(g2.id)
    expect(v.guests[1].state).toBe('finished')
    clock.advanceMin(60)
    v = await svc.sessions.get(v.session.id)
    expect(v.guests[1].timeAmount).toBe(63_000) // to'xtagan
    expect(v.guests[0].timeAmount).toBe(88_000) // 105 daqiqa → 87 500 → 88 000
  })

  it('erta chiqib ketgan mehmon ham olingan vaqtni to‘liq to‘laydi', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 2, 120)
    clock.advanceMin(10)
    const v = await svc.sessions.guestFinish(v0.guests[0].id)
    expect(v.guests[0]).toMatchObject({ state: 'finished', elapsedMs: 10 * MIN, billedMinutes: 120, timeAmount: 100_000 })
  })

  it('finished mehmonni qayta ishga tushirish paidMinutes ni o‘zgartirmaydi', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    const g = v0.guests[0]
    clock.advanceMin(20)
    await svc.sessions.guestFinish(g.id)
    clock.advanceMin(30)
    const v = await svc.sessions.guestResume(g.id)
    expect(v.guests[0]).toMatchObject({ state: 'running', paidMinutes: 60, elapsedMs: 20 * MIN, remainingMs: 40 * MIN })
  })

  it('noto‘g‘ri holat o‘tishlari rad etiladi', async () => {
    const { svc, rooms } = await setup()
    const v = await svc.sessions.open(rooms.s1, 1, 60)
    const g = v.guests[0]
    await expect(svc.sessions.guestResume(g.id)).rejects.toThrow('allaqachon ishlayapti')
    await svc.sessions.guestPause(g.id)
    await expect(svc.sessions.guestPause(g.id)).rejects.toThrow('allaqachon')
    await svc.sessions.guestFinish(g.id)
    await expect(svc.sessions.guestFinish(g.id)).rejects.toThrow('allaqachon chiqib ketgan')
    await expect(svc.sessions.guestPause(9999)).rejects.toThrow('Mehmon topilmadi')
  })

  it('stopAll: hamma to‘xtaydi, vaqt o‘smaydi, olingan vaqt to‘liq', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s2, 2, 60) // 60 000
    clock.advanceMin(20)
    let v = await svc.sessions.stopAll(v0.session.id)
    expect(v.guests.every((g) => g.state === 'finished')).toBe(true)
    clock.advanceMin(100)
    v = await svc.sessions.get(v0.session.id)
    expect(v.timeTotal).toBe(120_000)
  })

  it('renameGuest', async () => {
    const { svc, rooms } = await setup()
    const v = await svc.sessions.open(rooms.s1, 1, 60)
    const v2 = await svc.sessions.renameGuest(v.guests[0].id, '  Akmal ')
    expect(v2.guests[0].label).toBe('Akmal')
    await expect(svc.sessions.renameGuest(v.guests[0].id, ' ')).rejects.toThrow()
  })
})

describe('xona almashtirish', () => {
  it('ishlayotganlar yangi narxga o‘tadi, pauzadagilar keyingi davomda yangi narxni oladi', async () => {
    const { svc, rooms, clock } = await setup()
    let v = await svc.sessions.open(rooms.s1, 2, 120) // 50 000, 2 soat olingan
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
    // pauzadagi mehmonga yangi xona narxi bilan 0 uzunlikdagi oraliq qo'shiladi (qolgan vaqt yangi narxda)
    const pausedIvs = v.guests.find((g) => g.id === g2.id)!.intervals
    expect(pausedIvs).toHaveLength(2)
    expect(pausedIvs[1]).toMatchObject({ roomId: rooms.vip, rate: 100_000, start: clock.t, end: clock.t })
    // Qolgan (oldindan olingan) 60 daqiqa darhol yangi narxda: 60×50k + 60×100k
    expect(gv1.timeAmount).toBe(150_000)

    clock.advanceMin(30)
    v = await svc.sessions.guestResume(g2.id)
    expect(v.guests.find((g) => g.id === g2.id)!.runningRate).toBe(100_000)
    clock.advanceMin(30)
    v = await svc.sessions.get(v.session.id)
    // g1: 60 daq × 50k + 60 daq × 100k = 150 000
    // g2: 60 daq × 50k + 30 daq × 100k + qolgan 30 daq (oxirgi tarif 100k) = 150 000
    expect(v.guests.find((g) => g.id === g1.id)!.timeAmount).toBe(150_000)
    expect(v.guests.find((g) => g.id === g2.id)!.timeAmount).toBe(150_000)
    expect(v.total).toBe(300_000)
    // oshib ketsa: ortiqcha daqiqa yangi xona narxida — 60×50k/60 + 61×100k/60 = 151 667 → 152 000
    clock.advanceMin(1)
    v = await svc.sessions.get(v.session.id)
    expect(v.guests.find((g) => g.id === g1.id)!.timeAmount).toBe(152_000)

    // eski xona bo'shadi
    const board = await svc.rooms.board()
    expect(board.find((c) => c.room.id === rooms.s1)!.session).toBeNull()
    expect(board.find((c) => c.room.id === rooms.vip)!.session?.session.id).toBe(v.session.id)
  })

  it('band xonaga, sig‘imi kichik xonaga va o‘sha xonaga ko‘chirish rad etiladi', async () => {
    const { svc, rooms } = await setup()
    const a = await svc.sessions.open(rooms.s2, 7, 60)
    await svc.sessions.open(rooms.vip, 1, 60)
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
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advanceMin(60)
    const v = await svc.sessions.setDiscount(v0.session.id, 10_000)
    expect(v.discount).toBe(10_000)
    expect(v.total).toBe(40_000)
    await expect(svc.sessions.setDiscount(v0.session.id, 60_000)).rejects.toThrow('oshmasligi')
    await expect(svc.sessions.setDiscount(v0.session.id, -1)).rejects.toThrow()
  })

  it('bo‘sh sessiyani bekor qilish; buyurtma bo‘lsa yoki kassir vaqt hisoblangandan keyin — rad', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.sessions.cancel(a.session.id)
    expect((await svc.rooms.board()).find((c) => c.room.id === rooms.s1)!.session).toBeNull()
    await expect(svc.checkout.receipt(a.session.id)).rejects.toThrow('bekor qilingan')

    const b = await svc.sessions.open(rooms.s1, 1, 60)
    const p = (await svc.catalog.products()).find((x) => x.trackStock)!
    await svc.lines.addProduct(b.session.id, p.id, 1, null)
    await expect(svc.sessions.cancel(b.session.id)).rejects.toThrow('buyurtmalar bor')

    await loginAs('cashier')
    const c = await svc.sessions.open(rooms.s2, 1, 60)
    clock.advanceMin(30)
    await expect(svc.sessions.cancel(c.session.id)).rejects.toThrow('administrator')
  })
})
