/**
 * p) Xarajatlar va Sof foyda: xarajat qo'shish (UI) → ro'yxat; foyda hisobi qo'lda hisoblangan summa bilan;
 *    kassirga ko'rinmaydi (menyu + server rad etadi); kelajak kun rad etiladi; Barda tannarx maydoni.
 *
 *  Bar savdosi: Coca-Cola 1 L (15 000, tannarx 9 000) ×4 = 60 000 → tannarx 36 000;
 *               Pivo 0.5 L (20 000, tannarx yo'q) ×2 = 40 000 → noCostSales 40 000.
 *  Tushum 100 000 − tannarx 36 000 − ofitsiant 0 − oshxona 0 − xarajat 3 000 000 = −2 936 000.
 */
import { test, expect, fm } from './fixtures'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
interface Prod { id: number; name: string; categoryId: number; price: number; costPrice: number; stock: number; trackStock: boolean; lowStockAt: number; active: boolean }

test('Xarajat qo\'shish → ro\'yxat; sof foyda; kassirga yo\'q; kelajak kun rad', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  const b = pos.backend

  // Tannarx: Barda UI orqali (Coca-Cola)
  await pos.nav('Bar')
  const cola = (await b.rpc<Prod[]>('catalog.products')).find((p) => p.name === 'Coca-Cola 1 L')!
  await page.getByRole('button', { name: 'Tahrirlash' }).first().waitFor()
  await page.locator('.bar-row', { hasText: 'Coca-Cola 1 L' }).getByRole('button', { name: 'Tahrirlash' }).click()
  const pd = pos.dialog('Mahsulotni tahrirlash')
  await pd.getByLabel("Tannarx (so'm)").fill('9000')
  await pd.getByRole('button', { name: 'Saqlash' }).click()
  await expect(page.locator('.bar-row', { hasText: 'Coca-Cola 1 L' }).getByTestId('bar-cost')).toContainText('Tannarx 9 000 · 40%')
  expect((await b.rpc<Prod[]>('catalog.products')).find((p) => p.id === cola.id)!.costPrice).toBe(9000)

  // Savdo (backend orqali): 4 × Coca-Cola + 2 × Pivo, naqd
  const pivo = (await b.rpc<Prod[]>('catalog.products')).find((p) => p.name === 'Pivo 0.5 L')!
  const v = await b.rpc<{ session: { id: number } }>('barSales.open')
  await b.rpc('lines.addProduct', v.session.id, cola.id, 4, null)
  await b.rpc('lines.addProduct', v.session.id, pivo.id, 2, null)
  await b.rpc('checkout.pay', v.session.id, [{ method: 'cash', amount: 100000 }], null)

  // Xarajat qo'shish (UI): Ijara 3 000 000
  await pos.nav('Xarajatlar')
  await expect(page.getByText("Bu davrda xarajat yo'q")).toBeVisible()
  await page.getByTestId('exp-add').click()
  const d = pos.dialog("Xarajat qo'shish")
  await d.getByRole('radio', { name: 'Ijara' }).click()
  await pos.typeDigits('3000000')
  await expect(d.getByTestId('exp-amount')).toContainText('3 000 000')
  await d.getByTestId('exp-note').fill('Oktabr ijarasi')
  await d.getByTestId('exp-save').click()
  await expect(pos.toast("Xarajat qo'shildi")).toBeVisible()
  const row = page.getByTestId('exp-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Ijara')
  await expect(row).toContainText('Oktabr ijarasi')
  await expect(row).toContainText('Ega')
  await expect(page.getByTestId('exp-total')).toContainText('3 000 000')

  // Kelajak kun — rad (UI ham, server ham)
  await page.getByTestId('exp-add').click()
  const d2 = pos.dialog("Xarajat qo'shish")
  await d2.getByTestId('exp-day').fill('2026-12-31')
  for (const k of '5000') await d2.getByRole('button', { name: k, exact: true }).click()
  await d2.getByTestId('exp-save').click()
  await expect(pos.toast(/Kelajak/)).toBeVisible()
  await expect(row).toHaveCount(1)
  await d2.getByRole('button', { name: 'Bekor' }).click()
  expect(await b.rpcError('expenses.save', { day: '2026-12-31', categoryId: 1, amount: 5000, note: '' })).toMatch(/[Kk]elajak/)

  // Sof foyda (qo'lda hisoblangan)
  await pos.nav('Sof foyda')
  const table = page.getByTestId('pf-table')
  await expect(table).toContainText('Tushum')
  await expect(table).toContainText('100 000')
  await expect(table).toContainText('36 000')
  await expect(table).toContainText(fm(3000000))
  await expect(page.getByTestId('pf-hero')).toContainText('2 936 000')
  await expect(page.getByTestId('pf-margin')).toContainText('2936')
  await expect(page.getByTestId('pf-warn')).toContainText('40 000')
  await page.getByTestId('pf-warn').getByRole('button', { name: /Bar sahifasiga/ }).click()
  await expect(page.locator('.ui-pagehead__title, .ui-pagehead h1').first()).toHaveText('Bar')

  // O'chirish — tasdiq bilan
  await pos.nav('Xarajatlar')
  await row.getByRole('button', { name: "O'chirish" }).click()
  await pos.dialog().getByRole('button', { name: "O'chirish" }).click()
  await expect(pos.toast("Xarajat o'chirildi")).toBeVisible()
  await expect(row).toHaveCount(0)

  // Kassirga ko'rinmaydi
  await pos.lock()
  await pos.login('cashier')
  const items = (await page.locator('.side__item').allTextContents()).map((s) => s.trim())
  expect(items).not.toContain('Xarajatlar')
  expect(items).not.toContain('Sof foyda')
  expect(await b.rpcError('expenses.list', { from: 0, to: T_END })).toBe(DENIED)
  expect(await b.rpcError('profit.report', { from: 0, to: T_END })).toBe(DENIED)
  expect(await b.rpcError('expenses.save', { day: '2026-10-01', categoryId: 1, amount: 1000, note: '' })).toBe(DENIED)
})

const T_END = new Date('2026-11-01T00:00:00+05:00').getTime()
