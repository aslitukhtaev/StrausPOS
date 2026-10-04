/**
 * h) "Qattiq" vaqt (oldindan olinadigan vaqt) — haqiqiy brauzer orqali. roundTo = 1000, graceMinutes = 0.
 *    Standart blockMinutes = 1 (aynan o'tirilgan daqiqa); 1-test soatlik bloklar bilan (useHourBlocks).
 *
 *  1) Sauna 1 (50 000/soat), 3 kishi × 2 soat (T0):
 *       ochilishi bilan 3 × 2 × 50 000 = 300 000 (oldindan narx oynada ham shu)
 *     +5   Mehmon 1 tugatadi → 5 daq o'tirdi, lekin 2 soat to'liq: 100 000 (jami o'zgarmaydi: 300 000)
 *          Mehmon 2 "+1 soat" → 3 soat = 150 000 → jami 350 000
 *          "Hammaga +1 soat" → faqat chiqmaganlar: M2 4 soat = 200 000, M3 3 soat = 150 000; M1 100 000 → 450 000
 *     +180 M3 aynan 180 daq → hali 3 soat: 150 000
 *     +181 M3 1 daqiqa oshdi → 4 soat: 200 000 → jami 500 000
 *     +240 M2 aynan 240 → 200 000; M3 hali 4 soat ichida → 200 000 → jami 500 000
 *     +241 M2 → 5 soat 250 000; M3 241 daq → 5 soat 250 000 → jami 100 000 + 250 000 + 250 000 = 600 000 → naqd
 *  2) Imtiyoz (grace) 10 daq: 1 soat olingan, 70 daq → 50 000; 71 daq → 100 000.
 *     Keyin blok 30 daq (grace 10): 71 daq → 11 daq oshdi → 1 × 30 daq: 90 daq × 50 000/60 = 75 000.
 *  3) Ogohlantirish (warnBeforeMinutes = 10): 50-daqiqada "10 daqiqa qoldi" toast'i BIR MARTA; vaqt tugaganda
 *     "vaqti tugadi" BIR MARTA (boshqa ekranda ham; qaytib kelganda va keyingi daqiqalarda takrorlanmaydi).
 *     Daqiqalik hisob: 61 daq → 51 000 (50 000 × 61/60 = 50 833 → 1000 ga yaxlitlangan); kartada "+00:01:00 oshdi · 1 daq qo'shildi".
 */
import type { Page } from '@playwright/test'
import { test, expect, fm, T0, MIN } from './fixtures'
import {
  backToBoard, confirm, enterSession, expectGuest, expectWsTotal, finishReceipt, guest, hoursText, openRoom, startCheckout,
  tile, useHourBlocks, wsTotal
} from './ui'

interface View {
  total: number; timeTotal: number
  guests: { label: string; state: string; paidMinutes: number; billedMinutes: number; timeAmount: number }[]
}

