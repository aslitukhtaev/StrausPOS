/**
 * b) Asosiy biznes oqimi — hamma summa QO'LDA hisoblangan. "Qattiq" tizim (docs/ARCHITECTURE.md, src/shared/billing.ts):
 *    har mehmonga vaqt OLDINDAN olinadi (paidMinutes); kam o'tirsa ham to'liq; oshsa graceMinutes(0) dan keyin
 *    har BOSHLANGAN blockMinutes to'liq qo'shiladi (bu testda 1 soatlik bloklar — `useHourBlocks`; daqiqalik standart h-spec'da). Hisoblanadigan daqiqalar intervallar bo'ylab xronologik
 *    taqsimlanadi (har interval o'z tarifi bilan), ishlatilmagan qismi — oxirgi tarifda. roundTo = 1000.
 *
 * Standart xonalar: Sauna 1 = 50 000/soat (6 kishi), Sauna 2 = 60 000 (8), VIP xona = 100 000 (10).
 * Ofitsiantlar: Sardor 10%, Bekzod 12%. T0 = 10:00.
 *
 *  A) Sauna 1, 4 mehmon × 1 soat (T0; ofitsiant xonaga biriktirilmaydi — mahsulotlarni Sardor olib boradi). Ochilishi bilan: 4 × 50 000 = 200 000.
 *     +30 daq  Mehmon 2 pauza          → M2 = 50 000 (olingan 1 soat to'liq)
 *     +45 daq  Mehmon 3 tugatadi       → M3 = 50 000 (45 daq o'tirdi, 1 soat to'lanadi)
 *     +60 daq  Sauna 2 ga o'tish (60 000) — M1, M4 ning olingan vaqti aynan tugadi (qoldi 00:00:00)
 *     +70 daq  M1 = M4: 70 daq → 10 daq oshdi → 2 soat hisoblanadi:
 *                 60 daq × 50 000/60 (Sauna 1) + 10 daq × 60 000/60 (Sauna 2) + ishlatilmagan 50 daq × 60 000/60
 *                 = 50 000 + 10 000 + 50 000 = 110 000
 *              Mehmon 2 davom (Sauna 2 narxida)
 *              Coca-Cola 1 L ×2 (guruh, 15 000), Chips ×1 (Mehmon 1, 12 000) — "Kim olib bordi: Sardor"; Klassik massaj (Mehmon 4, Massajchi, 150 000)
 *              X: Coca-Cola 1 dona qaytariladi → 15 000; chegirma 25 000
 *     +100 daq to'lov:
 *        M1 = M4 = 100 daq o'tirdi → 2 soat: 60 × 50 000/60 + 40 × 60 000/60 + 20 × 60 000/60 = 50 000 + 40 000 + 20 000 = 110 000
 *        M2 = 30 daq (Sauna 1) + 30 daq (Sauna 2) = 60 daq — oshmagan, 1 soat: 25 000 + 30 000 = 55 000
 *        M3 = 50 000
 *        vaqt = 110 000 + 55 000 + 50 000 + 110 000 = 325 000
 *        bar/xizmat = 15 000 + 12 000 + 150 000 = 177 000 → jami 502 000 − 25 000 = 477 000
 *        Naqd: mijoz 500 000 berdi → qaytim 23 000
 *        Ofitsiant Sardor: faqat bar MAHSULOTLARI 15 000 + 12 000 = 27 000 × 10% = 2 700 (massaj va vaqt kirmaydi)
 *  B) VIP xona, 2 mehmon × 2 soat (T0) → +90 daq (2 soat ichida): 2 × 2 × 100 000 = 400 000 → Karta
 *  C) Sauna 1, 1 mehmon × 1 soat (+100) → +161: 61 daq o'tirdi → 1 daqiqa oshdi → 2 soat = 100 000
 *     → Aralash: 20 000 naqd + 80 000 karta
 *  D) Sauna 2, 3 mehmon × 1 soat (+161) + Pivo 0.5 L (20 000) → +181 (20 daq): 3 × 60 000 + 20 000 = 200 000
 *     → Qarz 50 000 (Ali Valiyev, 90 123 45 67) + 150 000 naqd
 *  Qarz keyin: +200 da 30 000 naqd, +210 da 20 000 karta → yopiladi.
 *
 *  Hisobot (bugun): sessiyalar 4; jami 477 000 + 400 000 + 100 000 + 200 000 = 1 177 000
 *    vaqt 325 000 + 400 000 + 100 000 + 180 000 = 1 005 000; mahsulot 15 000 + 12 000 + 20 000 = 47 000; xizmat 150 000;
 *    chegirma 25 000 (1 005 + 47 + 150 − 25 = 1 177 ✓); naqd 477 000 + 20 000 + 150 000 = 647 000;
 *    karta 400 000 + 80 000 = 480 000; qarz 50 000 (647 + 480 + 50 = 1 177 ✓); qaytarishlar 15 000 (Coca-Cola × 1);
 *    qarzdan undirilgan: naqd 30 000, karta 20 000; byWaiter: Sardor — 1 sessiya, 27 000, haq 2 700.
 */
