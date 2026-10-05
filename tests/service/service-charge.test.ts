import { describe, expect, it } from 'vitest'
import { HOUR, T0, kitchenSetup, productByName, setup } from './helpers'
import type { Ctx } from './helpers'
import { renderReceiptHtml } from '../../electron/main/receipt'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

/** Sauna 1 (50 000/soat), 1 mehmon 60 daq = 50 000; 2 × Pivo (20 000) = 40 000 → jami (obslugasiz) 90 000 */
async function room90(ctx: Ctx, opts: { pct?: number } = {}) {
  if (opts.pct !== undefined) await ctx.svc.settings.save({ ...(await ctx.svc.settings.get()), serviceChargePct: opts.pct })
  const beer = await productByName(ctx.svc, 'Pivo 0.5 L')
  const v0 = await ctx.svc.sessions.open(ctx.rooms.s1, 1, 60)
  const v = await ctx.svc.lines.addProduct(v0.session.id, beer.id, 2, null)
  return { id: v.session.id, v, beer }
}

describe('obsluga: hisob', () => {
  it('standart 10%: (50 000 + 40 000) × 10% = 9 000; jami 99 000; due = jami', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { v } = await room90(ctx)
    expect(v).toMatchObject({ timeTotal: 50_000, linesTotal: 40_000, discount: 0, serviceChargePct: 10, serviceCharge: 9_000, total: 99_000, due: 99_000 })
  })

  it('chegirmadan KEYIN: (90 000 − 20 000) × 10% = 7 000; jami 77 000', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    const v = await ctx.svc.sessions.setDiscount(id, 20_000)
    expect(v).toMatchObject({ discount: 20_000, serviceCharge: 7_000, total: 77_000, due: 77_000 })
  })

  it('chegirma obslugasiz jami summadan oshmaydi (90 000 mumkin → obsluga 0; 90 001 rad)', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await expect(ctx.svc.sessions.setDiscount(id, 90_001)).rejects.toThrow('Chegirma jami summadan oshmasligi kerak')
    const v = await ctx.svc.sessions.setDiscount(id, 90_000)
    expect(v).toMatchObject({ serviceCharge: 0, total: 0 })
  })

  it('0% da obsluga yo\'q; sozlama validatsiyasi (0..100)', async () => {
    const ctx = await setup()
    const { v } = await room90(ctx, { pct: 0 })
    expect(v).toMatchObject({ serviceChargePct: 0, serviceCharge: 0, total: 90_000 })
    const s = await ctx.svc.settings.get()
    await expect(ctx.svc.settings.save({ ...s, serviceChargePct: 101 })).rejects.toThrow("Obsluga foizi 0 dan 100 gacha bo'lishi kerak")
    await expect(ctx.svc.settings.save({ ...s, serviceChargePct: -1 })).rejects.toThrow("Obsluga foizi")
  })

  it('yangi bazada standart sozlama 10', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    expect((await ctx.svc.settings.get()).serviceChargePct).toBe(10)
  })

  it('yaxlitlash butun so\'mga: 55 000 × 0.05% = 27.5 → 28', async () => {
    const ctx = await setup()
    await ctx.svc.settings.save({ ...(await ctx.svc.settings.get()), serviceChargePct: 0.05 })
    const suv = await productByName(ctx.svc, 'Suv 0.5 L') // 5 000
    const v0 = await ctx.svc.sessions.open(ctx.rooms.s1, 1, 60)
    const v = await ctx.svc.lines.addProduct(v0.session.id, suv.id, 1, null)
    expect(v).toMatchObject({ serviceCharge: 28, total: 55_028 })
  })

  it('qaytarishdan keyin obsluga kamayadi: 2 → 1 pivo: (50 000 + 20 000) × 10% = 7 000', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { v } = await room90(ctx)
    const r = await ctx.svc.lines.returnLine(v.lines[0].id, 1, 'Sovigan')
    expect(r).toMatchObject({ linesTotal: 20_000, serviceCharge: 7_000, total: 77_000 })
  })
})

describe('obsluga: to\'lov, qarz, aralash', () => {
  it('to\'lov summasi yangi jamiga teng bo\'lishi shart (99 000); 90 000 rad etiladi, hech narsa o\'zgarmaydi', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await expect(ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 90_000 }], null)).rejects.toThrow('jami: 99000, kiritildi: 90000')
    expect((await ctx.svc.sessions.get(id)).session.status).toBe('open')
    const r = await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 99_000 }], null)
    expect(r).toMatchObject({ total: 99_000, serviceCharge: { pct: 10, amount: 9_000 } })
  })

  it('aralash: naqd 50 000 + karta 30 000 + terminal 19 000 = 99 000', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 50_000 }, { method: 'card', amount: 30_000 }, { method: 'terminal', amount: 19_000 }], null)
    const rep = await ctx.svc.reports.sales({ from: 0, to: T0 + HOUR * 5 })
    expect(rep.byMethod).toEqual({ cash: 50_000, card: 30_000, terminal: 19_000, debt: 0 })
    expect(rep.total).toBe(99_000)
  })

  it('qarz: naqd 50 000 + qarz 49 000 (jami 99 000 dan); qarz summasi yangi jamidan', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 50_000 }, { method: 'debt', amount: 49_000 }], { name: 'Ali', phone: '901234567' })
    const debts = await ctx.svc.debts.list(false)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ amount: 49_000, paid: 0 })
    const v = await ctx.svc.sessions.get(id)
    expect(v).toMatchObject({ total: 99_000, paid: 99_000, due: 0 })
  })
})

