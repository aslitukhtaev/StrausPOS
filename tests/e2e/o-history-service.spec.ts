/**
 * o) Obsluga (xizmat haqi 10%) va "Tarix" ekrani.
 *
 *  Sauna 1 = 50 000/soat. 1 mehmon × 1 soat (T0): vaqt 50 000 → obsluga 5 000 → jami 55 000.
 *  + Coca-Cola 1 L × 2 (15 000) = 30 000 → (50 000 + 30 000) × 10% = 8 000 → jami 88 000.
 *  + chegirma 10 000 → (80 000 − 10 000) × 10% = 7 000 → jami 77 000 (obsluga chegirmadan KEYIN).
 *  To'lov: naqd 77 000. Chek: "Obsluga 10%" 7 000. Tarix: qator + tafsilot (kim qo'shdi, to'lov).
 *  Bar savdosida obsluga yo'q.
 */
import { test, expect, fm, money } from './fixtures'
import { addProduct, closeAdd, expectWsTotal, finishReceipt, openAdd, openRoom, setDiscount, startCheckout, checkoutTotal } from './ui'

interface Receipt { receiptNo: number; serviceCharge: { pct: number; amount: number }; total: number }

test('Obsluga 10%: sessiya, oraliq chek, to\'lov, chek; Tarix: qator va tafsilot; bar savdosida yo\'q', async ({ pos, page }) => {
  test.setTimeout(180_000)
  await pos.backend.loginAs('owner', pos.ids)
  const s = await pos.backend.rpc<Record<string, unknown>>('settings.get')
  await pos.backend.rpc('settings.save', { ...s, serviceChargePct: 10 })
  await pos.backend.rpc('auth.logout')

  await pos.open()
  await pos.login('admin')

  // ── sessiya oynasi: vaqt 50 000 + obsluga 5 000 ──
  await openRoom(pos, 'Sauna 1', 1)
  await expectWsTotal(pos, 55_000)
  await expect(page.getByTestId('ws-service')).toContainText('Obsluga 10%: 5 000')

  const add = await openAdd(pos)
  await addProduct(pos, add, 'Coca-Cola 1 L', 2)
  await closeAdd(pos, add)
  await expectWsTotal(pos, 88_000)
  await expect(page.getByTestId('ws-service')).toContainText('Obsluga 10%: 8 000')
  // Hisob ro'yxatida "kim · soat:daqiqa"
  await expect(page.getByTestId('line-by').first()).toContainText('Administrator · 10:00')

  // chegirma: obsluga chegirmadan keyingi summadan
  await setDiscount(pos, 10_000)
  await expectWsTotal(pos, 77_000)
  await expect(page.getByTestId('ws-service')).toContainText('Obsluga 10%: 7 000')

  // oraliq chek
  await page.getByTestId('prebill').click()
  const pre = page.getByTestId('prebill-dialog')
  await expect(pre).toBeVisible()
  await expect(page.locator('.ui-modal__subtitle')).toContainText('77 000')
  await page.getByRole('button', { name: 'Yopish', exact: true }).last().click()

  // to'lov oynasi
  const co = await startCheckout(pos)
  await expect(co.getByTestId('checkout-service')).toContainText('Obsluga 10%')
  await expect(co.getByTestId('checkout-service')).toContainText('7 000')
  expect(await checkoutTotal(co)).toBe(77_000)
  await co.getByRole('button', { name: "To'lash · 77 000 so'm" }).click()
  await finishReceipt(pos, 77_000)

  // chek ma'lumoti va HTML
  const sessions = await pos.backend.rpc<{ sessionId: number; serviceCharge: number; total: number }[]>('reports.sessions', { from: 0, to: pos.now + 86_400_000 })
  expect(sessions).toHaveLength(1)
  expect(sessions[0].serviceCharge).toBe(7_000)
  expect(sessions[0].total).toBe(77_000)
  await pos.backend.loginAs('owner', pos.ids)
  const rc = await pos.backend.rpc<Receipt>('checkout.receipt', sessions[0].sessionId)
  expect(rc.serviceCharge).toEqual({ pct: 10, amount: 7_000 })
  expect(rc.total).toBe(77_000)
  const html = await pos.backend.rpc<string>('system.receiptHtml', rc)
  expect(html).toContain('Obsluga')
  expect(html).toContain('7 000')

  // foiz keyin o'zgarsa eski chek o'zgarmaydi
  await pos.backend.rpc('settings.save', { ...(await pos.backend.rpc<Record<string, unknown>>('settings.get')), serviceChargePct: 0 })
  expect((await pos.backend.rpc<Receipt>('checkout.receipt', sessions[0].sessionId)).serviceCharge.amount).toBe(7_000)
  await pos.backend.rpc('settings.save', { ...(await pos.backend.rpc<Record<string, unknown>>('settings.get')), serviceChargePct: 10 })

  // bar savdosida obsluga yo'q
  const bar = await pos.backend.rpc<{ session: { id: number } }>('barSales.open')
  const prods = await pos.backend.rpc<{ id: number; name: string }[]>('catalog.products')
  const cola = prods.find((p) => p.name === 'Coca-Cola 1 L')!
  const bv = await pos.backend.rpc<{ total: number; serviceCharge: number }>('lines.addProduct', bar.session.id, cola.id, 1, null)
  expect(bv.serviceCharge).toBe(0)
  expect(bv.total).toBe(15_000)
  await pos.backend.rpc('sessions.cancel', bar.session.id).catch(() => undefined)
  // (dev-server'da login umumiy: UI shu paytdan Ega nomidan ishlaydi)

  // ── Tarix ekrani ──
  await pos.nav('Tarix')
  const rows = page.getByTestId('hist-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Sauna 1')
  await expect(rows.first()).toContainText(fm(77_000))
  await expect(rows.first()).toContainText(fm(7_000))
  await expect(rows.first()).toContainText('Naqd')
  await expect(rows.first().getByTestId('hist-no')).toContainText('№' + rc.receiptNo)
  const cashierName = sessions[0] && (await pos.backend.rpc<{ cashier: string | null }[]>('reports.sessions', { from: 0, to: pos.now + 86_400_000 }))[0].cashier
  expect(cashierName).toBeTruthy()
  await expect(rows.first().getByTestId('hist-cashier-cell')).toHaveText(cashierName!)
  await expect(page.getByTestId('hist-total')).toContainText('1 ta hisob')
  await expect(page.getByTestId('hist-total')).toContainText(fm(77_000))
  // chek raqami bo'yicha qidiruv, kassir va to'lov filtrlari
  await page.getByTestId('hist-search').fill(String(rc.receiptNo))
  await expect(rows).toHaveCount(1)
  await page.getByTestId('hist-search').fill('')
  await page.getByTestId('hist-cashier').selectOption(cashierName!)
  await expect(rows).toHaveCount(1)
  await page.getByTestId('hist-method').selectOption('Karta')
  await expect(rows).toHaveCount(0)
  await page.getByTestId('hist-method').selectOption('Naqd')
  await expect(rows).toHaveCount(1)
  // "Chek" tugmasi: ro'yxatdan turib ko'rish va chop etish (tafsilot ochilmaydi)
  await rows.first().getByTestId('hist-receipt-btn').click()
  await expect(page.getByTestId('hist-receipt')).toBeVisible()
  await expect(page.getByTestId('hist-detail')).toHaveCount(0)
  await page.getByTestId('hist-print').click()
  await expect(page.getByText('Chek chop etildi').first()).toBeVisible()
  await page.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(page.getByTestId('hist-receipt')).toHaveCount(0)
  // qidiruv va xona filtri
  await page.getByTestId('hist-search').fill('zzz')
  await expect(rows).toHaveCount(0)
  await page.getByTestId('hist-search').fill('coca')
  await expect(rows).toHaveCount(1)
  await page.getByTestId('hist-search').fill('')
  await page.getByTestId('hist-room').selectOption('0')
  await expect(rows).toHaveCount(0)
  await page.getByTestId('hist-room').selectOption('all')

  await rows.first().click()
  const det = page.getByTestId('hist-detail')
  await expect(det).toBeVisible()
  await expect(det.getByTestId('hist-guest')).toHaveCount(1)
  await expect(det.getByTestId('hist-line')).toContainText('Coca-Cola 1 L')
  await expect(det.getByTestId('hist-line-by')).toContainText('Administrator')
  await expect(det.getByTestId('hist-line')).toContainText('10:00')
  await expect(det.getByTestId('hist-bystaff-row')).toHaveCount(1)
  await expect(det.getByTestId('hist-bystaff-row')).toContainText('Administrator')
  await expect(det.getByTestId('hist-bystaff-row')).toContainText('30 000')
  const t = det.getByTestId('hist-totals')
  await expect(t).toContainText('Chegirma')
  await expect(t).toContainText('Obsluga 10%')
  expect(money(await t.locator('.ui-money').nth(2).textContent())).toBe(-10_000)
  await expect(t).toContainText('Naqd')
  await expect(t).toContainText('77 000')
  await expect(page.getByTestId('hist-reprint')).toBeEnabled()

  // ── Sotuvlar tabi ──
  await page.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await page.getByRole('tab', { name: 'Sotuvlar' }).click()
  const sold = page.getByTestId('sold-row')
  await expect(sold).toHaveCount(1)
  await expect(sold.first()).toContainText('Coca-Cola 1 L')
  await expect(sold.first().getByTestId('sold-by')).toHaveText('Administrator')
  await expect(page.getByTestId('sold-total')).toContainText('30 000')
  await expect(page.getByTestId('sold-count')).toContainText('1 ta')
  await expect(page.getByTestId('sold-top')).toContainText('Administrator')
  await page.getByTestId('sold-dept').selectOption('service')
  await expect(sold).toHaveCount(0)
  await page.getByTestId('sold-dept').selectOption('all')
  await page.getByTestId('sold-search').fill('zzz')
  await expect(sold).toHaveCount(0)
  await page.getByTestId('sold-search').fill('coca')
  await expect(sold).toHaveCount(1)
  // xodim filtri: "Xodimlar bo'yicha" qatorini bosish filtrni o'rnatadi
  await page.getByTestId('sold-bystaff-row').first().click()
  await expect(page.getByTestId('sold-staff')).not.toHaveValue('all')
  await expect(sold).toHaveCount(1)
  await page.getByTestId('sold-staff').selectOption({ label: 'Kassir' })
  await expect(sold).toHaveCount(0)
})
