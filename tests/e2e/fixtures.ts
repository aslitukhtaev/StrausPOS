/**
 * e2e fixture'lari.
 *
 *  - `backend` (worker): har bir worker o'z dev-serverini (alohida port + alohida baza papkasi) ko'taradi.
 *    Vite `/rpc` ni `e2e-backend` cookie bo'yicha shu serverga yo'naltiradi (tests/e2e/vite.e2e.config.ts).
 *  - `pos` (test): toza baza (Ega/Admin/Kassir/Massajchi + ofitsiantlar Sardor/Bekzod + standart xonalar/katalog), soat T0 da muzlatilgan
 *    (server ham, brauzer ham — `page.clock.setFixedTime`), konsol tinglovchisi.
 *    Har test oxirida konsolda kutilmagan error/warning yoki sahifa istisnosi bo'lsa — test yiqiladi.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { Backend, NAMES, PINS, type Who } from './backend'

/** 2026-10-01 10:00 (Toshkent) — chorshanba */
export const T0 = new Date('2026-10-01T10:00:00+05:00').getTime()
export const MIN = 60_000

/** Konsolda kutiladigan (biznes xatolari) xabarlar. Dev-server PosError ni HTTP 400 bilan qaytaradi —
 * Chromium buni "Failed to load resource ... 400" deb yozadi. Bu dizayn bo'yicha (UI toast ko'rsatadi). */
const ALWAYS_OK: RegExp[] = [
  /Failed to load resource: the server responded with a status of 400/,
  // Playwright `page.clock` init-skripti chek namunasining sandbox iframe'iga (skriptsiz, ataylab) kiritilmoqchi bo'ladi —
  // bu test vositasining artefakti, ilovaniki emas (receipt.ts da <script> yo'q).
  /Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/
]

export interface Pos {
  backend: Backend
  ids: Record<Who, number>
  page: Page
  /** Hozirgi (muzlatilgan) vaqt */
  now: number
  /** Server va brauzer soatini birga suradi */
  advance(minutes: number): Promise<void>
  setNow(t: number): Promise<void>
  /** Sahifani ochish (boot) */
  open(): Promise<void>
  /** Qulf ekranidan UI orqali kirish */
  login(who: Who): Promise<void>
  /** Shell'dagi "Qulflash" */
  lock(): Promise<void>
  /** Chap menyu bo'limi */
  nav(label: string): Promise<void>
  /** Ushbu testda qo'shimcha ruxsat etilgan konsol xabarlari */
  allowConsole(re: RegExp): void
  consoleIssues(): string[]
  toast(text: string | RegExp): Locator
  dialog(title?: string | RegExp): Locator
  /** Raqamlarni jismoniy klaviatura bilan kiritish (Numpad tinglaydi) */
  typeDigits(s: string): Promise<void>
}

export const test = base.extend<{ pos: Pos }, { backend: Backend }>({
  backend: [
    async ({}, use, workerInfo) => {
      const b = new Backend(5300 + workerInfo.parallelIndex, 'w' + workerInfo.parallelIndex)
      await b.start(true)
      await use(b)
      await b.stop()
    },
    { scope: 'worker', timeout: 60_000 }
  ],

  pos: async ({ page, backend, baseURL }, use, testInfo) => {
    if (!backend.proc) await backend.start(true)
    await backend.setClock(T0)
    const ids = (await backend.reset(true))!
    await page.context().addCookies([{ name: 'e2e-backend', value: String(backend.port), url: baseURL! }])
    await page.clock.setFixedTime(T0)

    const issues: string[] = []
    const allowed = [...ALWAYS_OK]
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return
      const text = m.text()
      if (allowed.some((re) => re.test(text))) return
      issues.push(`[console.${m.type()}] ${text}`)
    })
    page.on('pageerror', (e) => issues.push('[pageerror] ' + e.message))

    const pos: Pos = {
      backend,
      ids,
      page,
      now: T0,
      async setNow(t) {
        pos.now = t
        await backend.setClock(t)
        await page.clock.setFixedTime(t)
      },
      async advance(minutes) {
        await pos.setNow(pos.now + minutes * MIN)
      },
      async open() {
        await page.goto('/')
        await expect(page.locator('.boot')).toHaveCount(0)
      },
      async login(who) {
        const tile = page.locator('.lock-tile', { has: page.locator('.lock-tile__name', { hasText: new RegExp('^' + NAMES[who] + '$') }) })
        await tile.click()
        await expect(page.locator('.lock-pin__name')).toHaveText(NAMES[who])
        await pos.typeDigits(PINS[who])
        await page.keyboard.press('Enter')
        await expect(page.locator('.shell')).toBeVisible()
        await expect(page.locator('.topbar__username')).toHaveText(NAMES[who])
      },
      async lock() {
        await page.getByRole('button', { name: 'Qulflash' }).click()
        await expect(page.locator('.auth')).toBeVisible()
      },
      async nav(label) {
        await page.locator('.side__item', { hasText: new RegExp('^' + label + '$') }).click()
        await expect(page.locator('.topbar__crumb')).toHaveText(label)
      },
      allowConsole(re) {
        allowed.push(re)
      },
      consoleIssues: () => issues.slice(),
      toast(text) {
        return page.locator('.ui-toast', { hasText: text })
      },
      dialog(title) {
        const d = page.locator('.ui-modal')
        return title ? d.filter({ has: page.locator('.ui-modal__title', { hasText: title }) }) : d.last()
      },
      async typeDigits(s) {
        for (const ch of s) await page.keyboard.press(ch)
      }
    }

    await use(pos)

    if (testInfo.status === testInfo.expectedStatus && issues.length) {
      throw new Error('Konsolda kutilmagan xabarlar:\n' + issues.join('\n'))
    }
  }
})

export { expect }

/** "125 000 so'm" → 125000 */
export function money(text: string | null): number {
  const digits = (text || '').replace(/[^\d−-]/g, '')
  const neg = /^[−-]/.test(digits)
  const n = Number(digits.replace(/[−-]/g, '') || 'NaN')
  return neg ? -n : n
}

/** Formatlangan pul (UI dagi kabi): 425000 → "425 000" */
export function fm(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
