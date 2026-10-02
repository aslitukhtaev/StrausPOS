/**
 * i) Ofitsiantlar: ochishda ogohlantirish, biriktirish/almashtirish, haq FAQAT bar mahsulotlaridan (xizmat va vaqt
 *    kirmaydi, qaytarish ayiriladi), foiz biriktirish paytida muzlatiladi, oylik hisob va pul berish → qoldiq.
 *
 *  S1) Sauna 1, 2 kishi × 1 soat. Ochishda ofitsiant tanlanmadi → "Ofitsiant biriktirilmadi!" → [Ofitsiant tanlash] →
 *      Sardor (10%) → ochildi. Keyin Bekzod (12%) ga almashtirildi → foiz 12% muzlatiladi.
 *      Coca-Cola 1 L × 2 (30 000), Chips × 1 (12 000), Klassik massaj (150 000, Massajchi); Chips qaytarildi (X).
 *      Bekzod foizi Xodimlar ekranida 20% ga o'zgartirildi — S1 baribir 12%.
 *      +60: to'lov = vaqt 2 × 50 000 + 30 000 + 150 000 = 280 000.
 *      Haq: bar mahsulotlari 30 000 (Chips qaytarilgan, massaj kirmaydi) × 12% = 3 600.
 *  S2) Sauna 2, 1 kishi × 1 soat, Bekzod (endi 20%), Pivo 0.5 L × 1 (20 000) → haq 4 000. To'lov 60 000 + 20 000 = 80 000.
 *  S3) VIP xona, ofitsiantsiz ("Ofitsiantsiz boshlash"), Pivo × 1 — hech kimga yozilmaydi. To'lov 100 000 + 20 000 = 120 000.
 *  Oylik (2026-10): Bekzod — 2 sessiya, bar 50 000, haq 7 600; Sardor — 0.
 *  Pul berish: "Yarmi" (round(7 600/2/1000)×1000 = 4 000) → qoldiq 3 600; keyin 3 600 → 0 ("to'liq berilgan").
 */
import { test, expect, T0, MIN } from './fixtures'
import {
  addProduct, addService, backToBoard, closeAdd, confirm, enterSession, finishReceipt, openAdd, openRoom, returnLine,
  setWaiterUi, startCheckout, tile
} from './ui'

interface MonthRow { staffId: number; name: string; commissionPct: number; sessions: number; productSales: number; commission: number; paid: number; balance: number }

