import { describe, expect, it } from 'vitest'
import { renderReceiptHtml } from '../../electron/main/receipt'
import { productByName, serviceByName, setup } from './helpers'

async function sessionWithBill() {
  const ctx = await setup()
  const { svc, rooms, clock, staff } = ctx
  const v0 = await svc.sessions.open(rooms.s1, 2, 90, null) // 50 000/soat, har biriga 90 daqiqa olingan
  const beer = await productByName(svc, 'Pivo 0.5 L') // 20 000
  await svc.lines.addProduct(v0.session.id, beer.id, 2, v0.guests[0].id)
  await svc.lines.addService(v0.session.id, (await serviceByName(svc, 'Peeling')).id, null, staff.provider.id) // 80 000
  clock.advanceMin(90) // har biri 75 000
  const v = await svc.sessions.get(v0.session.id)
  return { ...ctx, sessionId: v0.session.id, view: v }
}

describe('to‘lov', () => {
  it('naqd to‘lov: sessiya yopiladi, mehmonlar to‘xtaydi, xona bo‘shaydi', async () => {
    const { svc, sessionId, view, clock, rooms } = await sessionWithBill()
    expect(view.timeTotal).toBe(150_000)
    expect(view.linesTotal).toBe(120_000)
    expect(view.total).toBe(270_000)
    const r = await svc.checkout.pay(sessionId, [{ method: 'cash', amount: 270_000 }], null)
    expect(r.receiptNo).toBe(1)
    expect(r.total).toBe(270_000)
    const v = await svc.sessions.get(sessionId)
    expect(v.session.status).toBe('closed')
    expect(v.session.closedAt).toBe(clock.t)
    expect(v.paid).toBe(270_000)
    expect(v.due).toBe(0)
    expect(v.guests.every((g) => g.state === 'finished' && g.intervals.every((i) => i.end !== null))).toBe(true)
    // Yopilgan sessiya vaqt o'tsa ham o'zgarmaydi
    clock.advanceMin(120)
    expect((await svc.sessions.get(sessionId)).total).toBe(270_000)
    expect((await svc.rooms.board()).find((c) => c.room.id === rooms.s1)!.session).toBeNull()
    await expect(svc.checkout.pay(sessionId, [{ method: 'cash', amount: 270_000 }], null)).rejects.toThrow('Sessiya yopilgan')
  })

  it('summa mos kelmasa rad etiladi va hech narsa o‘zgarmaydi', async () => {
    const { svc, sessionId } = await sessionWithBill()
    await expect(svc.checkout.pay(sessionId, [{ method: 'cash', amount: 100_000 }], null)).rejects.toThrow(
      "To'lov summasi jami summaga teng emas (jami: 270000, kiritildi: 100000)"
    )
    await expect(svc.checkout.pay(sessionId, [{ method: 'cash', amount: -5 }], null)).rejects.toThrow()
    await expect(svc.checkout.pay(sessionId, [{ method: 'bitcoin' as 'cash', amount: 270_000 }], null)).rejects.toThrow('usuli')
    const v = await svc.sessions.get(sessionId)
    expect(v.session.status).toBe('open')
    expect(v.payments).toHaveLength(0)
    expect(v.guests.every((g) => g.state === 'running')).toBe(true)
  })

  it('aralash to‘lov (naqd + karta)', async () => {
    const { svc, sessionId } = await sessionWithBill()
    const r = await svc.checkout.pay(
      sessionId,
      [
        { method: 'cash', amount: 100_000 },
        { method: 'card', amount: 150_000 },
        { method: 'cash', amount: 20_000 },
        { method: 'card', amount: 0 }
      ],
      null
    )
    expect(r.payments).toEqual([
      { method: 'cash', amount: 120_000 },
      { method: 'card', amount: 150_000 }
    ])
    expect(r.debtor).toBeNull()
    const v = await svc.sessions.get(sessionId)
    expect(v.payments.map((p) => [p.method, p.amount])).toEqual([
      ['cash', 120_000],
      ['card', 150_000]
    ])
  })

  it('chek raqami ketma-ket', async () => {
    const { svc, rooms, clock } = await setup()
    const nos: number[] = []
    for (const room of [rooms.s1, rooms.s2, rooms.s1]) {
      const v0 = await svc.sessions.open(room, 1, 60, null)
      clock.advanceMin(60)
      const v = await svc.sessions.get(v0.session.id)
      nos.push((await svc.checkout.pay(v0.session.id, [{ method: 'card', amount: v.total }], null)).receiptNo)
    }
    expect(nos).toEqual([1, 2, 3])
  })

  it('olingan vaqt darhol to‘lanadi (bo‘sh to‘lov bilan yopilmaydi); bepul xona — bo‘sh to‘lov bilan', async () => {
    const { svc, rooms } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 1, 60, null)
    expect(v0.total).toBe(50_000)
    await expect(svc.checkout.pay(v0.session.id, [], null)).rejects.toThrow('jami: 50000')
    const r = await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 50_000 }], null)
    expect(r.total).toBe(50_000)
    expect(r.guests[0]).toEqual({ label: 'Mehmon 1', elapsedMs: 0, timeAmount: 50_000 })

    const free = await svc.rooms.save({ name: 'Bepul', pricePerHour: 0, capacity: 2 })
    const v1 = await svc.sessions.open(free.id, 1, 60, null)
    const r1 = await svc.checkout.pay(v1.session.id, [], null)
    expect(r1.total).toBe(0)
    expect(r1.payments).toEqual([])
  })
})

