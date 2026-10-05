/**
 * Dev server: haqiqiy PosService ni HTTP orqali beradi (brauzerda UI ishlab chiqish va e2e testlar uchun).
 *
 *   npm run dev:server                 → ./dev-data/delfin.db (mavjud bo'lsa davom etadi)
 *   npm run dev:server -- --reset      → bazani tozalab boshlash (yoki RESET=1)
 *   npm run dev:server -- --demo       → toza baza + tayyor xodimlar, ofitsiantlar, oshxona bo'limi va namunaviy savdolar
 * Ma'lumotlar papkasi: DELFIN_DATA_DIR (eski nomi STRAUS_DATA_DIR ham qabul qilinadi — e2e moslik).
 *
 * Endpointlar (port 5174, PORT env bilan o'zgaradi):
 *   POST /rpc            {"method":"rooms.board","args":[...]} → 200 {"result": ...} | 400 {"error": "..."}
 *   POST /rpc?reset=1    (xuddi shu) — avval bazani tozalaydi (faqat test uchun qulaylik)
 *   POST /__test/reset   {"setup"?: boolean, "login"?: "owner"|"admin"|"cashier"|null}
 *                        → toza baza. setup=true bo'lsa: ega/admin/kassir/massajchi/2 ofitsiant + standart ma'lumotlar,
 *                        javob: {ok, staff: {owner:{name,pin..}...}, ids: {owner, admin, cashier, provider, waiter1, waiter2}};
 *                        login standart 'owner'.
 *   POST /__test/clock   {"now": number} — soatni shu vaqtga muzlatadi; {"advanceMs": number} — oldinga suradi;
 *                        {"now": null} — haqiqiy soatga qaytadi. Javob: {"now": hozirgi vaqt}
 *   GET  /__test/state   → {"now", "frozen", "file"}
 * Login holati: bitta umumiy sessiya (server jarayonida bitta joriy xodim).
 *
 * Litsenziya:
 *   standart                → holat doim 'active' (e2e buzilmasin; /rpc baribir majburlash o'ramidan o'tadi)
 *   --license-trial         → HAQIQIY litsenziya rejimi: 24 soatlik sinov (DATA_DIR/.dlic + DB), soatni
 *                             /__test/clock bilan surib tekshirish mumkin (masalan {"advanceMs": 90000000} → muddat tugaydi).
 *                             --reset/--demo va /__test/reset .dlic ni ham tozalaydi (sinov qayta boshlanadi).
 *   LICENSE_PUBKEY_B64=...  → (faqat dev-server!) kalit tekshiruvi uchun test ochiq kaliti (SPKI DER base64).
 *
 * Tarmoq (TERMINAL — ikkinchi kompyuter, ofitsiantlar monobloki):
 *   --lan [--code 123456]   → LAN serverni ham ko'taradi (network.setEnabled(true)): http://0.0.0.0:47321 (LAN_PORT env),
 *                             UDP qidiruv 47322 (DISCOVERY_PORT env). --code berilsa ulanish kodi shu bo'ladi.
 *                             Har terminal — alohida login konteksti (bu jarayondagi asosiy login'ga ta'sir qilmaydi).
 *   --terminal-of http://host:47321 --code 123456   (eski nomi --viewer-of ham qabul qilinadi)
 *                           → TERMINAL rejimi: baza ochilmaydi, /rpc so'rovlari Electron'dagi kabi terminal proksisidan
 *                             o'tadi (o'z qulf/login ekrani; barcha amallar asosiyda shu terminal konteksti bilan;
 *                             network.*, system.backup/restore, license.activate, auth.setupOwner — rad).
 *                             connection.connectTerminal/disconnect ham ishlaydi (jarayon ichida rejim almashadi).
 *                             Terminal identifikatori DATA_DIR/connection.json da saqlanadi.
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { PosService } from '../electron/main/PosService'
import type { PosHost } from '../electron/main/PosService'
import { invokeApi, parseMethod } from '../electron/main/apiMethods'
import { writeFileAtomic } from '../electron/main/db'
import type { PosApi } from '../src/shared/api'
import { NetworkManager } from '../electron/main/lan/network'
import { setClientVersion } from '../electron/main/lan/client'
import { DEFAULT_LAN_PORT, DISCOVERY_PORT, isValidCode } from '../electron/main/lan/protocol'
import {
  MAIN_CONFIG, createConnectionController, createTerminalMode, loadConnectionConfig, readConnectionConfig, writeConnectionConfig
} from '../electron/main/lan/terminal'
import type { ConnectionConfig } from '../electron/main/lan/terminal'
import { LicenseManager } from '../electron/main/license/manager'
import { ALWAYS_ACTIVE, createLicensedApi } from '../electron/main/license/guard'
import { localMachine } from '../electron/main/license/machine'
import { DEVELOPER_CONTACT, LICENSE_PUBLIC_KEY_DER_B64 } from '../electron/main/license/publicKey'

const PORT = Number(process.env.PORT || 5174)
const DATA_DIR = path.resolve(process.env.DELFIN_DATA_DIR || process.env.STRAUS_DATA_DIR || './dev-data')
const DB_NAME = 'delfin.db'
const DB_FILE = path.join(DATA_DIR, DB_NAME)
const BUSINESS_NAME = 'Delfin Sauna'
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

const NO_WAITER = { isWaiter: false, commissionPct: 0 }
export const TEST_STAFF = {
  owner: { name: 'Ega', role: 'owner' as const, pin: '1234', isProvider: false, ...NO_WAITER },
  admin: { name: 'Administrator', role: 'admin' as const, pin: '2222', isProvider: false, ...NO_WAITER },
  cashier: { name: 'Kassir', role: 'cashier' as const, pin: '3333', isProvider: false, ...NO_WAITER },
  provider: { name: 'Massajchi', role: 'cashier' as const, pin: '4444', isProvider: true, ...NO_WAITER },
  waiter1: { name: 'Sardor', role: 'waiter' as const, pin: '5555', isProvider: false, isWaiter: true, commissionPct: 10 },
  waiter2: { name: 'Bekzod', role: 'waiter' as const, pin: '6666', isProvider: false, isWaiter: true, commissionPct: 12 }
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
/** --license-trial bo'lsa haqiqiy litsenziya, aks holda null (holat 'active') */
let license: LicenseManager | null = null
let licensedApi: PosApi | null = null
const LICENSE_TRIAL = process.argv.includes('--license-trial') || process.env.LICENSE_TRIAL === '1'
const LICENSE_FILE_NAME = '.dlic'
/** /rpc shu API'ga boradi: asosiy rejimda service, terminal rejimida proksi */
let current: PosApi | null = null
let mode: 'main' | 'terminal' = 'main'

