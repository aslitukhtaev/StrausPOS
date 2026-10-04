/**
 * l) Xonasiz bar savdosi ("Bar savdo" ekrani): savat, X (1 ta — darhol; ko'p — nechtasi), aralash to'lov, chek,
 *    "Bugungi savdolar" (chekni qayta ko'rish/chop etish), hisobotda barSales; ikki ochiq savdo, reload'dan keyin tiklanish,
 *    bekor qilish (mahsulot omborga qaytadi). Ofitsiant ulushi hisoblanmaydi.
 *
 *  Narxlar (standart katalog): Coca-Cola 1 L 15 000, Pivo 0.5 L 20 000, Suv 0.5 L 5 000, Chips 12 000.
 *  Savdo A: Coca-Cola ×3 + Pivo ×1 + Suv ×1 = 70 000 → X Suv (1) = 65 000 → X Coca-Cola 1 ta = 50 000
 *           → Aralash: 20 000 naqd + 30 000 karta.
 */
import { test, expect, fm, money, type Pos } from './fixtures'

interface Prod { name: string; stock: number }
interface SessionView { session: { id: number; kind: string }; total: number; lines: { name: string; qty: number; returnedQty: number }[] }

const cart = (pos: Pos) => pos.page.locator('[data-testid="sale-cart"]')
const cartLine = (pos: Pos, name: string) => pos.page.locator(`.sale-line[data-line="${name}"]`)
const cartTotal = async (pos: Pos) => money(await cart(pos).locator('.sale-total__sum').textContent())
const tabs = (pos: Pos) => pos.page.locator('.sale-tab:not(.is-draft)')

async function tap(pos: Pos, name: string, times = 1): Promise<void> {
  const t = pos.page.locator(`.sale-tile[data-product="${name}"]`)
  for (let i = 0; i < times; i++) {
    const resp = pos.page.waitForResponse((r) => r.url().includes('/rpc') && (r.request().postData() || '').includes('"lines.addProduct"'))
    await t.click()
    await resp
  }
}

async function stock(pos: Pos, name: string): Promise<number> {
  const list = await pos.backend.rpc<Prod[]>('catalog.products')
  return list.find((p) => p.name === name)!.stock
}

test('Bar savdo: savat → X → aralash to\'lov → chek → bugungi savdolar → hisobot (barSales)', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await pos.nav('Bar savdo')
  await expect(page.locator('.ui-pagehead__subtitle')).toContainText('ofitsiant ulushi hisoblanmaydi')
  await expect(cart(pos)).toContainText("Savat bo'sh")
  await expect(page.locator('[data-testid="sale-pay"]')).toBeDisabled()
  // Bo'sh savdo yaratilmaydi
  expect(await pos.backend.rpc<SessionView[]>('barSales.openList')).toHaveLength(0)

  const cola0 = await stock(pos, 'Coca-Cola 1 L')
  const suv0 = await stock(pos, 'Suv 0.5 L')

  await tap(pos, 'Coca-Cola 1 L', 3)
  await tap(pos, 'Pivo 0.5 L')
  await tap(pos, 'Suv 0.5 L')
  await expect(cartLine(pos, 'Coca-Cola 1 L')).toContainText('×3')
  await expect.poll(() => cartTotal(pos)).toBe(70_000)
  const open1 = await pos.backend.rpc<SessionView[]>('barSales.openList')
  expect(open1).toHaveLength(1)
  expect(open1[0].session.kind).toBe('bar')
  // Plitadagi savatdagi soni va qoldiq
  await expect(page.locator('.sale-tile[data-product="Coca-Cola 1 L"] .sale-tile__count')).toHaveText('3')
  await expect(page.locator('.sale-tile[data-product="Coca-Cola 1 L"] .sale-tile__stock')).toHaveText(cola0 - 3 + ' ta')

  // X: 1 ta bo'lsa — darhol (tasdiqsiz)
  await cartLine(pos, 'Suv 0.5 L').getByRole('button', { name: 'Olib tashlash' }).click()
  await expect(cartLine(pos, 'Suv 0.5 L')).toHaveCount(0)
  await expect.poll(() => cartTotal(pos)).toBe(65_000)
  expect(await stock(pos, 'Suv 0.5 L')).toBe(suv0)

  // X: 3 ta — nechtasi? (1 ta)
  await cartLine(pos, 'Coca-Cola 1 L').getByRole('button', { name: 'Olib tashlash' }).click()
  const rm = pos.dialog('Nechtasini olib tashlaysiz?')
  await expect(rm).toBeVisible()
  await rm.getByTestId('sale-remove-ok').click()
  await expect(rm).toHaveCount(0)
  await expect(cartLine(pos, 'Coca-Cola 1 L')).toContainText('×2')
  await expect.poll(() => cartTotal(pos)).toBe(50_000)
  expect(await stock(pos, 'Coca-Cola 1 L')).toBe(cola0 - 2)

  // To'lov: aralash 20 000 naqd + 30 000 karta (CheckoutDialog o'zgarishsiz)
  await page.locator('[data-testid="sale-pay"]').click()
  const co = page.locator('.ui-modal.checkout-modal')
  await expect(co).toBeVisible()
  await co.getByRole('radio', { name: 'Aralash' }).click()
  await pos.typeDigits('20000')
  await co.getByRole('button', { name: 'Qolganini karta' }).click()
  await expect(co.locator('.checkout-row', { hasText: 'Karta' })).toContainText('30 000')
  await co.getByRole('button', { name: "To'lash · 50 000 so'm" }).click()
  const r = pos.dialog("To'lov qabul qilindi")
  await expect(r).toBeVisible()
  await expect(r.locator('.checkout-done__info > .ui-money')).toHaveText(fm(50_000) + " so'm")
  const rc = (await r.textContent()) || ''
  expect(rc).toMatch(/Naqd\s*20 000/)
  expect(rc).toMatch(/Karta\s*30 000/)
  await r.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(r).toHaveCount(0)

  // Savat tozalandi — yangi savdo tayyor
  await expect(cart(pos)).toContainText("Savat bo'sh")
  await expect(tabs(pos)).toHaveCount(0)
  expect(await pos.backend.rpc<SessionView[]>('barSales.openList')).toHaveLength(0)

  // Bugungi savdolar → chek → qayta chop etish
  await page.getByTestId('sale-history').click()
  const h = pos.dialog('Bugungi savdolar')
  await expect(h).toBeVisible()
  await expect(h.getByTestId('sale-hist-row')).toHaveCount(1)
  await expect(h.getByTestId('sale-hist-row')).toContainText('50 000')
  await expect(h.getByTestId('sale-hist-row')).toContainText('3 ta mahsulot')
  await h.getByTestId('sale-hist-row').click()
  await expect(h.locator('iframe[title="Chek"]')).toBeVisible()
  await h.getByTestId('sale-reprint').click()
  await expect(pos.toast('Chek chop etildi')).toBeVisible()
  await h.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(h).toHaveCount(0)

  // Hisobot: barSales KPI va byRoom'dagi "Bar (xonasiz)"
  await pos.nav('Hisobot')
  const kpi = page.getByTestId('rep-bar-sales')
  await expect(kpi).toContainText('Bar (xonasiz)')
  await expect(kpi).toContainText('1 ta')
  await expect(kpi).toContainText('50 000')
  await expect(page.locator('.shell__main')).toContainText('Bar (xonasiz)')
  const rep = await pos.backend.rpc<{ barSales: { count: number; total: number }; total: number; byWaiter: unknown[]; byMethod: { cash: number; card: number } }>(
    'reports.sales', { from: pos.now - 86_400_000, to: pos.now + 86_400_000 }
  )
  expect(rep.barSales).toEqual({ count: 1, total: 50_000 })
  expect(rep.total).toBe(50_000)
  expect(rep.byMethod).toMatchObject({ cash: 20_000, card: 30_000 })
  expect(rep.byWaiter).toHaveLength(0)
})

