import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../electron/main/PosService'
import { MIN, setup } from './helpers'

describe('vaqt qo‘shish (extendGuest / extendAll)', () => {
  it('extendGuest: olingan vaqt oshadi, taymer va summa yangilanadi', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    clock.advanceMin(50)
    const v = await svc.sessions.extendGuest(v0.guests[0].id, 60)
    expect(v.guests[0]).toMatchObject({ paidMinutes: 120, remainingMs: 70 * MIN, billedMinutes: 120, timeAmount: 100_000 })
    expect(v.guests[1]).toMatchObject({ paidMinutes: 60, remainingMs: 10 * MIN, timeAmount: 50_000 })
    // 70 daqiqada: 1-mehmon hali oldindan olingan vaqt ichida, 2-mehmon oshib ketdi
    clock.advanceMin(20)
    const v2 = await svc.sessions.get(v0.session.id)
    expect(v2.guests[0].timeAmount).toBe(100_000)
    // 2-mehmon: 70 daq × 50 000/60 = 58 333 → 58 000 (daqiqalik, yaxlitlash 1000)
    expect(v2.guests[1].timeAmount).toBe(58_000)
  })

  it('oshib ketgandan keyin uzaytirish — blok qoidasi yangi paidMinutes bo‘yicha', async () => {
    const { svc, rooms, clock } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advanceMin(75)
    expect((await svc.sessions.get(v0.session.id)).guests[0].billedMinutes).toBe(75)
    const v = await svc.sessions.extendGuest(v0.guests[0].id, 120)
    expect(v.guests[0]).toMatchObject({ paidMinutes: 180, billedMinutes: 180, remainingMs: 105 * MIN, timeAmount: 150_000 })
  })

  it('tekshiruvlar: minutes > 0 butun, chiqib ketgan mehmon, yopilgan sessiya', async () => {
    const { svc, rooms } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    const g = v0.guests[0]
    for (const bad of [0, -60, 2.5, 1441, NaN]) {
      await expect(svc.sessions.extendGuest(g.id, bad)).rejects.toThrow("Qo'shiladigan vaqt")
      await expect(svc.sessions.extendAll(v0.session.id, bad)).rejects.toThrow("Qo'shiladigan vaqt")
    }
    await expect(svc.sessions.extendGuest(99999, 60)).rejects.toThrow('Mehmon topilmadi')
    await svc.sessions.guestFinish(g.id)
    await expect(svc.sessions.extendGuest(g.id, 60)).rejects.toThrow('chiqib ketgan')
    expect((await svc.sessions.get(v0.session.id)).guests[0].paidMinutes).toBe(60)
    const v = await svc.sessions.get(v0.session.id)
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: v.total }], null)
    await expect(svc.sessions.extendGuest(v0.guests[1].id, 60)).rejects.toThrow('Sessiya yopilgan')
    await expect(svc.sessions.extendAll(v0.session.id, 60)).rejects.toThrow('Sessiya yopilgan')
  })

  it('extendAll: running va paused mehmonlarga qo‘shiladi, finished larga — yo‘q', async () => {
    const { svc, rooms } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 3, 60)
    const [a, b, c] = v0.guests
    await svc.sessions.guestPause(b.id)
    await svc.sessions.guestFinish(c.id)
    const v = await svc.sessions.extendAll(v0.session.id, 60)
    expect(v.guests.find((g) => g.id === a.id)!.paidMinutes).toBe(120)
    expect(v.guests.find((g) => g.id === b.id)!.paidMinutes).toBe(120)
    expect(v.guests.find((g) => g.id === c.id)!.paidMinutes).toBe(60)
    expect(v.timeTotal).toBe(100_000 + 100_000 + 50_000)
    await svc.sessions.stopAll(v0.session.id)
    await expect(svc.sessions.extendAll(v0.session.id, 60)).rejects.toThrow("faol mehmon yo'q")
  })
})