test('Ofitsiant: ogohlantirish, almashtirish, haq faqat bar mahsulotidan, foiz muzlatiladi, oylik hisob va pul berish', async ({ pos, page }) => {
  test.setTimeout(180_000)
  await pos.open()
  await pos.login('owner')

  // ── S1: ofitsiantsiz boshlashga urinish → ogohlantirish → tanlash ──
  await tile(pos, 'Sauna 1').click()
  const d = pos.dialog('Sauna 1 — xonani ochish')
  await expect(d.locator('.rooms-waiter')).toHaveCount(2)
  await expect(d.locator('.rooms-waiter[data-waiter="Sardor"]')).toContainText('10% bardan')
  await expect(d.locator('.rooms-waiter[data-waiter="Bekzod"]')).toContainText('12% bardan')
  await expect(d.locator('.rooms-open__need')).toContainText('Tanlanmagan')
  await d.locator('.rooms-open__n', { hasText: /^2$/ }).click()
  await d.getByRole('button', { name: 'Boshlash · 2 kishi · 1 soat' }).click()
  const warn = page.locator('.ui-modal.rooms-nowaiter')
  await expect(warn).toContainText('Ofitsiant biriktirilmadi!')
  await expect(warn).toContainText('bar savdosidan foiz hech kimga yozilmaydi')
  // Ogohlantirish ochiq paytda Enter/raqam tugmalari ochish oynasini o'zgartirmaydi
  await page.keyboard.press('5')
  await warn.getByRole('button', { name: 'Ofitsiant tanlash' }).click()
  await expect(warn).toHaveCount(0)
  await expect(d).toBeVisible() // xona hali ochilmagan
  expect((await pos.backend.rpc<{ session: unknown }[]>('rooms.board')).every((c) => c.session === null)).toBe(true)
  await expect(d.locator('.rooms-waiters')).toHaveClass(/is-highlight/)
  await expect(d.locator('.rooms-open__n.is-active')).toHaveText('2')
  await d.locator('.rooms-waiter[data-waiter="Sardor"]').click()
  await expect(d.locator('.rooms-open__need')).toHaveCount(0)
  await d.getByRole('button', { name: 'Boshlash · 2 kishi · 1 soat' }).click()
  await expect(pos.toast('Sauna 1 ochildi')).toContainText('ofitsiant Sardor')
  await expect(d).toHaveCount(0)
  // Xona kartasida ofitsiant
  await expect(tile(pos, 'Sauna 1').locator('.rooms-tile__waiter')).toHaveText('Sardor')

  await enterSession(pos, 'Sauna 1')
  await expect(page.getByTestId('waiter-strip')).toContainText('Sardor · 10% bardan')
  // Almashtirish → Bekzod (12%)
  await setWaiterUi(pos, 'Bekzod')
  await expect(page.getByTestId('waiter-strip')).toContainText('Bekzod · 12% bardan')

  // Bar + xizmat + qaytarish
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Coca-Cola 1 L', 2)
  await addProduct(pos, add, 'Chips', 1, 'Mehmon 1')
  await addService(pos, add, 'Klassik massaj', 'Massajchi', 'Mehmon 2')
  await closeAdd(pos, add)
  await returnLine(pos, 'Chips', 1, 12_000)

  // ── Bekzod foizi 20% ga o'zgartiriladi (Xodimlar ekrani) — ochiq S1 da 12% qoladi ──
  await backToBoard(pos)
  await pos.nav('Xodimlar')
  const card = page.locator('.staff-card', { has: page.locator('.staff-card__name', { hasText: /^Bekzod$/ }) })
  await expect(card).toContainText('12%')
  await card.getByRole('button', { name: 'Tahrirlash' }).click()
  const ed = pos.dialog('Xodimni tahrirlash')
  await ed.getByTestId('staff-pct').fill('20')
  await ed.getByRole('button', { name: 'Saqlash' }).click()
  await expect(pos.toast('Saqlandi')).toBeVisible()
  await expect(card).toContainText('20%')
  await pos.nav('Xonalar')
  await enterSession(pos, 'Sauna 1')
  await expect(page.getByTestId('waiter-strip')).toContainText('Bekzod · 12% bardan')

  // ── S1 to'lov (+60) ──
  await pos.setNow(T0 + 60 * MIN)
  let co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 280 000 so'm" }).click()
  await finishReceipt(pos, 280_000)

  // ── S2: Bekzod endi 20% ──
  await openRoom(pos, 'Sauna 2', 1, { waiter: 'Bekzod' })
  await expect(page.getByTestId('waiter-strip')).toContainText('Bekzod · 20% bardan')
  let a2 = await openAdd(pos)
  await addProduct(pos, a2, 'Pivo 0.5 L', 1)
  await closeAdd(pos, a2)
  co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 80 000 so'm" }).click()
  await finishReceipt(pos, 80_000)

  // ── S3: ofitsiantsiz ──
  await openRoom(pos, 'VIP xona', 1)
  await expect(page.getByTestId('waiter-strip')).toContainText('Ofitsiant biriktirilmagan')
  a2 = await openAdd(pos)
  await addProduct(pos, a2, 'Pivo 0.5 L', 1)
  await closeAdd(pos, a2)
  co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 120 000 so'm" }).click()
  await finishReceipt(pos, 120_000)

  // ── Server: oylik hisob ──
  const rows = await pos.backend.rpc<MonthRow[]>('waiters.monthly', '2026-10')
  const bek = rows.find((r) => r.name === 'Bekzod')!
  const sar = rows.find((r) => r.name === 'Sardor')!
  expect(bek).toMatchObject({ commissionPct: 20, sessions: 2, productSales: 50_000, commission: 7_600, paid: 0, balance: 7_600 })
  expect(sar).toMatchObject({ sessions: 0, productSales: 0, commission: 0, balance: 0 })
  const sess = await pos.backend.rpc<{ sessionId: number; productSales: number; pct: number; commission: number }[]>(
    'waiters.sessions', pos.ids.waiter2, '2026-10'
  )
  expect(sess.map((s) => [s.sessionId, s.productSales, s.pct, s.commission]).sort()).toEqual([[1, 30_000, 12, 3_600], [2, 20_000, 20, 4_000]])

  // ── Ofitsiantlar ekrani ──
  await pos.nav('Ofitsiantlar')
  await expect(page.getByTestId('wt-month')).toHaveText('Oktabr 2026')
  const row = page.getByTestId('wt-row-' + pos.ids.waiter2)
  await expect(row).toContainText('20%')
  await expect(row).toContainText('50 000')
  await expect(row).toContainText('7 600')
  await expect(page.getByTestId('wt-table').locator('tfoot')).toContainText('7 600')
  // Tafsilot: ikki sessiya, har biri o'z (muzlatilgan) foizi bilan
  await row.click()
  const det = pos.dialog('Bekzod')
  await expect(det.locator('.wt-mini tbody tr')).toHaveCount(2)
  await expect(det.locator('.wt-mini tbody tr', { hasText: 'Sauna 1' })).toContainText('12%')
  await expect(det.locator('.wt-mini tbody tr', { hasText: 'Sauna 1' })).toContainText('3 600')
  await expect(det.locator('.wt-mini tbody tr', { hasText: 'Sauna 2' })).toContainText('20%')
  await expect(det.locator('.wt-mini tbody tr', { hasText: 'Sauna 2' })).toContainText('4 000')
  await expect(det).toContainText('Bu oy uchun hali pul berilmagan')
  // Pul berish: yarmi (4 000)
  await det.getByTestId('wt-pay-open').click()
  const pay = pos.dialog('Pul berish')
  await expect(pay.locator('.wt-pay__rest')).toContainText('7 600')
  await pay.getByRole('button', { name: 'Yarmi · 4 000' }).click()
  await pay.getByLabel('Izoh').fill('avans')
  await pay.getByTestId('wt-pay-submit').click()
  await expect(pos.toast("Bekzodga 4 000 so'm berildi")).toBeVisible()
  await expect(pay).toHaveCount(0)
  // Tafsilot yangilangan: berilgan pul ro'yxatda
  const det2 = pos.dialog('Bekzod')
  await expect(det2.locator('.wt-payout')).toHaveCount(1)
  await expect(det2.locator('.wt-payout')).toContainText('avans')
  await expect(det2.locator('.wt-payout')).toContainText('4 000')
  await det2.locator('.ui-modal__foot').getByRole('button', { name: 'Yopish', exact: true }).click()
  await expect(det2).toHaveCount(0)
  await expect(row).toContainText('3 600')
  // Qolganini qatordagi "Berish" bilan
  await row.getByRole('button', { name: 'Berish' }).click()
  const pay2 = pos.dialog('Pul berish')
  await expect(pay2.getByTestId('wt-pay-amount')).toHaveValue(/3\s?600/)
  await pay2.getByTestId('wt-pay-submit').click()
  await expect(pos.toast("Bekzodga 3 600 so'm berildi")).toBeVisible()
  await expect(row).toContainText("to'liq berilgan")
  await expect(row.getByRole('button', { name: 'Berish' })).toHaveCount(0)
  expect((await pos.backend.rpc<MonthRow[]>('waiters.monthly', '2026-10')).find((r) => r.name === 'Bekzod')).toMatchObject({
    paid: 7_600, balance: 0
  })
  // Noto'g'ri pul berish — server rad etadi
  const b = pos.backend
  expect(await b.rpcError('waiters.payout', pos.ids.waiter2, '2026-10', 0, '')).toBeTruthy()
  expect(await b.rpcError('waiters.payout', pos.ids.waiter2, '2026-13', 1000, '')).toBeTruthy()
  expect(await b.rpcError('waiters.payout', pos.ids.cashier, '2026-10', 1000, '')).toBe('Xodim ofitsiant emas')

  // Oldingi oy — bo'sh
  await page.getByRole('button', { name: 'Oldingi oy' }).click()
  await expect(page.getByTestId('wt-month')).toHaveText('Sentabr 2026')
  await expect(page.getByTestId('wt-row-' + pos.ids.waiter2)).toContainText('0')
  void confirm
})