const ARGV = process.argv.slice(2)
function argValue(name: string): string | null {
  const i = ARGV.indexOf(name)
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : null
}
const VERSION = (() => {
  try {
    return String((JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { version?: string }).version || '0.0.0')
  } catch {
    return '0.0.0'
  }
})()
setClientVersion(VERSION)
const CONN_FILE = path.join(DATA_DIR, 'connection.json')
const LAN_PORT = Number(process.env.LAN_PORT || DEFAULT_LAN_PORT)
const UDP_PORT = Number(process.env.DISCOVERY_PORT || DISCOVERY_PORT)

const connection = createConnectionController({
  file: CONN_FILE,
  onChange: (cfg) => applyMode(cfg),
  discoverOpts: { port: UDP_PORT }
})

let network: NetworkManager | null = null
function ensureNetwork(): NetworkManager {
  if (!network) {
    network = new NetworkManager({
      store: { load: () => service.readKv('network'), save: (j) => service.writeKv('network', j) },
      // Har terminal — alohida login konteksti (joriy baza ustida), litsenziya o'rami bilan
      createTerminal: () => createLicensedApi(service.forTerminal(), license ?? ALWAYS_ACTIVE),
      run: serial,
      name: () => service.businessName(),
      version: VERSION,
      clock,
      discoveryPort: UDP_PORT
    })
  }
  return network
}
host.network = {
  status: () => ensureNetwork().status(),
  setEnabled: (on) => ensureNetwork().setEnabled(on),
  regenerateCode: () => ensureNetwork().regenerateCode()
}
host.connection = connection