describe('qarz', () => {
  it('qarzga to‘lov: debtor majburiy, Debt yaratiladi, keyin bo‘lib to‘lanadi', async () => {
    const { svc, sessionId, loginAs, clock } = await sessionWithBill()
    await loginAs('cashier')
    const pays = [
      { method: 'cash' as const, amount: 70_000 },
      { method: 'debt' as const, amount: 200_000 }
    ]
    await expect(svc.checkout.pay(sessionId, pays, null)).rejects.toThrow('majburiy')
    await expect(svc.checkout.pay(sessionId, pays, { name: 'Jasur', phone: '' })).rejects.toThrow('telefon')
    await expect(svc.checkout.pay(sessionId, pays, { name: '', phone: '+998901234567' })).rejects.toThrow('ismini')

    const r = await svc.checkout.pay(sessionId, pays, { name: ' Jasur ', phone: '+998 90 123 45 67' })
    expect(r.debtor).toEqual({ name: 'Jasur', phone: '+998 90 123 45 67' })
    expect(r.payments).toEqual(pays)

    let debts = await svc.debts.list(true)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ sessionId, customerName: 'Jasur', amount: 200_000, paid: 0, closedAt: null })
    const debtId = debts[0].id

    clock.advanceMin(60 * 24)
    let d = await svc.debts.pay(debtId, 'cash', 50_000)
    expect(d).toMatchObject({ paid: 50_000, closedAt: null })
    await expect(svc.debts.pay(debtId, 'card', 150_001)).rejects.toThrow('1 dan 150000 gacha')
    await expect(svc.debts.pay(debtId, 'debt' as 'cash', 1)).rejects.toThrow('usuli')
    d = await svc.debts.pay(debtId, 'card', 150_000)
    expect(d).toMatchObject({ paid: 200_000, closedAt: clock.t })
    await expect(svc.debts.pay(debtId, 'cash', 1)).rejects.toThrow('allaqachon')

    debts = await svc.debts.list(true)
    expect(debts).toHaveLength(0)
    expect(await svc.debts.list(false)).toHaveLength(1)
    const dp = await svc.debts.payments(debtId)
    expect(dp.map((p) => [p.method, p.amount])).toEqual([
      ['cash', 50_000],
      ['card', 150_000]
    ])
  })
})

describe('chek ma’lumotlari', () => {
  it('ReceiptData to‘liq va HTML to‘g‘ri chiqadi', async () => {
    const { svc, sessionId, staff, loginAs } = await sessionWithBill()
    await loginAs('cashier')
    await svc.sessions.renameGuest((await svc.sessions.get(sessionId)).guests[0].id, 'Ali <b>')
    await loginAs('admin')
    const lineId = (await svc.sessions.get(sessionId)).lines[0].id
    await svc.lines.returnLine(lineId, 1, '') // 1 pivo qaytdi
    await svc.sessions.setDiscount(sessionId, 10_000)
    await loginAs('cashier')
    const r = await svc.checkout.pay(sessionId, [{ method: 'cash', amount: 240_000 }], null)
    expect(r).toMatchObject({
      receiptNo: 1,
      roomName: 'Sauna 1',
      cashier: 'Kassir',
      timeTotal: 150_000,
      linesTotal: 100_000,
      discount: 10_000,
      total: 240_000
    })
    expect(r.settings.businessName).toBe('Delfin Sauna')
    expect(r.guests).toEqual([
      { label: 'Ali <b>', elapsedMs: 90 * 60_000, timeAmount: 75_000 },
      { label: 'Mehmon 2', elapsedMs: 90 * 60_000, timeAmount: 75_000 }
    ])
    expect(r.lines).toEqual([
      { name: 'Pivo 0.5 L', qty: 1, unitPrice: 20_000, amount: 20_000, guestLabel: 'Ali <b>', providerName: null },
      { name: 'Peeling', qty: 1, unitPrice: 80_000, amount: 80_000, guestLabel: null, providerName: staff.provider.name }
    ])
    // Qayta olish bir xil natija beradi
    expect(await svc.checkout.receipt(sessionId)).toEqual(r)

    const html = await svc.system.receiptHtml(r)
    expect(html).toContain('Chek № 1')
    expect(html).toContain('240 000')
    expect(html).toContain('Ali &lt;b&gt;')
    expect(html).not.toContain('Ali <b>')
    expect(html).toContain('size: 80mm')
    const html58 = renderReceiptHtml({ ...r, settings: { ...r.settings, paperWidth: 58, showGuestBreakdown: false } })
    expect(html58).toContain('size: 58mm')
    expect(html58).not.toContain('Mehmon 2')
  })

  it('ochiq sessiya uchun oldindan hisob (receiptNo=0)', async () => {
    const { svc, sessionId, clock } = await sessionWithBill()
    const r = await svc.checkout.receipt(sessionId)
    expect(r.receiptNo).toBe(0)
    expect(r.closedAt).toBe(clock.t)
    expect(r.total).toBe(270_000)
  })

  it('printReceipt host orqali chaqiriladi', async () => {
    const printed: { html: string; printer: string }[] = []
    const ctx = await setup({ host: { printReceipt: async (html, s) => void printed.push({ html, printer: s.printerName }) } })
    const v0 = await ctx.svc.sessions.open(ctx.rooms.s1, 1, 60, null)
    const r = await ctx.svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: v0.total }], null)
    await ctx.svc.system.printReceipt({ ...r, settings: { ...r.settings, printerName: 'XP-80' } })
    expect(printed).toHaveLength(1)
    expect(printed[0].printer).toBe('XP-80')
    expect(printed[0].html).toContain('<!doctype html>')
  })
})
