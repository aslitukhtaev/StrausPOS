/**
 * Playwright e2e (tests/e2e). Brauzer yuklab olinmaydi — tizimdagi Chromium ishlatiladi
 * (PW_CHROMIUM env yoki /opt/pw-browsers/chromium-*). `npm run e2e`.
 *
 * webServer:
 *  1) dev-server (alohida port 5284, `--reset`, vaqtinchalik baza papkasi) — standart backend;
 *  2) vite (tests/e2e/vite.e2e.config.ts, port 5283) — `/rpc` ni cookie bo'yicha worker backend'iga yo'naltiradi.
 * Har bir worker o'z dev-serverini ko'taradi (tests/e2e/fixtures.ts) — testlar bir-birining login holatiga tegmaydi.
 */
import { defineConfig } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'

const VITE_PORT = Number(process.env.E2E_VITE_PORT || 5283)
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT || 5284)

function findChromium(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM
  const root = '/opt/pw-browsers'
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux', 'chrome')
    if (fs.existsSync(p)) return p
  }
  return undefined
}

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    viewport: { width: 1366, height: 768 },
    timezoneId: 'Asia/Tashkent',
    locale: 'uz-UZ',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: findChromium() }
  },
  webServer: [
    {
      command: 'npx tsx scripts/dev-server.ts --reset',
      url: `http://127.0.0.1:${SERVER_PORT}/__test/state`,
      env: {
        PORT: String(SERVER_PORT),
        DELFIN_DATA_DIR: path.join(os.tmpdir(), 'delfin-e2e', 'default'),
        TZ: 'Asia/Tashkent'
      },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe'
    },
    {
      command: 'npx vite --config tests/e2e/vite.e2e.config.ts',
      url: `http://localhost:${VITE_PORT}/`,
      env: { E2E_VITE_PORT: String(VITE_PORT), E2E_SERVER_PORT: String(SERVER_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ]
})
