import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { BotSync, type BotPayload } from '../../electron/main/sync/botSync'
import { productByName, setup } from './helpers'

function mkSync(ctx: Awaited<ReturnType<typeof setup>>, transport: (url: string, secret: string, body: string) => Promise<void>) {
  let saved: string | null = null
  const sync = new BotSync({ svc: ctx.svc, store: { load: () => saved, save: (j) => { saved = j } }, transport, clock: () => ctx.clock.t, intervalMs: 0 })
  return { sync, stored: () => saved }
}

describe('Telegram bot sinxronizatsiyasi (dastur → PHP server)', () => {
  it('holat nusxasi: smena, xonalar, ostatka, bugungi tushum', async () => {
    const ctx = await setup()
    const { svc, rooms, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    await svc.catalog.adjustStock(beer.id, 3, 'test')
    const v0 = await svc.sessions.open(rooms.s1, 2, 60, ctx.staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, beer.id, 1, null)
    const snap = svc.botSnapshot()
    expect(snap.business).toBe('Delfin Sauna')
    expect(snap.shift!.shift.openedByName).toBe('Ega')
    const s1 = snap.rooms.find((r) => r.name === 'Sauna 1')!
    expect(s1).toMatchObject({ open: true, guests: 2, waiter: 'Sardor', total: 120_000 })
    expect(snap.rooms.find((r) => r.name === 'Sauna 2')).toMatchObject({ open: false, total: 0 })
    expect(snap.stock.find((p) => p.name === 'Pivo 0.5 L')).toMatchObject({ low: expect.any(Boolean) })
    expect(snap.today.total).toBe(0)
    clock.advanceMin(60)
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: (await svc.sessions.get(v0.session.id)).total }], null)
    expect(svc.botSnapshot().today).toMatchObject({ total: 120_000, byMethod: { cash: 120_000 }, sessions: 1 })
  })

  it('save/status: kalit qiymati qaytmaydi; noto‘g‘ri manzil rad; yuborish va voqealar navbati', async () => {
    const ctx = await setup()
    const sent: { url: string; secret: string; body: BotPayload }[] = []
    let fail = false
    const { sync, stored } = mkSync(ctx, async (url, secret, body) => {
      if (fail) throw new Error('Aloqa xatosi: ECONNREFUSED')
      sent.push({ url, secret, body: JSON.parse(body) as BotPayload })
    })
    sync.start()
    expect(await sync.tick()).toBe(false) // o'chiq
    await expect(sync.save({ enabled: true, url: 'ftp://x', secret: 'k' })).rejects.toThrow('http')
    await expect(sync.save({ enabled: true, url: 'https://x.uz/bot/receive.php' })).rejects.toThrow('Maxfiy kalit')
    const st = await sync.save({ enabled: true, url: ' https://x.uz/bot/receive.php ', secret: 'sir-123' })
    expect(st).toMatchObject({ enabled: true, url: 'https://x.uz/bot/receive.php', secretSet: true })
    expect(JSON.stringify(st)).not.toContain('sir-123')
    await new Promise((r) => setTimeout(r, 20)) // save() tick'i
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent[0]).toMatchObject({ url: 'https://x.uz/bot/receive.php', secret: 'sir-123' })
    expect(sent[0].body.snapshot.rooms.length).toBeGreaterThan(0)

    // Aloqa yo'q: smena yopilishi voqeasi navbatda turadi
    fail = true
    await ctx.svc.shifts.close()
    await new Promise((r) => setTimeout(r, 20))
    let s2 = await sync.status()
    expect(s2.pending).toBe(1)
    expect(s2.lastError).toContain('ECONNREFUSED')
    // Aloqa tiklandi — voqea yetkaziladi
    fail = false
    sent.length = 0
    expect(await sync.tick()).toBe(true)
    expect(sent[0].body.events.map((e) => e.type)).toEqual(['shift_closed'])
    expect(sent[0].body.events[0].row.shift.closedAt).not.toBeNull()
    s2 = await sync.status()
    expect(s2).toMatchObject({ pending: 0, lastError: null })
    expect(s2.lastOkAt).toBe(ctx.clock.t)
    // keyingi yuborishda voqea takrorlanmaydi
    sent.length = 0
    await sync.tick()
    expect(sent[0].body.events).toEqual([])
    // saqlangan sozlama qayta yuklanadi
    expect(stored()).toContain('sir-123')
    sync.stop()
  })

  it('test(): server javobi; o‘chirilsa navbat tozalanadi', async () => {
    const ctx = await setup()
    let ok = true
    const { sync } = mkSync(ctx, async () => { if (!ok) throw new Error('Server maxfiy kalitni qabul qilmadi (403)') })
    expect(await sync.test()).toMatchObject({ ok: false })
    await sync.save({ enabled: true, url: 'http://localhost/bot/receive.php', secret: 'k' })
    expect(await sync.test()).toEqual({ ok: true })
    ok = false
    expect(await sync.test()).toEqual({ ok: false, error: 'Server maxfiy kalitni qabul qilmadi (403)' })
    await sync.save({ enabled: false, url: '' })
    expect((await sync.status()).enabled).toBe(false)
  })

  it('namuna yuklama (PHP selftest uchun): BOT_SAMPLE_OUT berilsa faylga yoziladi', async () => {
    const out = process.env.BOT_SAMPLE_OUT
    if (!out) return
    const ctx = await setup()
    const { svc, rooms, clock } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 2, 60, ctx.staff.waiter.id)
    await svc.lines.addProduct(v0.session.id, beer.id, 2, null)
    clock.advanceMin(60)
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 50_000 }, { method: 'card', amount: 90_000 }], null)
    await svc.sessions.open(rooms.vip, 3, 120)
    const events: unknown[] = []
    svc.events.on('shiftClosed', (r) => events.push({ type: 'shift_closed', at: clock.t, row: r }))
    clock.advanceMin(5)
    await ctx.loginAs('cashier')
    await svc.shifts.open() // ega smenasi avtomatik yopiladi
    const payload = { v: 1, sentAt: clock.t, snapshot: svc.botSnapshot(), events }
    fs.writeFileSync(out, JSON.stringify(payload, null, 2))
  })
})
