/**
 * d) Chegaraviy holatlar: sig'im, band xona, ombor, ikki marta to'lash, bekor qilish, qarz maydonlari,
 *    juda katta summalar, 5 marta noto'g'ri PIN bloki.
 */
import { test, expect, T0 } from './fixtures'
import {
  addGuest, addProduct, backToBoard, closeAdd, enterSession, finishReceipt, guest, line, openAdd, openRoom, startCheckout, tile, wsTotal
} from './ui'

interface View { session: { id: number; status: string }; total: number; guests: { id: number; state: string }[]; lines: { id: number }[] }

test('Sig\'im: ochishda 1..sig\'im, "Mehmon qo\'shish" to\'lganda o\'chiq, server ham rad etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  await tile(pos, 'Sauna 1').click()
  const d = pos.dialog('Sauna 1 — xonani ochish')
  await expect(d.locator('.rooms-open__n')).toHaveCount(6)
  await d.getByRole('button', { name: 'Bekor qilish' }).click()
  expect(await pos.backend.rpcError('sessions.open', 1, 7, 60, null)).toBe("Xona sig'imi 6 kishi")
  expect(await pos.backend.rpcError('sessions.open', 1, 0, 60, null)).toContain('kamida 1')
  expect(await pos.backend.rpcError('sessions.open', 1, 2.5, 60, null)).toContain('kamida 1')
  // Olingan vaqt: 1..max butun daqiqa; ofitsiant — faqat ofitsiant xodim
  for (const m of [0, -60, 30.5, null]) expect(await pos.backend.rpcError('sessions.open', 1, 1, m, null)).toContain('Olingan vaqt')
  expect(await pos.backend.rpcError('sessions.open', 1, 1, 60, pos.ids.cashier)).toBe('Ofitsiant topilmadi')
  expect(await pos.backend.rpcError('sessions.open', 1, 1, 60, 9999)).toBe('Ofitsiant topilmadi')

  await openRoom(pos, 'Sauna 1', 6)
  await expect(page.getByRole('button', { name: "Mehmon qo'shish" })).toBeDisabled()
  await expect(page.getByRole('button', { name: "Mehmon qo'shish" })).toContainText("To'lgan (6)")
  expect(await pos.backend.rpcError('sessions.addGuest', 1, 60)).toBe("Xona sig'imi 6 kishi")
  expect(await pos.backend.rpcError('sessions.extendGuest', 1, 0)).toContain("Qo'shiladigan vaqt")
  // Bitta mehmon chiqib ketdi → joy bo'shadi → yangi mehmon qo'shiladi
  await guest(pos, 'Mehmon 6').getByRole('button', { name: 'Tugatish' }).click()
  await page.getByRole('button', { name: 'Ha, tugatish' }).click()
  await addGuest(pos, 120)
  await expect(guest(pos, 'Mehmon 7')).toBeVisible()
  await expect(guest(pos, 'Mehmon 7')).toContainText('2 soat olingan')
  // Endi chiqib ketgan mehmon qaytib kela olmaydi (sig'im to'la)
  await guest(pos, 'Mehmon 6').getByRole('button', { name: /Qaytib keldi/ }).click()
  await expect(pos.toast("Xona sig'imi 6 kishi")).toBeVisible()
  await expect(guest(pos, 'Mehmon 6')).toHaveClass(/rooms-guest--finished/)
  // Ochiq sessiyali xonaning sig'imini mehmonlardan kam qilib bo'lmaydi
  await pos.lock()
  await pos.login('owner')
  expect(await pos.backend.rpcError('rooms.save', { id: 1, name: 'Sauna 1', pricePerHour: 50000, capacity: 3 })).toContain('6 mehmon bor')
})

