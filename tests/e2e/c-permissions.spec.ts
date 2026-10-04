/**
 * c) Ruxsatlar: kassir / administrator / ega / ofitsiant — UI'da ko'rinmaydi VA server ham rad etadi.
 */
import { test, expect, T0, MIN } from './fixtures'
import { addProduct, backToBoard, closeAdd, enterSession, guest, line, openAdd, openRoom, selectProduct, submitAdd, wsTotal } from './ui'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
const ALL = ['Xonalar', 'Bar savdo', 'Bar', 'Qarzlar', 'Hisobot', 'Ofitsiantlar', 'Oshxona', 'Xodimlar', 'Sozlamalar']
const STAFF = { isProvider: false, isWaiter: false, commissionPct: 0, active: true }

async function navItems(page: import('@playwright/test').Page): Promise<string[]> {
  return (await page.locator('.side__item').allTextContents()).map((s) => s.trim())
}

test('Kassir (3333): X, chegirma, sozlamalar, hisobot, xodimlar, bar yo\'q; server ham rad etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar savdo', 'Qarzlar'])

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
  expect(await b.rpcError('staff.save', { name: 'X', role: 'owner', pin: '9999', ...STAFF })).toBe(DENIED)
  // Ofitsiantlar hisob-kitobi: ko'rish (reports.view) va pul berish (staff.manage) — kassirga yo'q
  expect(await b.rpcError('waiters.monthly', '2026-10')).toBe(DENIED)
  expect(await b.rpcError('waiters.sessions', pos.ids.waiter1, '2026-10')).toBe(DENIED)
  expect(await b.rpcError('waiters.payouts', pos.ids.waiter1, '2026-10')).toBe(DENIED)
  expect(await b.rpcError('waiters.payout', pos.ids.waiter1, '2026-10', 1000, '')).toBe(DENIED)
  // "Kim olib bordi" (session.manage) — kassir mahsulotni ofitsiant nomiga yoza oladi
  const add2 = await openAdd(pos)
  await addProduct(pos, add2, 'Suv 0.5 L', 1, 'Butun guruh', 'Bekzod')
  await closeAdd(pos, add2)
  const sw = await b.rpc<{ lines: { name: string; waiterId: number | null; waiterPct: number }[] }>('sessions.get', 1)
  expect(sw.lines.find((l) => l.waiterId === pos.ids.waiter2)).toMatchObject({ name: 'Suv 0.5 L', waiterPct: 12 })
  await expect(line(pos, 'Suv 0.5 L').getByTestId('line-waiter')).toContainText(['Bekzod'])
  expect(await b.rpcError('staff.changePin', pos.ids.owner, '9999')).toBe(DENIED)
  expect(await b.rpcError('rooms.save', { name: 'Yangi', pricePerHour: 1, capacity: 1 })).toBe(DENIED)
  expect(await b.rpcError('catalog.adjustStock', 1, 10, '')).toBe(DENIED)
  expect(await b.rpcError('catalog.saveProduct', { name: 'X', categoryId: 1, price: 1 })).toBe(DENIED)
  expect(await b.rpcError('system.backup')).toBe(DENIED)
  expect(await b.rpcError('system.restore')).toBe(DENIED)
  // O'z PINini o'zgartirishi mumkin (shartnoma: "faqat ega yoki o'z PINi")
  await b.rpc('staff.changePin', pos.ids.cashier, '3333')

  // Xato ochilgan xonani kassir DARHOL (< 1 daqiqa) bekor qila oladi — oldindan olingan vaqt summasi bo'lsa ham
  // (ARCHITECTURE: "xato ochilgan xonani kassir darhol bekor qila oladi")
  await backToBoard(pos)
  await openRoom(pos, 'Sauna 2', 1)
  expect(await wsTotal(pos)).toBe(60_000) // 1 soat olingan
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toBeVisible()
  await pos.setNow(pos.now + 50_000)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toBeVisible()
  await pos.advance(30)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toHaveCount(0)
  expect(await b.rpcError('sessions.cancel', 2)).toContain('administrator ruxsati kerak')
})

test('Administrator: X, chegirma, bar, hisobot bor; xodimlar, sozlamalar, zaxira yo\'q', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar savdo', 'Bar', 'Qarzlar', 'Hisobot', 'Ofitsiantlar', 'Oshxona'])
  await openRoom(pos, 'Sauna 1', 1)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 1)
  await closeAdd(pos, add)
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chegirma' })).toBeVisible()
  const b = pos.backend
  expect(await b.rpcError('settings.save', await b.rpc('settings.get'))).toBe(DENIED)
  expect(await b.rpcError('staff.save', { name: 'X', role: 'admin', pin: '9999', ...STAFF })).toBe(DENIED)
  // Ofitsiantlar hisobini ko'radi, lekin pul bera olmaydi (staff.manage)
  await b.rpc('waiters.monthly', '2026-10')
  expect(await b.rpcError('waiters.payout', pos.ids.waiter1, '2026-10', 1000, '')).toBe(DENIED)
  await pos.nav('Ofitsiantlar')
  await expect(page.getByTestId('wt-table')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Berish' })).toHaveCount(0)
  await pos.nav('Xonalar')
  await enterSession(pos, 'Sauna 1')
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
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar savdo', 'Qarzlar'])
})

