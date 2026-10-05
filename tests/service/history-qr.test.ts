import { describe, expect, it } from 'vitest'
import { HOUR, T0, productByName, setup } from './helpers'
import { renderReceiptHtml } from '../../electron/main/receipt'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('sessiyalar tarixi', () => {
  it('yopilgan sessiya: xona, xodim, mahsulotlar, to‘lov usuli', async () => {
    const { svc, rooms, clock, loginAs } = await setup()
    const beer = await productByName(svc, 'Pivo 0.5 L')
    await loginAs('cashier')
    const a = await svc.sessions.open(rooms.s1, 2, 60)
    await svc.lines.addProduct(a.session.id, beer.id, 3, null)
    clock.advanceMin(60)
    const v = await svc.sessions.get(a.session.id)
    await svc.checkout.pay(a.session.id, [{ method: 'cash', amount: v.total }], null)

    await loginAs('admin')
    const rows = await svc.reports.sessions({ from: T0 - HOUR, to: T0 + 24 * HOUR })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: a.session.id, guestCount: 2, total: v.total, paid: v.total, paymentMethods: 'Naqd' })
    expect(rows[0].items).toEqual([expect.objectContaining({ name: 'Pivo 0.5 L', qty: 3 })])
  })

  it('ofitsiant tarixni ko‘ra olmaydi', async () => {
    const { svc, loginAs } = await setup()
    await loginAs('waiter')
    await expect(svc.reports.sessions({ from: 0, to: 1 })).rejects.toThrow("ruxsatingiz yo'q")
  })
})

describe('Instagram QR', () => {
  it('saqlanadi, chekka chiqadi; noto‘g‘ri rasm rad etiladi', async () => {
    const { svc, rooms, loginAs } = await setup()
    await loginAs('owner')
    const cur = await svc.settings.get()
    const saved = await svc.settings.save({ ...cur, instagram: { qrCodeBase64: PNG, handle: '@delfin' } })
    expect(saved.instagram).toEqual({ qrCodeBase64: PNG, handle: '@delfin' })
    await expect(svc.settings.save({ ...cur, instagram: { qrCodeBase64: 'javascript:alert(1)', handle: '' } })).rejects.toThrow('QR kod')

    const a = await svc.sessions.open(rooms.s1, 1, 60)
    const html = renderReceiptHtml(await svc.checkout.preBill(a.session.id))
    expect(html).toContain(PNG)
    expect(html).toContain('Bizning Instagram: @delfin')
  })
})