test('2 soat × 3 kishi: 5 daqiqada chiqqan ham to\'liq, +1 soat, hammaga +1 soat, oshganda keyingi soat', async ({ pos, page }) => {
  await useHourBlocks(pos)
  await pos.open()
  await pos.login('admin')

  // Oldindan narx — ochish oynasida
  await tile(pos, 'Sauna 1').click()
  const d = pos.dialog('Sauna 1 — xonani ochish')
  // Ofitsiant xonaga biriktirilmaydi — tanlov yo'q
  await expect(d.locator('.rooms-waiter')).toHaveCount(0)
  await expect(d).not.toContainText('Ofitsiant')
  await d.locator('.rooms-open__n', { hasText: /^3$/ }).click()
  await d.locator('.rooms-time__btn', { has: page.locator('.rooms-time__n', { hasText: /^2$/ }) }).click()
  await expect(d.getByTestId('open-price')).toContainText('3 kishi × 2 soat × 50 000')
  await expect(d.getByTestId('open-price')).toContainText('300 000')
  // "Boshqa": 1 soat 30 daq → 3 × 75 000
  await d.locator('.rooms-time__btn--other').click()
  await d.locator('.rooms-time__custom .ui-stepper').nth(0).getByRole('button', { name: 'Kamaytirish' }).click()
  await d.locator('.rooms-time__custom .ui-stepper').nth(1).getByRole('button', { name: "Ko'paytirish" }).click()
  await d.locator('.rooms-time__custom .ui-stepper').nth(1).getByRole('button', { name: "Ko'paytirish" }).click()
  await expect(d.getByTestId('open-price')).toContainText('3 kishi × 1 soat 30 daq × 50 000')
  await expect(d.getByTestId('open-price')).toContainText('225 000')
  await d.getByRole('button', { name: 'Bekor qilish' }).click()
  await expect(d).toHaveCount(0)

  await openRoom(pos, 'Sauna 1', 3, { minutes: 120 })
  await expectWsTotal(pos, 300_000)
  for (const g of ['Mehmon 1', 'Mehmon 2', 'Mehmon 3']) {
    await expectGuest(pos, g, 100_000)
    await expect(guest(pos, g)).toContainText('2 soat olingan')
    await expect(guest(pos, g).getByTestId('countdown')).toHaveText('02:00:00')
  }

  // ── +5: Mehmon 1 chiqib ketdi ──
  await pos.advance(5)
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('01:55:00')
  await guest(pos, 'Mehmon 1').getByRole('button', { name: 'Tugatish' }).click()
  const fin = page.locator('.ui-modal').filter({ hasText: 'Mehmon 1 chiqib ketdimi?' })
  await expect(fin).toContainText("Olingan vaqt (2 soat) baribir to'lanadi: 100 000 so'm")
  await confirm(pos, 'Ha, tugatish')
  await expect(guest(pos, 'Mehmon 1')).toHaveClass(/rooms-guest--finished/)
  await expectGuest(pos, 'Mehmon 1', 100_000)
  await expectWsTotal(pos, 300_000)

  // ── Mehmon 2: +1 soat ──
  await guest(pos, 'Mehmon 2').getByRole('button', { name: '1 soat' }).click()
  await expect(pos.toast("Mehmon 2: +1 soat qo'shildi")).toBeVisible()
  await expect(guest(pos, 'Mehmon 2')).toContainText('3 soat olingan')
  await expect(guest(pos, 'Mehmon 2').getByTestId('countdown')).toHaveText('02:55:00')
  await expectGuest(pos, 'Mehmon 2', 150_000)
  await expectWsTotal(pos, 350_000)

  // ── Hammaga +1 soat (chiqib ketgan mehmonga qo'shilmaydi) ──
  await page.getByRole('button', { name: 'Hammaga +1 soat' }).click()
  const all = page.locator('.ui-modal').filter({ hasText: "Hammaga +1 soat qo'shilsinmi?" })
  await expect(all).toContainText("2 ta mehmonning har biriga 1 soat qo'shiladi: +100 000 so'm")
  await confirm(pos, "Ha, qo'shish")
  await expect(pos.toast("Hammaga +1 soat qo'shildi (2 kishi)")).toBeVisible()
  await expectGuest(pos, 'Mehmon 1', 100_000)
  await expectGuest(pos, 'Mehmon 2', 200_000)
  await expectGuest(pos, 'Mehmon 3', 150_000)
  await expectWsTotal(pos, 450_000)
  // Chiqib ketgan mehmonga server ham qo'shmaydi
  const v0 = await pos.backend.rpc<View & { guests: { id: number }[] }>('sessions.get', 1)
  expect(await pos.backend.rpcError('sessions.extendGuest', v0.guests[0].id, 60)).toContain('chiqib ketgan')
  expect(v0.guests.map((g) => g.paidMinutes)).toEqual([120, 240, 180])

  // ── +180: M3 aynan olingan vaqtda — hali oshmagan ──
  await pos.setNow(T0 + 180 * MIN)
  await expect(guest(pos, 'Mehmon 3').getByTestId('countdown')).toContainText('00:00:00')
  await expectGuest(pos, 'Mehmon 3', 150_000)
  // ── +181: 1 daqiqa oshdi → keyingi soat to'liq ──
  await pos.setNow(T0 + 181 * MIN)
  await expect(guest(pos, 'Mehmon 3').getByTestId('countdown')).toContainText('+00:01:00')
  await expect(guest(pos, 'Mehmon 3').getByTestId('overnote')).toHaveText("+00:01:00 oshdi · 1 soat qo'shildi")
  await expect(guest(pos, 'Mehmon 3')).toHaveClass(/rooms-guest--over/)
  await expectGuest(pos, 'Mehmon 3', 200_000)
  await expectWsTotal(pos, 500_000)
  // Xona kartasi qizil: "Vaqt tugadi!"
  await backToBoard(pos)
  await expect(tile(pos, 'Sauna 1')).toHaveClass(/rooms-tile--over/)
  await expect(tile(pos, 'Sauna 1')).toContainText('Vaqt tugadi!')
  await enterSession(pos, 'Sauna 1')

  // ── +240: M2 aynan 4 soat; M3 hali 4 soatlik blok ichida ──
  await pos.setNow(T0 + 240 * MIN)
  await expectGuest(pos, 'Mehmon 2', 200_000)
  await expectGuest(pos, 'Mehmon 3', 200_000)
  await expectWsTotal(pos, 500_000)
  // ── +241: ikkalasi ham 5-soatga o'tdi ──
  await pos.setNow(T0 + 241 * MIN)
  await expectGuest(pos, 'Mehmon 2', 250_000)
  await expectGuest(pos, 'Mehmon 3', 250_000)
  await expectWsTotal(pos, 600_000)
  // Server ham xuddi shunday hisoblaydi
  const v = await pos.backend.rpc<View>('sessions.get', 1)
  expect(v.guests.map((g) => [g.paidMinutes, g.billedMinutes, g.timeAmount])).toEqual([
    [120, 120, 100_000], [240, 300, 250_000], [180, 300, 250_000]
  ])
  expect(v.total).toBe(600_000)

  const co = await startCheckout(pos)
  await co.getByRole('button', { name: 'Aniq' }).click()
  await co.getByRole('button', { name: "To'lash · 600 000 so'm" }).click()
  const rc = await finishReceipt(pos, 600_000)
  expect(rc).toContain('600 000')
  const receipt = await pos.backend.rpc<{ timeTotal: number; guests: { label: string; timeAmount: number }[] }>('checkout.receipt', 1)
  expect(receipt.timeTotal).toBe(600_000)
  expect(receipt.guests.map((g) => g.timeAmount)).toEqual([100_000, 250_000, 250_000])
})

