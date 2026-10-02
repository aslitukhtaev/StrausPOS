/**
 * g) Konsol tozaligi: har bir ekran va bo'lim ochiladi; fixture har testda console.error/warning va
 *    sahifa istisnolarini tinglaydi (tests/e2e/fixtures.ts) — kutilmagan xabar bo'lsa test yiqiladi.
 *    Bu yerda qo'shimcha: ErrorBoundary ("Bu bo'limda xatolik yuz berdi") hech qayerda chiqmasligi.
 */
import { test, expect } from './fixtures'
import { addProduct, closeAdd, openAdd, openRoom } from './ui'

const CRASH = "Bu bo'limda xatolik yuz berdi"

test('Ega: barcha ekranlar va sozlamalar bo\'limlari xatosiz ochiladi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  // Ma'lumot bilan ham (bo'sh holat emas)
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Chips', 1)
  await closeAdd(pos, add)
  await pos.advance(15)
  for (const s of ['Xonalar', 'Bar', 'Qarzlar', 'Hisobot', 'Ofitsiantlar', 'Xodimlar', 'Sozlamalar']) {
    await pos.nav(s)
    await page.waitForTimeout(700)
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
    await expect(page.locator('.shell__main')).not.toContainText('tayyorlanmoqda')
  }
  for (const sec of ['Xonalar', 'Chek', 'Xavfsizlik', 'Hisob-kitob', "Ko'rinish", 'Zaxira', 'Haqida']) {
    await page.locator('.set-nav').getByText(sec, { exact: true }).click()
    await page.waitForTimeout(700)
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  // Bar ichidagi tablar
  await pos.nav('Bar')
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click()
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  // Hisobot davrlari
  await pos.nav('Hisobot')
  for (const p of ['Kecha', 'Hafta', 'Oy', 'Bugun']) {
    const r = page.getByRole('radio', { name: p })
    if (await r.count()) await r.click()
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  expect(pos.consoleIssues()).toEqual([])
})

test('Kassir: ruxsat etilgan ekranlar xatosiz', async ({ pos, page }) => {
  await pos.open()
  await pos.login('cashier')
  for (const s of ['Qarzlar', 'Xonalar']) {
    await pos.nav(s)
    await page.waitForTimeout(700)
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  expect(pos.consoleIssues()).toEqual([])
})
