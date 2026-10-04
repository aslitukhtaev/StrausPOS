import { describe, expect, it } from 'vitest'
import { MIN, setup } from './helpers'

describe('QA tuzatishlari', () => {
  it('xona almashtirilganda pauzadagi mehmonning qolgan vaqti yangi xona narxida hisoblanadi', async () => {
    const { svc, rooms, clock } = await setup()
    const list = await svc.rooms.list()
    const s1 = list.find((r) => r.id === rooms.s1)!.pricePerHour
    const vip = list.find((r) => r.id === rooms.vip)!.pricePerHour
    expect(vip).not.toBe(s1)
    const v0 = await svc.sessions.open(rooms.s1, 2, 60)
    const [a, b] = v0.guests
    clock.advanceMin(10)
    await svc.sessions.guestPause(b.id)
    const v = await svc.sessions.moveRoom(v0.session.id, rooms.vip)
    const exp = Math.round(((10 * s1) / 60 + (50 * vip) / 60) / 1000) * 1000
    expect(v.guests.find((g) => g.id === a.id)!.timeAmount).toBe(exp)
    expect(v.guests.find((g) => g.id === b.id)!.timeAmount).toBe(exp)
    // Davom ettirilganda summa sakramaydi va vaqt o'zgarmaydi
    const r = await svc.sessions.guestResume(b.id)
    const gb = r.guests.find((g) => g.id === b.id)!
    expect(gb.timeAmount).toBe(exp)
    expect(gb.elapsedMs).toBe(10 * MIN)
  })

  it('kelajak oy uchun ofitsiantga pul berib bo‘lmaydi', async () => {
    const { svc, staff, clock } = await setup()
    const d = new Date(clock.now())
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const m = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    await expect(svc.waiters.payout(staff.waiter.id, m, 1000, '')).rejects.toThrow('Kelajak oy')
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    await expect(svc.waiters.payout(staff.waiter.id, cur, 1000, '')).resolves.toMatchObject({ amount: 1000 })
  })
})
