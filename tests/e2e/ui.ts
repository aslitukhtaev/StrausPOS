/**
 * Xonalar / sessiya / to'lov ekranlari uchun UI yordamchilari (faqat haqiqiy UI orqali bosish).
 */
import type { Locator } from '@playwright/test'
import { expect, fm, money, type Pos } from './fixtures'

/** Tugmani bosib, berilgan RPC javobini kutadi */
export async function rpcClick(pos: Pos, target: Locator, method: string): Promise<void> {
  const resp = pos.page.waitForResponse((r) => r.url().includes('/rpc') && (r.request().postData() || '').includes('"' + method + '"'))
  await target.click()
  await resp
}

export function tile(pos: Pos, room: string): Locator {
  return pos.page.locator(`.rooms-tile[data-room="${room}"]`)
}

export interface OpenOpts {
  /** Har mehmonga olinadigan vaqt, daqiqa (standart 60 = sozlamalardagi defaultHours=1). 60/120/180/240 — tezkor tugma, boshqasi "Boshqa" */
  minutes?: number
  /** Ofitsiant ismi (masalan "Sardor"); null/yo'q — "Ofitsiant biriktirilmadi!" ogohlantirishi → "Ofitsiantsiz boshlash" */
  waiter?: string | null
}

/** "2 soat", "1 soat 30 daq", "45 daq" — billing.formatHours bilan bir xil */
export function hoursText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h} soat ${m} daq`
  if (h) return `${h} soat`
  return `${m} daq`
}

/** Vaqt tanlash (TimePicker) — ochish va "Mehmon qo'shish" oynalarida */
export async function pickTime(d: Locator, minutes: number): Promise<void> {
  const quick = d.locator('.rooms-time__btn').filter({ has: d.page().locator('.rooms-time__n', { hasText: new RegExp('^' + minutes / 60 + '$') }) })
  if (minutes % 60 === 0 && minutes >= 60 && minutes <= 240) {
    await quick.click()
    await expect(quick).toHaveAttribute('aria-pressed', 'true')
    return
  }
  await d.locator('.rooms-time__btn--other').click()
  const [hs, ms] = [d.locator('.rooms-time__custom .ui-stepper').nth(0), d.locator('.rooms-time__custom .ui-stepper').nth(1)]
  const val = async (st: Locator) => money(await st.locator('.ui-stepper__value').textContent())
  const th = Math.floor(minutes / 60)
  const tm = minutes % 60
  for (let i = 0; i < 40 && (await val(hs)) !== th; i++) {
    await hs.getByRole('button', { name: (await val(hs)) < th ? "Ko'paytirish" : 'Kamaytirish' }).click()
  }
  for (let i = 0; i < 10 && (await val(ms)) !== tm; i++) {
    await ms.getByRole('button', { name: (await val(ms)) < tm ? "Ko'paytirish" : 'Kamaytirish' }).click()
  }
  expect(await val(hs)).toBe(th)
  expect(await val(ms)).toBe(tm)
}

/**
 * Bosh ekrandan bo'sh xonani N mehmon bilan ochadi (vaqt + ofitsiant tanlab) va sessiya oynasiga kiradi.
 * Ofitsiant berilmasa — "Ofitsiant biriktirilmadi!" ogohlantirishi chiqishi tekshiriladi va "Ofitsiantsiz boshlash" bosiladi.
 */
export async function openRoom(pos: Pos, room: string, guests: number, opts: OpenOpts = {}): Promise<void> {
  const { page } = pos
  const minutes = opts.minutes ?? 60
  const waiter = opts.waiter ?? null
  await tile(pos, room).click()
  const d = pos.dialog(room + ' — xonani ochish')
  await expect(d).toBeVisible()
  // Ofitsiantlar ro'yxati yuklanguncha kutamiz (aks holda ogohlantirish mantiqi hali ishlamaydi)
  await expect(d.locator('.rooms-waiter').first()).toBeVisible()
  await d.locator('.rooms-open__n', { hasText: new RegExp('^' + guests + '$') }).click()
  await pickTime(d, minutes)
  if (waiter) {
    const w = d.locator(`.rooms-waiter[data-waiter="${waiter}"]`)
    await w.click()
    await expect(w).toHaveAttribute('aria-checked', 'true')
  }
  await d.getByRole('button', { name: `Boshlash · ${guests} kishi · ${hoursText(minutes)}` }).click()
  if (!waiter) {
    const warn = page.locator('.ui-modal.rooms-nowaiter')
    await expect(warn).toContainText('Ofitsiant biriktirilmadi!')
    await warn.getByRole('button', { name: 'Ofitsiantsiz boshlash' }).click()
  }
  await expect(pos.toast(`${room} ochildi`)).toBeVisible()
  await expect(d).toHaveCount(0)
  await enterSession(pos, room)
  await expect(page.locator('.rooms-guest')).toHaveCount(guests)
}

/** Sessiya oynasidagi ofitsiant tasmasi orqali biriktirish / almashtirish */
export async function setWaiterUi(pos: Pos, name: string): Promise<void> {
  const strip = pos.page.getByTestId('waiter-strip')
  await strip.getByRole('button', { name: /Biriktirish|Almashtirish/ }).click()
  const d = pos.dialog(/Ofitsiant(ni)? (biriktirish|almashtirish)/i)
  await expect(d).toBeVisible()
  await d.locator(`.rooms-waiter[data-waiter="${name}"]`).click()
  await d.getByRole('button', { name: 'Biriktirish', exact: true }).click()
  await expect(pos.toast(`Ofitsiant biriktirildi: ${name}`)).toBeVisible()
  await expect(d).toHaveCount(0)
  await expect(strip).toContainText(name)
}

/** "Mehmon qo'shish" → vaqt tanlash → "Qo'shish · …" */
export async function addGuest(pos: Pos, minutes = 60): Promise<void> {
  await pos.page.getByRole('button', { name: "Mehmon qo'shish" }).click()
  const d = pos.dialog("Mehmon qo'shish")
  await expect(d).toBeVisible()
  await pickTime(d, minutes)
  await d.getByRole('button', { name: `Qo'shish · ${hoursText(minutes)}` }).click()
  await expect(d).toHaveCount(0)
}

