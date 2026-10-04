import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../../electron/main/db/phone'
import { HOUR, T0, productByName, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"

/** Sauna 1 da 1 mehmon × 1 soat (50 000) + n ta pivo (20 000) */
async function bill(ctx: Ctx, beers = 0, room: 's1' | 's2' | 'vip' = 's1') {
  const v0 = await ctx.svc.sessions.open(ctx.rooms[room], 1, 60)
  if (beers > 0) await ctx.svc.lines.addProduct(v0.session.id, (await productByName(ctx.svc, 'Pivo 0.5 L')).id, beers, null)
  return ctx.svc.sessions.get(v0.session.id)
}

describe('telefon normallashtirish', () => {
  it('faqat raqamlar; 9 xonali mahalliy raqamga 998', () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('998901234567')
    expect(normalizePhone('90 123 45 67')).toBe('998901234567')
    expect(normalizePhone('998901234567')).toBe('998901234567')
    expect(normalizePhone('12-34')).toBe('1234')
    expect(normalizePhone('---')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('qarzdorlar: bitta odam — bitta yozuv', () => {
  it('pay: telefon bo‘yicha topadi (format va ism farq qilsa ham — eski ism saqlanadi), yo‘q bo‘lsa yaratadi', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    const a = await bill(ctx) // 50 000
    const r1 = await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Jasur', phone: '+998 90 123 45 67' })
    const jasurId = r1.debtor!.debtorId!
    expect(r1.debtor).toEqual({ debtorId: jasurId, name: 'Jasur', phone: '+998 90 123 45 67' })

    clock.advanceMin(90)
    const b = await bill(ctx, 1) // 70 000
    const r2 = await svc.checkout.pay(
      b.session.id,
      [{ method: 'cash', amount: 30_000 }, { method: 'debt', amount: 40_000 }],
      { name: 'Jasurbek aka', phone: '90-123-45-67' }
    )
    expect(r2.debtor).toEqual({ debtorId: jasurId, name: 'Jasur', phone: '+998 90 123 45 67' })

    clock.advanceMin(90)
    const c = await bill(ctx)
    const r3 = await svc.checkout.pay(c.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Olim', phone: '+998 93 000 00 01' })
    expect(r3.debtor!.debtorId).not.toBe(jasurId)

    const list = await svc.debtors.list(true)
    expect(list).toEqual([
      { id: r3.debtor!.debtorId, name: 'Olim', phone: '+998 93 000 00 01', total: 50_000, paid: 0, balance: 50_000, debtsCount: 1, lastAt: clock.t },
      { id: jasurId, name: 'Jasur', phone: '+998 90 123 45 67', total: 90_000, paid: 0, balance: 90_000, debtsCount: 2, lastAt: T0 + 90 * 60_000 }
    ])
    const debts = await svc.debtors.debts(jasurId)
    expect(debts.map((d) => [d.sessionId, d.amount, d.debtorId, d.customerName])).toEqual([
      [b.session.id, 40_000, jasurId, 'Jasur'],
      [a.session.id, 50_000, jasurId, 'Jasur']
    ])
    expect((await svc.debts.list(true)).every((d) => d.debtorId > 0)).toBe(true)
  })

  it('pay: debtorId bilan tanlangan odamga (ism/telefon kiritilmasa ham); noto‘g‘ri id — rad, atomik', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const a = await bill(ctx)
    const r1 = await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Ali', phone: '901112233' })
    const id = r1.debtor!.debtorId!
    const b = await bill(ctx, 0, 's2')
    const total = b.total
    await expect(svc.checkout.pay(b.session.id, [{ method: 'debt', amount: total }], { debtorId: 9999, name: '', phone: '' })).rejects.toThrow('Qarzdor topilmadi')
    expect((await svc.sessions.get(b.session.id)).session.status).toBe('open')
    const r2 = await svc.checkout.pay(b.session.id, [{ method: 'debt', amount: total }], { debtorId: id, name: '', phone: '' })
    expect(r2.debtor).toEqual({ debtorId: id, name: 'Ali', phone: '901112233' })
    expect((await svc.debtors.list(false))).toHaveLength(1)
    expect((await svc.debtors.list(false))[0]).toMatchObject({ total: 50_000 + total, debtsCount: 2 })
  })

  it('aralash to‘lov: 4 usul ham (qarz ham), Σ = jami; qarz bo‘lsa qarzdor majburiy; hisobot', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const a = await bill(ctx, 5) // 50 000 + 100 000 = 150 000
    expect(a.total).toBe(150_000)
    const pays = [
      { method: 'cash' as const, amount: 40_000 },
      { method: 'card' as const, amount: 30_000 },
      { method: 'terminal' as const, amount: 50_000 },
      { method: 'debt' as const, amount: 30_000 }
    ]
    await expect(svc.checkout.pay(a.session.id, pays, null)).rejects.toThrow('majburiy')
    await expect(svc.checkout.pay(a.session.id, pays.slice(0, 3), null)).rejects.toThrow('teng emas')
    await expect(svc.checkout.pay(a.session.id, [...pays, { method: 'bitcoin' as 'cash', amount: 0 }], null)).rejects.toThrow('usuli')
    await expect(svc.checkout.pay(a.session.id, pays, { name: 'Vali', phone: 'abc' })).rejects.toThrow("Telefon raqami noto'g'ri")
    const r = await svc.checkout.pay(a.session.id, pays, { name: 'Vali', phone: '+998 97 777 77 77' })
    expect(r.payments).toEqual(pays)
    const html = await svc.system.receiptHtml(r)
    expect(html).toContain('Terminal:')
    expect(html).toContain('50 000 so')
    expect(html).toContain('Qarzdor:')

    // Faqat terminal
    const b = await bill(ctx, 0, 's2')
    await svc.checkout.pay(b.session.id, [{ method: 'terminal', amount: b.total }], null)

    const rep = await svc.reports.sales({ from: T0 - HOUR, to: T0 + HOUR })
    // Sauna 2: 60 000 so'm/soat
    expect(rep.byMethod).toEqual({ cash: 40_000, card: 30_000, terminal: 50_000 + 60_000, debt: 30_000 })
    expect(rep.total).toBe(210_000)
  })

  it('debtors.pay: FIFO — eng eski qarzdan; terminal/naqd; hisobot debtPayments', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    const a = await bill(ctx) // 50 000 qarz
    await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Jasur', phone: '901234567' })
    clock.advanceMin(90)
    const b = await bill(ctx, 1) // 70 000 qarz
    const r = await svc.checkout.pay(b.session.id, [{ method: 'debt', amount: 70_000 }], { name: 'Jasur', phone: '901234567' })
    const id = r.debtor!.debtorId!
    clock.advanceMin(10)
    await expect(svc.debtors.pay(id, 'terminal', 120_001)).rejects.toThrow('1 dan 120000 gacha')
    await expect(svc.debtors.pay(id, 'debt' as 'cash', 1)).rejects.toThrow('usuli')
    await expect(svc.debtors.pay(id, 'cash', 0)).rejects.toThrow('1 dan')
    // 60 000: 1-qarz (50 000) yopiladi, 2-qarzdan 10 000
    let d = await svc.debtors.pay(id, 'terminal', 60_000)
    expect(d).toMatchObject({ total: 120_000, paid: 60_000, balance: 60_000, debtsCount: 2 })
    let debts = await svc.debtors.debts(id)
    expect(debts.map((x) => [x.amount, x.paid, x.closedAt])).toEqual([
      [70_000, 10_000, null],
      [50_000, 50_000, clock.t]
    ])
    // Qolgani naqd — hammasi yopiladi
    d = await svc.debtors.pay(id, 'cash', 60_000)
    expect(d).toMatchObject({ paid: 120_000, balance: 0 })
    debts = await svc.debtors.debts(id)
    expect(debts.every((x) => x.closedAt === clock.t)).toBe(true)
    await expect(svc.debtors.pay(id, 'cash', 1)).rejects.toThrow("qarzi yo'q")
    expect(await svc.debtors.list(true)).toEqual([])
    expect(await svc.debtors.list(false)).toHaveLength(1)
    // Qarz to'lovlari tarixi (har bir qarz bo'yicha)
    expect((await svc.debts.payments(debts[1].id)).map((p) => [p.method, p.amount])).toEqual([['terminal', 50_000]])
    expect((await svc.debts.payments(debts[0].id)).map((p) => [p.method, p.amount])).toEqual([
      ['terminal', 10_000],
      ['cash', 60_000]
    ])
    const rep = await svc.reports.sales({ from: T0 - HOUR, to: clock.t + 1 })
    expect(rep.debtPayments).toEqual({ cash: 60_000, card: 0, terminal: 60_000 })
    expect(rep.byMethod.debt).toBe(120_000)
  })

  it('debts.pay (bitta qarz) terminal bilan ham ishlaydi', async () => {
    const ctx = await setup()
    const a = await bill(ctx)
    await ctx.svc.checkout.pay(a.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Ali', phone: '901112233' })
    const debt = (await ctx.svc.debts.list(true))[0]
    const d = await ctx.svc.debts.pay(debt.id, 'terminal', 50_000)
    expect(d).toMatchObject({ paid: 50_000, closedAt: ctx.clock.t, customerName: 'Ali' })
  })

  it('search: ism (katta-kichik harf farqsiz) yoki telefon raqamlari bo‘yicha; bo‘sh so‘rov — bo‘sh', async () => {
    const ctx = await setup()
    const { svc, clock } = ctx
    const people: [string, string][] = [['Jasur Karimov', '+998 90 123 45 67'], ['Olim', '93 555 11 22'], ['jasmina', '+998 99 000 00 00']]
    for (const [name, phone] of people) {
      const v = await bill(ctx)
      await svc.checkout.pay(v.session.id, [{ method: 'debt', amount: v.total }], { name, phone })
      clock.advanceMin(90)
    }
    expect((await svc.debtors.search('jas')).map((d) => d.name)).toEqual(['jasmina', 'Jasur Karimov'])
    expect((await svc.debtors.search('JASUR')).map((d) => d.name)).toEqual(['Jasur Karimov'])
    expect((await svc.debtors.search('555 11')).map((d) => d.name)).toEqual(['Olim'])
    expect((await svc.debtors.search('90123')).map((d) => d.name)).toEqual(['Jasur Karimov'])
    expect((await svc.debtors.search('%'))).toEqual([])
    expect(await svc.debtors.search('   ')).toEqual([])
  })

  it('rename: ism/telefon tuzatiladi, qarzlarda ham yangi ism; boshqaning telefoni — rad', async () => {
    const ctx = await setup()
    const { svc } = ctx
    const a = await bill(ctx)
    const ra = await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: a.total }], { name: 'Ali', phone: '901112233' })
    const b = await bill(ctx, 0, 's2')
    const rb = await svc.checkout.pay(b.session.id, [{ method: 'debt', amount: b.total }], { name: 'Vali', phone: '902223344' })
    const ali = ra.debtor!.debtorId!
    await expect(svc.debtors.rename(ali, 'Ali', '+998 90 222 33 44')).rejects.toThrow('boshqa qarzdorga tegishli (Vali)')
    await expect(svc.debtors.rename(ali, '', '901112233')).rejects.toThrow('ismini')
    await expect(svc.debtors.rename(ali, 'Ali', 'x')).rejects.toThrow("Telefon raqami noto'g'ri")
    await expect(svc.debtors.rename(9999, 'Ali', '901112233')).rejects.toThrow('Qarzdor topilmadi')
    const d = await svc.debtors.rename(ali, 'Ali Valiyev', '+998 91 000 00 00')
    expect(d).toMatchObject({ id: ali, name: 'Ali Valiyev', phone: '+998 91 000 00 00', balance: a.total })
    expect((await svc.debtors.debts(ali))[0]).toMatchObject({ customerName: 'Ali Valiyev', phone: '+998 91 000 00 00' })
    expect((await svc.checkout.receipt(a.session.id)).debtor).toEqual({ debtorId: ali, name: 'Ali Valiyev', phone: '+998 91 000 00 00' })
    // eski telefon endi bo'sh — yangi odam yaratiladi
    const c = await bill(ctx, 0, 'vip')
    const rc = await svc.checkout.pay(c.session.id, [{ method: 'debt', amount: c.total }], { name: 'Boshqa', phone: '901112233' })
    expect(rc.debtor!.debtorId).not.toBe(ali)
    expect(rc.debtor!.debtorId).not.toBe(rb.debtor!.debtorId)
  })

  it('ruxsatlar: kassir — hammasi; admin — hammasi; ofitsiant — hech biri', async () => {
    const ctx = await setup()
    const { svc, loginAs } = ctx
    const a = await bill(ctx)
    const r = await svc.checkout.pay(a.session.id, [{ method: 'debt', amount: a.total }], { name: 'Ali', phone: '901112233' })
    const id = r.debtor!.debtorId!
    for (const who of ['cashier', 'admin'] as const) {
      await loginAs(who)
      await expect(svc.debtors.search('Ali')).resolves.toHaveLength(1)
      await expect(svc.debtors.list(true)).resolves.toHaveLength(1)
      await expect(svc.debtors.debts(id)).resolves.toHaveLength(1)
      await expect(svc.debtors.pay(id, 'cash', 1_000)).resolves.toBeTruthy()
      await expect(svc.debtors.rename(id, 'Ali', '901112233')).resolves.toBeTruthy()
    }
    await loginAs('waiter')
    await expect(svc.debtors.search('Ali')).rejects.toThrow(DENIED)
    await expect(svc.debtors.list(true)).rejects.toThrow(DENIED)
    await expect(svc.debtors.debts(id)).rejects.toThrow(DENIED)
    await expect(svc.debtors.pay(id, 'cash', 1_000)).rejects.toThrow(DENIED)
    await expect(svc.debtors.rename(id, 'X', '901112233')).rejects.toThrow(DENIED)
    await svc.auth.logout()
    await expect(svc.debtors.list(true)).rejects.toThrow('Avval tizimga kiring')
  })
})