async function applyMode(cfg: ConnectionConfig): Promise<void> {
  if (cfg.mode === 'terminal') {
    mode = 'terminal'
    const full = loadConnectionConfig(CONN_FILE) // terminalId kafolati
    current = createTerminalMode(full, { file: CONN_FILE, onChange: (c) => applyMode(c), discoverOpts: { port: UDP_PORT } }).api
    console.log(`[dev-server] TERMINAL rejimi → http://${cfg.host}:${cfg.port}`)
  } else {
    mode = 'main'
    if (!service) await open(false)
    current = licensedApi ?? service
    console.log('[dev-server] asosiy rejim')
  }
}

function removeDbFiles(): void {
  for (const f of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    if (f === DB_NAME || f.startsWith(DB_NAME + '.tmp') || (LICENSE_TRIAL && f.startsWith(LICENSE_FILE_NAME))) fs.rmSync(path.join(DATA_DIR, f), { force: true })
  }
}

async function open(reset: boolean): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (service) service.db.close()
  // Eski bazaga bog'langan terminal kontekstlari (login'lar) bekor
  network?.server.clearTerminals()
  if (reset) removeDbFiles()
  service = await PosService.create({ file: DB_FILE, clock, host })
  setupLicense()
  if (mode === 'main') current = licensedApi
}

/** Litsenziya o'rami: majburlash har doim; --license-trial'siz holat 'active' (PosService standarti) */
function setupLicense(): void {
  license?.stop()
  license = null
  host.license = undefined
  if (LICENSE_TRIAL) {
    const svc = service
    license = new LicenseManager({
      clock,
      machine: localMachine(),
      publicKey: process.env.LICENSE_PUBKEY_B64 || LICENSE_PUBLIC_KEY_DER_B64,
      kv: { get: (k) => svc.readKv(k), set: (k, v) => svc.writeKv(k, v) },
      file: path.join(DATA_DIR, LICENSE_FILE_NAME),
      registry: null,
      contact: DEVELOPER_CONTACT
    })
    license.start()
    host.license = license.api()
  }
  licensedApi = createLicensedApi(service, license ?? ALWAYS_ACTIVE)
}

async function setupStaff(login: keyof typeof TEST_STAFF | null): Promise<Record<string, number>> {
  const o = TEST_STAFF.owner
  await service.auth.setupOwner(o.name, o.pin, BUSINESS_NAME)
  const ids: Record<string, number> = {}
  const me = await service.auth.current()
  ids.owner = me!.staff.id
  for (const key of ['admin', 'cashier', 'provider', 'waiter1', 'waiter2'] as const) {
    const s = await service.staff.save({ ...TEST_STAFF[key], active: true })
    ids[key] = s.id
  }
  await service.auth.logout()
  if (login) await service.auth.login(ids[login], TEST_STAFF[login].pin)
  return ids
}

/**
 * --demo: oshxona bo'limi ("Taomlar" → "Oshxona", department='kitchen', ovqatlar) va namunaviy savdolar:
 * xona (ofitsiant qatorda, oshxona cheki) — terminal + naqd; bar savdosi — terminal; bar savdosi — qarz (qarzdor).
 * /__test/reset (e2e) bunga tegmaydi.
 */
