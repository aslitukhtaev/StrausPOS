/**
 * a) Birinchi ishga tushirish (Setup) → ega → Lock → PIN xato/to'g'ri → avtomatik qulf.
 */
import { test, expect, MIN } from './fixtures'

test('Setup: biznes va ega → PIN tasdig\'i → avtomatik kirish → qulf → PIN xato/to\'g\'ri', async ({ pos, page }) => {
  await pos.backend.reset(false) // xodimlar yo'q → birinchi ishga tushirish
  await pos.open()
  await expect(page.getByRole('heading', { name: 'Xush kelibsiz!' })).toBeVisible()
  // Brend: Delfin Sauna (sarlavha, logotip)
  await expect(page).toHaveTitle('Delfin Sauna')
  await expect(page.getByRole('img', { name: 'Delfin Sauna' }).first()).toBeVisible()

  // Tanlov: yangi biznes (asosiy kompyuter) / asosiy kompyuterga ulanish (faqat ko'rish)
  await expect(page.getByTestId('setup-viewer')).toBeVisible()
  await page.getByTestId('setup-owner').click()

  // Bo'sh maydonlar bilan davom etib bo'lmaydi
  await page.getByRole('button', { name: 'Davom etish' }).click()
  await expect(page.getByText('Biznes nomini kiriting')).toBeVisible()
  await expect(page.getByText('Ismingizni kiriting')).toBeVisible()

  await page.getByPlaceholder('Masalan: Delfin Sauna').fill('Delfin Sauna Chilonzor')
  await page.getByPlaceholder('Ism Familiya').fill('Bekzod')
  await page.getByRole('button', { name: 'Davom etish' }).click()
  await expect(page.getByRole('heading', { name: "PIN kod o'rnating" })).toBeVisible()

  // 3 raqam — tasdiqlash tugmasi o'chiq
  await pos.typeDigits('567')
  await expect(page.getByRole('button', { name: 'Tasdiqlash' })).toBeDisabled()
  await pos.typeDigits('8')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'PIN kodni takrorlang' })).toBeVisible()

  // Noto'g'ri tasdiq (uzunlik teng bo'lganda avtomatik tekshiriladi)
  await pos.typeDigits('5679')
  await expect(page.getByRole('alert').filter({ hasText: 'PIN kodlar mos kelmadi' })).toBeVisible()
  await pos.typeDigits('5678')

  await expect(page.locator('.shell')).toBeVisible()
  await expect(page.locator('.topbar__username')).toHaveText('Bekzod')
  await expect(page.locator('.topbar__bizname')).toHaveText('Delfin Sauna Chilonzor')
  await expect(pos.toast('Xush kelibsiz, Bekzod!')).toBeVisible()
  // Standart xonalar yaratilgan
  await expect(page.locator('[data-room="Sauna 1"]')).toBeVisible()
  // Ega barcha bo'limlarni ko'radi
  for (const l of ['Xonalar', 'Bar', 'Qarzlar', 'Hisobot', 'Ofitsiantlar', 'Xodimlar', 'Sozlamalar']) {
    await expect(page.locator('.side__item', { hasText: l })).toBeVisible()
  }
  // Setup qayta chaqirilmaydi
  expect(await pos.backend.rpcError('auth.setupOwner', 'X', '1111', 'Y')).toContain('allaqachon')

  // ── Qulf ──
  await pos.lock()
  // Yagona xodim — avtomatik tanlangan
  await expect(page.locator('.lock-pin__name')).toHaveText('Bekzod')
  await pos.typeDigits('0000')
  await page.keyboard.press('Enter')
  await expect(page.locator('.lock-pin__error')).toContainText("PIN noto'g'ri")
  // Biznes nomi qulf ekranida ham ko'rinadi
  await expect(page.locator('.auth')).toContainText('Delfin Sauna Chilonzor')

  await pos.typeDigits('5678')
  await page.keyboard.press('Enter')
  await expect(page.locator('.topbar__username')).toHaveText('Bekzod')

  // Sahifa yangilansa — server sessiyasi saqlangan, Setup qaytmaydi
  await page.reload()
  await expect(page.locator('.shell')).toBeVisible()
})

test('Avtomatik qulf: 1 daqiqa harakatsizlik → Lock; harakat bo\'lsa qulflanmaydi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Xavfsizlik').click()
  await page.getByRole('radio', { name: '1 daq' }).click()
  await page.getByRole('button', { name: 'Saqlash' }).click()
  await expect(pos.toast('Xavfsizlik sozlamalari saqlandi')).toBeVisible()
  expect((await pos.backend.rpc<{ autoLockMinutes: number }>('settings.get')).autoLockMinutes).toBe(1)

  await pos.nav('Xonalar')
  // 50 soniya o'tdi, keyin harakat (bosish) — taymer qaytadan boshlanadi
  await pos.setNow(pos.now + 50_000)
  await page.waitForTimeout(5500)
  await expect(page.locator('.shell')).toBeVisible()
  await page.mouse.click(700, 120)
  await pos.setNow(pos.now + 30_000) // oxirgi harakatdan 30 s — hali qulflanmasligi kerak
  await page.waitForTimeout(5500)
  await expect(page.locator('.shell')).toBeVisible()

  await pos.setNow(pos.now + MIN) // >1 daqiqa harakatsiz
  await expect(page.locator('.auth')).toBeVisible({ timeout: 12_000 })
  // Server tomonida ham chiqarilgan
  expect(await pos.backend.rpc('auth.current')).toBeNull()
  await pos.login('owner')
})

test('PIN uzunligi: Sozlamalarda o\'rnatilgan PIN bilan qulf ekranidan kirish mumkin (qulf ekrani ≤ 6 raqam)', async ({ pos, page }) => {
  // Xato (tuzatildi): Sozlamalar → Xavfsizlik 8 xonali PIN qabul qilardi, qulf ekrani esa ko'pi bilan 6 raqam
  // kiritadi → ega o'z dasturiga kira olmay qolardi.
  await pos.open()
  await pos.login('owner')
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Xavfsizlik').click()
  await page.getByTestId('pin1').fill('12345678')
  await page.getByTestId('pin2').fill('12345678')
  await expect(page.getByTestId('pin1')).toHaveValue('123456')
  await page.getByTestId('pin-save').click()
  await expect(pos.toast("PIN o'zgartirildi")).toBeVisible()
  await pos.lock()
  await page.locator('.lock-tile', { has: page.locator('.lock-tile__name', { hasText: /^Ega$/ }) }).click()
  await pos.typeDigits('12345678') // 7-8 raqamlar e'tiborsiz, 6-raqamda avtomatik kirish
  await expect(page.locator('.topbar__username')).toHaveText('Ega')
})
