/**
 * HTTP /rpc adapter — brauzerda (Electronsiz) `scripts/dev-server.ts` orqali haqiqiy PosService.
 *
 * Protokol (dev-server bilan kelishuv):
 *   POST /rpc   Content-Type: application/json
 *   body:  { "method": "rooms.board", "args": [ ... ] }
 *   javob: { "ok": true, "result": <qiymat> }  yoki  { "ok": false, "error": "O'zbekcha xato matni" }
 *   (moslik uchun { "result": ... } / { "error": ... } yoki HTTP 4xx/5xx + { error } ham qabul qilinadi)
 */
import type { PosApi } from '@shared/api'

export class RpcError extends Error {
  constructor(message: string, public method: string) {
    super(message)
    this.name = 'RpcError'
  }
}

async function call(endpoint: string, method: string, args: unknown[]): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ method, args })
    })
  } catch {
    throw new RpcError("Server bilan aloqa yo'q. Dastur serveri ishlayotganini tekshiring.", method)
  }
  let data: unknown = undefined
  const text = await res.text()
  if (!text && res.status >= 500) {
    // Vite proksi backend topilmasa bo'sh 500 qaytaradi
    throw new RpcError("Server bilan aloqa yo'q (" + res.status + "). Dastur serveri ishlayotganini tekshiring.", method)
  }
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new RpcError(res.ok ? "Serverdan noto'g'ri javob keldi" : 'Server xatosi (' + res.status + ')', method)
    }
  }
  const obj = (data && typeof data === 'object' ? data : {}) as { ok?: boolean; result?: unknown; error?: unknown }
  if (!res.ok || obj.ok === false || (obj.error != null && obj.error !== false)) {
    const err = obj.error
    const msg =
      typeof err === 'string' ? err
        : err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message
          : 'Server xatosi (' + res.status + ')'
    throw new RpcError(msg, method)
  }
  return 'result' in obj ? obj.result : data
}

/** PosApi ni to'liq tipli Proxy sifatida yaratadi: api.rooms.board() → POST /rpc {method:"rooms.board"} */
export function createRpcApi(endpoint = '/rpc'): PosApi {
  const groups = new Map<string, unknown>()
  return new Proxy({} as PosApi, {
    get(_t, group) {
      if (typeof group !== 'string' || group === 'then' || group === 'toJSON') return undefined
      let g = groups.get(group)
      if (!g) {
        const fns = new Map<string, (...a: unknown[]) => Promise<unknown>>()
        g = new Proxy({}, {
          get(_t2, method) {
            if (typeof method !== 'string' || method === 'then' || method === 'toJSON') return undefined
            let f = fns.get(method)
            if (!f) {
              const full = group + '.' + method
              f = (...args: unknown[]) => call(endpoint, full, args)
              fns.set(method, f)
            }
            return f
          }
        })
        groups.set(group, g)
      }
      return g
    }
  })
}
