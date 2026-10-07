/**
 * i) Ofitsiantlar (2026-10 qoidasi): ofitsiant xonaga BIRIKTIRILMAYDI. Har bir ofitsiant o'z PIN'i bilan kirib istalgan
 *    xonaga buyurtma qo'shadi — qator uning nomiga (waiterId) va o'sha paytdagi foizi bilan (waiterPct, muzlatiladi) yoziladi.
 *    Kassir/ega qo'shganda "Kim olib bordi" ixtiyoriy ("—" = hech kimga). Haq = bar + OSHXONA mahsulotlari qatorlari
 *    (qaytarish ayirilgan) × foiz; xizmat va vaqt kirmaydi.
 *
 *  Sauna 1, 2 kishi × 1 soat (ega ochadi — ochish oynasida ofitsiant tanlovi yo'q).
 *   Sardor (PIN 5555) kiradi: Coca-Cola 1 L × 2 (30 000, bar) + Shashlik × 1 (25 000, OSHXONA) — "Kim olib bordi" ko'rinmaydi,
 *     qatorlarda "Sardor"; oshxona mahsuloti → "Oshxonaga chek yuborildi".
 *   Ega kiradi: Sardor foizi 10% → 20% (eski qatorlarda 10% qoladi).
 *     Pivo 0.5 L × 1 (20 000) "Kim olib bordi: Bekzod" (12%); Chips × 1 (12 000) "—"; Klassik massaj (150 000).
 *     X: Coca-Cola 1 dona qaytariladi → Sardor savdosi 15 000 + 25 000 = 40 000.
 *   +60: to'lov = 2 × 50 000 + 15 000 + 25 000 + 20 000 + 12 000 + 150 000 = 322 000.
 *  Oylik (2026-10): Sardor 40 000 × 10% = 4 000; Bekzod 20 000 × 12% = 2 400. Chips (ofitsiantsiz) va massaj — hech kimga.
 *  Pul berish (Bekzod): "Yarmi" (round(2 400/2/1000)×1000 = 1 000) → qoldiq 1 400; keyin 1 400 → 0 ("to'liq berilgan").
 */
import { test, expect, T0, MIN } from './fixtures'
import {
  addProduct, addService, backToBoard, closeAdd, enterSession, finishReceipt, line, openAdd, openRoom, returnLine, selectProduct,
  startCheckout, submitAdd, tile
} from './ui'

interface MonthRow { staffId: number; name: string; commissionPct: number; sessions: number; productSales: number; commission: number; paid: number; balance: number }
interface LineRow { name: string; waiterId: number | null; waiterPct: number; department: string | null; kind: string }

/** Demo katalogidagi "Taomlar" kategoriyasini oshxona bo'limiga o'tkazadi (ega nomidan, UI ga kirishdan oldin) */
async function kitchenCategory(pos: import('./fixtures').Pos): Promise<void> {
  const b = pos.backend
  await b.loginAs('owner', pos.ids)
  const cats = await b.rpc<{ id: number; name: string; sortOrder: number; department: string }[]>('catalog.categories')
  const taom = cats.find((c) => c.name === 'Taomlar')!
  if (taom.department !== 'kitchen') await b.rpc('catalog.saveCategory', { ...taom, department: 'kitchen' })
  await b.rpc('auth.logout')
}