test('Mehmon qo\'shish: yangi mehmonga alohida vaqt olinadi; xona almashsa qolgan vaqt yangi narxda', async ({ pos, page }) => {
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 1)
  await pos.advance(20)
  // 20 daqiqadan keyin yana bir mehmon — 2 soatga
  await page.getByRole('button', { name: "Mehmon qo'shish" }).click()
  const d = pos.dialog("Mehmon qo'shish")
  await d.locator('.rooms-time__btn', { has: page.locator('.rooms-time__n', { hasText: /^2$/ }) }).click()
  await expect(d).toContainText('1 kishi × 2 soat × 50 000')
  await expect(d).toContainText('100 000')
  await d.getByRole('button', { name: `Qo'shish · ${hoursText(120)}` }).click()
  await expect(pos.toast("Mehmon 2 qo'shildi")).toBeVisible()
  await expect(guest(pos, 'Mehmon 2').getByTestId('countdown')).toHaveText('02:00:00')
  await expect(guest(pos, 'Mehmon 1').getByTestId('countdown')).toHaveText('00:40:00')
  await expectWsTotal(pos, 150_000)
  // +10 (T0+30): VIP xonaga (100 000) o'tish. M1: 30 daq Sauna 1 + qolgan 30 daq VIP narxida = 25 000 + 50 000 = 75 000
  // M2: 10 daq Sauna 1 + qolgan 110 daq VIP = 8 333,3 + 183 333,3 = 191 666,7 → 192 000
  await pos.advance(10)
  await page.getByRole('button', { name: 'Xonani almashtirish' }).click()
  const md = pos.dialog('Xonani almashtirish')
  await md.locator('.rooms-move__item[data-room="VIP xona"]').click()
  await md.getByRole('button', { name: "VIP xona ga o'tkazish" }).click()
  await expect(pos.toast("Mehmonlar VIP xona ga o'tkazildi")).toBeVisible()
  await expectGuest(pos, 'Mehmon 1', 75_000)
  await expectGuest(pos, 'Mehmon 2', 192_000)
  expect(await wsTotal(pos)).toBe(267_000)
  void fm
})