test('Band xonaga / kichik xonaga o\'tkazib bo\'lmaydi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 2)
  await backToBoard(pos)
  await openRoom(pos, 'Sauna 2', 7)
  await page.getByRole('button', { name: 'Xonani almashtirish' }).click()
  const d = pos.dialog('Xonani almashtirish')
  // Sauna 1 band — ro'yxatda yo'q; VIP bo'sh
  await expect(d.locator('.rooms-move__item[data-room="Sauna 1"]')).toHaveCount(0)
  await expect(d.locator('.rooms-move__item[data-room="VIP xona"]')).toBeEnabled()
  await d.getByRole('button', { name: 'Bekor' }).click()
  expect(await pos.backend.rpcError('sessions.moveRoom', 2, 1)).toBe('Xona band')
  expect(await pos.backend.rpcError('sessions.moveRoom', 2, 2)).toContain('allaqachon shu xonada')
  // Sauna 1 ni bo'shatamiz (bekor) → endi u ro'yxatda, lekin sig'im (6) 7 mehmonga yetmaydi
  await backToBoard(pos)
  await enterSession(pos, 'Sauna 1')
  await page.getByRole('button', { name: 'Sessiyani bekor qilish' }).click()
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click()
  await expect(tile(pos, 'Sauna 1')).toHaveAttribute('aria-label', "Sauna 1 — bo'sh")
  await enterSession(pos, 'Sauna 2')
  await page.getByRole('button', { name: 'Xonani almashtirish' }).click()
  const item = pos.dialog('Xonani almashtirish').locator('.rooms-move__item[data-room="Sauna 1"]')
  await expect(item).toBeDisabled()
  await expect(item).toContainText("sig'im yetmaydi")
  await pos.dialog('Xonani almashtirish').getByRole('button', { name: 'Bekor' }).click()
  expect(await pos.backend.rpcError('sessions.moveRoom', 2, 1)).toContain("Xona sig'imi 6 kishi, mehmonlar esa 7 kishi")
})

test('Ombor: qoldiqdan ko\'p qo\'shib bo\'lmaydi, tugagan mahsulot o\'chiq, qaytarishda omborga qaytadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  const products = await pos.backend.rpc<{ id: number; name: string; stock: number }[]>('catalog.products')
  const pista = products.find((p) => p.name === 'Pista')!
  expect(pista.stock).toBe(10)
  await pos.backend.rpc('catalog.adjustStock', pista.id, -8, 'test') // qoldiq 2
  await openRoom(pos, 'Sauna 1', 1)
  expect(await pos.backend.rpcError('lines.addProduct', 1, pista.id, 3, null)).toBe('Omborda yetarli emas (qoldi: 2)')
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Pista', 2)
  const tileBtn = add.locator('[data-product="Pista"]')
  await expect(tileBtn).toBeDisabled()
  await expect(tileBtn).toContainText('Tugagan')
  await closeAdd(pos, add)
  await expect(line(pos, 'Pista')).toContainText('2 × 25 000')
  expect(await pos.backend.rpcError('lines.addProduct', 1, pista.id, 1, null)).toBe('Omborda yetarli emas (qoldi: 0)')
  // Manfiy/0/kasr miqdor
  for (const q of [0, -1, 1.5]) expect(await pos.backend.rpcError('lines.addProduct', 1, pista.id, q, null)).toContain('Miqdor')
  // Ombor manfiy bo'lmaydi
  expect(await pos.backend.rpcError('catalog.adjustStock', pista.id, -1, '')).toContain('manfiy')
  // Qaytarish: ko'p qaytarib bo'lmaydi; qaytarilgani omborga tushadi
  const v = await pos.backend.rpc<View>('sessions.get', 1)
  expect(await pos.backend.rpcError('lines.returnLine', v.lines[0].id, 3, '')).toContain('1 dan 2 gacha')
  await line(pos, 'Pista').getByRole('button', { name: 'Qaytarish' }).click()
  await pos.dialog('Qatorni qaytarish').getByRole('button', { name: 'Qaytarish · 50 000' }).click()
  await expect(line(pos, 'Pista')).toHaveClass(/is-returned/)
  const after = (await pos.backend.rpc<{ name: string; stock: number }[]>('catalog.products')).find((p) => p.name === 'Pista')!
  expect(after.stock).toBe(2)
  expect(await pos.backend.rpcError('lines.returnLine', v.lines[0].id, 1, '')).toContain('to‘liq qaytarilgan')
})

