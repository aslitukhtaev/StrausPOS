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
  await pos.advance(30)
  await expect(tile(pos, 'Sauna 1')).toHaveAttribute('aria-label', 'Sauna 1 — band')
  await enterSession(pos, 'Sauna 1')
  // M1: 60 daq = 50 000; M2: 30 daq (pauza) = 25 000
  await expectGuest(pos, 'Mehmon 1', 50_000)
  await expectGuest(pos, 'Mehmon 2', 25_000)
  await expect(guest(pos, 'Mehmon 2')).toHaveClass(/rooms-guest--paused/)
  await expectWsTotal(pos, 75_000)
})

test('Dev-server qayta ishga tushirilsa: sessiya, vaqt, buyurtma va chegirma bazadan tiklanadi', async ({ pos, page }) => {
  // Server o'chiq paytida UI so'rovlari 502 oladi — bu test uchun kutilgan
  pos.allowConsole(/Failed to load resource: the server responded with a status of 502/)
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 2)
  const add = await openAdd(pos)
  await addProduct(pos, add, 'Suv 0.5 L', 3)
  await closeAdd(pos, add)
  await pos.advance(30)
  await setDiscount(pos, 5_000)
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
  // 2 × 60 daq × 50 000/60 = 100 000; Suv 3 × 5 000 = 15 000; chegirma 5 000 → 110 000
  await expectGuest(pos, 'Mehmon 1', 50_000)
  await expectGuest(pos, 'Mehmon 2', 50_000)
  await expect(line(pos, 'Suv 0.5 L')).toContainText('3 × 5 000')
  await expectWsTotal(pos, 110_000)
  const v = await pos.backend.rpc<{ session: { openedAt: number }; discount: number }>('sessions.get', 1)
  expect(v.session.openedAt).toBe(T0)
  expect(v.discount).toBe(5_000)
  // Ombor ham saqlangan (48 − 3)
  const suv = (await pos.backend.rpc<{ name: string; stock: number }[]>('catalog.products')).find((p) => p.name === 'Suv 0.5 L')!
  expect(suv.stock).toBe(45)
})