test('Ofitsiant o\'z PIN\'i bilan mahsulot qo\'shadi → haq (bar + oshxona), kassir "kim olib bordi", xizmat kirmaydi, foiz muzlatiladi', async ({ pos, page }) => {
  test.setTimeout(180_000)
  await kitchenCategory(pos)
  await pos.open()
  await pos.login('owner')

  // ── Ochish: ofitsiant tanlovi ham, ogohlantirish ham yo'q; kartada ofitsiant belgisi yo'q ──
  await openRoom(pos, 'Sauna 1', 2)
  await expect(page.getByTestId('waiter-strip')).toHaveCount(0)
  await backToBoard(pos)
  await expect(tile(pos, 'Sauna 1').locator('.rooms-tile__waiter')).toHaveCount(0)
  await pos.lock()

  // ── Sardor (ofitsiant) o'zi qo'shadi ──
  await pos.login('waiter1')
  await enterSession(pos, 'Sauna 1')
  const wa = await openAdd(pos)
  await expect(wa.getByTestId('add-waiter')).toHaveCount(0)
  // Plitani bosish darhol qo'shmaydi — faqat tanlaydi
  await selectProduct(wa, 'Coca-Cola 1 L', 2)
  await wa.getByRole('tab', { name: /^Oshxona/ }).click()
  await selectProduct(wa, 'Shashlik', 1)
  await expect(wa.getByTestId('add-summary')).toContainText('Coca-Cola 1 L ×2')
  await expect(wa.getByTestId('add-summary')).toContainText('Shashlik ×1')
  await expect(wa.getByTestId('add-submit')).toHaveText("Qo'shish (3 ta · 55 000)")
  expect((await pos.backend.rpc<{ lines: unknown[] }>('sessions.get', 1)).lines).toHaveLength(0)
  await submitAdd(pos, wa)
  await expect(pos.toast('Oshxonaga chek yuborildi')).toBeVisible()
  await expect(line(pos, 'Coca-Cola 1 L').getByTestId('line-waiter')).toHaveText('Sardor')
  await expect(line(pos, 'Shashlik').getByTestId('line-waiter')).toHaveText('Sardor')
  let lines = (await pos.backend.rpc<{ lines: LineRow[] }>('sessions.get', 1)).lines
  expect(lines.find((l) => l.name === 'Shashlik')).toMatchObject({ waiterId: pos.ids.waiter1, waiterPct: 10, department: 'kitchen' })
  expect(lines.find((l) => l.name === 'Coca-Cola 1 L')).toMatchObject({ waiterId: pos.ids.waiter1, waiterPct: 10, department: 'bar' })
  await pos.lock()

  // ── Ega: Sardor foizi 20% (eski qatorlarda 10% qoladi); "kim olib bordi" bilan qo'shish ──
  await pos.login('owner')
  await pos.backend.rpc('staff.save', { id: pos.ids.waiter1, name: 'Sardor', role: 'waiter', pin: '', isProvider: false, isWaiter: true, commissionPct: 20, active: true })
  await enterSession(pos, 'Sauna 1')
  const add = await openAdd(pos)
  // Standart "—"
  await expect(add.getByTestId('add-waiter').locator('.rooms-chip.is-active')).toHaveText('—')
  await addProduct(pos, add, 'Pivo 0.5 L', 1, 'Butun guruh', 'Bekzod')
  await addProduct(pos, add, 'Chips', 1, 'Mehmon 1', null)
  await addService(pos, add, 'Klassik massaj', 'Massajchi', 'Mehmon 2')
  await closeAdd(pos, add)
  await expect(line(pos, 'Pivo 0.5 L').getByTestId('line-waiter')).toHaveText('Bekzod')
  await expect(line(pos, 'Chips').getByTestId('line-waiter')).toHaveCount(0)
  await expect(line(pos, 'Klassik massaj').getByTestId('line-waiter')).toHaveCount(0)
  await returnLine(pos, 'Coca-Cola 1 L', 1, 15_000)
  lines = (await pos.backend.rpc<{ lines: LineRow[] }>('sessions.get', 1)).lines
  expect(lines.find((l) => l.name === 'Coca-Cola 1 L')).toMatchObject({ waiterPct: 10 })
  expect(lines.find((l) => l.name === 'Pivo 0.5 L')).toMatchObject({ waiterId: pos.ids.waiter2, waiterPct: 12 })
  expect(lines.find((l) => l.name === 'Chips')).toMatchObject({ waiterId: null })

  // ── To'lov (+60) ──
  await pos.setNow(T0 + 60 * MIN)
  const co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 322 000 so'm" }).click()
  await finishReceipt(pos, 322_000)

  // ── Server: oylik hisob ──
  const rows = await pos.backend.rpc<MonthRow[]>('waiters.monthly', '2026-10')
  expect(rows.find((r) => r.name === 'Sardor')).toMatchObject({ commissionPct: 20, productSales: 40_000, commission: 4_000, balance: 4_000 })
  expect(rows.find((r) => r.name === 'Bekzod')).toMatchObject({ productSales: 20_000, commission: 2_400, balance: 2_400 })
  expect(rows.reduce((s, r) => s + r.commission, 0)).toBe(6_400)

  // ── Ofitsiantlar ekrani ──
  await pos.nav('Ofitsiantlar')
  await expect(page.getByTestId('wt-month')).toHaveText('Oktabr 2026')
  const sar = page.getByTestId('wt-row-' + pos.ids.waiter1)
  await expect(sar).toContainText('40 000')
  await expect(sar).toContainText('4 000')
  const bek = page.getByTestId('wt-row-' + pos.ids.waiter2)
  await expect(bek).toContainText('20 000')
  await expect(bek).toContainText('2 400')
  await expect(page.getByTestId('wt-table').locator('tfoot')).toContainText('6 400')

  // Pul berish: yarmi (1 000) → qoldiq 1 400 → qolganini qatordagi "Berish"
  await bek.click()
  const det = pos.dialog('Bekzod')
  await det.getByTestId('wt-pay-open').click()
  const pay = pos.dialog('Pul berish')
  await expect(pay.locator('.wt-pay__rest')).toContainText('2 400')
  await pay.getByRole('button', { name: 'Yarmi · 1 000' }).click()
  await pay.getByTestId('wt-pay-submit').click()
  await expect(pos.toast("Bekzodga 1 000 so'm berildi")).toBeVisible()
  await expect(pay).toHaveCount(0)
  const det2 = pos.dialog('Bekzod')
  await det2.locator('.ui-modal__foot').getByRole('button', { name: 'Yopish', exact: true }).click()
  await expect(det2).toHaveCount(0)
  await expect(bek).toContainText('1 400')
  await bek.getByRole('button', { name: 'Berish' }).click()
  const pay2 = pos.dialog('Pul berish')
  await expect(pay2.getByTestId('wt-pay-amount')).toHaveValue(/1\s?400/)
  await pay2.getByTestId('wt-pay-submit').click()
  await expect(pos.toast("Bekzodga 1 400 so'm berildi")).toBeVisible()
  await expect(bek).toContainText("to'liq berilgan")
  const b = pos.backend
  expect(await b.rpcError('waiters.payout', pos.ids.cashier, '2026-10', 1000, '')).toBe('Xodim ofitsiant emas')
})