test('Bar savdo: ikki ochiq savdo, reload\'dan keyin tiklanish, bekor qilish', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await pos.nav('Bar savdo')
  const chips0 = await stock(pos, 'Chips')

  await tap(pos, 'Pivo 0.5 L')
  await expect(tabs(pos)).toHaveCount(1)
  // Ikkinchi mijoz: yangi savdo (birinchisi pul olib kelguncha kutadi)
  await page.getByRole('button', { name: 'Yangi savdo' }).click()
  await expect(cart(pos)).toContainText("Savat bo'sh")
  await tap(pos, 'Chips', 2)
  await expect(tabs(pos)).toHaveCount(2)
  await expect.poll(() => cartTotal(pos)).toBe(24_000)
  await tabs(pos).nth(0).click()
  await expect(cartLine(pos, 'Pivo 0.5 L')).toBeVisible()
  await expect.poll(() => cartTotal(pos)).toBe(20_000)

  // Qayta yuklash → ikkala savdo tiklanadi, eng yangisi tanlangan
  await page.reload()
  await expect(page.locator('.shell')).toBeVisible()
  await pos.nav('Bar savdo')
  await expect(tabs(pos)).toHaveCount(2)
  await expect(tabs(pos).nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(cartLine(pos, 'Chips')).toContainText('×2')

  // Bekor qilish (tasdiq bilan) — Chips omborga qaytadi
  await page.getByTestId('sale-cancel').click()
  await expect(page.locator('.ui-confirm__title')).toHaveText('Savdoni bekor qilasizmi?')
  await expect(page.locator('.ui-confirm__msg')).toContainText('2 ta mahsulot omborga qaytariladi')
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click()
  await expect(pos.toast('Savdo bekor qilindi')).toBeVisible()
  await expect(tabs(pos)).toHaveCount(1)
  await expect(cart(pos)).toContainText("Savat bo'sh")
  expect(await stock(pos, 'Chips')).toBe(chips0)
  const open = await pos.backend.rpc<SessionView[]>('barSales.openList')
  expect(open).toHaveLength(1)
  expect(open[0].lines.map((l) => l.name)).toEqual(['Pivo 0.5 L'])

  // Kassir: bar savdo bor, X (qaytarish ruxsati yo'q) o'chiq
  await pos.lock()
  await pos.login('cashier')
  await pos.nav('Bar savdo')
  await expect(cartLine(pos, 'Pivo 0.5 L')).toBeVisible()
  await expect(cartLine(pos, 'Pivo 0.5 L').locator('.sale-line__x')).toBeDisabled()
  await expect(page.locator('[data-testid="sale-pay"]')).toBeEnabled()
})
