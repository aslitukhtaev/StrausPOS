/**
 * f) Zaxira va tiklash (Sozlamalar → Zaxira): zaxiradan keyingi o'zgarishlar tiklashda yo'qoladi,
 *    tiklangach dastur qulflanadi.
 */
import fs from 'fs'
import path from 'path'
import { test, expect, T0 } from './fixtures'
import { finishReceipt, openRoom, startCheckout, tile } from './ui'

async function paySauna1(pos: Parameters<typeof openRoom>[0], minutes: number, total: number): Promise<void> {
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(minutes)
  const co = await startCheckout(pos)
  await co.getByRole('button', { name: new RegExp("To'lash · ") }).click()
  await finishReceipt(pos, total)
}

test('Zaxira → yangi savdo → tiklash: holat zaxira paytiga qaytadi', async ({ pos, page }) => {
  const backups = path.join(pos.backend.dataDir, 'backups')
  fs.rmSync(backups, { recursive: true, force: true })
  await pos.open()
  await pos.login('owner')
  await paySauna1(pos, 60, 50_000) // zaxiradan oldingi savdo

  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Zaxira').click()
  await page.getByTestId('backup').click()
  await expect(pos.toast('Zaxira nusxa saqlandi')).toBeVisible()
  const files = fs.readdirSync(backups).filter((f) => f.endsWith('.db'))
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^delfin-zaxira-2026-10-01-\d{4}\.db$/)

  // Zaxiradan keyin: yana bitta savdo + ochiq sessiya
  await pos.nav('Xonalar')
  await paySauna1(pos, 120, 100_000) // 1 soat olingan, 120 daq o'tirdi → +1 soat blok
  await openRoom(pos, 'VIP xona', 2)
  const range = { from: T0 - 3600_000, to: T0 + 24 * 3600_000 }
  expect((await pos.backend.rpc<{ total: number }>('reports.sales', range)).total).toBe(150_000)

  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Zaxira').click()
  await page.getByTestId('restore').click()
  await page.getByRole('button', { name: 'Ha, tiklash' }).click()
  await expect(pos.toast("Ma'lumotlar zaxiradan tiklandi")).toBeVisible()
  await expect(page.locator('.auth')).toBeVisible()

  await pos.login('owner')
  await expect(tile(pos, 'VIP xona')).toHaveAttribute('aria-label', "VIP xona — bo'sh")
  const r = await pos.backend.rpc<{ total: number; sessionsCount: number }>('reports.sales', range)
  expect(r).toMatchObject({ total: 50_000, sessionsCount: 1 })
})

test('Zaxira/tiklash faqat egaga: admin Sozlamalarni ko\'rmaydi va server rad etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  await expect(page.locator('.side__item', { hasText: 'Sozlamalar' })).toHaveCount(0)
  expect(await pos.backend.rpcError('system.backup')).toBe("Bu amal uchun ruxsatingiz yo'q")
})
