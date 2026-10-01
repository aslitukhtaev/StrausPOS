import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const alias = { '@shared': resolve('src/shared'), '@': resolve('src/renderer') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    resolve: { alias },
    build: { target: 'node16', rollupOptions: { input: { index: resolve('electron/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { target: 'node16', rollupOptions: { input: { index: resolve('electron/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias },
    build: { target: 'chrome108', cssTarget: 'chrome108', rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
})