test('Kassir "—" bilan qo\'shsa haq yo\'q; nofaol ofitsiant "kim olib bordi" ro\'yxatida yo\'q', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  await openRoom(pos, 'Sauna 1', 1)
  const a = await openAdd(pos)
  await expect(a.getByTestId('add-waiter').locator('.rooms-chip[data-waiter="Sardor"]')).toBeVisible()
  await addProduct(pos, a, 'Pivo 0.5 L', 1)
  await closeAdd(pos, a)
  await expect(line(pos, 'Pivo 0.5 L').getByTestId('line-waiter')).toHaveCount(0)
  await pos.setNow(T0 + 60 * MIN)
  const co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 70 000 so'm" }).click()
  await finishReceipt(pos, 70_000)
  await pos.lock()

  await pos.login('owner')
  const rows = await pos.backend.rpc<MonthRow[]>('waiters.monthly', '2026-10')
  expect(rows.reduce((s, r) => s + r.commission, 0)).toBe(0)
  // Sardor nofaol → "Kim olib bordi" da yo'q
  await pos.backend.rpc('staff.save', { id: pos.ids.waiter1, name: 'Sardor', role: 'waiter', pin: '', isProvider: false, isWaiter: true, commissionPct: 10, active: false })
  await openRoom(pos, 'Sauna 2', 1)
  const a2 = await openAdd(pos)
  await expect(a2.getByTestId('add-waiter').locator('.rooms-chip[data-waiter="Bekzod"]')).toBeVisible()
  await expect(a2.getByTestId('add-waiter').locator('.rooms-chip[data-waiter="Sardor"]')).toHaveCount(0)
  await closeAdd(pos, a2)
  void page
})

test('Ofitsiant tanlanmasa eslatma chiqadi: "Ofitsiant tanlash" oynani ochiq qoldiradi, "Ofitsiantsiz qo\'shish" haqsiz qo\'shadi, tanlansa eslatma yo\'q', async ({ pos, page }) => {
  test.setTimeout(120_000)
  await pos.open()
  await pos.login('owner')
  await openRoom(pos, 'Sauna 1', 1)
  const d = await openAdd(pos)
  await selectProduct(d, 'Coca-Cola 1 L', 1)

  // 1) Ofitsiant tanlanmagan → eslatma; "Ofitsiant tanlash" → hech narsa qo'shilmaydi, oyna ochiq
  await d.getByTestId('add-submit').click()
  const warn = page.getByRole('button', { name: "Ofitsiantsiz qo'shish" })
  await expect(warn).toBeVisible()
  await expect(page.getByText('Ofitsiant tanlanmadi')).toBeVisible()
  await page.getByRole('button', { name: 'Ofitsiant tanlash' }).click()
  await expect(warn).toHaveCount(0)
  await expect(d).toBeVisible()
  expect((await pos.backend.rpc<{ lines: unknown[] }>('sessions.get', 1)).lines).toHaveLength(0)

  // 2) Ofitsiant tanlandi → eslatmasiz qo'shiladi va ofitsiant qatorga yoziladi
  await d.getByTestId('add-waiter').locator('.rooms-chip[data-waiter="Sardor"]').click()
  const resp = page.waitForResponse((r) => r.url().includes('/rpc') && (r.request().postData() || '').includes('"lines.addProducts"'))
  await d.getByTestId('add-submit').click()
  await resp
  await expect(warn).toHaveCount(0)
  await expect(d).toHaveCount(0)
  const lines = (await pos.backend.rpc<{ lines: { name: string; waiterId: number | null }[] }>('sessions.get', 1)).lines
  expect(lines).toHaveLength(1)
  expect(lines[0].waiterId).not.toBeNull()

  // 3) Ofitsiantsiz qo'shish: yana bitta, eslatmadan keyin "Ofitsiantsiz qo'shish"
  const d2 = await openAdd(pos)
  await selectProduct(d2, 'Pivo 0.5 L', 1)
  await submitAdd(pos, d2)
  const after = (await pos.backend.rpc<{ lines: { name: string; waiterId: number | null }[] }>('sessions.get', 1)).lines
  expect(after).toHaveLength(2)
  expect(after.find((l) => l.name === 'Pivo 0.5 L')!.waiterId).toBeNull()
})