/** Band xona kartasini bosib sessiya oynasiga kirish */
export async function enterSession(pos: Pos, room: string): Promise<void> {
  await tile(pos, room).click()
  await expect(pos.page.locator('.rooms-ws__room')).toHaveText(room)
}

export async function backToBoard(pos: Pos): Promise<void> {
  await pos.page.getByRole('button', { name: 'Xonalarga qaytish (Esc)' }).click()
  await expect(pos.page.locator('.rooms-board')).toBeVisible()
}

export function guest(pos: Pos, label: string): Locator {
  return pos.page.locator(`.rooms-guest[data-guest="${label}"]`)
}

export async function confirm(pos: Pos, button: string): Promise<void> {
  const d = pos.page.locator('.ui-modal').filter({ has: pos.page.getByRole('button', { name: button }) }).last()
  await d.getByRole('button', { name: button }).click()
  await expect(d).toHaveCount(0)
}

/** Sessiya oynasining "Jami summa / Qolgan to'lov" qiymati */
export async function wsTotal(pos: Pos): Promise<number> {
  return money(await pos.page.locator('.rooms-ws__totalnum').textContent())
}

export async function wsStat(pos: Pos, label: string): Promise<number> {
  const s = pos.page.locator('.rooms-stat', { has: pos.page.locator('.rooms-stat__label', { hasText: label }) })
  return money(await s.locator('.ui-money').textContent())
}

export async function expectWsTotal(pos: Pos, n: number): Promise<void> {
  await expect(pos.page.locator('.rooms-ws__totalnum')).toHaveText(fm(n) + " so'm")
}

export async function guestAmount(pos: Pos, label: string): Promise<number> {
  return money(await guest(pos, label).locator('.rooms-guest__money > .ui-money').textContent())
}

export async function expectGuest(pos: Pos, label: string, n: number): Promise<void> {
  await expect(guest(pos, label).locator('.rooms-guest__money > .ui-money')).toHaveText(fm(n) + " so'm")
}

export async function moveTo(pos: Pos, room: string): Promise<void> {
  await pos.page.getByRole('button', { name: 'Xonani almashtirish' }).click()
  const d = pos.dialog('Xonani almashtirish')
  await d.locator(`.rooms-move__item[data-room="${room}"]`).click()
  await d.getByRole('button', { name: room + " ga o'tkazish" }).click()
  await expect(pos.toast(`Mehmonlar ${room} ga o'tkazildi`)).toBeVisible()
  await expect(pos.page.locator('.rooms-ws__room')).toHaveText(room)
}