async function seedDemo(ids: Record<string, number>): Promise<void> {
  await service.auth.login(ids.owner, TEST_STAFF.owner.pin)
  const old = (await service.catalog.categories()).find((c) => c.name === 'Taomlar')
  const cat = await service.catalog.saveCategory(
    old ? { id: old.id, name: 'Oshxona', department: 'kitchen' } : { name: 'Oshxona', department: 'kitchen' }
  )
  const dishes: [string, number][] = [["Lag'mon", 35_000], ['Osh', 40_000], ['Manti', 30_000], ['Qozon kabob', 60_000], ['Shurva', 30_000]]
  for (const [name, price] of dishes) await service.catalog.saveProduct({ name, price, categoryId: cat.id, trackStock: false, lowStockAt: 0 })
  const products = await service.catalog.products()
  const pid = (name: string): number => {
    const p = products.find((x) => x.name === name)
    if (!p) throw new Error('Demo mahsulot topilmadi: ' + name)
    return p.id
  }
  // Tannarx (sotuvdan oldin — qatorda muzlatiladi); ba'zi mahsulotlarda ataylab 0 (foyda ogohlantirishi uchun)
  for (const p of products) {
    if (['Chips', 'Pista', 'Salat'].includes(p.name) || p.name.startsWith('Yong')) continue
    await service.catalog.saveProduct({ ...p, costPrice: Math.round((p.price * 0.6) / 500) * 500 })
  }
  const room = (await service.rooms.list())[0]
  // 1) Xona: 2 mehmon × 1 soat, Pivo 2 + Lag'mon 2 + Shashlik 1 (Sardor olib bordi) → terminal + naqd
  const s1 = await service.sessions.open(room.id, 2, 60)
  await service.lines.addProducts(
    s1.session.id,
    [{ productId: pid('Pivo 0.5 L'), qty: 2 }, { productId: pid("Lag'mon"), qty: 2 }, { productId: pid('Shashlik'), qty: 1 }],
    null,
    ids.waiter1
  )
  const v1 = await service.sessions.get(s1.session.id)
  await service.checkout.pay(s1.session.id, [{ method: 'terminal', amount: v1.total - 50_000 }, { method: 'cash', amount: 50_000 }], null)
  // 2) Bar savdosi: Osh + Coca-Cola → terminal
  const b1 = await service.barSales.open()
  await service.lines.addProducts(b1.session.id, [{ productId: pid('Osh'), qty: 1 }, { productId: pid('Coca-Cola 1 L'), qty: 1 }], null)
  await service.checkout.pay(b1.session.id, [{ method: 'terminal', amount: (await service.sessions.get(b1.session.id)).total }], null)
  // 3) Bar savdosi: Manti 2 → qarz (qarzdor)
  const b2 = await service.barSales.open()
  await service.lines.addProduct(b2.session.id, pid('Manti'), 2, null)
  await service.checkout.pay(b2.session.id, [{ method: 'debt', amount: (await service.sessions.get(b2.session.id)).total }], {
    name: 'Jasur',
    phone: '+998 90 123 45 67'
  })
  // Xarajatlar (bugun va kecha)
  const cats = await service.expenses.categories()
  const cid = (n: string): number => cats.find((c) => c.name.startsWith(n))!.id
  const pad = (n: number): string => String(n).padStart(2, '0')
  const dayOf = (back: number): string => {
    const d = new Date(clock() - back * 86_400_000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  await service.expenses.save({ day: dayOf(0), categoryId: cid('Ijara'), amount: 3_000_000, note: 'Oylik ijara' })
  await service.expenses.save({ day: dayOf(0), categoryId: cid('Kommunal'), amount: 450_000, note: 'Svet, gaz' })
  await service.expenses.save({ day: dayOf(1), categoryId: cid('Mahsulot xaridi'), amount: 600_000, note: 'Ichimliklar' })
  await service.expenses.save({ day: dayOf(1), categoryId: cid('Reklama'), amount: 150_000, note: '' })
  await service.auth.logout()
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
    return send(res, 200, { now: clock(), frozen: frozenAt !== null, file: DB_FILE, license: license ? license.status() : null })
  }

  if (req.method !== 'POST') return send(res, 404, { error: 'Topilmadi' })
  const body = (await readBody(req)) as Record<string, unknown>

  if (url.pathname === '/rpc') {
    if (url.searchParams.get('reset') === '1' && mode === 'main') await serial(() => open(true))
    const m = parseMethod(body.method)
    if (!m) return send(res, 400, { error: "Noma'lum amal: " + String(body.method) })
    const args = Array.isArray(body.args) ? body.args : []
    const api = current
    if (!api) return send(res, 503, { error: 'Server tayyor emas' })
    const result = await serial(() => invokeApi(api, m.group, m.method, args))
    // Uint8Array (bo'lmaydi) va undefined → null
    return send(res, 200, { result: result === undefined ? null : result })
  }

  if (url.pathname.startsWith('/__test/') && mode === 'terminal') return send(res, 400, { error: 'Terminal rejimida mavjud emas' })

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
    // Soat surilganda litsenziya darhol yangi vaqtni ko'rsin (Electron'da har daqiqada)
    license?.touch()
    return send(res, 200, { now: clock(), frozen: frozenAt !== null })
  }

  return send(res, 404, { error: 'Topilmadi' })
}

