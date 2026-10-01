/**
 * Dev server: haqiqiy PosService ni HTTP orqali beradi (brauzerda UI ishlab chiqish va e2e testlar uchun).
 *
 *   npm run dev:server                 → ./dev-data/straus.db (mavjud bo'lsa davom etadi)
 *   npm run dev:server -- --reset      → bazani tozalab boshlash (yoki RESET=1)
 *   npm run dev:server -- --demo       → toza baza + tayyor xodimlar (setupOwner o'tgan holat)
 *
 * Endpointlar (port 5174, PORT env bilan o'zgaradi):
 *   POST /rpc            {"method":"rooms.board","args":[...]} → 200 {"result": ...} | 400 {"error": "..."}
 *   POST /rpc?reset=1    (xuddi shu) — avval bazani tozalaydi (faqat test uchun qulaylik)
 *   POST /__test/reset   {"setup"?: boolean, "login"?: "owner"|"admin"|"cashier"|null}
 *                        → toza baza. setup=true bo'lsa: ega/admin/kassir/massajchi + standart ma'lumotlar,
 *                        javob: {ok, staff: {owner:{name,pin..}...}, ids: {owner, admin, cashier, provider}}; login standart 'owner'.
 *   POST /__test/clock   {"now": number} — soatni shu vaqtga muzlatadi; {"advanceMs": number} — oldinga suradi;
 *                        {"now": null} — haqiqiy soatga qaytadi. Javob: {"now": hozirgi vaqt}
 *   GET  /__test/state   → {"now", "frozen", "file"}
 * Login holati: bitta umumiy sessiya (server jarayonida bitta joriy xodim).
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { PosService } from '../electron/main/PosService'
import type { PosHost } from '../electron/main/PosService'
import { invokeApi, parseMethod } from '../electron/main/apiMethods'
import { writeFileAtomic } from '../electron/main/db'

const PORT = Number(process.env.PORT || 5174)
const DATA_DIR = path.resolve(process.env.STRAUS_DATA_DIR || './dev-data')
const DB_FILE = path.join(DATA_DIR, 'straus.db')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

export const TEST_STAFF = {
  owner: { name: 'Ega', role: 'owner' as const, pin: '1234', isProvider: false },
  admin: { name: 'Administrator', role: 'admin' as const, pin: '2222', isProvider: false },
  cashier: { name: 'Kassir', role: 'cashier' as const, pin: '3333', isProvider: false },
  provider: { name: 'Massajchi', role: 'cashier' as const, pin: '4444', isProvider: true }
}

// ───── Boshqariladigan soat ─────
let frozenAt: number | null = null
const clock = (): number => (frozenAt ?? Date.now())

const host: PosHost = {
  printReceipt: async () => {
    /* brauzerda window.print ishlatiladi */
  },
  saveBackup: async (bytes, name) => {
    const p = path.join(BACKUP_DIR, name)
    writeFileAtomic(p, bytes)
    return p
  },
  openBackup: async () => {
    if (!fs.existsSync(BACKUP_DIR)) return null
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (files.length === 0) return null
    return fs.readFileSync(path.join(BACKUP_DIR, files[0].f))
  }
}

let service: PosService

function removeDbFiles(): void {
  for (const f of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    if (f === 'straus.db' || f.startsWith('straus.db.tmp')) fs.rmSync(path.join(DATA_DIR, f), { force: true })
  }
}

async function open(reset: boolean): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (service) service.db.close()
  if (reset) removeDbFiles()
  service = await PosService.create({ file: DB_FILE, clock, host })
}

async function setupStaff(login: keyof typeof TEST_STAFF | null): Promise<Record<string, number>> {
  const o = TEST_STAFF.owner
  await service.auth.setupOwner(o.name, o.pin, 'Straus Sauna')
  const ids: Record<string, number> = {}
  const me = await service.auth.current()
  ids.owner = me!.staff.id
  for (const key of ['admin', 'cashier', 'provider'] as const) {
    const s = await service.staff.save({ ...TEST_STAFF[key], active: true })
    ids[key] = s.id
  }
  await service.auth.logout()
  if (login) await service.auth.login(ids[login], TEST_STAFF[login].pin)
  return ids
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body === undefined ? {} : body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(json)
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 5 * 1024 * 1024) {
        reject(new Error("So'rov juda katta"))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error("JSON noto'g'ri"))
      }
    })
    req.on('error', reject)
  })
}

// So'rovlarni ketma-ket bajaramiz (sql.js bitta ulanish; tranzaksiyalar aralashmasin)
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn)
  queue = p.catch(() => undefined)
  return p
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'OPTIONS') return send(res, 204, undefined)

  if (url.pathname === '/__test/state' && req.method === 'GET') {
    return send(res, 200, { now: clock(), frozen: frozenAt !== null, file: DB_FILE })
  }

  if (req.method !== 'POST') return send(res, 404, { error: 'Topilmadi' })
  const body = (await readBody(req)) as Record<string, unknown>

  if (url.pathname === '/rpc') {
    if (url.searchParams.get('reset') === '1') await serial(() => open(true))
    const m = parseMethod(body.method)
    if (!m) return send(res, 400, { error: "Noma'lum amal: " + String(body.method) })
    const args = Array.isArray(body.args) ? body.args : []
    const result = await serial(() => invokeApi(service, m.group, m.method, args))
    // Uint8Array (bo'lmaydi) va undefined → null
    return send(res, 200, { result: result === undefined ? null : result })
  }

  if (url.pathname === '/__test/reset') {
    const ids = await serial(async () => {
      await open(true)
      if (!body.setup) return null
      const login = body.login === undefined ? 'owner' : (body.login as keyof typeof TEST_STAFF | null)
      return setupStaff(login)
    })
    return send(res, 200, { ok: true, staff: ids ? TEST_STAFF : null, ids })
  }

  if (url.pathname === '/__test/clock') {
    if (body.now === null) frozenAt = null
    else if (typeof body.now === 'number' && Number.isFinite(body.now)) frozenAt = Math.floor(body.now)
    if (typeof body.advanceMs === 'number' && Number.isFinite(body.advanceMs)) frozenAt = clock() + Math.floor(body.advanceMs)
    return send(res, 200, { now: clock(), frozen: frozenAt !== null })
  }

  return send(res, 404, { error: 'Topilmadi' })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const reset = args.includes('--reset') || process.env.RESET === '1'
  const demo = args.includes('--demo')
  await open(reset || demo)
  if (demo) await setupStaff(null)

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof Error) || e.name !== 'PosError') console.error('[dev-server]', e)
      if (!res.headersSent) send(res, 400, { error: msg || "Noma'lum xato" })
    })
  })
  server.listen(PORT, () => {
    console.log(`[dev-server] http://localhost:${PORT}/rpc  baza: ${DB_FILE}${reset || demo ? ' (toza)' : ''}`)
    if (demo) console.log('[dev-server] demo xodimlar: Ega 1234, Administrator 2222, Kassir 3333, Massajchi 4444')
  })
}

void main()