describe('sozlamalar: blok va imtiyozli daqiqalar', () => {
  it('standart qiymatlar', async () => {
    const { svc } = await setup()
    const s = await svc.settings.get()
    expect(s).toMatchObject({ defaultHours: 1, blockMinutes: 1, graceMinutes: 0, warnBeforeMinutes: 10, theme: 'auto', roundTo: 1000 })
    expect(s.kitchen).toEqual({ sharePct: 100, printerName: '', paperWidth: 80, autoPrint: true })
    expect(s.receipt.businessName).toBe('Delfin Sauna')
    expect(DEFAULT_SETTINGS.receipt.businessName).toBe('Delfin Sauna')
  })

  it('graceMinutes: imtiyoz ichida qo‘shimcha blok yo‘q; blockMinutes=30', async () => {
    const { svc, rooms, clock } = await setup()
    const s = await svc.settings.get()
    await svc.settings.save({ ...s, graceMinutes: 10 })
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advanceMin(70)
    expect((await svc.sessions.get(v0.session.id)).guests[0].timeAmount).toBe(50_000)
    clock.advanceMin(1)
    // 71 daq (imtiyozdan oshdi) → aynan 71 daq: 59 167 → 59 000
    expect((await svc.sessions.get(v0.session.id)).guests[0].timeAmount).toBe(59_000)

    await svc.settings.save({ ...(await svc.settings.get()), graceMinutes: 0, blockMinutes: 30 })
    const g = (await svc.sessions.get(v0.session.id)).guests[0] // 71 daq → 60 + 30
    expect(g.billedMinutes).toBe(90)
    expect(g.timeAmount).toBe(75_000)
    clock.advanceMin(20) // 91 daq → 60 + 2×30
    expect((await svc.sessions.get(v0.session.id)).guests[0].billedMinutes).toBe(120)
  })

  it('noto‘g‘ri qiymatlar rad etiladi, saqlangan sozlama o‘zgarmaydi', async () => {
    const { svc } = await setup()
    const s = await svc.settings.get()
    await expect(svc.settings.save({ ...s, blockMinutes: 0 })).rejects.toThrow('Blok')
    await expect(svc.settings.save({ ...s, graceMinutes: -1 })).rejects.toThrow('Imtiyozli')
    await expect(svc.settings.save({ ...s, defaultHours: 0 })).rejects.toThrow('Standart soat')
    await expect(svc.settings.save({ ...s, warnBeforeMinutes: 1.5 })).rejects.toThrow('Ogohlantirish')
    await expect(svc.settings.save({ ...s, theme: 'neon' as 'auto' })).rejects.toThrow('rejimi')
    const saved = await svc.settings.save({ ...s, theme: 'dark', defaultHours: 2, warnBeforeMinutes: 5 })
    expect(saved).toMatchObject({ theme: 'dark', defaultHours: 2, warnBeforeMinutes: 5 })
    expect(svc.currentTheme()).toBe('dark')
  })

  it('eski (yangi maydonlarsiz) sozlamalar standartlar bilan birlashtiriladi', async () => {
    const { svc } = await setup()
    const old = { receipt: { businessName: 'Eski nom', paperWidth: 58 }, roundTo: 500, lockEnabled: false, autoLockMinutes: 5, language: 'uz' }
    svc.db.run("UPDATE kv SET value=? WHERE key='settings'", [JSON.stringify(old)])
    const s = await svc.settings.get()
    expect(s).toMatchObject({ roundTo: 500, lockEnabled: false, autoLockMinutes: 5, defaultHours: 1, blockMinutes: 1, graceMinutes: 0, warnBeforeMinutes: 10, theme: 'auto' })
    expect(s.kitchen).toEqual(DEFAULT_SETTINGS.kitchen)
    expect(s.receipt).toMatchObject({ businessName: 'Eski nom', paperWidth: 58, footer: DEFAULT_SETTINGS.receipt.footer })
  })
})

describe('bekor qilish (oldindan olingan vaqt bilan)', () => {
  it('ofitsiant birinchi daqiqa ichida bekor qila oladi, keyin — administrator kerak', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    await loginAs('waiter')
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    expect(a.timeTotal).toBe(50_000)
    clock.advance(30_000)
    await svc.sessions.cancel(a.session.id)
    const b = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advanceMin(1)
    await expect(svc.sessions.cancel(b.session.id)).rejects.toThrow('administrator')
    await loginAs('admin')
    await svc.sessions.cancel(b.session.id)
  })
})