test('Imtiyozli daqiqa (grace) va blok sozlamasi ochiq hisobga ta\'sir qiladi', async ({ pos, page }) => {
  await pos.open()
  await pos.login('owner')
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Hisob-kitob', { exact: true }).click()
  // Standart: "Har daqiqa"
  const over = page.locator('.set-bill__item', { hasText: 'Oshib ketganda' })
  await expect(over.getByRole('radio', { name: 'Har daqiqa' })).toHaveAttribute('aria-checked', 'true')
  await expect(over).toContainText("aynan o'tirilgan daqiqalar qo'shiladi")
  await expect(page.getByTestId('billing-example')).toContainText("1 soat 1 daq to'lanadi")
  await over.getByRole('radio', { name: '1 soat' }).click()
  await page.getByRole('radio', { name: '10 daq', exact: true }).click()
  await expect(page.getByText("10 daqiqagacha oshsa — qo'shimcha to'lov yo'q")).toBeVisible()
  await page.getByRole('button', { name: 'Saqlash' }).click()
  await expect(pos.toast('Hisob-kitob sozlamalari saqlandi')).toBeVisible()
  expect(await pos.backend.rpc('settings.get')).toMatchObject({ graceMinutes: 10, blockMinutes: 60 })

  await pos.nav('Xonalar')
  await openRoom(pos, 'Sauna 1', 1)
  await pos.setNow(T0 + 70 * MIN)
  await expectGuest(pos, 'Mehmon 1', 50_000) // 10 daq oshdi — imtiyoz ichida
  await pos.setNow(T0 + 71 * MIN)
  await expectGuest(pos, 'Mehmon 1', 100_000) // 11 daq — keyingi soat

  // Blok 30 daqiqa: 11 daq oshgan → 1 × 30 daq → 90 daq × 50 000/60 = 75 000
  await backToBoard(pos)
  await pos.nav('Sozlamalar')
  await page.locator('.set-nav').getByText('Hisob-kitob', { exact: true }).click()
  await page.getByRole('radio', { name: '30 daqiqa', exact: true }).click()
  await page.getByRole('button', { name: 'Saqlash' }).click()
  await expect(pos.toast('Hisob-kitob sozlamalari saqlandi')).toBeVisible()
  await pos.nav('Xonalar')
  await enterSession(pos, 'Sauna 1')
  await expectGuest(pos, 'Mehmon 1', 75_000)
  expect((await pos.backend.rpc<View>('sessions.get', 1)).guests[0]).toMatchObject({ billedMinutes: 90, timeAmount: 75_000 })
  // Imtiyozni o'chirish (grace 0) — server ham qabul qiladi, noto'g'ri qiymat rad etiladi
  const s = await pos.backend.rpc<Record<string, unknown>>('settings.get')
  expect(await pos.backend.rpcError('settings.save', { ...s, graceMinutes: -1 })).toContain('Imtiyozli')
  expect(await pos.backend.rpcError('settings.save', { ...s, blockMinutes: 0 })).toContain('Blok')
})

/** Sahifaga qo'shilgan har bir toast matnini yozib boradi (bir martalikni tekshirish uchun) */
async function recordToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __toasts: string[] }
    w.__toasts = []
    const seen = new WeakSet<Element>()
    const scan = () => {
      for (const el of Array.from(document.querySelectorAll('.ui-toast'))) {
        if (seen.has(el)) continue
        seen.add(el)
        w.__toasts.push(el.textContent || '')
      }
    }
    new MutationObserver(scan).observe(document, { childList: true, subtree: true })
  })
}

