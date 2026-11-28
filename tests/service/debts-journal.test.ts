import { describe, expect, it } from 'vitest'
import { collections, filterDebts, type DebtFilter } from '../../src/renderer/screens/debts/model'
import { DEFAULT_ROLE_PERMISSIONS } from '../../src/shared/permissions'
import { HOUR, T0, productByName, setup } from './helpers'
import type { Ctx } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
const RANGE = { from: T0 - 24 * HOUR, to: T0 + 24 * HOUR }
const ALL: DebtFilter = { range: RANGE, status: 'all', staffId: null, source: 'all', q: '', receipt: '' }
const ALI = { debtorId: null, name: 'Ali', phone: '+998 90 111 22 33' }

async function noDebtPerm(c: Ctx): Promise<void> {
  await c.loginAs('owner')
  const s = await c.svc.settings.get()
  const cashier = DEFAULT_ROLE_PERMISSIONS.cashier.filter((p) => p !== 'debt.manage')
  await c.svc.settings.save({ ...s, rolePermissions: { ...s.rolePermissions, cashier } })
  await c.loginAs('cashier')
}

async function barDebt(c: Ctx, debtor = ALI, qty = 2) {
  const p = (await c.svc.catalog.products(true)).find((x) => x.active && x.stock >= qty)!
  const sale = await c.svc.barSales.open()
  const v = await c.svc.lines.addProduct(sale.session.id, p.id, qty, null)
  const receipt = await c.svc.checkout.pay(sale.session.id, [{ method: 'debt', amount: v.total }], debtor)
  return { receipt, total: v.total, product: p, sessionId: sale.session.id }
}

describe("qarzga berish 'debt.manage' ruxsatisiz", () => {
  it('bar savdosi va xona hisobi qarzga yopiladi, qarzlar bilan ishlash esa yopiq', async () => {
    const c = await setup()
    await noDebtPerm(c)
    const { total } = await barDebt(c)

    const room = await c.svc.sessions.open(c.rooms.s1, 1, 60)
    c.clock.advance(HOUR)
    const v = await c.svc.sessions.get(room.session.id)
    // mavjud qarzdorni qidirib tanlash mumkin, lekin summalar ko'rinmaydi
    const found = await c.svc.debtors.search('Ali')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ name: 'Ali', balance: 0, total: 0, paid: 0 })
    await c.svc.checkout.pay(room.session.id, [{ method: 'debt', amount: v.total }], { debtorId: found[0].id, name: '', phone: '' })

    await expect(c.svc.debts.journal()).rejects.toThrow(DENIED)
    await expect(c.svc.debts.list(false)).rejects.toThrow(DENIED)
    await expect(c.svc.debtors.list(false)).rejects.toThrow(DENIED)
    await expect(c.svc.debtors.pay(found[0].id, 'cash', 1000)).rejects.toThrow(DENIED)
    await expect(c.svc.debtors.rename(found[0].id, 'Vali', '+998 90 111 22 33')).rejects.toThrow(DENIED)

    await c.loginAs('owner')
    const [d] = await c.svc.debtors.list(true)
    expect(d.balance).toBe(total + v.total)
  })
})

describe('qarzlar jurnali', () => {
  it('chek, kim bergan, mahsulotlar va to‘lovni qabul qilgan xodim', async () => {
    const c = await setup()
    await c.loginAs('cashier')
    const first = await barDebt(c)
    c.clock.advanceMin(5)
    await c.loginAs('admin')
    const second = await barDebt(c, { debtorId: null, name: 'Vali', phone: '+998 93 555 66 77' }, 1)
    c.clock.advanceMin(5)
    const ali = (await c.svc.debtors.list(true)).find((d) => d.name === 'Ali')!
    await c.svc.debtors.pay(ali.id, 'cash', 1000)

    const rows = await c.svc.debts.journal()
    expect(rows.map((r) => r.customerName)).toEqual(['Vali', 'Ali'])
    const a = rows[1]
    expect(a).toMatchObject({
      receiptNo: first.receipt.receiptNo, source: 'bar', roomName: 'Bar', amount: first.total, paid: 1000,
      issuedById: c.staff.cashier.id, issuedByName: 'Kassir'
    })
    expect(a.items).toEqual([{ name: first.product.name, qty: 2, unitPrice: first.product.price, amount: 2 * first.product.price }])
    expect(a.payments).toHaveLength(1)
    expect(a.payments[0]).toMatchObject({ amount: 1000, byName: 'Admin' })

    // filtrlar
    expect(filterDebts(rows, { ...ALL, staffId: c.staff.cashier.id }).map((r) => r.customerName)).toEqual(['Ali'])
    expect(filterDebts(rows, { ...ALL, receipt: String(second.receipt.receiptNo), q: 'hech kim', status: 'paid' }).map((r) => r.customerName)).toEqual(['Vali'])
    expect(filterDebts(rows, { ...ALL, q: '№' + first.receipt.receiptNo }).map((r) => r.customerName)).toEqual(['Ali'])
    expect(filterDebts(rows, { ...ALL, q: '555' }).map((r) => r.customerName)).toEqual(['Vali'])
    expect(filterDebts(rows, { ...ALL, source: 'room' })).toEqual([])
    expect(filterDebts(rows, { ...ALL, status: 'paid' })).toEqual([])
    expect(collections(rows, ALL).map((p) => [p.byName, p.amount])).toEqual([['Admin', 1000]])
    expect(collections(rows, { ...ALL, staffId: c.staff.admin.id })).toEqual([])
  })
})

describe('ombor tarixi', () => {
  it('kirim, chiqim, sotuv va qaytarish kim qilgani bilan', async () => {
    const c = await setup()
    const p = await productByName(c.svc, (await c.svc.catalog.products(true)).find((x) => x.trackStock)!.name)
    c.clock.advanceMin(1)
    await c.svc.catalog.adjustStock(p.id, 10, 'Yangi partiya')
    c.clock.advanceMin(1)
    await c.svc.catalog.adjustStock(p.id, -2, 'Singan')
    c.clock.advanceMin(1)
    const sale = await c.svc.barSales.open()
    const v = await c.svc.lines.addProduct(sale.session.id, p.id, 1, null)
    c.clock.advanceMin(1)
    await c.svc.lines.returnLine(v.lines[0].id, 1, 'Xato')

    const rows = (await c.svc.catalog.stockHistory(RANGE)).filter((r) => r.productId === p.id && r.at > T0)
    expect(rows.map((r) => [r.kind, r.delta])).toEqual([['return', 1], ['sale', -1], ['out', -2], ['in', 10]])
    expect(rows[3]).toMatchObject({ reason: 'Yangi partiya', staffName: 'Ega', productName: p.name })
    expect(rows[1].roomName).toBe('Bar')

    await c.loginAs('cashier')
    await expect(c.svc.catalog.stockHistory(RANGE)).rejects.toThrow(DENIED)
  })
})
