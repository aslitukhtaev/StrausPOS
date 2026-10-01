/**
 * sql.js (WASM SQLite) yuklovchi.
 *
 * WASM faylni o'zimiz `fs.readFileSync` bilan o'qib `wasmBinary` sifatida beramiz — shunda sql.js fayl yo'lini
 * o'zi qidirmaydi va bir xil kod ishlaydi:
 *   - Node (vitest, tsx dev-server)  → node_modules/sql.js/dist/sql-wasm.wasm
 *   - Electron (dev)                 → node_modules/sql.js/dist/sql-wasm.wasm
 *   - Electron (asar ichida)         → app.asar/node_modules/sql.js/dist/sql-wasm.wasm (Electron fs asar'ni o'qiy oladi)
 *                                      yoki app.asar.unpacked/... yoki out/main/sql-wasm.wasm (agar nusxalangan bo'lsa)
 * sql.js main build'da tashqi (external) modul, electron-builder production dependency sifatida qo'shadi.
 */
import initSqlJs from 'sql.js'
import type { SqlJsStatic } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

let cached: Promise<SqlJsStatic> | null = null

function tryResolve(): string | null {
  // CJS bundle (Electron main) — `require` mavjud
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    if (typeof require === 'function') return require.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    /* davom */
  }
  // ESM (vitest, tsx)
  try {
    const req = createRequire(import.meta.url)
    return req.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    return null
  }
}

/** WASM faylning mumkin bo'lgan joylari (birinchi mavjudi olinadi). */
export function wasmCandidates(): string[] {
  const out: string[] = []
  const envPath = process.env.STRAUS_SQL_WASM
  if (envPath) out.push(envPath)
  const resolved = tryResolve()
  if (resolved) {
    out.push(resolved)
    // asar ichidagi yo'l bo'lsa, unpacked varianti ham
    if (resolved.includes('app.asar' + path.sep)) out.push(resolved.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep))
  }
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath
  if (rp) {
    out.push(path.join(rp, 'app.asar', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
    out.push(path.join(rp, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
    out.push(path.join(rp, 'sql-wasm.wasm'))
  }
  if (typeof __dirname === 'string') out.push(path.join(__dirname, 'sql-wasm.wasm'))
  out.push(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  return out
}

export function readWasmBinary(): Uint8Array {
  const tried: string[] = []
  for (const p of wasmCandidates()) {
    tried.push(p)
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p)
    } catch {
      /* keyingisi */
    }
  }
  throw new Error("Ma'lumotlar bazasi moduli (sql-wasm.wasm) topilmadi: " + tried.join(', '))
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!cached) {
    cached = (async () => {
      const bin = readWasmBinary()
      const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer
      return initSqlJs({ wasmBinary: ab })
    })()
    cached.catch(() => {
      cached = null
    })
  }
  return cached
}