/** "Qo'shish" panelini ochadi */
export async function openAdd(pos: Pos): Promise<Locator> {
  await pos.page.locator('.rooms-bill__add').click()
  const d = pos.dialog("Bar va xizmat qo'shish")
  await expect(d.locator('.rooms-add__grid')).toBeVisible()
  return d
}

export async function addProduct(pos: Pos, d: Locator, name: string, times = 1, who = 'Butun guruh'): Promise<void> {
  await d.locator('.rooms-add__who .rooms-chip', { hasText: who }).click()
  const btn = d.locator(`[data-product="${name}"]`)
  for (let i = 0; i < times; i++) await rpcClick(pos, btn, 'lines.addProduct')
}

export async function addService(pos: Pos, d: Locator, name: string, provider: string | null, who = 'Butun guruh'): Promise<void> {
  await d.getByRole('tab', { name: 'Xizmatlar' }).click()
  await d.locator('.rooms-add__who .rooms-chip', { hasText: who }).click()
  if (provider) await d.getByRole('radio', { name: provider }).click()
  await rpcClick(pos, d.locator(`[data-service="${name}"]`), 'lines.addService')
  await d.getByRole('tab', { name: 'Bar' }).click()
}

export async function closeAdd(pos: Pos, d: Locator): Promise<void> {
  await d.getByRole('button', { name: 'Tayyor' }).click()
  await expect(d).toHaveCount(0)
}

export function line(pos: Pos, name: string): Locator {
  return pos.page.locator(`.rooms-line[data-line="${name}"]`)
}

/** X tugmasi: qatorni qaytarish (qty dona) */
export async function returnLine(pos: Pos, name: string, qty: number, unit: number, reason = 'Xato kiritildi'): Promise<void> {
  await line(pos, name).first().getByRole('button', { name: 'Qaytarish' }).click()
  const d = pos.dialog('Qatorni qaytarish')
  await expect(d).toBeVisible()
  // Standart — barcha faol miqdor; kerakli songa tushiramiz
  const val = d.locator('.ui-stepper__value')
  if (await val.count()) {
    for (let i = 0; i < 50; i++) {
      if (money(await val.textContent()) <= qty) break
      await d.getByRole('button', { name: 'Kamaytirish' }).click()
    }
    await expect(val).toContainText(String(qty))
  }
  await d.locator('.rooms-chip', { hasText: reason }).click()
  await d.getByRole('button', { name: 'Qaytarish · ' + fm(qty * unit) }).click()
  await expect(pos.toast(`Qaytarildi: ${name} × ${qty}`)).toBeVisible()
}

export async function setDiscount(pos: Pos, amount: number): Promise<void> {
  await pos.page.getByRole('button', { name: 'Chegirma' }).click()
  const d = pos.dialog('Chegirma')
  await expect(d).toBeVisible()
  await pos.typeDigits(String(amount))
  await d.getByRole('button', { name: "Qo'llash" }).click()
  await expect(pos.toast(`Chegirma: ${fm(amount)} so'm`)).toBeVisible()
}

/** "Hisobni yopish / To'lov" → (tasdiq) → to'lov oynasi */
export async function startCheckout(pos: Pos): Promise<Locator> {
  await pos.page.locator('.rooms-bill__pay').click()
  const stop = pos.page.getByRole('button', { name: "To'xtatish va davom etish" })
  const d = pos.page.locator('.ui-modal.checkout-modal')
  await expect(stop.or(d)).toBeVisible()
  if (await stop.isVisible()) await stop.click()
  await expect(d).toBeVisible()
  return d
}

export async function checkoutTotal(d: Locator): Promise<number> {
  return money(await d.locator('.checkout-sum__total .ui-money').textContent())
}

/** Chek oynasi: tekshirib yopadi va chek ma'lumotini (matn) qaytaradi */
export async function finishReceipt(pos: Pos, total: number): Promise<string> {
  const r = pos.dialog("To'lov qabul qilindi")
  await expect(r).toBeVisible()
  await expect(r.locator('.checkout-done__info > .ui-money')).toHaveText(fm(total) + " so'm")
  const text = (await r.textContent()) || ''
  await r.getByRole('button', { name: 'Yopish', exact: true }).last().click()
  await expect(r).toHaveCount(0)
  await expect(pos.page.locator('.rooms-board')).toBeVisible()
  return text
}