test('Ikki marta to\'lash: UI ikki bosish bitta to\'lov; server qayta to\'lovni rad etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  await openRoom(pos, 'Sauna 1', 2)
  await pos.advance(60) // 2 × 50 000 = 100 000
  const co = await startCheckout(pos)
  const pay = co.getByRole('button', { name: "To'lash · 100 000 so'm" })
  await pay.dblclick()
  await finishReceipt(pos, 100_000)
  const view = await pos.backend.rpc<View & { payments: unknown[] }>('sessions.get', 1)
  expect(view.session.status).toBe('closed')
  expect(view.payments).toHaveLength(1)
  expect(await pos.backend.rpcError('checkout.pay', 1, [{ method: 'cash', amount: 100_000 }], null)).toBe('Sessiya yopilgan')
  // Yopilgan sessiyaga qo'shish/pauza ham mumkin emas
  expect(await pos.backend.rpcError('lines.addProduct', 1, 1, 1, null)).toBe('Sessiya yopilgan')
  expect(await pos.backend.rpcError('sessions.guestResume', view.guests[0].id)).toBe('Sessiya yopilgan')
  // Noto'g'ri summalar
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(60)
  const b = pos.backend
  expect(await b.rpcError('checkout.pay', 2, [{ method: 'cash', amount: 49_000 }], null)).toContain("jami summaga teng emas (jami: 50000, kiritildi: 49000)")
  expect(await b.rpcError('checkout.pay', 2, [{ method: 'cash', amount: -50_000 }, { method: 'card', amount: 100_000 }], null)).toContain('musbat')
  expect(await b.rpcError('checkout.pay', 2, [{ method: 'cash', amount: 50_000.5 }], null)).toContain('butun son')
  expect(await b.rpcError('checkout.pay', 2, [{ method: 'bitcoin', amount: 50_000 }], null)).toContain('usuli')
})

test('Bekor qilish va 0 so\'mlik to\'lov: kassir xato ochilgan xonani darhol bekor qiladi; bepul xona 0 so\'mga yopiladi; buyurtmali sessiya bekor qilinmaydi', async ({ pos, page }) => {
  // Tayyorlash (ega nomidan, UI dan oldin): Sauna 1 narxi 0 (bepul xona) — 0 so'mlik chek uchun
  await pos.backend.loginAs('owner', pos.ids)
  await pos.backend.rpc('rooms.save', { id: 1, name: 'Sauna 1', pricePerHour: 0, capacity: 6 })
  await pos.backend.rpc('auth.logout')
  await pos.open()
  await pos.login('cashier')
  await openRoom(pos, 'Sauna 2', 3)
  // Oldindan olingan vaqt darhol hisoblanadi (3 × 60 000), lekin hech kim 1 daqiqa o'tirmagan — bekor qilish mumkin
  expect(await wsTotal(pos)).toBe(180_000)
  await page.getByRole('button', { name: 'Sessiyani bekor qilish' }).click()
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click()
  await expect(pos.toast("Sauna 2 bekor qilindi va bo'shatildi")).toBeVisible()
  await expect(tile(pos, 'Sauna 2')).toHaveAttribute('aria-label', "Sauna 2 — bo'sh")
  expect(await pos.backend.rpcError('checkout.receipt', 1)).toBe('Sessiya bekor qilingan')

  // 0 so'mlik to'lov (bepul xona)
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(30)
  const co = await startCheckout(pos)
  await co.getByRole('button', { name: "To'lash · 0 so'm" }).click()
  await finishReceipt(pos, 0)

  // Buyurtma bor — bekor qilinmaydi
  await openRoom(pos, 'Sauna 1', 1)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Non', 1)
  await closeAdd(pos, add)
  await expect(page.getByRole('button', { name: 'Sessiyani bekor qilish' })).toHaveCount(0)
  expect(await pos.backend.rpcError('sessions.cancel', 3)).toContain('buyurtmalar bor')
})

