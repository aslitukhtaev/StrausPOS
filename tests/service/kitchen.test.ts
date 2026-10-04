import { describe, expect, it } from 'vitest'
import { renderKitchenHtml } from '../../electron/main/receipt'
import { HOUR, T0, kitchenSetup, productByName, recordingHost, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

async function payAll(ctx: Ctx, sessionId: number) {
  const v = await ctx.svc.sessions.get(sessionId)
  return ctx.svc.checkout.pay(sessionId, [{ method: 'cash', amount: v.total }], null)
}

async function kitchenCtx() {
  const rec = recordingHost()
  const ctx = await setup({ host: rec.host })
  const k = await kitchenSetup(ctx.svc)
  const s = await ctx.svc.settings.get()
  await ctx.svc.settings.save({ ...s, kitchen: { ...s.kitchen, printerName: 'Oshxona-58', paperWidth: 58 } })
  return { ...ctx, ...rec, k }
}

describe('oshxona bo‘limi (kategoriya department)', () => {
  it('saveCategory: standart bar, kitchen saqlanadi, tahrirda saqlanib qoladi; noto‘g‘ri qiymat rad', async () => {
    const { svc } = await setup()
    const cats = await svc.catalog.categories()
    expect(cats.every((c) => c.department === 'bar')).toBe(true)
    const a = await svc.catalog.saveCategory({ name: 'Ichimlik 2' })
    expect(a.department).toBe('bar')
    const b = await svc.catalog.saveCategory({ name: 'Oshxona', department: 'kitchen' })
    expect(b).toMatchObject({ name: 'Oshxona', department: 'kitchen' })
    const b2 = await svc.catalog.saveCategory({ id: b.id, name: 'Issiq ovqat' })
    expect(b2).toMatchObject({ name: 'Issiq ovqat', department: 'kitchen' })
    const a2 = await svc.catalog.saveCategory({ id: a.id, name: 'Ichimlik 2', department: 'kitchen' })
    expect(a2.department).toBe('kitchen')
    await expect(svc.catalog.saveCategory({ name: 'X', department: 'sklad' as 'bar' })).rejects.toThrow("Bo'lim noto'g'ri")
    expect((await svc.catalog.categories()).find((c) => c.id === b.id)?.department).toBe('kitchen')
  })

  it('qator bo‘limni oladi: oshxona mahsuloti → kitchen, xizmat → null', async () => {
    const { svc, rooms, k } = await kitchenCtx()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addService(v0.session.id, (await svc.catalog.services())[0].id, null, null)
    const v = await svc.lines.addProducts(v0.session.id, [{ productId: beer.id, qty: 1 }, { productId: k.osh.id, qty: 2 }], null)
    expect(v.lines.map((l) => [l.name, l.department])).toEqual([
      ['Klassik massaj', null],
      ['Pivo 0.5 L', 'bar'],
      ['Osh', 'kitchen']
    ])
  })
})

describe('oshxona cheki', () => {
  it('oshxona mahsuloti qo‘shilganda oshxona printeriga (nom, qog‘oz) — xona, miqdor, ofitsiant, kim, vaqt, №', async () => {
    const { svc, rooms, k, printed, staff, clock } = await kitchenCtx()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.vip, 2, 60)
    // Faqat bar mahsuloti — oshxona cheki chiqmaydi
    await svc.lines.addProduct(v0.session.id, beer.id, 1, null)
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(0)

    await svc.lines.addProduct(v0.session.id, k.lagmon.id, 2, null, staff.waiter.id)
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(1)
    expect(printed[0]).toMatchObject({ printerName: 'Oshxona-58', paperWidth: 58 })
    const html = printed[0].html
    expect(html).toContain('OSHXONA')
    expect(html).toContain('VIP xona')
    expect(html).toMatch(/2 ×<\/span> <span class="n">Lag&#39;mon/)
    expect(html).toContain('Ofitsiant: <b>Sardor</b>')
    expect(html).toContain("Qo'shdi: Ega (Ega)")
    expect(html).toContain('15.01.2026 10:00')
    expect(html).toContain('size: 58mm')
    const t = svc.listKitchenTickets(v0.session.id)
    expect(t).toEqual([{ id: t[0].id, kind: 'order', items: [{ name: "Lag'mon", qty: 2 }], printed: true, error: null }])
    expect(html).toContain(`Buyurtma № <b>${t[0].id}</b>`)
    expect(clock.t).toBe(T0)
  })

  it('addProducts: bitta tranzaksiya va BITTA oshxona cheki (faqat oshxona mahsulotlari)', async () => {
    const { svc, rooms, k, printed, loginAs } = await kitchenCtx()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    await loginAs('waiter')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProducts(
      v0.session.id,
      [{ productId: k.osh.id, qty: 1 }, { productId: beer.id, qty: 2 }, { productId: k.manti.id, qty: 3 }, { productId: k.osh.id, qty: 1 }],
      null
    )
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(1)
    expect(printed[0].html).toContain('Osh')
    expect(printed[0].html).toContain('Manti')
    expect(printed[0].html).not.toContain('Pivo')
    expect(printed[0].html).toContain('Ofitsiant: <b>Sardor</b>')
    expect(printed[0].html).toContain("Qo'shdi: Sardor (Ofitsiant)")
    expect(svc.listKitchenTickets(v0.session.id).map((t) => t.items)).toEqual([[{ name: 'Osh', qty: 2 }, { name: 'Manti', qty: 3 }]])
  })

  it('xonasiz bar savdosi: oshxona chekida "Bar", ofitsiant yo‘q', async () => {
    const { svc, k, printed, loginAs } = await kitchenCtx()
    await loginAs('cashier')
    const b = await svc.barSales.open()
    await svc.lines.addProduct(b.session.id, k.manti.id, 1, null)
    await svc.flushKitchenPrints()
    expect(printed[0].html).toContain('<div class="center room">Bar</div>')
    expect(printed[0].html).not.toContain('Ofitsiant:')
    expect(printed[0].html).toContain("Qo'shdi: Kassir (Kassir)")
  })

  it('qaytarishda "BEKOR" cheki; bar mahsuloti qaytsa — chiqmaydi', async () => {
    const { svc, rooms, k, printed, loginAs } = await kitchenCtx()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    const v = await svc.lines.addProducts(v0.session.id, [{ productId: k.osh.id, qty: 3 }, { productId: beer.id, qty: 1 }], null)
    await loginAs('admin')
    await svc.lines.returnLine(v.lines[1].id, 1, '') // pivo
    await svc.lines.returnLine(v.lines[0].id, 2, 'Mijoz voz kechdi')
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(2)
    expect(printed[1].html).toContain('BEKOR')
    expect(printed[1].html).not.toContain('OSHXONA')
    expect(printed[1].html).toContain('−2 ×')
    expect(printed[1].html).toContain('Osh')
    expect(svc.listKitchenTickets(v0.session.id).map((t) => [t.kind, t.items])).toEqual([
      ['order', [{ name: 'Osh', qty: 3 }]],
      ['cancel', [{ name: 'Osh', qty: 2 }]]
    ])
  })

  it('autoPrint=false — chek chiqmaydi, jurnal yozilmaydi; reprint baribir ishlaydi', async () => {
    const { svc, rooms, k, printed } = await kitchenCtx()
    const s = await svc.settings.get()
    await svc.settings.save({ ...s, kitchen: { ...s.kitchen, autoPrint: false } })
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(v0.session.id, k.osh.id, 1, null)
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(0)
    expect(svc.listKitchenTickets(v0.session.id)).toEqual([])
    await svc.kitchen.reprint(v0.session.id)
    expect(printed).toHaveLength(1)
    expect(printed[0].html).toContain('(qayta chop etildi)')
  })

  it('printer xatosi amalni bekor qilmaydi: qator va ombor joyida, jurnalda xato; reprint xatoni ko‘rsatadi, keyin chiqadi', async () => {
    const { svc, rooms, k, printed, fail } = await kitchenCtx()
    fail.kitchen = true
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    const v = await svc.lines.addProducts(v0.session.id, [{ productId: k.osh.id, qty: 1 }, { productId: k.lagmon.id, qty: 1 }], null)
    expect(v.lines).toHaveLength(2)
    await svc.flushKitchenPrints()
    expect(printed).toHaveLength(0)
    expect(svc.listKitchenTickets(v0.session.id)).toEqual([expect.objectContaining({ kind: 'order', printed: false, error: 'Printer topilmadi' })])
    expect((await svc.sessions.get(v0.session.id)).lines).toHaveLength(2)

    await expect(svc.kitchen.reprint(v0.session.id)).rejects.toThrow('Printer topilmadi')
    fail.kitchen = false
    await svc.kitchen.reprint(v0.session.id)
    expect(printed).toHaveLength(1)
    expect(printed[0].html).toContain('Osh')
    expect(printed[0].html).toContain("Lag&#39;mon")
  })

  it('reprint: faqat faol oshxona qatorlari; yo‘q bo‘lsa xato; ruxsat session.manage', async () => {
    const { svc, rooms, k, printed, loginAs } = await kitchenCtx()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProduct(v0.session.id, beer.id, 1, null)
    await expect(svc.kitchen.reprint(v0.session.id)).rejects.toThrow("oshxona mahsulotlari yo'q")
    const v = await svc.lines.addProduct(v0.session.id, k.osh.id, 2, null)
    await loginAs('admin')
    await svc.lines.returnLine(v.lines[1].id, 1, '')
    await svc.flushKitchenPrints()
    printed.length = 0
    await loginAs('waiter')
    await svc.kitchen.reprint(v0.session.id)
    expect(printed[0].html).toMatch(/1 ×<\/span> <span class="n">Osh/)
    await svc.auth.logout()
    await expect(svc.kitchen.reprint(v0.session.id)).rejects.toThrow('Avval tizimga kiring')
  })

  it('renderKitchenHtml: HTML escape, 80 mm standart', () => {
    const html = renderKitchenHtml({
      kind: 'order', orderNo: 7, roomName: '<VIP>', items: [{ name: 'Osh & non', qty: 1 }], waiterName: null, addedBy: 'Ali (Kassir)', at: T0, paperWidth: 80
    })
    expect(html).toContain('&lt;VIP&gt;')
    expect(html).toContain('Osh &amp; non')
    expect(html).toContain('size: 80mm')
    expect(html).toContain('Buyurtma № <b>7</b>')
  })
})

describe('oshxona kunlik hisobi', () => {
  it('daily: savdo × sessiya yopilgan paytdagi ulush; qaytarish ayiriladi; payout/payouts; balans', async () => {
    const ctx = await kitchenCtx()
    const { svc, rooms, k, clock, loginAs } = ctx
    const beer = await productByName(svc, 'Pivo 0.5 L')
    // 15-yanvar: 1) Osh 2 (80 000) + Pivo → ulush 100% → 80 000
    const a = await svc.sessions.open(rooms.s1, 1, 60)
    await svc.lines.addProducts(a.session.id, [{ productId: k.osh.id, qty: 2 }, { productId: beer.id, qty: 1 }], null)
    await payAll(ctx, a.session.id)
    // ulush 40% ga o'zgaradi
    const s = await svc.settings.get()
    await svc.settings.save({ ...s, kitchen: { ...s.kitchen, sharePct: 40 } })
    // 2) Manti 3 (90 000), 1 tasi qaytdi → 60 000 × 40% = 24 000
    const b = await svc.sessions.open(rooms.s2, 1, 60)
    const vb = await svc.lines.addProduct(b.session.id, k.manti.id, 3, null)
    await loginAs('admin')
    await svc.lines.returnLine(vb.lines[0].id, 1, '')
    await payAll(ctx, b.session.id)
    // 3) faqat bar — oshxona hisobiga kirmaydi
    const c = await svc.barSales.open()
    await svc.lines.addProduct(c.session.id, beer.id, 1, null)
    await payAll(ctx, c.session.id)
    // 16-yanvar: Lag'mon 1 (35 000) × 40% = 14 000; ulush keyin 50% bo'lsa ham o'zgarmaydi
    clock.t = new Date(2026, 0, 16, 12, 0).getTime()
    const d = await svc.barSales.open()
    await svc.lines.addProduct(d.session.id, k.lagmon.id, 1, null)
    await payAll(ctx, d.session.id)
    await loginAs('owner')
    await svc.settings.save({ ...(await svc.settings.get()), kitchen: { ...s.kitchen, sharePct: 50 } })
    // Ochiq sessiya hisobga kirmaydi
    const e = await svc.sessions.open(rooms.vip, 1, 60)
    await svc.lines.addProduct(e.session.id, k.osh.id, 1, null)

    await svc.kitchen.payout('2026-01-15', 100_000, ' kechki ')
    await svc.kitchen.payout('2026-01-15', 4_000, '')
    expect(await svc.kitchen.daily('2026-01')).toEqual([
      { day: '2026-01-15', sales: 140_000, due: 104_000, paid: 104_000, balance: 0, orders: 2 },
      { day: '2026-01-16', sales: 35_000, due: 14_000, paid: 0, balance: 14_000, orders: 1 }
    ])
    expect(await svc.kitchen.daily('2026-02')).toEqual([])
    const pays = await svc.kitchen.payouts('2026-01')
    expect(pays.map((p) => [p.day, p.amount, p.note])).toEqual([
      ['2026-01-15', 100_000, 'kechki'],
      ['2026-01-15', 4_000, '']
    ])
    expect(pays[0]).toMatchObject({ by: ctx.staff.owner.id, at: clock.t })
    // Hisobot: oshxona mahsulotlari ham mahsulot tushumida
    const rep = await svc.reports.sales({ from: T0 - HOUR, to: clock.t + HOUR })
    expect(rep.productRevenue).toBe(80_000 + 20_000 + 60_000 + 20_000 + 35_000)
  })

  it('tekshiruvlar va ruxsatlar: payout — staff.manage, daily/payouts — reports.view', async () => {
    const { svc, loginAs } = await kitchenCtx()
    await expect(svc.kitchen.payout('2026-1-15', 1000, '')).rejects.toThrow("Kun noto'g'ri")
    await expect(svc.kitchen.payout('2026-02-30', 1000, '')).rejects.toThrow("Kun noto'g'ri")
    await expect(svc.kitchen.payout('2026-01-16', 1000, '')).rejects.toThrow('Kelajak')
    await expect(svc.kitchen.payout('2026-01-15', 0, '')).rejects.toThrow('Summa')
    await expect(svc.kitchen.payout('2026-01-15', 10.5, '')).rejects.toThrow('Summa')
    await expect(svc.kitchen.daily('2026-13')).rejects.toThrow('Oy noto')
    await loginAs('admin')
    await expect(svc.kitchen.daily('2026-01')).resolves.toEqual([])
    await expect(svc.kitchen.payouts('2026-01')).resolves.toEqual([])
    await expect(svc.kitchen.payout('2026-01-15', 1000, '')).rejects.toThrow(DENIED)
    for (const who of ['cashier', 'waiter'] as const) {
      await loginAs(who)
      await expect(svc.kitchen.daily('2026-01')).rejects.toThrow(DENIED)
      await expect(svc.kitchen.payouts('2026-01')).rejects.toThrow(DENIED)
      await expect(svc.kitchen.payout('2026-01-15', 1000, '')).rejects.toThrow(DENIED)
    }
  })

  it('sozlama: ulush 0..100, oshxona qog‘ozi 58/80', async () => {
    const { svc } = await setup()
    const s = await svc.settings.get()
    await expect(svc.settings.save({ ...s, kitchen: { ...s.kitchen, sharePct: 101 } })).rejects.toThrow('Oshxona ulushi')
    await expect(svc.settings.save({ ...s, kitchen: { ...s.kitchen, sharePct: -1 } })).rejects.toThrow('Oshxona ulushi')
    await expect(svc.settings.save({ ...s, kitchen: { ...s.kitchen, paperWidth: 57 as 58 } })).rejects.toThrow("Oshxona cheki qog'ozi")
    const saved = await svc.settings.save({ ...s, kitchen: { sharePct: 30.555, printerName: '  XP-58  ', paperWidth: 58, autoPrint: false } })
    expect(saved.kitchen).toEqual({ sharePct: 30.56, printerName: 'XP-58', paperWidth: 58, autoPrint: false })
  })
})