test('(k) Ofitsiant roli (Sardor, PIN 5555): faqat Xonalar (to\'lov qila olmagani uchun Bar savdo yo\'q); ochish/bar/+1 soat bor; to\'lov, X, chegirma yo\'q; server rad etadi', async ({ pos, page }) => {
  await pos.open()
  // Qulf ekranida ofitsiantlar ham bor; noto'g'ri PIN rad etiladi
  const tileS = page.locator('.lock-tile', { has: page.locator('.lock-tile__name', { hasText: /^Sardor$/ }) })
  await expect(tileS).toBeVisible()
  await tileS.click()
  await pos.typeDigits('6666') // Bekzodning PINi
  await page.keyboard.press('Enter')
  await expect(page.locator('.lock-pin__error')).toContainText("PIN noto'g'ri")
  await page.locator('.lock-pin__switch').click()
  await pos.login('waiter1')
  expect(await navItems(page)).toEqual(['Xonalar'])

  // Xona ochadi (ofitsiant tanlovi yo'q), mahsulot qo'shadi — qator avtomatik uning nomiga yoziladi
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  // Ofitsiantning o'zi kirgan — "Kim olib bordi" ko'rsatilmaydi
  await expect(add.getByTestId('add-waiter')).toHaveCount(0)
  await selectProduct(add, 'Suv 0.5 L', 2)
  await submitAdd(pos, add)
  await expect(line(pos, 'Suv 0.5 L')).toContainText('2 × 5 000')
  await expect(line(pos, 'Suv 0.5 L').getByTestId('line-waiter')).toHaveText('Sardor')
  // +1 soat (session.manage) bor
  await guest(pos, 'Mehmon 1').getByRole('button', { name: '1 soat' }).click()
  await expect(guest(pos, 'Mehmon 1')).toContainText('2 soat olingan')
  // To'lov, X, chegirma tugmalari yo'q
  await expect(page.locator('.rooms-bill__pay')).toHaveCount(0)
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chegirma' })).toHaveCount(0)

  const b = pos.backend
  const v = await b.rpc<{ total: number; lines: { id: number }[] }>('sessions.get', 1)
  expect(v.total).toBe(3 * 50_000 + 10_000) // M1 2 soat + M2 1 soat + suv
  expect(await b.rpcError('checkout.pay', 1, [{ method: 'cash', amount: v.total }], null)).toBe(DENIED)
  expect(await b.rpcError('lines.returnLine', v.lines[0].id, 1, '')).toBe(DENIED)
  expect(await b.rpcError('sessions.setDiscount', 1, 1000)).toBe(DENIED)
  expect(await b.rpcError('reports.sales', { from: 0, to: T0 * 2 })).toBe(DENIED)
  expect(await b.rpcError('waiters.monthly', '2026-10')).toBe(DENIED)
  expect(await b.rpcError('waiters.payout', pos.ids.waiter1, '2026-10', 1000, '')).toBe(DENIED)
  expect(await b.rpcError('debts.list', true)).toBe(DENIED)
  expect(await b.rpcError('settings.save', await b.rpc('settings.get'))).toBe(DENIED)
  expect(await b.rpcError('catalog.adjustStock', 1, 10, '')).toBe(DENIED)
  expect(await b.rpcError('staff.save', { name: 'X', role: 'waiter', pin: '9999', ...STAFF })).toBe(DENIED)
  expect(await b.rpcError('system.backup')).toBe(DENIED)
  // Ikkinchi xona: xato ochildi → darhol bekor qila oladi; 5 daqiqadan keyin — yo'q (discount.apply yo'q)
  await backToBoard(pos)
  await openRoom(pos, 'Sauna 2', 1)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toBeVisible()
  await pos.advance(5)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toHaveCount(0)
  expect(await b.rpcError('sessions.cancel', 2)).toContain('administrator ruxsati kerak')

  // Boshqa bo'limlar (masalan Ofitsiantlar) menyuda yo'q
  await expect(page.locator('.side__item', { hasText: 'Ofitsiantlar' })).toHaveCount(0)
  await pos.lock()
  await pos.login('owner')
  expect(await navItems(page)).toEqual(ALL)
  void MIN
})
