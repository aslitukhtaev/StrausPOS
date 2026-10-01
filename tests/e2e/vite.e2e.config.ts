/**
 * e2e uchun Vite konfiguratsiyasi (asosiy `vite.web.config.ts` ustiga).
 *  - Alohida port (E2E_VITE_PORT, standart 5283) — boshqa agentlarning 5173/5174 portlari bilan to'qnashmaydi.
 *  - `/rpc` ni dev-serverga yo'naltiradi. Qaysi dev-server — `e2e-backend=<port>` cookie'si bo'yicha
 *    (har bir Playwright worker o'z dev-serverini ishga tushiradi, shuning uchun testlar parallel va izolyatsiyalangan).
 *    Cookie bo'lmasa — webServer sifatida ko'tarilgan standart dev-server (E2E_SERVER_PORT, 5284).
 */
import http from 'http'
import { defineConfig, mergeConfig, type Plugin } from 'vite'
import base from '../../vite.web.config'

const VITE_PORT = Number(process.env.E2E_VITE_PORT || 5283)
const DEFAULT_BACKEND = Number(process.env.E2E_SERVER_PORT || 5284)

function backendPort(cookie: string | undefined): number {
  const m = /(?:^|;\s*)e2e-backend=(\d+)/.exec(cookie || '')
  return m ? Number(m[1]) : DEFAULT_BACKEND
}

function rpcRouter(): Plugin {
  return {
    name: 'e2e-rpc-router',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/rpc')) return next()
        const port = backendPort(req.headers.cookie)
        const up = http.request(
          { host: '127.0.0.1', port, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + port } },
          (r) => {
            res.writeHead(r.statusCode || 502, r.headers)
            r.pipe(res)
          }
        )
        up.on('error', () => {
          // Backend o'chiq (masalan qayta ishga tushirish testi) — Vite proksisi kabi bo'sh 502
          if (!res.headersSent) res.writeHead(502)
          res.end()
        })
        req.pipe(up)
      })
    }
  }
}

export default mergeConfig(
  { ...base, server: { ...base.server, proxy: undefined } },
  defineConfig({
    plugins: [rpcRouter()],
    server: { port: VITE_PORT, strictPort: true, hmr: false },
    clearScreen: false,
    logLevel: 'warn'
  })
)
