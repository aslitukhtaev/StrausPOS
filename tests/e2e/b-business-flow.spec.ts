/**
 * b) Asosiy biznes oqimi — hamma summa QO'LDA hisoblangan (roundTo = 1000, Math.round).
 *
 * Standart xonalar: Sauna 1 = 50 000/soat (6 kishi), Sauna 2 = 60 000 (8), VIP xona = 100 000 (10).
 * T0 = 10:00.
 *
 *  A) Sauna 1, 4 mehmon (T0):
 *     +30 daq  Mehmon 2 pauza          → M2: 30 daq × 50 000/60 = 25 000
 *     +45 daq  Mehmon 3 tugatadi       → M3: 45 × 50 000/60 = 37 500 → 38 000 (yaxlitlash)
 *     +60 daq  Sauna 2 ga o'tish (60 000)
 *     +70 daq  Mehmon 2 davom (Sauna 2 narxida)
 *              Coca-Cola 1 L ×2 (guruh, 15 000), Chips ×1 (Mehmon 1, 12 000), Klassik massaj (Mehmon 4, Massajchi, 150 000)
 *              X: Coca-Cola 1 dona qaytariladi → 15 000; chegirma 25 000
 *     +100 daq to'lov:
 *        M1 = M4 = 60 daq × 50 000/60 + 40 daq × 60 000/60 = 50 000 + 40 000 = 90 000
 *        M2 = 25 000 + 30 daq × 60 000/60 = 55 000
 *        M3 = 38 000
 *        vaqt = 90 000 + 55 000 + 38 000 + 90 000 = 273 000
 *        bar/xizmat = 15 000 + 12 000 + 150 000 = 177 000 → jami 450 000 − 25 000 = 425 000
 *        Naqd: mijoz 500 000 berdi → qaytim 75 000
 *  B) VIP xona, 2 mehmon (T0) → +90 daq: 2 × 90 × 100 000/60 = 300 000 → Karta
 *  C) Sauna 1, 1 mehmon (+100) → +161: 61 daq × 50 000/60 = 50 833,3 → 51 000 → Aralash: 20 000 naqd + 31 000 karta
 *  D) Sauna 2, 3 mehmon (+161) + Pivo 0.5 L (20 000) → +181: 3 × 20 000 + 20 000 = 80 000
 *     → Qarz 50 000 (Ali Valiyev, 90 123 45 67) + 30 000 naqd
 *  Qarz keyin: +200 da 30 000 naqd, +210 da 20 000 karta → yopiladi.
 *
 *  Hisobot (bugun): sessiyalar 4; jami 425 000 + 300 000 + 51 000 + 80 000 = 856 000
 *    vaqt 273 000 + 300 000 + 51 000 + 60 000 = 684 000; mahsulot 15 000 + 12 000 + 20 000 = 47 000; xizmat 150 000;
 *    chegirma 25 000 (684+47+150−25 = 856 ✓); naqd 425 000 + 20 000 + 30 000 = 475 000; karta 300 000 + 31 000 = 331 000;
 *    qarz 50 000 (475+331+50 = 856 ✓); qaytarishlar 15 000 (Coca-Cola × 1).
 */
import { test, expect, fm, money, T0, MIN } from './fixtures'
import {
  addProduct, addService, backToBoard, checkoutTotal, closeAdd, confirm, enterSession, expectWsTotal, finishReceipt, guest,
  expectGuest, line, moveTo, openAdd, openRoom, returnLine, setDiscount, startCheckout, tile, wsStat
} from './ui'

interface SalesReport {
  sessionsCount: number; timeRevenue: number; productRevenue: number; serviceRevenue: number; discounts: number; total: number
  byMethod: { cash: number; card: number; debt: number }; returnsAmount: number
}

