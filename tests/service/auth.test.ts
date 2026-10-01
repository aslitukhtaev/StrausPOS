import { describe, expect, it } from 'vitest'
import { PosService } from '../../electron/main/PosService'
import { FakeClock, setup } from './helpers'

describe('birinchi ishga tushirish', () => {
  it('bo‘sh baza: needsSetup=true, standart ma’lumotlar yo‘q', async () => {
    const svc = await PosService.create({ clock: new FakeClock().now })
    expect(await svc.auth.needsSetup()).toBe(true)
    expect(await svc.auth.current()).toBeNull()
    expect(svc.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM rooms')!.n).toBe(0)
    expect(svc.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products')!.n).toBe(0)
    await expect(svc.rooms.board()).rejects.toThrow('Avval tizimga kiring')
  })

  it('setupOwner: ega yaratiladi, kiriladi, 3 xona + katalog + xizmatlar qo‘shiladi', async () => {
    const svc = await PosService.create({ clock: new FakeClock().now })
    await svc.auth.setupOwner('Ali', '1234', 'Straus Sauna')
    expect(await svc.auth.needsSetup()).toBe(false)
    const cur = await svc.auth.current()
    expect(cur?.staff.name).toBe('Ali')
    expect(cur?.staff.role).toBe('owner')
    expect(cur?.permissions).toContain('staff.manage')
    expect((await svc.rooms.list()).map((r) => r.name)).toEqual(['Sauna 1', 'Sauna 2', 'VIP xona'])
    expect((await svc.catalog.categories()).length).toBeGreaterThanOrEqual(3)
    expect((await svc.catalog.products()).length).toBeGreaterThan(5)
    expect((await svc.catalog.services()).length).toBeGreaterThanOrEqual(2)
    expect((await svc.settings.get()).receipt.businessName).toBe('Straus Sauna')
    await expect(svc.auth.setupOwner('Boshqa', '9999', 'X')).rejects.toThrow('allaqachon sozlangan')
  })

  it('seedDemo: xodimsiz standart ma’lumotlar', async () => {
    const svc = await PosService.create({ clock: new FakeClock().now, seedDemo: true })
    expect(await svc.auth.needsSetup()).toBe(true)
    expect(svc.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM rooms')!.n).toBe(3)
    await svc.auth.setupOwner('Ali', '1234', 'S')
    // ikkinchi marta qo'shilmaydi
    expect(svc.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM rooms')!.n).toBe(3)
  })

  it('PIN noto‘g‘ri formatda rad etiladi', async () => {
    const svc = await PosService.create({ clock: new FakeClock().now })
    await expect(svc.auth.setupOwner('Ali', '12', 'S')).rejects.toThrow('PIN')
    await expect(svc.auth.setupOwner('Ali', 'abcd', 'S')).rejects.toThrow('PIN')
    await expect(svc.auth.setupOwner('', '1234', 'S')).rejects.toThrow('Ismni')
  })
})

describe('kirish / chiqish', () => {
  it('PIN xeshlanadi (bazada ochiq holda saqlanmaydi)', async () => {
    const { svc } = await setup()
    const rows = svc.db.all<{ pin_hash: string }>('SELECT pin_hash FROM staff')
    for (const r of rows) {
      expect(r.pin_hash.startsWith('scrypt$')).toBe(true)
      expect(r.pin_hash).not.toContain('1234')
    }
    // UI ga PIN/hash ketmaydi
    const list = await svc.auth.listLoginStaff()
    expect(JSON.stringify(list)).not.toContain('scrypt')
    expect(list[0].role).toBe('owner')
  })

  it('to‘g‘ri/noto‘g‘ri PIN, logout, current', async () => {
    const { svc, staff } = await setup()
    await svc.auth.logout()
    expect(await svc.auth.current()).toBeNull()
    await expect(svc.auth.login(staff.cashier.id, '0000')).rejects.toThrow("PIN noto'g'ri")
    const r = await svc.auth.login(staff.cashier.id, '3333')
    expect(r.staff.id).toBe(staff.cashier.id)
    expect(r.permissions).toEqual(['session.open', 'session.manage', 'session.pay', 'debt.manage'])
    expect((await svc.auth.current())?.staff.id).toBe(staff.cashier.id)
  })

  it('5 marta xato PIN → 30 soniya bloklanadi', async () => {
    const { svc, staff, clock } = await setup()
    await svc.auth.logout()
    for (let i = 0; i < 5; i++) await expect(svc.auth.login(staff.admin.id, '0000')).rejects.toThrow("PIN noto'g'ri")
    await expect(svc.auth.login(staff.admin.id, '2222')).rejects.toThrow("Juda ko'p")
    clock.advance(31_000)
    await expect(svc.auth.login(staff.admin.id, '2222')).resolves.toBeTruthy()
  })

  it('faol bo‘lmagan xodim kira olmaydi, kirgan bo‘lsa chiqariladi', async () => {
    const { svc, staff, loginAs } = await setup()
    await svc.staff.save({ ...staff.cashier, pin: '', active: false })
    await expect(svc.auth.login(staff.cashier.id, '3333')).rejects.toThrow('faol emas')
    expect((await svc.auth.listLoginStaff()).some((s) => s.id === staff.cashier.id)).toBe(false)
    await svc.staff.save({ ...staff.admin, pin: '' })
    await loginAs('admin')
    // Ega admin'ni o'chiradi (to'g'ridan-to'g'ri DB orqali simulyatsiya)
    svc.db.run('UPDATE staff SET active=0 WHERE id=?', [staff.admin.id])
    expect(await svc.auth.current()).toBeNull()
  })

  it('qulf o‘chirilgan bo‘lsa — ega avtomatik kiritiladi', async () => {
    const { svc } = await setup()
    const s = await svc.settings.get()
    await svc.settings.save({ ...s, lockEnabled: false })
    await svc.auth.logout()
    const cur = await svc.auth.current()
    expect(cur?.staff.role).toBe('owner')
  })
})

describe('ruxsatlar', () => {
  it('kassir: sozlama, xona, qaytarish, hisobot, zaxira, xodim — rad etiladi', async () => {
    const { svc, loginAs, rooms, staff } = await setup()
    await loginAs('cashier')
    const denied = "Bu amal uchun ruxsatingiz yo'q"
    await expect(svc.rooms.save({ name: 'X', pricePerHour: 1, capacity: 1 })).rejects.toThrow(denied)
    await expect(svc.rooms.remove(rooms.s1)).rejects.toThrow(denied)
    await expect(svc.settings.save(await svc.settings.get())).rejects.toThrow(denied)
    await expect(svc.reports.sales({ from: 0, to: 1 })).rejects.toThrow(denied)
    await expect(svc.reports.returns({ from: 0, to: 1 })).rejects.toThrow(denied)
    await expect(svc.system.backup()).rejects.toThrow(denied)
    await expect(svc.system.restore()).rejects.toThrow(denied)
    await expect(svc.staff.save({ name: 'Y', role: 'cashier', pin: '5555', isProvider: false, active: true })).rejects.toThrow(denied)
    await expect(svc.catalog.adjustStock(1, 5, '')).rejects.toThrow(denied)
    await expect(svc.catalog.saveProduct({ name: 'Z', categoryId: 1, price: 1 })).rejects.toThrow(denied)
    await expect(svc.staff.changePin(staff.owner.id, '9999')).rejects.toThrow(denied)
    const v = await svc.sessions.open(rooms.s1, 1)
    await expect(svc.sessions.setDiscount(v.session.id, 1000)).rejects.toThrow(denied)
    // o'z PINini o'zgartira oladi
    await svc.staff.changePin(staff.cashier.id, '7777')
    await svc.auth.logout()
    await expect(svc.auth.login(staff.cashier.id, '3333')).rejects.toThrow("PIN noto'g'ri")
    await svc.auth.login(staff.cashier.id, '7777')
  })

  it('admin: ombor va hisobot mumkin, sozlama/xodim/zaxira yo‘q', async () => {
    const { svc, loginAs } = await setup()
    await loginAs('admin')
    const p = (await svc.catalog.products())[0]
    await expect(svc.catalog.adjustStock(p.id, 3, 'Kirim')).resolves.toBeTruthy()
    await expect(svc.reports.sales({ from: 0, to: Date.now() })).resolves.toBeTruthy()
    await expect(svc.settings.save(await svc.settings.get())).rejects.toThrow('ruxsat')
    await expect(svc.system.backup()).rejects.toThrow('ruxsat')
  })

  it('kirmagan foydalanuvchi hech narsa qila olmaydi', async () => {
    const { svc, rooms } = await setup()
    await svc.auth.logout()
    await expect(svc.sessions.open(rooms.s1, 1)).rejects.toThrow('Avval tizimga kiring')
    await expect(svc.catalog.products()).rejects.toThrow('Avval tizimga kiring')
    // Ochiq metodlar
    await expect(svc.settings.get()).resolves.toBeTruthy()
    await expect(svc.system.now()).resolves.toBeTypeOf('number')
  })

  it('oxirgi ega o‘chirilmaydi / lavozimi tushirilmaydi', async () => {
    const { svc, staff } = await setup()
    await expect(svc.staff.save({ ...staff.owner, pin: '', role: 'admin' })).rejects.toThrow('Kamida bitta faol ega')
    await expect(svc.staff.save({ ...staff.owner, pin: '', active: false })).rejects.toThrow('Kamida bitta faol ega')
  })
})
