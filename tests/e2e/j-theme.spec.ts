/**
 * j) Kunduzgi / tungi rejim: tepa paneldagi almashtirgich `<html data-theme>` ni o'zgartiradi, ega uchun sozlamaga
 *    saqlanadi (qayta yuklashda va qulf ekranida ham saqlanadi); ruxsatsiz xodim (kassir) — faqat shu kompyuterda.
 *    Ikkala rejimda barcha ekranlar konsol xatosiz (fixture har console.error/warning ni ushlaydi).
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { addProduct, closeAdd, openAdd, openRoom } from './ui'

const CRASH = "Bu bo'limda xatolik yuz berdi"
const theme = (page: Page) => page.locator('html')

async function tourScreens(pos: Parameters<typeof openRoom>[0]): Promise<void> {
  const { page } = pos
  for (const s of ['Xonalar', 'Bar savdo', 'Bar', 'Qarzlar', 'Hisobot', 'Ofitsiantlar', 'Oshxona', 'Xodimlar', 'Sozlamalar']) {
    await pos.nav(s)
    await page.waitForTimeout(400)
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  for (const sec of ['Xonalar', 'Chek', 'Xavfsizlik', 'Hisob-kitob', "Ko'rinish", 'Zaxira', 'Haqida']) {
    await page.locator('.set-nav').getByText(sec, { exact: true }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.shell__main')).not.toContainText(CRASH)
  }
  await pos.nav('Xonalar')
}

test('Ega: kunduzgi ↔ tungi, saqlanadi (reload, qulf ekrani), ikkala rejimda konsol toza', async ({ pos, page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await pos.open()
  // Standart: auto → tizim (yorug')
  await expect(theme(page)).toHaveAttribute('data-theme', 'light')
  await pos.login('owner')
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Chips', 1)
  await closeAdd(pos, add)
  await pos.nav('Xonalar')
  await tourScreens(pos)

  // → tungi
  const toggle = page.getByTestId('theme-toggle')
  await expect(toggle).toHaveAttribute('aria-label', 'Tungi rejim')
  await toggle.click()
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  await expect(toggle).toHaveAttribute('aria-label', 'Kunduzgi rejim')
  await expect.poll(async () => (await pos.backend.rpc<{ theme: string }>('settings.get')).theme).toBe('dark')
  // Fon rangi haqiqatan o'zgargan (tokenlar)
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await tourScreens(pos)

  // Qayta yuklash — tungi saqlanadi (birinchi chizishdan boshlab)
  await page.reload()
  await expect(page.locator('.shell')).toBeVisible()
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  // Qulf ekrani ham tungi
  await pos.lock()
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  await pos.login('owner')

  // Sozlamalar → Ko'rinish: "Kunduzgi"
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText("Ko'rinish", { exact: true }).click()
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('theme-light').click()
  await expect(pos.toast('Rejim saqlandi: Kunduzgi')).toBeVisible()
  await expect(theme(page)).toHaveAttribute('data-theme', 'light')
  const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bgLight).not.toBe(bgDark)
  await page.reload()
  await expect(page.locator('.shell')).toBeVisible()
  await expect(theme(page)).toHaveAttribute('data-theme', 'light')
  expect((await pos.backend.rpc<{ theme: string }>('settings.get')).theme).toBe('light')

  // Avtomatik: tizim tungi bo'lsa — tungi
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText("Ko'rinish", { exact: true }).click()
  await page.getByTestId('theme-auto').click()
  await expect(pos.toast('Rejim saqlandi: Avtomatik')).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(theme(page)).toHaveAttribute('data-theme', 'light')
  expect(pos.consoleIssues()).toEqual([])
})

test('Kassir: rejim almashtirgich faqat shu kompyuterda (sozlamaga yozilmaydi), konsol toza', async ({ pos, page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await pos.open()
  await pos.login('cashier')
  await expect(theme(page)).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('theme-toggle').click()
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  await openRoom(pos, 'Sauna 1', 1)
  await pos.nav('Qarzlar')
  await pos.nav('Xonalar')
  // Server sozlamasi o'zgarmagan (kassirda settings.manage yo'q) — xato ham chiqmagan
  await pos.lock()
  await pos.login('owner')
  expect((await pos.backend.rpc<{ theme: string }>('settings.get')).theme).toBe('auto')
  await page.reload()
  await expect(page.locator('.shell')).toBeVisible()
  // Lokal tanlov shu kompyuterda saqlanadi
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark')
  expect(pos.consoleIssues()).toEqual([])
})
