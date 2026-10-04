/**
 * Qarzdorlar (bir odam = bitta yozuv, qidirib tanlash, FIFO to'lov), aralash to'lov (4 usul, qarz ham),
 * oshxona kunlik hisobi va pul berish. Haqiqiy dev-server + UI.
 * T0 = 2026-10-01 10:00. Sauna 1 = 50 000/soat, Sauna 2 = 60 000/soat.
 */
import { test, expect, fm, T0, MIN, type Pos } from './fixtures'
import { enterSession, finishReceipt, startCheckout } from './ui'

interface Debtor { id: number; name: string; phone: string; total: number; paid: number; balance: number; debtsCount: number }
interface Debt { id: number; amount: number; paid: number; closedAt: number | null; createdAt: number }

const ROOM = { 'Sauna 1': 1, 'Sauna 2': 2, 'VIP xona': 3 } as const

async function openPaid(pos: Pos, room: keyof typeof ROOM, minutes = 60): Promise<number> {
  const v = await pos.backend.rpc<{ session: { id: number } }>('sessions.open', ROOM[room], 1, minutes)
  return v.session.id
}

async function productId(pos: Pos, name: string): Promise<number> {
  const list = await pos.backend.rpc<{ id: number; name: string; categoryId: number }[]>('catalog.products', false)
  const p = list.find((x) => x.name === name)
  if (!p) throw new Error('Mahsulot topilmadi: ' + name)
  return p.id
}

test('Qarz: bir odamga ikki marta — bitta qarzdor (qidirib tanlash), odam bo\'yicha FIFO to\'lov', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  // 1-qarz (server orqali): Ali, 50 000
  const s1 = await openPaid(pos, 'Sauna 1')
  await pos.advance(60)
  await pos.backend.rpc('checkout.pay', s1, [{ method: 'debt', amount: 50_000 }], { name: 'Ali Valiyev', phone: '901234567' })

  // 2-qarz (UI): Sauna 2, telefon bo'yicha qidirib mavjud Ali tanlanadi
  await openPaid(pos, 'Sauna 2')
  await pos.advance(30)
  await page.reload()
  await enterSession(pos, 'Sauna 2')
  const co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Qarz' }).click()
  await co.getByTestId('debtor-phone').fill('90 123')
  const sugg = co.getByTestId('debtor-suggest')
  await expect(sugg).toBeVisible()
  const item = sugg.locator('.checkout-sugg__item', { hasText: 'Ali Valiyev' })
  await expect(item).toContainText('50 000')
  await item.click()
  const sel = co.getByTestId('debtor-selected')
  await expect(sel).toContainText('Mavjud qarzdor')
  await expect(sel).toContainText('Ali Valiyev')
  await expect(sel).toContainText('50 000')
  await expect(co.locator('.checkout-foot__status')).toContainText("Hammasi to'g'ri")
  await co.getByRole('button', { name: "To'lash · 60 000 so'm" }).click()
  const rc = await finishReceipt(pos, 60_000)
  expect(rc).toContain('Ali Valiyev')

  let list = await pos.backend.rpc<Debtor[]>('debtors.list', false)
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ name: 'Ali Valiyev', total: 110_000, paid: 0, balance: 110_000, debtsCount: 2 })

  // Qarzlar ekrani: bitta qator (odam), tafsilotda 2 ta qarz
  await pos.nav('Qarzlar')
  const rows = page.locator('.debts-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Ali Valiyev')
  await expect(page.locator('.debts-total .ui-money')).toHaveText("110 000 so'm")
  await rows.first().click()
  const dd = pos.dialog('Ali Valiyev')
  await expect(dd.getByTestId('debtor-debts').locator('tbody tr')).toHaveCount(2)

  // Odam bo'yicha 70 000 to'lash (terminal) → eski 50 000 yopiladi, yangisidan 20 000
  await dd.getByTestId('debtor-pay').click()
  const pd = pos.dialog("Qarzni to'lash")
  await pd.getByRole('radio', { name: 'Terminal' }).click()
  await pos.typeDigits('70000')
  await pd.getByTestId('debt-pay-submit').click()
  await expect(pos.toast("70 000 so'm qabul qilindi")).toBeVisible()
  await expect(pd.locator('.debts-pay__rest')).toContainText('40 000')
  await pd.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(dd.getByTestId('debtor-pays').locator('li')).toHaveCount(2)
  await expect(dd.getByTestId('debtor-pays')).toContainText('Terminal')
  await dd.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(page.locator('.debts-total .ui-money')).toHaveText("40 000 so'm")

  const debts = (await pos.backend.rpc<Debt[]>('debtors.debts', list[0].id)).sort((a, b) => a.createdAt - b.createdAt)
  expect(debts.map((d) => [d.amount, d.paid, d.closedAt !== null])).toEqual([
    [50_000, 50_000, true],
    [60_000, 20_000, false]
  ])
  list = await pos.backend.rpc<Debtor[]>('debtors.list', false)
  expect(list[0]).toMatchObject({ total: 110_000, paid: 70_000, balance: 40_000 })

  // Qidiruv (telefon) va ism/telefonni tuzatish
  await page.getByTestId('debts-search').fill('93 999')
  await expect(rows).toHaveCount(0)
  await page.getByTestId('debts-search').fill('Ali')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  await pos.dialog('Ali Valiyev').getByTestId('debtor-edit').click()
  const ed = pos.dialog("Qarzdor ma'lumotlari")
  await ed.locator('input').first().fill('Ali Valiyev (aka)')
  await ed.getByTestId('debtor-rename-save').click()
  await expect(pos.toast('Saqlandi')).toBeVisible()
  await expect(pos.dialog('Ali Valiyev (aka)')).toBeVisible()
})

