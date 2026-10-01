import { describe, expect, it } from 'vitest'
import { productByName, serviceByName, setup } from './helpers'

describe('mahsulot qo‘shish va ombor', () => {
  it('ombor kamayadi, bir xil mahsulot bitta qatorga birlashadi', async () => {
    const { svc, rooms } = await setup()
    const water = await productByName(svc, 'Suv 0.5 L')
    expect(water.stock).toBe(48)
    const v0 = await svc.sessions.open(rooms.s1, 2)
    await svc.lines.addProduct(v0.session.id, water.id, 2, null)
    const v = await svc.lines.addProduct(v0.session.id, water.id, 3, null)
    expect(v.lines).toHaveLength(1)
    expect(v.lines[0]).toMatchObject({ qty: 5, activeQty: 5, amount: 25_000, unitPrice: 5_000 })
    expect(v.linesTotal).toBe(25_000)
    expect((await productByName(svc, 'Suv 0.5 L')).stock).toBe(43)

    // Mehmonga biriktirilgan qator alohida
    const v2 = await svc.lines.addProduct(v0.session.id, water.id, 1, v0.guests[1].id)
    expect(v2.lines).toHaveLength(2)
    expect(v2.guests[1].linesAmount).toBe(5_000)
    expect(v2.guests[0].linesAmount).toBe(0)
  })

  it('omborda yetarli bo‘lmasa rad etiladi (atomik)', async () => {
    const { svc, rooms } = await setup()
    const pista = await productByName(svc, 'Pista')
    const v0 = await svc.sessions.open(rooms.s1, 1)
    await expect(svc.lines.addProduct(v0.session.id, pista.id, 11, null)).rejects.toThrow('Omborda yetarli emas (qoldi: 10)')
    expect((await productByName(svc, 'Pista')).stock).toBe(10)
    expect((await svc.sessions.get(v0.session.id)).lines).toHaveLength(0)
    await expect(svc.lines.addProduct(v0.session.id, pista.id, 0, null)).rejects.toThrow('Miqdor')
    await expect(svc.lines.addProduct(v0.session.id, pista.id, 1.5, null)).rejects.toThrow('Miqdor')
  })

  it('ombor kuzatilmaydigan mahsulot cheklanmaydi', async () => {
    const { svc, rooms } = await setup()
    const tea = await productByName(svc, 'Qahva')
    expect(tea.trackStock).toBe(false)
    const v0 = await svc.sessions.open(rooms.s1, 1)
    const v = await svc.lines.addProduct(v0.session.id, tea.id, 20, null)
    expect(v.linesTotal).toBe(300_000)
  })

  it('boshqa sessiya mehmoni / nofaol mahsulot rad etiladi', async () => {
    const { svc, rooms } = await setup()
    const a = await svc.sessions.open(rooms.s1, 1)
    const b = await svc.sessions.open(rooms.s2, 1)
    const water = await productByName(svc, 'Suv 0.5 L')
    await expect(svc.lines.addProduct(a.session.id, water.id, 1, b.guests[0].id)).rejects.toThrow('tegishli emas')
    await svc.catalog.saveProduct({ ...water, active: false })
    await expect(svc.lines.addProduct(a.session.id, water.id, 1, null)).rejects.toThrow('sotuvda emas')
  })
})

describe('xizmatlar', () => {
  it('xizmat qat‘iy narx, provider yoziladi', async () => {
    const { svc, rooms, staff } = await setup()
    const massage = await serviceByName(svc, 'Klassik massaj')
    const v0 = await svc.sessions.open(rooms.s1, 2)
    const v = await svc.lines.addService(v0.session.id, massage.id, v0.guests[0].id, staff.provider.id)
    expect(v.lines[0]).toMatchObject({ kind: 'service', unitPrice: 150_000, qty: 1, providerId: staff.provider.id, providerName: 'Massajchi' })
    expect(v.guests[0].linesAmount).toBe(150_000)
    await expect(svc.lines.addService(v0.session.id, massage.id, null, 9999)).rejects.toThrow('topilmadi')
  })
})

