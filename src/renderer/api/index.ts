/**
 * PosApi ga kirish nuqtasi. Ekranlar FAQAT shu orqali backend bilan gaplashadi.
 *
 *   import { api } from '@/api'
 *   const cards = await api.rooms.board()
 *
 * Manba tanlash tartibi:
 *   1) URL da `?mock` (yoki `?mock=1`, `?mock=empty`) → xotiradagi mockApi (backendsiz UI ko'rish)
 *   2) `window.api` (Electron preload) → IPC
 *   3) aks holda HTTP `/rpc` (vite dev-server proksi → scripts/dev-server.ts)
 */
import type { PosApi } from '@shared/api'
import { createRpcApi } from './rpc'
import { createMockApi } from './mockApi'

let instance: PosApi | null = null
let kind: 'mock' | 'electron' | 'rpc' = 'rpc'

export function getApi(): PosApi {
  if (instance) return instance
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  const w = (typeof window !== 'undefined' ? window : {}) as { api?: PosApi }
  if (params.has('mock')) {
    instance = createMockApi({ empty: params.get('mock') === 'empty', viewer: params.has('viewer'), offline: params.has('offline') })
    kind = 'mock'
  } else if (w.api) {
    instance = w.api
    kind = 'electron'
  } else {
    instance = createRpcApi('/rpc')
    kind = 'rpc'
  }
  return instance
}

/** Qaysi adapter ishlatilmoqda (diagnostika uchun) */
export function apiKind(): 'mock' | 'electron' | 'rpc' {
  getApi()
  return kind
}

/** Testlar uchun: adapterni almashtirish */
export function setApi(a: PosApi): void {
  instance = a
}

/** Qulay yorliq: `api.rooms.board()` — har chaqiruvda getApi() ga yo'naltiradi. */
export const api: PosApi = new Proxy({} as PosApi, {
  get(_t, group) {
    if (group === 'then') return undefined
    return (getApi() as unknown as Record<string | symbol, unknown>)[group]
  }
})

export { createRpcApi, RpcError } from './rpc'
