/**
 * c) Ruxsatlar: kassir / administrator / ega — UI'da ko'rinmaydi VA server ham rad etadi.
 */
import { test, expect, T0, MIN } from './fixtures'
import { addProduct, backToBoard, closeAdd, enterSession, line, openAdd, openRoom } from './ui'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
const ALL = ['Xonalar', 'Bar', 'Qarzlar', 'Hisobot', 'Xodimlar', 'Sozlamalar']

async function navItems(page: import('@playwright/test').Page): Promise<string[]> {
  return (await page.locator('.side__item').allTextContents()).map((s) => s.trim())
}

test('Kassir (3333): X, chegirma, sozlamalar, hisobot, xodimlar, bar yo\'q; server ham rad etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  expect(await navItems(page)).toEqual(['Xonalar', 'Qarzlar'])

  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 2)
  await closeAdd(pos, add)
  await expect(line(pos, 'Suv 0.5 L')).toBeVisible()
  // X (qaytarish) va chegirma tugmalari yo'q
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chegirma' })).toHaveCount(0)
  // Buyurtma bor → bekor qilish tugmasi yo'q
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toHaveCount(0)
  // To'lov tugmasi bor (session.pay)
  await expect(page.locator('.rooms-bill__pay')).toBeVisible()

  // Server ham rad etadi (UI'ni chetlab o'tishga urinish)
  const v = await pos.backend.rpc<{ session: { id: number }; lines: { id: number }[] }>('sessions.get', 1)
  const b = pos.backend
  expect(await b.rpcError('lines.returnLine', v.lines[0].id, 1, '')).toBe(DENIED)
  expect(await b.rpcError('sessions.setDiscount', 1, 1000)).toBe(DENIED)
  expect(await b.rpcError('reports.sales', { from: 0, to: T0 * 2 })).toBe(DENIED)
  expect(await b.rpcError('reports.returns', { from: 0, to: T0 * 2 })).toBe(DENIED)
  expect(await b.rpcError('settings.save', await b.rpc('settings.get'))).toBe(DENIED)
  expect(await b.rpcError('staff.save', { name: 'X', role: 'owner', pin: '9999', isProvider: false, active: true })).toBe(DENIED)
  expect(await b.rpcError('staff.changePin', pos.ids.owner, '9999')).toBe(DENIED)
  expect(await b.rpcError('rooms.save', { name: 'Yangi', pricePerHour: 1, capacity: 1 })).toBe(DENIED)
  expect(await b.rpcError('catalog.adjustStock', 1, 10, '')).toBe(DENIED)
  expect(await b.rpcError('catalog.saveProduct', { name: 'X', categoryId: 1, price: 1 })).toBe(DENIED)
  expect(await b.rpcError('system.backup')).toBe(DENIED)
  expect(await b.rpcError('system.restore')).toBe(DENIED)
  // O'z PINini o'zgartirishi mumkin (shartnoma: "faqat ega yoki o'z PINi")
  await b.rpc('staff.changePin', pos.ids.cashier, '3333')

  // Vaqt hisoblangan bo'sh sessiyani kassir bekor qila olmaydi
  await backToBoard(pos)
  await openRoom(pos, 'Sauna 2', 1)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toBeVisible() // hali 0 so'm
  await pos.advance(30)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toHaveCount(0)
  expect(await b.rpcError('sessions.cancel', 2)).toContain('administrator ruxsati kerak')
})

test('Administrator: X, chegirma, bar, hisobot bor; xodimlar, sozlamalar, zaxira yo\'q', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar', 'Qarzlar', 'Hisobot'])
  await openRoom(pos, 'Sauna 1', 1)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 1)
  await closeAdd(pos, add)
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chegirma' })).toBeVisible()
  const b = pos.backend
  expect(await b.rpcError('settings.save', await b.rpc('settings.get'))).toBe(DENIED)
  expect(await b.rpcError('staff.save', { name: 'X', role: 'admin', pin: '9999', isProvider: false, active: true })).toBe(DENIED)
  expect(await b.rpcError('system.backup')).toBe(DENIED)
  // Boshqa xodim PINini o'zgartira olmaydi
  expect(await b.rpcError('staff.changePin', pos.ids.owner, '9999')).toBe(DENIED)
  await b.rpc('reports.sales', { from: 0, to: T0 * 2 })
  // Vaqt hisoblangan sessiyani admin bekor qila oladi
  await backToBoard(pos)
  await openRoom(pos, 'Sauna 2', 1)
  await pos.advance(10)
  await page.getByRole('button', { name: 'Sessiyani bekor qilish' }).click()
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click()
  await expect(pos.toast("Sauna 2 bekor qilindi va bo'shatildi")).toBeVisible()
  // Bekor qilingan sessiya hisobotga tushmaydi
  const r = await b.rpc<{ sessionsCount: number; total: number }>('reports.sales', { from: 0, to: T0 + 10 * 60 * MIN })
  expect(r).toMatchObject({ sessionsCount: 0, total: 0 })
  await enterSession(pos, 'Sauna 1')
})

test('Ega: hamma bo\'lim; Massajchi (kassir + xizmat ko\'rsatuvchi) kassir ruxsatida', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  expect(await navItems(page)).toEqual(ALL)
  await pos.nav('Xodimlar')
  await pos.nav('Sozlamalar')
  await pos.nav('Hisobot')
  await pos.nav('Bar')
  // Massajchi (kassir + xizmat ko'rsatuvchi) — kassir ruxsatlari
  await pos.lock()
  await pos.login('provider')
  expect(await navItems(page)).toEqual(['Xonalar', 'Qarzlar'])
})