async function toastCount(page: Page, re: RegExp): Promise<number> {
  const all = await page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts)
  return all.filter((t) => re.test(t)).length
}

test('Vaqt ogohlantirishi: "10 daqiqa qoldi" va "vaqti tugadi" bir martadan (boshqa ekranda ham)', async ({ pos, page }) => {
  await recordToasts(page)
  await pos.open()
  await pos.login('admin')
  await openRoom(pos, 'Sauna 1', 1)
  const WARN = /Sauna 1: Mehmon 1 — 10 daqiqa qoldi/
  const OVER = /Sauna 1: Mehmon 1 vaqti tugadi/

  await pos.setNow(T0 + 49 * MIN)
  await page.waitForTimeout(1500)
  expect(await toastCount(page, WARN)).toBe(0)
  await expect(guest(pos, 'Mehmon 1')).not.toHaveClass(/rooms-guest--warn/)

  await pos.setNow(T0 + 50 * MIN)
  await expect(pos.toast(WARN)).toBeVisible()
  await expect(guest(pos, 'Mehmon 1')).toHaveClass(/rooms-guest--warn/)
  await backToBoard(pos)
  await expect(tile(pos, 'Sauna 1')).toHaveClass(/rooms-tile--warn/)
  await expect(tile(pos, 'Sauna 1')).toContainText('Tugayapti')
  // Bir necha soniya (har soniya tekshiriladi) va boshqa daqiqalar — takrorlanmaydi
  await page.waitForTimeout(2500)
  await pos.setNow(T0 + 55 * MIN)
  await page.waitForTimeout(1500)
  expect(await toastCount(page, WARN)).toBe(1)

  // Boshqa ekranda turganda vaqt tugaydi — ogohlantirish baribir chiqadi (ilova qobig'ida)
  await pos.nav('Qarzlar')
  await pos.setNow(T0 + 61 * MIN)
  await expect(pos.toast(OVER)).toBeVisible()
  await expect(pos.toast(OVER)).toContainText("Endi o'tirilgan har daqiqa qo'shiladi")
  await page.waitForTimeout(2500)
  await pos.nav('Xonalar')
  await enterSession(pos, 'Sauna 1')
  // Daqiqalik: 61 daq × 50 000/60 = 50 833 → 51 000
  await expectGuest(pos, 'Mehmon 1', 51_000)
  await expect(guest(pos, 'Mehmon 1').getByTestId('overnote')).toHaveText("+00:01:00 oshdi · 1 daq qo'shildi")
  await pos.setNow(T0 + 75 * MIN)
  await expect(guest(pos, 'Mehmon 1').getByTestId('overnote')).toHaveText("+00:15:00 oshdi · 15 daq qo'shildi")
  await expectGuest(pos, 'Mehmon 1', 63_000) // 75 × 50 000/60 = 62 500 → 63 000
  await pos.setNow(T0 + 90 * MIN)
  await page.waitForTimeout(2000)
  expect(await toastCount(page, OVER)).toBe(1)
  expect(await toastCount(page, WARN)).toBe(1)

  // +1 soat bilan uzaytirildi (paid 120): 110-daqiqada yana "10 daqiqa qoldi" — yangi olingan vaqt uchun bir marta
  await guest(pos, 'Mehmon 1').getByRole('button', { name: '1 soat' }).click()
  await expect(guest(pos, 'Mehmon 1')).toContainText('2 soat olingan')
  await expectGuest(pos, 'Mehmon 1', 100_000)
  await pos.setNow(T0 + 110 * MIN)
  await expect.poll(() => toastCount(page, WARN)).toBe(2)
  await page.waitForTimeout(2000)
  expect(await toastCount(page, WARN)).toBe(2)
  expect(await toastCount(page, OVER)).toBe(1)
})
