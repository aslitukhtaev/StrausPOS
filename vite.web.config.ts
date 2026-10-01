// Brauzerda (Electronsiz) ishlab chiqish va test qilish uchun.
// UI -> /rpc -> scripts/dev-server.ts (haqiqiy PosService + SQLite).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer') } },
  build: { target: 'chrome108', cssTarget: 'chrome108' },
  server: { port: 5173, proxy: { '/rpc': 'http://localhost:5174' } }
})