describe('obsluga: muzlatish', () => {
  it('yopilgach sozlama o\'zgarsa ham eski chek, sessiya va hisobot o\'zgarmaydi; ochiq sessiya yangi foizni oladi', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 99_000 }], null)
    const other = await ctx.svc.sessions.open(ctx.rooms.s2, 1, 60) // ochiq (60 000)
    await ctx.svc.settings.save({ ...(await ctx.svc.settings.get()), serviceChargePct: 20 })

    const closed = await ctx.svc.sessions.get(id)
    expect(closed).toMatchObject({ serviceChargePct: 10, serviceCharge: 9_000, total: 99_000, due: 0 })
    expect((await ctx.svc.checkout.receipt(id)).serviceCharge).toEqual({ pct: 10, amount: 9_000 })
    const rep = await ctx.svc.reports.sales({ from: 0, to: T0 + HOUR * 5 })
    expect(rep).toMatchObject({ serviceCharge: 9_000, total: 99_000 })
    const open = await ctx.svc.sessions.get(other.session.id)
    expect(open).toMatchObject({ serviceChargePct: 20, serviceCharge: 12_000, total: 72_000 })
    // DB da muzlatilgan ustunlar
    expect(ctx.svc.db.get('SELECT service_charge_pct AS p, service_charge AS c FROM sessions WHERE id=?', [id])).toEqual({ p: 10, c: 9_000 })
  })

  it('bar savdosida obsluga yo\'q (0), sozlama 10% bo\'lsa ham', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const beer = await productByName(ctx.svc, 'Pivo 0.5 L')
    const b = await ctx.svc.barSales.open()
    const v = await ctx.svc.lines.addProduct(b.session.id, beer.id, 2, null)
    expect(v).toMatchObject({ serviceChargePct: 0, serviceCharge: 0, total: 40_000 })
    const r = await ctx.svc.checkout.pay(b.session.id, [{ method: 'cash', amount: 40_000 }], null)
    expect(r.serviceCharge).toEqual({ pct: 0, amount: 0 })
    expect(renderReceiptHtml(r)).not.toContain('Obsluga')
    const rep = await ctx.svc.reports.sales({ from: 0, to: T0 + HOUR * 5 })
    expect(rep).toMatchObject({ serviceCharge: 0, total: 40_000 })
  })
})

describe('obsluga: ofitsiant haqi va oshxona ulushiga ta\'sir qilmaydi', () => {
  it('2 pivo (ofitsiant 10%) = 4 000; oshxona 35 000 — obslugasiz', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const k = await kitchenSetup(ctx.svc)
    const beer = await productByName(ctx.svc, 'Pivo 0.5 L')
    const v0 = await ctx.svc.sessions.open(ctx.rooms.s1, 1, 60)
    await ctx.svc.lines.addProduct(v0.session.id, beer.id, 2, null, ctx.staff.waiter.id)
    const v = await ctx.svc.lines.addProduct(v0.session.id, k.lagmon.id, 1, null)
    // (50 000 + 40 000 + 35 000) = 125 000 → obsluga 12 500, jami 137 500
    expect(v).toMatchObject({ serviceCharge: 12_500, total: 137_500 })
    await ctx.svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 137_500 }], null)
    const row = ctx.svc.db.get('SELECT product_sales AS ps, waiter_commission AS wc, kitchen_sales AS ks FROM sessions WHERE id=?', [v0.session.id])
    expect(row).toEqual({ ps: 75_000, wc: 4_000, ks: 35_000 })
    expect((await ctx.svc.waiters.monthly('2026-01')).find((w) => w.staffId === ctx.staff.waiter.id)).toMatchObject({ productSales: 40_000, commission: 4_000 })
  })
})