test('Aralash: Naqd + Karta + Terminal + Qarz (yangi qarzdor); chek va hisobotda Terminal', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await openPaid(pos, 'Sauna 1')
  await pos.advance(60)
  await page.reload()
  await enterSession(pos, 'Sauna 1')
  const co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Aralash' }).click()
  // Qarz yo'q — qarzdor maydoni ko'rinmaydi
  await expect(co.getByTestId('debtor-name')).toHaveCount(0)
  await pos.typeDigits('10000')
  await co.locator('.checkout-row[data-method="card"]').click()
  await pos.typeDigits('15000')
  await co.locator('.checkout-row[data-method="terminal"]').click()
  await pos.typeDigits('5000')
  await expect(co.locator('.checkout-change')).toContainText('20 000')
  await co.locator('.checkout-row[data-method="debt"]').click()
  await co.getByRole('button', { name: 'Qolganini: Qarz' }).click()
  await expect(co.locator('.checkout-row[data-method="debt"]')).toContainText('20 000')
  await expect(co.locator('.checkout-change')).toContainText('0')
  // Qarz > 0 → qarzdor maydoni
  await expect(co.locator('.checkout-foot__status')).toContainText('Qarzdorning ismini kiriting')
  await co.getByTestId('debtor-name').fill('Vali Karimov')
  await co.getByTestId('debtor-phone').fill('935556677')
  await expect(co.getByText('Yangi qarzdor')).toBeVisible()
  await co.getByRole('button', { name: "To'lash · 50 000 so'm" }).click()
  const rc = await finishReceipt(pos, 50_000)
  expect(rc).toMatch(/Naqd\s*10 000/)
  expect(rc).toMatch(/Karta\s*15 000/)
  expect(rc).toMatch(/Terminal\s*5 000/)
  expect(rc).toMatch(/Qarz\s*20 000/)

  const list = await pos.backend.rpc<Debtor[]>('debtors.list', false)
  expect(list).toEqual([expect.objectContaining({ name: 'Vali Karimov', phone: '+998 93 555 66 77', balance: 20_000, debtsCount: 1 })])
  const r = await pos.backend.rpc<{ byMethod: Record<string, number> }>('reports.sales', { from: T0, to: T0 + 86_400_000 })
  expect(r.byMethod).toEqual({ cash: 10_000, card: 15_000, terminal: 5_000, debt: 20_000 })

  await pos.nav('Hisobot')
  const term = page.locator('.rep-pay__row[data-method="terminal"]')
  await expect(term).toContainText('Terminal')
  await expect(term).toContainText('5 000')
})