import { test, expect, money, T0, MIN } from './fixtures'
import {
  addProduct, addService, backToBoard, checkoutTotal, closeAdd, confirm, enterSession, expectWsTotal, finishReceipt, guest,
  expectGuest, line, moveTo, openAdd, openRoom, returnLine, setDiscount, startCheckout, tile, useHourBlocks, wsStat
} from './ui'

interface SalesReport {
  sessionsCount: number; timeRevenue: number; productRevenue: number; serviceRevenue: number; discounts: number; total: number
  byMethod: { cash: number; card: number; terminal: number; debt: number }; returnsAmount: number
  debtPayments: { cash: number; card: number; terminal: number }
  byWaiter: { name: string; sessions: number; productSales: number; commission: number }[]
}

test('Asosiy oqim: pauza, tugatish, xona almashtirish, bar/xizmat, X, chegirma, 4 xil to\'lov, qarz, hisobot', async ({ pos, page }) => {
  test.setTimeout(240_000)
  await useHourBlocks(pos)
  await pos.open()
  await pos.login('admin')

  // ───── A va B ochiladi (T0) ─────
  await openRoom(pos, 'Sauna 1', 4)
  // Oldindan olingan vaqt darhol hisobda: 4 × 1 soat × 50 000
  await expectWsTotal(pos, 200_000)
  await expectGuest(pos, 'Mehmon 1', 50_000)
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('01:00:00')
  await backToBoard(pos)
  await openRoom(pos, 'VIP xona', 2, { minutes: 120 })
  await expectWsTotal(pos, 400_000)
  await expect(guest(pos, 'Mehmon 2')).toContainText('2 soat olingan')
  await backToBoard(pos)
  await expect(page.locator('.rooms-board')).toContainText('2 / 3 xona band · 6 mehmon')

  // ───── +30: Mehmon 2 pauza ─────
  await pos.setNow(T0 + 30 * MIN)
  await enterSession(pos, 'Sauna 1')
  // 30 daq o'tirildi — baribir olingan 1 soat: 4 × 50 000; taymer orqaga sanaydi
  await expectWsTotal(pos, 200_000)
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('00:30:00')
  await guest(pos, 'Mehmon 2').getByRole('button', { name: 'Pauza' }).click()
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--paused/)
  await expectGuest(pos, 'Mehmon 2', 50_000)

  // ───── +45: Mehmon 3 tugatadi ─────
  await pos.setNow(T0 + 45 * MIN)
  await guest(pos, 'Mehmon 3').getByRole('button', { name: 'Tugatish' }).click()
  await confirm(pos, 'Ha, tugatish')
  await expect(guest(pos, 'Mehmon 3')).toHaveClass(/rooms-guest--finished/)
  await expectGuest(pos, 'Mehmon 3', 50_000) // 45 daq o'tirdi — olingan 1 soat to'liq
  // Pauzadagi mehmon taymeri yurmagan (30 daq qolgan)
  await expect(guest(pos, 'Mehmon 2').getByTestId('countdown')).toHaveText('00:30:00')
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('00:15:00')
  await expectWsTotal(pos, 200_000)

  // ───── +60: Sauna 2 ga o'tish ─────
  await pos.setNow(T0 + 60 * MIN)
  await moveTo(pos, 'Sauna 2')
  await expect(page.locator('.rooms-ws__sub')).toContainText('60 000/soat')
  await expect(page.locator('.rooms-ws__sub')).toContainText('3/8 kishi') // tugagan mehmon hisobga olinmaydi

  // ───── +70: Mehmon 2 davom ettiradi (yangi xona narxida) ─────
  await pos.setNow(T0 + 70 * MIN)
  // M1: 10 daq oshdi → keyingi soat: 50 000 + 10 000 + 50 000 = 110 000
  await expectGuest(pos, 'Mehmon 1', 110_000)
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toContainText('01:10:00')
  await expect(guest(pos, 'Mehmon 1').getByTestId('overnote')).toHaveText("+00:10:00 oshdi · 1 soat qo'shildi")
  await expect(guest(pos, 'Mehmon 1')).toHaveClass(/rooms-guest--over/)
  await guest(pos, 'Mehmon 2').getByRole('button', { name: /Davom/ }).click()
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--running/)
  await expect(guest(pos, 'Mehmon 2')).toContainText('× 60 000') // yangi xona narxida yuradi
  // Qoidaga ko'ra qolgan (oldindan olingan) 30 daqiqa endi yangi xona narxida: 25 000 + 30 000 = 55 000
  await expectGuest(pos, 'Mehmon 2', 55_000)

  // ───── Bar va xizmat ─────
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Coca-Cola 1 L', 2, 'Butun guruh', 'Sardor')
  await addProduct(pos, add, 'Chips', 1, 'Mehmon 1', 'Sardor')
  await addService(pos, add, 'Klassik massaj', 'Massajchi', 'Mehmon 4')
  await closeAdd(pos, add)
  await expect(line(pos, 'Coca-Cola 1 L').getByTestId('line-waiter')).toHaveText('Sardor')
  await expect(line(pos, 'Klassik massaj').getByTestId('line-waiter')).toHaveCount(0)
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
  // 90 daq o'tirdi, 2 soat olingan — oshmagan: 2 × 200 000
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('00:30:00')
  await expectWsTotal(pos, 400_000)
  let co = await startCheckout(pos)
  expect(await checkoutTotal(co)).toBe(400_000)
  await co.getByRole('radio', { name: 'Karta' }).click()
  await expect(co.locator('.checkout-card')).toContainText("400 000 so'm")
  await co.getByRole('button', { name: "To'lash · 400 000 so'm" }).click()
  let rc = await finishReceipt(pos, 400_000)
  expect(rc).toContain('Karta')
  await expect(tile(pos, 'VIP xona')).toHaveAttribute('aria-label', "VIP xona — bo'sh")

  // ───── +100: A to'lov (naqd, qaytim) ─────
  await pos.setNow(T0 + 100 * MIN)
  await enterSession(pos, 'Sauna 2')
  await expectGuest(pos, 'Mehmon 1', 110_000)
  await expectGuest(pos, 'Mehmon 2', 55_000)
  await expectGuest(pos, 'Mehmon 3', 50_000)
  await expectGuest(pos, 'Mehmon 4', 110_000)
  // M2 aynan 60 daq o'tirdi (30 + 30) — oshmagan, taymer 00:00:00
  await expect(guest(pos, 'Mehmon 2').getByTestId('countdown')).toContainText('00:00:00')
  await expect.poll(() => wsStat(pos, 'Vaqt')).toBe(325_000)
  await expectWsTotal(pos, 477_000)
  co = await startCheckout(pos)
  expect(await checkoutTotal(co)).toBe(477_000)
  await expect(co.locator('.checkout-sum__line', { hasText: 'Chegirma' })).toContainText('25 000')
  // Kam summa → xato, to'lash o'chiq
  await pos.typeDigits('400000')
  await expect(co.locator('.checkout-foot__status')).toContainText("Yetarli emas: yana 77 000 so'm")
  await expect(co.getByRole('button', { name: /To'lash ·/ })).toBeDisabled()
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
  await pos.typeDigits('500000')
  await expect(co.locator('.checkout-change')).toContainText('23 000')
  await expect(co.locator('.checkout-foot__status')).toContainText("Qaytim: 23 000 so'm")
  await co.getByRole('button', { name: "To'lash · 477 000 so'm" }).click()
  rc = await finishReceipt(pos, 477_000)
  expect(rc).toContain('Qaytim')
  expect(rc).toContain('23 000')

  // Chek ma'lumotlari (server): qaytarilgan qator to'liq emas, faqat faol miqdor
  const closed = await pos.backend.rpc<{ session: { id: number } }[]>('rooms.board')
  void closed
  const receiptA = await pos.backend.rpc<{
    total: number; timeTotal: number; linesTotal: number; discount: number; receiptNo: number
    lines: { name: string; qty: number; amount: number }[]; payments: { method: string; amount: number }[]
  }>('checkout.receipt', 1)
  expect(receiptA).toMatchObject({ total: 477_000, timeTotal: 325_000, linesTotal: 177_000, discount: 25_000 })
  expect(receiptA.lines.find((l) => l.name === 'Coca-Cola 1 L')).toMatchObject({ qty: 1, amount: 15_000 })
  expect(receiptA.payments).toEqual([{ method: 'cash', amount: 477_000 }])
  // Ofitsiant haqi: Sardor olib borgan mahsulot qatorlari (27 000 × 10%), massaj kirmaydi
  const wsA = await pos.backend.rpc<{ sessionId: number; productSales: number; pct: number; commission: number }[]>(
    'waiters.sessions', pos.ids.waiter1, '2026-10'
  )
  expect(wsA).toEqual([expect.objectContaining({ sessionId: 1, productSales: 27_000, pct: 10, commission: 2_700 })])
  expect(await stock('Coca-Cola 1 L')).toBe(23)
  expect(await stock('Chips')).toBe(19)

  // ───── C: Sauna 1, 1 mehmon (+100 → +161), aralash ─────
  await openRoom(pos, 'Sauna 1', 1)
  await pos.setNow(T0 + 160 * MIN)
  await expectWsTotal(pos, 50_000) // aynan 60 daq — hali 1 soat
  await pos.setNow(T0 + 161 * MIN)
  await expectWsTotal(pos, 100_000) // 1 daqiqa oshdi → keyingi soat to'liq
  co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Aralash' }).click()
  await pos.typeDigits('20000')
  await co.locator('.checkout-row[data-method="card"]').click()
  await co.getByRole('button', { name: 'Qolganini: Karta' }).click()
  await expect(co.locator('.checkout-row', { hasText: 'Karta' })).toContainText('80 000')
  await expect(co.locator('.checkout-change')).toContainText('0')
  await co.getByRole('button', { name: "To'lash · 100 000 so'm" }).click()
  rc = await finishReceipt(pos, 100_000)
  expect(rc).toMatch(/Naqd\s*20 000/)
  expect(rc).toMatch(/Karta\s*80 000/)

  // ───── D: Sauna 2, 3 mehmon + Pivo (+161 → +181), qarz + naqd ─────
  await openRoom(pos, 'Sauna 2', 3)
  const add2 = await openAdd(pos)
  await addProduct(pos, add2, 'Pivo 0.5 L', 1)
  await closeAdd(pos, add2)
  await pos.setNow(T0 + 181 * MIN)
  await expectWsTotal(pos, 200_000)
  co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Qarz' }).click()
  await co.getByTestId('debtor-name').fill('Ali Valiyev')
  await co.getByPlaceholder('90 123 45 67').fill('901234567')
  await expect(co.getByPlaceholder('90 123 45 67')).toHaveValue('90 123 45 67')
  // Qarz summasi 50 000, qolgani naqd
  await co.locator('.checkout-amount').click() // fokusni inputdan olamiz → numpad klaviaturasi ishlaydi
  await pos.typeDigits('50000')
  await expect(co.locator('.checkout-rest')).toContainText('150 000')
  await co.locator('.checkout-rest').getByRole('radio', { name: 'Naqd' }).click()
  await co.getByRole('button', { name: "To'lash · 200 000 so'm" }).click()
  rc = await finishReceipt(pos, 200_000)
  expect(rc).toContain('Ali Valiyev')
  expect(rc).toMatch(/Qarz\s*50 000/)
  expect(rc).toMatch(/Naqd\s*150 000/)
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
    total: 1_177_000,
    timeRevenue: 1_005_000,
    productRevenue: 47_000,
    serviceRevenue: 150_000,
    discounts: 25_000,
    byMethod: { cash: 647_000, card: 480_000, terminal: 0, debt: 50_000 },
    debtPayments: { cash: 30_000, card: 20_000, terminal: 0 },
    returnsAmount: 15_000
  })
  expect(report.byWaiter.filter((w) => w.sessions > 0)).toEqual([
    expect.objectContaining({ name: 'Sardor', sessions: 1, productSales: 27_000, commission: 2_700 })
  ])
  const rep = page.locator('.rep')
  await expect(rep).toContainText('1 177 000')
  await expect(rep).toContainText('647 000')
  await expect(rep).toContainText('480 000')
  await expect(rep).toContainText('1 005 000')
  await expect(rep).toContainText('150 000')
  // Qaytarish ko'rinadi: mahsulot, miqdor, summa, sabab
  const ret = rep.locator(':text("Coca-Cola 1 L")').last()
  await expect(ret).toBeVisible()
  await expect(rep).toContainText('Xato kiritildi')
  // Xizmat ko'rsatuvchi
  await expect(rep).toContainText('Massajchi')
  void money
})
