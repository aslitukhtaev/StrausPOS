/**
 * m) TERMINAL rejimi: asosiy dev-server (--lan) + terminal dev-server (--terminal-of) va ikki brauzer konteksti.
 * Terminalda ofitsiant o'z PIN'i bilan kiradi va xonaga mahsulot qo'shadi → asosiy kompyuterda ko'rinadi.
 * Terminal login'i asosiy kompyuterdagi login'ga ta'sir qilmaydi.
 */
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect, type Page } from '@playwright/test'

const ROOT = process.cwd()
const MAIN_PORT = 5390
const TERM_PORT = 5391
const LAN_PORT = 5392
const UDP_PORT = 5393
const CODE = '135790'
const ROOM = 'Sauna 1'
const PRODUCT = 'Pivo 0.5 L'

class Server {
  proc: ChildProcess | null = null
  log = ''
  constructor(readonly port: number, readonly dir: string, readonly args: string[]) {}
  get url(): string {
    return 'http://127.0.0.1:' + this.port
  }
  async start(): Promise<void> {
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx')
    const p = spawn(tsx, [path.join(ROOT, 'scripts', 'dev-server.ts'), ...this.args], {
      cwd: ROOT,
      env: {
        ...process.env, PORT: String(this.port), DELFIN_DATA_DIR: this.dir, TZ: 'Asia/Tashkent', RESET: '',
        LAN_PORT: String(LAN_PORT), DISCOVERY_PORT: String(UDP_PORT)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc = p
    p.stdout?.on('data', (d: Buffer) => (this.log += d.toString()))
    p.stderr?.on('data', (d: Buffer) => (this.log += d.toString()))
    p.once('exit', () => {
      if (this.proc === p) this.proc = null
    })
    const until = Date.now() + 30_000
    for (;;) {
      try {
        if ((await fetch(this.url + '/__test/state')).ok) return
      } catch {
        /* hali ko'tarilmadi */
      }
      if (!this.proc) throw new Error('dev-server ishga tushmadi:\n' + this.log)
      if (Date.now() > until) throw new Error('dev-server kutish vaqti tugadi:\n' + this.log)
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  async stop(): Promise<void> {
    const p = this.proc
    if (!p) return
    this.proc = null
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => p.kill('SIGKILL'), 3000)
      p.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      p.kill('SIGTERM')
    })
  }
  async post<T>(p: string, body: unknown): Promise<T> {
    const r = await fetch(this.url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json()) as T & { error?: string }
    if (!r.ok) throw new Error(`${p} → ${r.status}: ${j.error}`)
    return j
  }
  async rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const r = await this.post<{ result: T }>('/rpc', { method, args })
    return r.result
  }
}

const root = path.join(os.tmpdir(), 'delfin-e2e', 'terminal')
const main = new Server(MAIN_PORT, path.join(root, 'main'), ['--reset', '--lan', '--code', CODE])
const term = new Server(TERM_PORT, path.join(root, 'term'), ['--terminal-of', `http://127.0.0.1:${LAN_PORT}`, '--code', CODE])

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await main.start()
  await term.start()
})

test.afterAll(async () => {
  await term.stop()
  await main.stop()
})

async function pageFor(browser: import('@playwright/test').Browser, baseURL: string, port: number): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, timezoneId: 'Asia/Tashkent', locale: 'uz-UZ' })
  await ctx.addCookies([{ name: 'e2e-backend', value: String(port), url: baseURL }])
  return ctx.newPage()
}

async function pinLogin(page: Page, name: string, pin: string): Promise<void> {
  const tile = page.locator('.lock-tile', { has: page.locator('.lock-tile__name', { hasText: new RegExp('^' + name + '$') }) })
  await tile.click()
  await expect(page.locator('.lock-pin__name')).toHaveText(name)
  for (const ch of pin) await page.keyboard.press(ch)
  await page.keyboard.press('Enter')
  await expect(page.locator('.shell')).toBeVisible()
  await expect(page.locator('.topbar__username')).toHaveText(name)
}