test('Oshxona: kunlik hisob (ulush %), "Bugun" kartasi, pul berish va tarix; sozlamalar va bo\'lim', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  // Bar katalogi: "Taomlar" kategoriyasini Oshxona bo'limiga o'tkazish (UI)
  await pos.nav('Bar')
  await page.locator('.bar-cat__main', { hasText: 'Taomlar' }).click()
  await page.getByRole('button', { name: 'Tahrirlash' }).first().click()
  const cd = pos.dialog('Kategoriyani tahrirlash')
  await cd.getByRole('radio', { name: 'Oshxona' }).click()
  await cd.getByRole('button', { name: 'Saqlash' }).click()
  await expect(cd).toHaveCount(0)
  await page.locator('.bar-dept').getByRole('radio', { name: 'Oshxona' }).click()
  await expect(page.locator('.bar-cat[data-dept]')).toHaveCount(1)
  await expect(page.locator('.bar-cat[data-dept="kitchen"]')).toContainText('Taomlar')

  // Sozlamalar → Oshxona: ulush 40%
  await pos.nav('Sozlamalar')
  await page.getByTestId('set-nav-kitchen').click()
  await page.getByTestId('kitchen-pct').fill('40')
  await page.getByTestId('set-save').click()
  await expect(pos.toast('Oshxona sozlamalari saqlandi')).toBeVisible()
  const st = await pos.backend.rpc<{ kitchen: { sharePct: number } }>('settings.get')
  expect(st.kitchen.sharePct).toBe(40)

  // Savdo: Shashlik ×2 (oshxona) + Coca-Cola (bar) → oshxona savdosi 2 × narx
  const shashlik = await productId(pos, 'Shashlik')
  const cola = await productId(pos, 'Coca-Cola 1 L')
  const products = await pos.backend.rpc<{ id: number; price: number }[]>('catalog.products', false)
  const price = products.find((p) => p.id === shashlik)!.price
  const s = await openPaid(pos, 'VIP xona')
  await pos.backend.rpc('lines.addProduct', s, shashlik, 2, null)
  await pos.backend.rpc('lines.addProduct', s, cola, 1, null)
  await pos.advance(60)
  const v = await pos.backend.rpc<{ total: number }>('sessions.stopAll', s)
  await pos.backend.rpc('checkout.pay', s, [{ method: 'cash', amount: v.total }], null)
  const sales = 2 * price
  const due = Math.round((sales * 40) / 100)

  await pos.nav('Oshxona')
  const today = page.getByTestId('kt-today')
  await expect(today).toContainText('Bugun')
  await expect(today).toContainText('1 ta buyurtma')
  await expect(today).toContainText(fm(sales))
  await expect(today.locator('.kt-stat.is-main')).toContainText(fm(due))
  const row = page.getByTestId('kt-row-2026-10-01')
  await expect(row).toContainText(fm(sales))
  await expect(row).toContainText(fm(due))

  // Pul berish (qisman)
  await page.getByTestId('kt-today-pay').click()
  const pd = pos.dialog('Oshxonaga pul berish')
  await expect(page.getByTestId('kt-pay-amount')).toHaveValue(fm(due))
  await page.getByTestId('kt-pay-amount').fill(String(due - 5_000))
  await pd.locator('input').last().fill('Oshpazga naqd')
  await page.getByTestId('kt-pay-submit').click()
  await expect(pos.toast('Oshxonaga ' + fm(due - 5_000) + " so'm berildi")).toBeVisible()
  await expect(today.locator('.kt-stat.is-main')).toContainText('5 000')

  // Kun tafsiloti: tarix
  await row.click()
  const dd = pos.dialog(/Oshxona · 1-oktabr/)
  await expect(dd.getByTestId('kt-payouts').locator('li')).toHaveCount(1)
  await expect(dd.getByTestId('kt-payouts')).toContainText('Oshpazga naqd')
  await dd.getByRole('button', { name: 'Yopish', exact: true }).last().click()

  const daily = await pos.backend.rpc<{ day: string; sales: number; due: number; paid: number; balance: number }[]>('kitchen.daily', '2026-10')
  expect(daily).toEqual([expect.objectContaining({ day: '2026-10-01', sales, due, paid: due - 5_000, balance: 5_000, orders: 1 })])
  void MIN
})