async function main(): Promise<void> {
  const args = ARGV
  const reset = args.includes('--reset') || process.env.RESET === '1'
  const demo = args.includes('--demo')
  const terminalOf = argValue('--terminal-of') ?? argValue('--viewer-of')
  const code = argValue('--code')
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const prevConn = readConnectionConfig(CONN_FILE)
  if (terminalOf) {
    const u = new URL(terminalOf)
    if (!isValidCode(code)) throw new Error('--terminal-of uchun --code 6 raqam kerak')
    const cfg: ConnectionConfig = {
      mode: 'terminal', host: u.hostname, port: Number(u.port || DEFAULT_LAN_PORT), code,
      terminalId: prevConn.terminalId, printerName: prevConn.printerName
    }
    writeConnectionConfig(CONN_FILE, cfg)
    await applyMode(cfg)
  } else {
    writeConnectionConfig(CONN_FILE, { ...MAIN_CONFIG, terminalId: prevConn.terminalId, printerName: prevConn.printerName })
    await open(reset || demo)
    if (demo) await seedDemo(await setupStaff(null))
    if (args.includes('--lan')) {
      if (code !== null) {
        if (!isValidCode(code)) throw new Error('--code 6 raqam bo‘lishi kerak')
        service.writeKv('network', JSON.stringify({ enabled: true, port: LAN_PORT, code }))
      } else {
        const prev = service.readKv('network')
        const j = prev ? (JSON.parse(prev) as Record<string, unknown>) : {}
        service.writeKv('network', JSON.stringify({ ...j, port: LAN_PORT }))
      }
      const st = await ensureNetwork().setEnabled(true)
      console.log(`[dev-server] LAN server: http://0.0.0.0:${st.port}  kod: ${st.code}  manzillar: ${st.addresses.join(', ') || '-'}  (UDP ${UDP_PORT})`)
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof Error) || e.name !== 'PosError') console.error('[dev-server]', e)
      if (!res.headersSent) send(res, 400, { error: msg || "Noma'lum xato" })
    })
  })
  server.listen(PORT, () => {
    console.log(`[dev-server] http://localhost:${PORT}/rpc  ${mode === 'terminal' ? "(terminal, baza yo'q)" : 'baza: ' + DB_FILE + (reset || demo ? ' (toza)' : '')}`)
    if (demo)
      console.log('[dev-server] demo xodimlar: Ega 1234, Administrator 2222, Kassir 3333, Massajchi 4444, ofitsiantlar: Sardor 5555 (10%), Bekzod 6666 (12%)')
  })
}

void main()
