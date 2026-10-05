/**
 * q) Rollar va ruxsatlar: Sozlamalar → "Rollar va ruxsatlar" matritsasi, menyu/tugmalar ruxsatga qarab.
 */
import { test, expect } from './fixtures'
import { addProduct, closeAdd, line, openAdd, openRoom } from './ui'

async function navItems(page: import('@playwright/test').Page): Promise<string[]> {
  return (await page.locator('.side__item').allTextContents()).map((s) => s.trim())
}

async function openMatrix(pos: import('./fixtures').Pos) {
  await pos.nav('Sozlamalar')
  await pos.page.getByTestId('set-nav-roles').click()
  await expect(pos.page.getByTestId('roles-matrix')).toBeVisible()
}

const sw = (pos: import('./fixtures').Pos, role: string, perm: string) => pos.page.getByTestId(`perm-${role}-${perm}`)

test('Matritsa: kassirga reports.view berish → menyuda Hisobot; standartga qaytarish; skrinshot', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await openMatrix(pos)
  await expect(page.locator('.roles-grid__gname')).toHaveText(['Xonalar', 'Qarzlar', 'Bar va ombor', 'Hisobotlar', 'Moliya', 'Boshqaruv'])
  await expect(sw(pos, 'cashier', 'reports.view')).toHaveAttribute('aria-checked', 'false')
  await page.screenshot({ path: 'screenshots/q-roles-light.png' })
  await page.getByRole('button', { name: 'Kunduzgi / tungi rejim' }).click().catch(() => undefined)

  await sw(pos, 'cashier', 'reports.view').click()
  await expect(page.getByTestId('set-save')).toBeEnabled()
  await page.getByTestId('set-save').click()
  await expect(pos.toast('Ruxsatlar yangilandi')).toBeVisible()
  const s = await pos.backend.rpc<{ rolePermissions: Record<string, string[]> }>('settings.get')
  expect(s.rolePermissions.cashier).toContain('reports.view')

  await pos.lock()
  await pos.login('cashier')
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar savdo', 'Qarzlar', 'Hisobot'])
  await pos.nav('Hisobot')

  // Standartga qaytarish
  await pos.lock()
  await pos.login('owner')
  await openMatrix(pos)
  await page.getByTestId('roles-default-cashier').click()
  await page.getByTestId('set-save').click()
  await expect(pos.toast('Ruxsatlar yangilandi').first()).toBeVisible()
  await pos.lock()
  await pos.login('cashier')
  expect(await navItems(page)).toEqual(['Xonalar', 'Bar savdo', 'Qarzlar'])
})

test('Xarajat bog\'liqligi va xavfli o\'zgarish tasdig\'i', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await openMatrix(pos)
  await sw(pos, 'cashier', 'expense.manage').click()
  await expect(sw(pos, 'cashier', 'expense.view')).toHaveAttribute('aria-checked', 'true')
  await sw(pos, 'cashier', 'expense.view').click()
  await expect(sw(pos, 'cashier', 'expense.manage')).toHaveAttribute('aria-checked', 'false')
  // Ega ustuni o'chirilgan
  await expect(page.getByRole('switch', { name: /Sozlamalar: Ega/ })).toBeDisabled()

  // Xavfli: administratorga settings.manage → tasdiq
  await sw(pos, 'admin', 'settings.manage').click()
  await page.getByTestId('set-save').click()
  const d = pos.dialog('Bu ruxsat xavfli')
  await expect(d).toBeVisible()
  await d.getByRole('button', { name: "Yo'q" }).click()
  const before = await pos.backend.rpc<{ rolePermissions: Record<string, string[]> }>('settings.get')
  expect(before.rolePermissions.admin).not.toContain('settings.manage')
  await page.getByTestId('set-save').click()
  await pos.dialog('Bu ruxsat xavfli').getByRole('button', { name: 'Ha, saqlash' }).click()
  await expect(pos.toast('Ruxsatlar yangilandi')).toBeVisible()
  const after = await pos.backend.rpc<{ rolePermissions: Record<string, string[]> }>('settings.get')
  expect(after.rolePermissions.admin).toContain('settings.manage')
})

test('Ofitsiantdan line.return olinsa X yo\'qoladi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('waiter1')
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 1)
  await closeAdd(pos, add)
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toHaveCount(1)
  await pos.lock()

  const s = await (async () => {
    await pos.backend.loginAs('owner', pos.ids)
    return pos.backend.rpc<{ rolePermissions: Record<string, string[]> }>('settings.get')
  })()
  const full = await pos.backend.rpc<Record<string, unknown>>('settings.get')
  await pos.backend.rpc('settings.save', { ...full, rolePermissions: { ...s.rolePermissions, waiter: s.rolePermissions.waiter.filter((p) => p !== 'line.return') } })
  await pos.backend.rpc('auth.logout')

  await pos.login('waiter1')
  await pos.nav('Xonalar')
  await page.locator('.rooms-tile[data-room="Sauna 1"]').click()
  await expect(line(pos, 'Suv 0.5 L')).toBeVisible()
  await expect(line(pos, 'Suv 0.5 L').getByRole('button', { name: 'Qaytarish' })).toHaveCount(0)
})