test("terminal: ofitsiant PIN bilan kirib xonaga mahsulot qo'shadi → asosiyda ko'rinadi", async ({ browser, baseURL }) => {
  // Asosiy: toza baza + xodimlar; kassir kirgan, xona ochilgan
  const r = await main.post<{ ids: Record<string, number> }>('/__test/reset', { setup: true, login: 'cashier' })
  const ids = r.ids
  const room = (await main.rpc<{ id: number; name: string }[]>('rooms.list')).find((x) => x.name === ROOM)!
  const opened = await main.rpc<{ session: { id: number } }>('sessions.open', room.id, 2, 60)
  const sid = opened.session.id

  // Terminal konteksti: baza yo'q, rejim 'terminal', login yo'q (asosiydagi kassir login'i bu yerga o'tmaydi)
  expect(await term.rpc('connection.info')).toMatchObject({ mode: 'terminal', host: '127.0.0.1', port: LAN_PORT, connected: true })
  expect(await term.rpc('auth.current')).toBeNull()

  const tp = await pageFor(browser, baseURL!, TERM_PORT)
  await tp.goto('/')
  await expect(tp.locator('.boot')).toHaveCount(0)
  // Qulf ekrani: asosiydagi xodimlar; pastda "Terminal · manzil"
  await expect(tp.getByTestId('lock-terminal')).toContainText('Terminal')
  await expect(tp.getByTestId('lock-to-terminal')).toHaveCount(0)
  await pinLogin(tp, 'Sardor', '5555')
  await expect(tp.getByTestId('terminal-badge')).toContainText('Terminal')
  await expect(tp.getByTestId('terminal-badge')).toContainText('Delfin Sauna')

  // Asosiy kompyuter login'i o'zgarmagan
  expect((await main.rpc<{ staff: { id: number } }>('auth.current')).staff.id).toBe(ids.cashier)

  // Terminalda ofitsiant xonaga kiradi va mahsulot qo'shadi
  await tp.locator(`.rooms-tile[data-room="${ROOM}"]`).click()
  await expect(tp.locator('.rooms-ws__room')).toHaveText(ROOM)
  await tp.locator('.rooms-bill__add').click()
  const d = tp.locator('.ui-modal').last()
  const ptile = d.locator(`.rooms-ptile[data-product="${PRODUCT}"]`)
  await expect(ptile).toBeVisible()
  await ptile.locator('[data-act="plus"]').click()
  await ptile.locator('[data-act="plus"]').click()
  const resp = tp.waitForResponse((x) => x.url().includes('/rpc') && (x.request().postData() || '').includes('"lines.addProducts"'))
  await d.getByTestId('add-submit').click()
  expect((await resp).status()).toBe(200)
  await expect(tp.locator(`.rooms-line[data-line="${PRODUCT}"]`)).toBeVisible()

  // Asosiy bazada: qator ofitsiant nomidan
  const view = await main.rpc<{ lines: { name: string; activeQty: number; createdBy: number }[] }>('sessions.get', sid)
  expect(view.lines.map((l) => [l.name, l.activeQty, l.createdBy])).toEqual([[PRODUCT, 2, ids.waiter1]])

  // Asosiy kompyuter UI (kassir): xona panelidan kirib qatorni ko'radi
  const mp = await pageFor(browser, baseURL!, MAIN_PORT)
  await mp.goto('/')
  await expect(mp.locator('.shell')).toBeVisible()
  await expect(mp.locator('.topbar__username')).toHaveText('Kassir')
  await expect(mp.getByTestId('terminal-badge')).toHaveCount(0)
  await mp.locator(`.rooms-tile[data-room="${ROOM}"]`).click()
  await expect(mp.locator('.rooms-ws__room')).toHaveText(ROOM)
  await expect(mp.locator(`.rooms-line[data-line="${PRODUCT}"]`)).toBeVisible()

  // Terminal faqat asosiyga tegishli amallarni bajarmaydi
  const deny = await fetch(term.url + '/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'network.status', args: [] }) })
  expect(((await deny.json()) as { error: string }).error).toBe('Bu amal faqat asosiy kompyuterda bajariladi')

  // Ega asosiyda: ulangan terminal va unda kirgan xodim ko'rinadi
  await main.rpc('auth.login', ids.owner, '1234')
  const st = await main.rpc<{ terminals: { staffName: string | null }[] }>('network.status')
  expect(st.terminals.map((t) => t.staffName)).toEqual(['Sardor'])

  // Terminalda qulflash → asosiy login o'zgarmaydi
  await tp.getByRole('button', { name: 'Qulflash' }).click()
  await expect(tp.locator('.auth')).toBeVisible()
  expect((await main.rpc<{ staff: { id: number } }>('auth.current')).staff.id).toBe(ids.owner)
  expect(await term.rpc('auth.current')).toBeNull()
})