test('Asosiy oqim: pauza, tugatish, xona almashtirish, bar/xizmat, X, chegirma, 4 xil to\'lov, qarz, hisobot', async ({ pos, page }) => {
  test.setTimeout(240_000)
  await pos.open()
  await pos.login('admin')

  // ───── A va B ochiladi (T0) ─────
  await openRoom(pos, 'Sauna 1', 4)
  await expectWsTotal(pos, 0)
  await backToBoard(pos)
  await openRoom(pos, 'VIP xona', 2)
  await backToBoard(pos)
  await expect(page.locator('.rooms-board')).toContainText('2 / 3 xona band · 6 mehmon')

  // ───── +30: Mehmon 2 pauza ─────
  await pos.setNow(T0 + 30 * MIN)
  await enterSession(pos, 'Sauna 1')
  // 4 × 30 daq × 50 000/60 = 4 × 25 000
  await expectWsTotal(pos, 100_000)
  await guest(pos, 'Mehmon 2').getByRole('button', { name: 'Pauza' }).click()
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--paused/)
  await expectGuest(pos, 'Mehmon 2', 25_000)

  // ───── +45: Mehmon 3 tugatadi ─────
  await pos.setNow(T0 + 45 * MIN)
  await guest(pos, 'Mehmon 3').getByRole('button', { name: 'Tugatish' }).click()
  await confirm(pos, 'Ha, tugatish')
  await expect(guest(pos, 'Mehmon 3')).toHaveClass(/rooms-guest--finished/)
  await expectGuest(pos, 'Mehmon 3', 38_000) // 37 500 → 38 000
  // Pauzadagi mehmon vaqti yurmagan
  await expectGuest(pos, 'Mehmon 2', 25_000)
  // M1, M4: 45 daq = 37 500 → 38 000 har biri; jami 38+25+38+38 = 139 000
  await expectWsTotal(pos, 139_000)

  // ───── +60: Sauna 2 ga o'tish ─────
  await pos.setNow(T0 + 60 * MIN)
  await moveTo(pos, 'Sauna 2')
  await expect(page.locator('.rooms-ws__sub')).toContainText('60 000/soat')
  await expect(page.locator('.rooms-ws__sub')).toContainText('3/8 kishi') // tugagan mehmon hisobga olinmaydi

  // ───── +70: Mehmon 2 davom ettiradi (yangi xona narxida) ─────
  await pos.setNow(T0 + 70 * MIN)
  // M1 = 50 000 + 10 × 1 000 = 60 000
  await expectGuest(pos, 'Mehmon 1', 60_000)
  await guest(pos, 'Mehmon 2').getByRole('button', { name: /Davom/ }).click()
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--running/)
  await expect(guest(pos, 'Mehmon 2')).toContainText("narx o‘zgargan")

  // ───── Bar va xizmat ─────
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Coca-Cola 1 L', 2)
  await addProduct(pos, add, 'Chips', 1, 'Mehmon 1')
  await addService(pos, add, 'Klassik massaj', 'Massajchi', 'Mehmon 4')
  await expect(add.locator('.rooms-add__summary')).toContainText(fm(15_000 * 2 + 12_000 + 150_000))
  await closeAdd(pos, add)
  await expect(line(pos, 'Coca-Cola 1 L')).toContainText('2 × 15 000')
  await expect(line(pos, 'Klassik massaj')).toContainText('Massajchi')
  await expect(line(pos, 'Klassik massaj')).toContainText('Mehmon 4')
  await expect.poll(() => wsStat(pos, 'Bar va xizmat')).toBe(192_000)
  // Ombor: Coca-Cola 24 → 22, Chips 20 → 19
  const stock = async (name: string) =>
    (await pos.backend.rpc<{ name: string; stock: number }[]>('catalog.products')).find((p) => p.name === name)!.stock

  // ───── X: 1 ta Coca-Cola qaytarish ─────
  await returnLine(pos, 'Coca-Cola 1 L', 1, 15_000)
  await expect(line(pos, 'Coca-Cola 1 L')).toContainText('1 × 15 000')
  await expect(line(pos, 'Coca-Cola 1 L')).toContainText('qaytarildi: 1 dona')
  await expect.poll(() => wsStat(pos, 'Bar va xizmat')).toBe(177_000)

  // ───── Chegirma 25 000 ─────
  await setDiscount(pos, 25_000)
  await expect.poll(() => wsStat(pos, 'Chegirma')).toBe(-25_000)

  // ───── +90: VIP karta bilan ─────
  await pos.setNow(T0 + 90 * MIN)
  await backToBoard(pos)
  await enterSession(pos, 'VIP xona')
  await expectWsTotal(pos, 300_000)
  let co = await startCheckout(pos)
  expect(await checkoutTotal(co)).toBe(300_000)
  await co.getByRole('radio', { name: 'Karta' }).click()
  await expect(co.locator('.checkout-card')).toContainText("300 000 so'm")
  await co.getByRole('button', { name: "To'lash · 300 000 so'm" }).click()
  let rc = await finishReceipt(pos, 300_000)
  expect(rc).toContain('Karta')
  await expect(tile(pos, 'VIP xona')).toHaveAttribute('aria-label', "VIP xona — bo'sh")

  // ───── +100: A to'lov (naqd, qaytim) ─────
  await pos.setNow(T0 + 100 * MIN)
  await enterSession(pos, 'Sauna 2')
  await expectGuest(pos, 'Mehmon 1', 90_000)
  await expectGuest(pos, 'Mehmon 2', 55_000)
  await expectGuest(pos, 'Mehmon 3', 38_000)
  await expectGuest(pos, 'Mehmon 4', 90_000)
  await expect.poll(() => wsStat(pos, 'Vaqt')).toBe(273_000)
  await expectWsTotal(pos, 425_000)
  co = await startCheckout(pos)
  expect(await checkoutTotal(co)).toBe(425_000)
  await expect(co.locator('.checkout-sum__line', { hasText: 'Chegirma' })).toContainText('25 000')
  // Kam summa → xato, to'lash o'chiq
  await pos.typeDigits('400000')
  await expect(co.locator('.checkout-foot__status')).toContainText("Yetarli emas: yana 25 000 so'm")
  await expect(co.getByRole('button', { name: /To'lash ·/ })).toBeDisabled()
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
  await pos.typeDigits('500000')
  await expect(co.locator('.checkout-change')).toContainText('75 000')
  await expect(co.locator('.checkout-foot__status')).toContainText("Qaytim: 75 000 so'm")
  await co.getByRole('button', { name: "To'lash · 425 000 so'm" }).click()
  rc = await finishReceipt(pos, 425_000)
  expect(rc).toContain('Qaytim')
  expect(rc).toContain('75 000')

  // Chek ma'lumotlari (server): qaytarilgan qator to'liq emas, faqat faol miqdor
  const closed = await pos.backend.rpc<{ session: { id: number } }[]>('rooms.board')
  void closed
  const receiptA = await pos.backend.rpc<{
    total: number; timeTotal: number; linesTotal: number; discount: number; receiptNo: number
    lines: { name: string; qty: number; amount: number }[]; payments: { method: string; amount: number }[]
  }>('checkout.receipt', 1)
  expect(receiptA).toMatchObject({ total: 425_000, timeTotal: 273_000, linesTotal: 177_000, discount: 25_000 })
  expect(receiptA.lines.find((l) => l.name === 'Coca-Cola 1 L')).toMatchObject({ qty: 1, amount: 15_000 })
  expect(receiptA.payments).toEqual([{ method: 'cash', amount: 425_000 }])
  expect(await stock('Coca-Cola 1 L')).toBe(23)
  expect(await stock('Chips')).toBe(19)

  // ───── C: Sauna 1, 1 mehmon (+100 → +161), aralash ─────
  await openRoom(pos, 'Sauna 1', 1)
  await pos.setNow(T0 + 161 * MIN)
  await expectWsTotal(pos, 51_000)
  co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Aralash' }).click()
  await pos.typeDigits('20000')
  await co.getByRole('button', { name: 'Qolganini karta' }).click()
  await expect(co.locator('.checkout-row', { hasText: 'Karta' })).toContainText('31 000')
  await expect(co.locator('.checkout-change')).toContainText('0')
  await co.getByRole('button', { name: "To'lash · 51 000 so'm" }).click()
  rc = await finishReceipt(pos, 51_000)
  expect(rc).toMatch(/Naqd\s*20 000/)
  expect(rc).toMatch(/Karta\s*31 000/)

  // ───── D: Sauna 2, 3 mehmon + Pivo (+161 → +181), qarz + naqd ─────
  await openRoom(pos, 'Sauna 2', 3)
  const add2 = await openAdd(pos)
  await addProduct(pos, add2, 'Pivo 0.5 L', 1)
  await closeAdd(pos, add2)
  await pos.setNow(T0 + 181 * MIN)
  await expectWsTotal(pos, 80_000)
  co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Qarz' }).click()
  await co.getByPlaceholder('Mijoz ismi').fill('Ali Valiyev')
  await co.getByPlaceholder('90 123 45 67').fill('901234567')
  await expect(co.getByPlaceholder('90 123 45 67')).toHaveValue('90 123 45 67')
  // Qarz summasi 50 000, qolgani naqd
  await co.locator('.checkout-amount').click() // fokusni inputdan olamiz → numpad klaviaturasi ishlaydi
  await pos.typeDigits('50000')
  await expect(co.locator('.checkout-rest')).toContainText('30 000')
  await co.locator('.checkout-rest').getByRole('radio', { name: 'Naqd' }).click()
  await co.getByRole('button', { name: "To'lash · 80 000 so'm" }).click()
  rc = await finishReceipt(pos, 80_000)
  expect(rc).toContain('Ali Valiyev')
  expect(rc).toMatch(/Qarz\s*50 000/)
  expect(rc).toMatch(/Naqd\s*30 000/)
  await expect(page.locator('.rooms-board')).toContainText("3 ta xona · hammasi bo'sh")

  // ───── Qarzni keyin to'lash ─────
  await pos.setNow(T0 + 200 * MIN)
  await pos.nav('Qarzlar')
  const total = page.locator('.debts-total .ui-money')
  await expect(total).toHaveText("50 000 so'm")
  const row = page.locator('.debts-row', { hasText: 'Ali Valiyev' })
  await expect(row).toContainText('90 123 45 67')
  await row.getByRole('button', { name: "To'lash" }).click()
  let pd = pos.dialog("Qarzni to'lash")
  await pos.typeDigits('30000')
  await pd.getByRole('button', { name: "30 000 so'm qabul qilish" }).click()
  await expect(pos.toast("30 000 so'm qabul qilindi")).toBeVisible()
  await expect(pd.locator('.debts-pay__rest')).toContainText('20 000')
  await pd.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(total).toHaveText("20 000 so'm")

  await pos.setNow(T0 + 210 * MIN)
  await row.getByRole('button', { name: "To'lash" }).click()
  pd = pos.dialog("Qarzni to'lash")
  await pd.getByRole('radio', { name: 'Karta' }).click()
  await pd.getByRole('button', { name: 'Hammasi' }).click()
  await pd.getByRole('button', { name: "20 000 so'm qabul qilish" }).click()
  await expect(pos.toast("Qarz to'liq yopildi")).toBeVisible()
  await expect(pd).toHaveCount(0)
  await expect(total).toHaveText("0 so'm")
  await page.getByRole('tab', { name: 'Barchasi' }).click()
  await expect(row).toContainText("To'langan")
  const debts = await pos.backend.rpc<{ amount: number; paid: number; closedAt: number | null }[]>('debts.list', false)
  expect(debts).toHaveLength(1)
  expect(debts[0]).toMatchObject({ amount: 50_000, paid: 50_000, closedAt: T0 + 210 * MIN })

  // ───── Hisobot ─────
  await pos.nav('Hisobot')
  const report = await pos.backend.rpc<SalesReport>('reports.sales', { from: T0 - 10 * 3600_000, to: T0 + 14 * 3600_000 })
  expect(report).toMatchObject({
    sessionsCount: 4,
    total: 856_000,
    timeRevenue: 684_000,
    productRevenue: 47_000,
    serviceRevenue: 150_000,
    discounts: 25_000,
    byMethod: { cash: 475_000, card: 331_000, debt: 50_000 },
    returnsAmount: 15_000
  })
  const rep = page.locator('.rep')
  await expect(rep).toContainText('856 000')
  await expect(rep).toContainText('475 000')
  await expect(rep).toContainText('331 000')
  await expect(rep).toContainText('684 000')
  await expect(rep).toContainText('150 000')
  // Qaytarish ko'rinadi: mahsulot, miqdor, summa, sabab
  const ret = rep.locator(':text("Coca-Cola 1 L")').last()
  await expect(ret).toBeVisible()
  await expect(rep).toContainText('Xato kiritildi')
  // Xizmat ko'rsatuvchi
  await expect(rep).toContainText('Massajchi')
  void money
})