describe('obsluga: hisobot', () => {
  it('SalesReport.serviceCharge va reports.sessions qatori; byRoom/byDay jami obsluga bilan', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const a = await room90(ctx)
    await ctx.svc.checkout.pay(a.id, [{ method: 'cash', amount: 99_000 }], null)
    // 2-sessiya: Sauna 2, 60 000 vaqt, chegirma 10 000 → (50 000) × 10% = 5 000 → jami 55 000
    const s2 = await ctx.svc.sessions.open(ctx.rooms.s2, 1, 60)
    await ctx.svc.sessions.setDiscount(s2.session.id, 10_000)
    await ctx.svc.checkout.pay(s2.session.id, [{ method: 'card', amount: 55_000 }], null)
    const range = { from: 0, to: T0 + HOUR * 5 }
    const rep = await ctx.svc.reports.sales(range)
    expect(rep).toMatchObject({ serviceCharge: 14_000, total: 154_000, discounts: 10_000, timeRevenue: 110_000, productRevenue: 40_000 })
    expect(rep.byMethod).toMatchObject({ cash: 99_000, card: 55_000 })
    expect(rep.byRoom.reduce((s, r) => s + r.total, 0)).toBe(154_000)
    expect(rep.byDay.reduce((s, r) => s + r.total, 0)).toBe(154_000)
    const rows = await ctx.svc.reports.sessions(range)
    expect(rows.map((r) => [r.sessionId, r.serviceCharge, r.total]).sort()).toEqual([[a.id, 9_000, 99_000], [s2.session.id, 5_000, 55_000]].sort())
  })
})

describe('obsluga: chek va oraliq chek', () => {
  it('chekda alohida "Obsluga 10%" qatori JAMI dan oldin; JAMI 99 000', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    const r = await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 99_000 }], null)
    const html = renderReceiptHtml(r)
    const i = html.indexOf('Obsluga 10%:')
    expect(i).toBeGreaterThan(0)
    expect(html.indexOf('9 000 so')).toBeGreaterThan(i)
    expect(html.indexOf('JAMI:')).toBeGreaterThan(i)
    expect(html).toContain('99 000 so')
  })

  it('chegirma bilan: Chegirma qatori, keyin Obsluga, keyin JAMI', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await ctx.svc.sessions.setDiscount(id, 20_000)
    const html = renderReceiptHtml(await ctx.svc.checkout.preBill(id))
    expect(html.indexOf('Chegirma:')).toBeLessThan(html.indexOf('Obsluga 10%:'))
    expect(html.indexOf('Obsluga 10%:')).toBeLessThan(html.indexOf('JAMI:'))
    expect(html).toContain('77 000 so')
  })

  it('oraliq chekda ham ko\'rinadi; 0% bo\'lsa chiqmaydi', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    const pre = await ctx.svc.checkout.preBill(id)
    expect(pre).toMatchObject({ provisional: true, serviceCharge: { pct: 10, amount: 9_000 }, total: 99_000 })
    expect(renderReceiptHtml(pre)).toContain('Obsluga 10%:')
    await ctx.svc.settings.save({ ...(await ctx.svc.settings.get()), serviceChargePct: 0 })
    const pre0 = await ctx.svc.checkout.preBill(id)
    expect(pre0.serviceCharge).toEqual({ pct: 0, amount: 0 })
    expect(renderReceiptHtml(pre0)).not.toContain('Obsluga')
  })
})

describe('sessions.detail va LineView.createdByName', () => {
  it('yopilgan sessiya: muzlatilgan summalar, chek raqami, kim ochgan/yopgan, qaytarishlar, qator muallifi', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id, v } = await room90(ctx)
    expect(v.lines[0].createdByName).toBe('Ega')
    await ctx.loginAs('cashier')
    await ctx.svc.lines.returnLine(v.lines[0].id, 1, 'Sovigan')
    // 50 000 + 20 000 = 70 000 → 7 000 → 77 000
    await ctx.svc.checkout.pay(id, [{ method: 'cash', amount: 77_000 }], null)
    await ctx.loginAs('admin')
    const d = await ctx.svc.sessions.detail(id)
    expect(d.receiptNo).toBe(1)
    expect(d.openedBy).toBe('Ega')
    expect(d.cashier).toBe('Kassir')
    expect(d.view).toMatchObject({ serviceChargePct: 10, serviceCharge: 7_000, total: 77_000, due: 0 })
    expect(d.view.session.status).toBe('closed')
    expect(d.view.lines[0]).toMatchObject({ qty: 2, returnedQty: 1, activeQty: 1, createdByName: 'Ega' })
    expect(d.returns).toEqual([{ lineId: v.lines[0].id, name: 'Pivo 0.5 L', qty: 1, reason: 'Sovigan', at: T0, byName: 'Kassir' }])
  })

  it('ochiq sessiya uchun ham ishlaydi (receiptNo null, cashier null)', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    const d = await ctx.svc.sessions.detail(id)
    expect(d).toMatchObject({ receiptNo: null, cashier: null, returns: [] })
    expect(d.view.total).toBe(99_000)
  })

  it('ruxsat: kassir va ofitsiant — rad; admin — mumkin; noma\'lum id — xato', async () => {
    const ctx = await setup({ serviceChargePct: 10 })
    const { id } = await room90(ctx)
    await ctx.loginAs('cashier')
    await expect(ctx.svc.sessions.detail(id)).rejects.toThrow(DENIED)
    await ctx.loginAs('waiter')
    await expect(ctx.svc.sessions.detail(id)).rejects.toThrow(DENIED)
    await ctx.loginAs('admin')
    await expect(ctx.svc.sessions.detail(99999)).rejects.toThrow()
    expect((await ctx.svc.sessions.detail(id)).view.session.id).toBe(id)
  })
})