describe('qaytarish (X tugmasi)', () => {
  it('qisman va to‘liq qaytarish: omborga qaytadi, ReturnRecord yoziladi, summa kamayadi', async () => {
    const { svc, rooms, loginAs, staff, clock } = await setup()
    await loginAs('admin')
    const cola = await productByName(svc, 'Coca-Cola 1 L')
    const v0 = await svc.sessions.open(rooms.s1, 1)
    let v = await svc.lines.addProduct(v0.session.id, cola.id, 3, null)
    const lineId = v.lines[0].id
    expect((await productByName(svc, 'Coca-Cola 1 L')).stock).toBe(21)

    clock.advanceMin(5)
    v = await svc.lines.returnLine(lineId, 2, 'Ochilmagan')
    expect(v.lines[0]).toMatchObject({ qty: 3, returnedQty: 2, activeQty: 1, amount: 15_000 })
    expect(v.linesTotal).toBe(15_000)
    expect((await productByName(svc, 'Coca-Cola 1 L')).stock).toBe(23)
    const recs = svc.listReturns(v0.session.id)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ lineId, qty: 2, reason: 'Ochilmagan', by: staff.admin.id, at: clock.t })

    await expect(svc.lines.returnLine(lineId, 2, '')).rejects.toThrow("1 dan 1 gacha")
    v = await svc.lines.returnLine(lineId, 1, '')
    expect(v.lines[0].activeQty).toBe(0)
    expect(v.linesTotal).toBe(0)
    expect((await productByName(svc, 'Coca-Cola 1 L')).stock).toBe(24)
    await expect(svc.lines.returnLine(lineId, 1, '')).rejects.toThrow('to‘liq qaytarilgan')
  })

  it('kassir qaytara olmaydi', async () => {
    const { svc, rooms, loginAs } = await setup()
    const cola = await productByName(svc, 'Coca-Cola 1 L')
    const v0 = await svc.sessions.open(rooms.s1, 1)
    const v = await svc.lines.addProduct(v0.session.id, cola.id, 1, null)
    await loginAs('cashier')
    await expect(svc.lines.returnLine(v.lines[0].id, 1, '')).rejects.toThrow("ruxsatingiz yo'q")
  })

  it('xizmatni qaytarish omborga ta’sir qilmaydi; qaytarishdan keyin chegirma moslashadi', async () => {
    const { svc, rooms } = await setup()
    const peel = await serviceByName(svc, 'Peeling')
    const v0 = await svc.sessions.open(rooms.s1, 1)
    let v = await svc.lines.addService(v0.session.id, peel.id, null, null)
    v = await svc.sessions.setDiscount(v0.session.id, 80_000)
    expect(v.total).toBe(0)
    v = await svc.lines.returnLine(v.lines[0].id, 1, 'Bekor')
    expect(v.discount).toBe(0)
    expect(v.session.discount).toBe(0)
    expect(v.total).toBe(0)
  })

  it('yopilgan sessiyada qaytarish mumkin emas', async () => {
    const { svc, rooms } = await setup()
    const cola = await productByName(svc, 'Coca-Cola 1 L')
    const v0 = await svc.sessions.open(rooms.s1, 1)
    const v = await svc.lines.addProduct(v0.session.id, cola.id, 1, null)
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: v.total }], null)
    await expect(svc.lines.returnLine(v.lines[0].id, 1, '')).rejects.toThrow('Sessiya yopilgan')
    await expect(svc.lines.addProduct(v0.session.id, cola.id, 1, null)).rejects.toThrow('Sessiya yopilgan')
  })
})

describe('katalog boshqaruvi', () => {
  it('adjustStock va manfiy qoldiq taqiqi', async () => {
    const { svc } = await setup()
    const chips = await productByName(svc, 'Chips')
    expect((await svc.catalog.adjustStock(chips.id, 10, 'Kirim')).stock).toBe(30)
    expect((await svc.catalog.adjustStock(chips.id, -5, 'Buzilgan')).stock).toBe(25)
    await expect(svc.catalog.adjustStock(chips.id, -26, '')).rejects.toThrow('manfiy')
    await expect(svc.catalog.adjustStock(chips.id, 0, '')).rejects.toThrow()
  })

  it('kategoriya: mahsulot bor bo‘lsa o‘chmaydi; mahsulot o‘chirilgach o‘chadi', async () => {
    const { svc } = await setup()
    const cat = await svc.catalog.saveCategory({ name: 'Yangi' })
    const p = await svc.catalog.saveProduct({ name: 'Test', categoryId: cat.id, price: 1000, stock: 3 })
    expect(p).toMatchObject({ trackStock: true, stock: 3, active: true, lowStockAt: 5 })
    await expect(svc.catalog.removeCategory(cat.id)).rejects.toThrow('mahsulotlar bor')
    await svc.catalog.removeProduct(p.id)
    expect((await svc.catalog.products(true)).some((x) => x.id === p.id)).toBe(false)
    await svc.catalog.removeCategory(cat.id)
    expect((await svc.catalog.categories()).some((c) => c.id === cat.id)).toBe(false)
  })

  it('xizmat va xona CRUD', async () => {
    const { svc, rooms } = await setup()
    const s = await svc.catalog.saveService({ name: 'Hammom', price: 40_000, durationMin: 45 })
    const s2 = await svc.catalog.saveService({ ...s, price: 45_000, active: false })
    expect(s2).toMatchObject({ price: 45_000, active: false, durationMin: 45 })
    expect((await svc.catalog.services()).some((x) => x.id === s.id)).toBe(false)
    expect((await svc.catalog.services(true)).some((x) => x.id === s.id)).toBe(true)

    const r = await svc.rooms.save({ name: 'Kichik', pricePerHour: 30_000, capacity: 2 })
    expect(r.sortOrder).toBe(4)
    await expect(svc.rooms.save({ name: 'X', pricePerHour: 1, capacity: 0 })).rejects.toThrow("Sig'im")
    const v = await svc.sessions.open(rooms.s1, 3)
    const s1 = (await svc.rooms.list()).find((x) => x.id === rooms.s1)!
    await expect(svc.rooms.save({ ...s1, capacity: 2 })).rejects.toThrow('3 mehmon')
    await expect(svc.rooms.remove(rooms.s1)).rejects.toThrow('ochiq sessiya')
    // narx o'zgarishi ishlayotgan oraliqqa ta'sir qilmaydi (muzlatilgan)
    await svc.rooms.save({ ...s1, pricePerHour: 70_000 })
    const v2 = await svc.sessions.get(v.session.id)
    expect(v2.guests[0].runningRate).toBe(50_000)
    await svc.rooms.remove(r.id)
    expect((await svc.rooms.list()).some((x) => x.id === r.id)).toBe(false)
  })
})