test('Qarz: ism/telefon majburiy va to\'g\'ri formatda; server ham tekshiradi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(60)
  const co = await startCheckout(pos)
  await co.getByRole('radio', { name: 'Qarz' }).click()
  const status = co.locator('.checkout-foot__status')
  const payBtn = co.getByRole('button', { name: /To'lash ·/ })
  await expect(status).toContainText('Qarzdorning ismini kiriting')
  await expect(payBtn).toBeDisabled()
  await co.getByPlaceholder('Mijoz ismi').fill('   ')
  await expect(payBtn).toBeDisabled()
  await co.getByPlaceholder('Mijoz ismi').fill('Vali')
  await expect(status).toContainText("Telefon raqamini to'liq kiriting")
  await co.getByPlaceholder('90 123 45 67').fill('90 12')
  await expect(payBtn).toBeDisabled()
  // Harflar kiritilmaydi
  await co.getByPlaceholder('90 123 45 67').fill('abc')
  await expect(co.getByPlaceholder('90 123 45 67')).toHaveValue('')
  // +998 bilan yozilsa — prefiks olib tashlanadi
  await co.getByPlaceholder('90 123 45 67').fill('+998 93 555 66 77')
  await expect(co.getByPlaceholder('90 123 45 67')).toHaveValue('93 555 66 77')
  // Qarz summasi jamidan katta
  await co.locator('.checkout-amount').click()
  await pos.typeDigits('60000')
  await expect(status).toContainText('Qarz summasi jami summadan katta')
  await expect(payBtn).toBeDisabled()
  await co.getByRole('button', { name: "To'liq summa" }).click()
  await expect(status).toContainText("Hammasi to'g'ri")

  // Server: debtor yo'q / bo'sh / noto'g'ri telefon
  const b = pos.backend
  const p = [{ method: 'debt', amount: 50_000 }]
  expect(await b.rpcError('checkout.pay', 1, p, null)).toBe('Qarzdorning ismi va telefoni majburiy')
  expect(await b.rpcError('checkout.pay', 1, p, { name: ' ', phone: '901234567' })).toBe('Qarzdorning ismini kiriting')
  expect(await b.rpcError('checkout.pay', 1, p, { name: 'Vali', phone: '' })).toBe('Qarzdorning telefonini kiriting')
  expect(await b.rpcError('checkout.pay', 1, p, { name: 'Vali', phone: 'abc' })).toBe("Telefon raqami noto'g'ri")
  expect(await b.rpcError('checkout.pay', 1, p, { name: 'x'.repeat(81), phone: '901234567' })).toContain('juda uzun')

  await payBtn.click()
  const text = await finishReceipt(pos, 50_000)
  expect(text).toContain('+998 93 555 66 77')
  const debts = await b.rpc<{ customerName: string; phone: string; amount: number }[]>('debts.list', true)
  expect(debts).toEqual([expect.objectContaining({ customerName: 'Vali', phone: '+998 93 555 66 77', amount: 50_000 })])
  // Qarzdan ko'p to'lab bo'lmaydi
  expect(await b.rpcError('debts.pay', 1, 'cash', 50_001)).toContain('1 dan 50000 gacha')
  expect(await b.rpcError('debts.pay', 1, 'debt', 1)).toContain('usuli')
})

test('Juda katta summalar: maksimal narx, 9 xonali naqd, chegirma chegarasi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  const b = pos.backend
  expect(await b.rpcError('rooms.save', { id: 3, name: 'VIP xona', pricePerHour: 100_000_001, capacity: 10 })).toContain('Narx')
  await b.rpc('rooms.save', { id: 3, name: 'VIP xona', pricePerHour: 100_000_000, capacity: 10 })
  await page.reload()
  await openRoom(pos, 'VIP xona', 10)
  // 10 mehmon × 72 soat × 100 000 000 = 72 000 000 000
  await pos.advance(72 * 60)
  await expect(page.locator('.rooms-ws__totalnum')).toHaveText("72 000 000 000 so'm")
  // Chegirma jami summadan oshmaydi
  expect(await b.rpcError('sessions.setDiscount', 1, 72_000_000_001)).toContain('oshmasligi')
  expect(await b.rpcError('sessions.setDiscount', 1, -1)).toContain('Chegirma')
  expect(await b.rpcError('sessions.setDiscount', 1, Number.MAX_SAFE_INTEGER + 2)).toContain('Chegirma')
  const co = await startCheckout(pos)
  // Naqd: numpad maksimal 9 raqam qabul qiladi — 10-raqam e'tiborsiz
  await pos.typeDigits('9999999999')
  await expect(co.locator('.checkout-amount__val')).toHaveText("999 999 999 so'm")
  await expect(co.locator('.checkout-foot__status')).toContainText('Yetarli emas')
  // Katta summani "Aniq" tugmasi bilan to'lash mumkin
  await co.getByRole('button', { name: 'Aniq' }).click()
  await co.getByRole('button', { name: "To'lash · 72 000 000 000 so'm" }).click()
  await finishReceipt(pos, 72_000_000_000)
  const r = await b.rpc<{ total: number; byMethod: { cash: number } }>('reports.sales', { from: T0, to: T0 + 100 * 3600_000 })
  expect(r.total).toBe(72_000_000_000)
  expect(r.byMethod.cash).toBe(72_000_000_000)
})