test('Ofitsiantni olib tashlash: haq hech kimga yozilmaydi; nofaol ofitsiant ro\'yxatda yo\'q va biriktirib bo\'lmaydi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await openRoom(pos, 'Sauna 1', 1, { waiter: 'Sardor' })
  await page.getByTestId('waiter-strip').getByRole('button', { name: 'Almashtirish' }).click()
  const d = pos.dialog('Ofitsiantni almashtirish')
  await d.getByRole('button', { name: 'Olib tashlash' }).click()
  await expect(pos.toast('Ofitsiant olib tashlandi')).toBeVisible()
  await expect(page.getByTestId('waiter-strip')).toContainText('Ofitsiant biriktirilmagan')
  const a = await openAdd(pos)
  await addProduct(pos, a, 'Pivo 0.5 L', 1)
  await closeAdd(pos, a)
  const co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 70 000 so'm" }).click()
  await finishReceipt(pos, 70_000)
  const rows = await pos.backend.rpc<MonthRow[]>('waiters.monthly', '2026-10')
  expect(rows.reduce((s, r) => s + r.commission, 0)).toBe(0)

  // Sardor nofaol → ochish oynasida yo'q, server ham rad etadi
  await pos.backend.rpc('staff.save', { id: pos.ids.waiter1, name: 'Sardor', role: 'waiter', pin: '', isProvider: false, isWaiter: true, commissionPct: 10, active: false })
  await tile(pos, 'Sauna 2').click()
  const od = pos.dialog('Sauna 2 — xonani ochish')
  await expect(od.locator('.rooms-waiter')).toHaveCount(1)
  await expect(od.locator('.rooms-waiter[data-waiter="Sardor"]')).toHaveCount(0)
  await od.getByRole('button', { name: 'Bekor qilish' }).click()
  expect(await pos.backend.rpcError('sessions.open', 2, 1, 60, pos.ids.waiter1)).toBe('Ofitsiant faol emas')
})
