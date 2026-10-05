/**
 * e) Ma'lumot saqlanishi: sahifani yangilash va dev-serverni (PosService jarayonini) qayta ishga tushirish —
 *    ochiq sessiya, mehmon vaqtlari (intervallar), qatorlar, chegirma saqlanib qolishi.
 */
import { test, expect, T0, MIN } from './fixtures'
import { addProduct, backToBoard, closeAdd, enterSession, expectGuest, expectWsTotal, guest, line, openAdd, openRoom, setDiscount, tile } from './ui'

test('Sahifa yangilanishi: ochiq sessiya va jonli vaqt davom etadi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 2)
  await pos.advance(30)
  await guest(pos, 'Mehmon 2').getByRole('button', { name: 'Pauza' }).click()
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--paused/)
  await page.reload()
  // Server sessiyasi saqlangan — qulf ekrani emas, to'g'ridan-to'g'ri qobiq
  await expect(page.locator('.shell')).toBeVisible()
  await pos.advance(31)
  await expect(tile(pos, 'Sauna 1')).toHaveAttribute('aria-label', 'Sauna 1 — band')
  await enterSession(pos, 'Sauna 1')
  // 1 soat olingan. M1: 61 daq → aynan 1 daqiqa qo'shiladi (blockMinutes=1): 61 × 50 000 / 60 = 50 833 → 51 000
  // M2: 30 daq (pauza) — olingan 1 soat baribir: 50 000; taymer 30 daqiqa qolganda to'xtagan
  await expectGuest(pos, 'Mehmon 1', 51_000)
  await expectGuest(pos, 'Mehmon 2', 50_000)
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toContainText('+00:01:00')
  await expect(guest(pos, 'Mehmon 2').getByTestId('countdown')).toHaveText('00:30:00')
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--paused/)
  await expectWsTotal(pos, 101_000)
})

test('Dev-server qayta ishga tushirilsa: sessiya, vaqt, buyurtma va chegirma bazadan tiklanadi', async ({ pos, page }) => {
  // Server o'chiq paytida UI so'rovlari 502 oladi — bu test uchun kutilgan
  pos.allowConsole(/Failed to load resource: the server responded with a status of 502/)
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 3, 'Butun guruh', 'Sardor')
  await closeAdd(pos, add)
  await pos.advance(30)
  await setDiscount(pos, 5_000)
  // Mehmon 1 ga +1 soat (paidMinutes 60 → 120)
  await guest(pos, 'Mehmon 1').getByRole('button', { name: '1 soat' }).click()
  await expect(pos.toast("Mehmon 1: +1 soat qo'shildi")).toBeVisible()
  await backToBoard(pos)

  await pos.backend.stop()
  // Aloqa yo'qligi foydalanuvchiga ko'rsatiladi
  await page.getByRole('button', { name: 'Yangilash' }).click()
  await expect(pos.toast("Server bilan aloqa yo'q")).toBeVisible()
  await expect(page.locator('.rooms-board__offline')).toBeVisible()

  await pos.backend.start(false) // o'sha baza fayli, --reset YO'Q
  // Soat jarayon xotirasida edi — qayta muzlatamiz (30 daqiqa keyin)
  await pos.setNow(T0 + 60 * MIN)
  // Kirish holati jarayon bilan yo'qoladi → qayta yuklash qulf ekraniga olib keladi
  await page.reload()
  await expect(page.locator('.auth')).toBeVisible()
  await pos.login('admin')
  await enterSession(pos, 'Sauna 1')
  // M1: 2 soat olingan = 100 000; M2: 1 soat (60 daq o'tirdi, oshmagan) = 50 000; Suv 3 × 5 000 = 15 000;
  // chegirma 5 000 → 160 000
  await expectGuest(pos, 'Mehmon 1', 100_000)
  await expectGuest(pos, 'Mehmon 2', 50_000)
  await expect(guest(pos, 'Mehmon 1')).toContainText('2 soat olingan')
  await expect(line(pos, 'Suv 0.5 L')).toContainText('3 × 5 000')
  await expectWsTotal(pos, 160_000)
  // Qatordagi ofitsiant va muzlatilgan foiz ham saqlangan
  await expect(line(pos, 'Suv 0.5 L').getByTestId('line-waiter')).toHaveText('Sardor')
  const v = await pos.backend.rpc<{ session: { openedAt: number }; discount: number; lines: { waiterId: number | null; waiterPct: number }[] }>('sessions.get', 1)
  expect(v.lines[0]).toMatchObject({ waiterId: pos.ids.waiter1, waiterPct: 10 })
  expect(v.session.openedAt).toBe(T0)
  expect(v.discount).toBe(5_000)
  // Ombor ham saqlangan (48 − 3)
  const suv = (await pos.backend.rpc<{ name: string; stock: number }[]>('catalog.products')).find((p) => p.name === 'Suv 0.5 L')!
  expect(suv.stock).toBe(45)
})
