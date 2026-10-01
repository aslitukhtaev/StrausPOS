import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer') } },
  test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'electron/**/*.test.ts'], environment: 'node' }
})