test('5 marta noto\'g\'ri PIN → 30 soniya blok (to\'g\'ri PIN ham qabul qilinmaydi), keyin ochiladi', async ({ pos, page }) => {
  await pos.open()
  await page.locator('.lock-tile', { has: page.locator('.lock-tile__name', { hasText: /^Kassir$/ }) }).click()
  for (let i = 0; i < 5; i++) {
    await pos.typeDigits('0000')
    await page.keyboard.press('Enter')
    await expect(page.locator('.lock-pin__error')).toContainText("PIN noto'g'ri")
  }
  await pos.typeDigits('3333')
  await page.keyboard.press('Enter')
  await expect(page.locator('.lock-pin__error')).toContainText("Juda ko'p noto'g'ri urinish. 30 soniyadan keyin")
  // Boshqa xodim bloklanmagan
  await page.locator('.lock-pin__switch').click()
  await pos.login('admin')
  await pos.lock()
  // 31 soniyadan keyin kassir kira oladi
  await pos.setNow(pos.now + 31_000)
  await pos.login('cashier')
})

test('Qaytarishdan keyin chegirma jami summadan oshmaydi (avtomatik kamayadi)', async ({ pos }) => {
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 1)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Shashlik', 2) // 2 × 25 000; vaqt: 1 soat olingan = 50 000
  await closeAdd(pos, add)
  const b = pos.backend
  await b.rpc('sessions.setDiscount', 1, 90_000)
  const v = await b.rpc<View>('sessions.get', 1)
  const after = await b.rpc<View & { discount: number }>('lines.returnLine', v.lines[0].id, 1, '')
  // gross 50 000 + 25 000 = 75 000 → chegirma 90 000 dan 75 000 ga tushadi, jami 0 (manfiy emas)
  expect(after).toMatchObject({ discount: 75_000, total: 0 })
  await expect(line(pos, 'Shashlik')).toBeVisible()
})

test('Hisobot: qarz to\'lovlari (kassaga kirim) ko\'rinishi kerak', async ({ pos }) => {
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(60)
  await pos.backend.rpc('checkout.pay', 1, [{ method: 'debt', amount: 50_000 }], { name: 'Ali', phone: '901234567' })
  await pos.backend.rpc('debts.pay', 1, 'cash', 50_000)
  const r = await pos.backend.rpc<Record<string, unknown>>('reports.sales', { from: T0, to: T0 + 86_400_000 })
  expect(r.debtPayments).toEqual({ cash: 50_000, card: 0 })
})
