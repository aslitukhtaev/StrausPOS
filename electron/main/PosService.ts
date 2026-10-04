/**
 * PosService — Delfin Sauna ning barcha biznes mantig'i (PosApi shartnomasi).
 * Electron (IPC), dev-server (HTTP /rpc) va testlar shu bitta klassdan foydalanadi.
 *
 *  - Har bir metod ruxsatni `can(role, perm)` bilan tekshiradi.
 *  - Vaqt manbai `clock` inject qilinadi (testlarda soxta soat).
 *  - Mutatsiyalar `db.tx()` ichida — atomik, muvaffaqiyatdan keyin darhol faylga yoziladi.
 *  - Xato matnlari o'zbekcha (UI to'g'ridan-to'g'ri ko'rsatadi).
 */
import type { PosApi, StaffInput } from '../../src/shared/api'
import type {
  AppSettings, Debt, DebtPayment, DebtorInput, Guest, GuestState, Id, OrderLine, Payment, PaymentInput, PayMethod,
  Permission, Product, ProductCategory, ReceiptData, ReceiptSettings, ReportRange, ReturnRecord, Role, Room, RoomCard,
  SalesReport, ServiceItem, Session, SessionKind, SessionView, Staff, TimeInterval, WaiterMonthRow, WaiterPayout, WaiterSessionRow,
  BarSaleRow
} from '../../src/shared/types'
import { ROLE_PERMISSIONS, can } from '../../src/shared/permissions'
import {
  MS_MIN, buildGuestView, buildLineView, computeTotals, waiterCommission, waiterProductSales
} from '../../src/shared/billing'
import type { BillingOptions } from '../../src/shared/billing'
import { Db } from './db'
import { hashPin, isValidPin, verifyPin } from './pin'
import { renderReceiptHtml } from './receipt'

// ───────────── Tashqi muhit (Electron / dev-server) ─────────────
export interface PosHost {
  /** Chekni chop etish. Xato bo'lsa tushunarli Error tashlaydi. */
  printReceipt?(html: string, settings: ReceiptSettings): Promise<void>
  /** Tizim printerlari ro'yxati */
  listPrinters?(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
  /** Zaxira baytlarini saqlash (masalan fayl dialogi). Bekor qilinsa null. */
  saveBackup?(bytes: Uint8Array, suggestedName: string): Promise<string | null>
  /** Tiklash uchun zaxira faylni tanlash. Bekor qilinsa null. */
  openBackup?(): Promise<Uint8Array | null>
  /** LAN server boshqaruvi (asosiy kompyuter). Yo'q bo'lsa network.* xato beradi. */
  network?: PosApi['network']
  /** Ulanish rejimi (lokal konfiguratsiya). Yo'q bo'lsa: asosiy rejim, ulanish o'zgartirib bo'lmaydi. */
  connection?: PosApi['connection']
  /** Litsenziya (electron/main/license). Yo'q bo'lsa (testlar, dev-server standart) — holat doim 'active'. */
  license?: PosApi['license']
}

/** Ko'ruvchi (LAN, faqat o'qish) kontekstining sintetik xodimi — mavjud xodim emas (id 0). */
export const VIEWER_STAFF: Staff = {
  id: 0, name: "Ko'ruvchi", role: 'cashier', active: true, isProvider: false, isWaiter: false, commissionPct: 0
}
export const VIEWER_PERMISSIONS: Permission[] = ['reports.view']
export const VIEW_ONLY_ERROR = "Bu kompyuter faqat ko'rish rejimida"

export interface PosServiceOptions {
  clock?: () => number
  host?: PosHost
  /** Bo'sh bazaga standart xonalar/katalog/xizmatlarni darhol qo'shish (xodimlar yaratilmaydi) */
  seedDemo?: boolean
}

export class PosError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PosError'
  }
}

function fail(msg: string): never {
  throw new PosError(msg)
}

// ───────────── Standart qiymatlar ─────────────
export const DEFAULT_SETTINGS: AppSettings = {
  receipt: {
    businessName: 'Delfin Sauna',
    address: '',
    phone: '',
    footer: 'Tashrifingiz uchun rahmat!',
    paperWidth: 80,
    showGuestBreakdown: true,
    showStaff: true,
    showTimes: true,
    autoPrintOnPay: false,
    printerName: ''
  },
  roundTo: 1000,
  defaultHours: 1,
  blockMinutes: 60,
  graceMinutes: 0,
  warnBeforeMinutes: 10,
  theme: 'auto',
  lockEnabled: true,
  autoLockMinutes: 0,
  language: 'uz'
}

const PERMISSION_DENIED = "Bu amal uchun ruxsatingiz yo'q"
const LOGIN_REQUIRED = 'Avval tizimga kiring'
const MAX_LOGIN_FAILS = 5
const LOGIN_LOCK_MS = 30_000
/** Bir martada olinadigan / qo'shiladigan vaqt chegarasi (daqiqa) */
const MAX_PAID_MINUTES = 24 * 60
/** Ochilgandan keyin shuncha vaqt o'tsa, kassir sessiyani bekor qila olmaydi (administrator kerak) */
const CANCEL_FREE_MS = MS_MIN
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
/** Xonasiz bar savdosi uchun sintetik xona (SessionView.room) */
export const BAR_ROOM: Room = { id: 0, name: 'Bar', pricePerHour: 0, capacity: 0, active: true, sortOrder: 0 }
/** Hisobotdagi byRoom qatori nomi (xonasiz bar savdolari) */
export const BAR_REPORT_ROOM_NAME = 'Bar (xonasiz)'
const BAR_NO_GUESTS = "Bar savdosida mehmonlar yo'q — bu amal faqat xona uchun"
const BAR_NO_TIME = "Bar savdosida vaqt hisoblanmaydi — bu amal faqat xona uchun"

// ───────────── Qator turlari (DB) ─────────────
interface StaffRow {
  id: number; name: string; role: Role; pin_hash: string; active: number; is_provider: number; is_waiter: number; commission_pct: number
}
interface RoomRow { id: number; name: string; price_per_hour: number; capacity: number; active: number; sort_order: number; deleted: number }
interface CategoryRow { id: number; name: string; sort_order: number }
interface ProductRow { id: number; category_id: number; name: string; price: number; stock: number; track_stock: number; low_stock_at: number; active: number; deleted: number }
interface ServiceRow { id: number; name: string; price: number; duration_min: number | null; active: number; deleted: number }
interface SessionRow {
  id: number; kind: SessionKind; room_id: number | null; status: 'open' | 'closed'; opened_at: number; closed_at: number | null; opened_by: number
  closed_by: number | null; discount: number; note: string; cancelled: number; receipt_no: number | null
  time_total: number | null; lines_total: number | null; discount_applied: number | null; total: number | null
  waiter_id: number | null; waiter_pct: number; product_sales: number | null; waiter_commission: number | null
}
interface GuestRow { id: number; session_id: number; label: string; state: GuestState; paid_minutes: number }
interface IntervalRow { id: number; guest_id: number; room_id: number; rate: number; start: number; end: number | null }
interface LineRow {
  id: number; session_id: number; guest_id: number | null; kind: 'product' | 'service'; ref_id: number; name: string
  unit_price: number; qty: number; returned_qty: number; provider_id: number | null; created_at: number; created_by: number
}
interface PaymentRow { id: number; session_id: number; method: PayMethod; amount: number; at: number; by: number }
interface DebtRow { id: number; session_id: number | null; customer_name: string; phone: string; amount: number; paid: number; created_at: number; closed_at: number | null }
interface DebtPaymentRow { id: number; debt_id: number; method: 'cash' | 'card'; amount: number; at: number; by: number }
interface ReturnRow { id: number; line_id: number; session_id: number; qty: number; reason: string; at: number; by: number }
interface PayoutRow { id: number; staff_id: number; month: string; amount: number; note: string; at: number; by: number }

const toStaff = (r: StaffRow): Staff => ({
  id: r.id, name: r.name, role: r.role, active: !!r.active, isProvider: !!r.is_provider, isWaiter: !!r.is_waiter, commissionPct: r.commission_pct ?? 0
})
const toRoom = (r: RoomRow): Room => ({ id: r.id, name: r.name, pricePerHour: r.price_per_hour, capacity: r.capacity, active: !!r.active, sortOrder: r.sort_order })
const toCategory = (r: CategoryRow): ProductCategory => ({ id: r.id, name: r.name, sortOrder: r.sort_order })
const toProduct = (r: ProductRow): Product => ({
  id: r.id, categoryId: r.category_id, name: r.name, price: r.price, stock: r.stock, trackStock: !!r.track_stock, lowStockAt: r.low_stock_at, active: !!r.active
})
const toService = (r: ServiceRow): ServiceItem => ({ id: r.id, name: r.name, price: r.price, durationMin: r.duration_min, active: !!r.active })
const toSession = (r: SessionRow): Session => ({
  id: r.id, kind: r.kind === 'bar' ? 'bar' : 'room', roomId: r.kind === 'bar' ? 0 : r.room_id ?? 0, status: r.status, openedAt: r.opened_at, closedAt: r.closed_at, openedBy: r.opened_by, discount: r.discount, note: r.note,
  waiterId: r.waiter_id ?? null, waiterPct: r.waiter_pct ?? 0
})
const toInterval = (r: IntervalRow): TimeInterval => ({ roomId: r.room_id, rate: r.rate, start: r.start, end: r.end })
const toLine = (r: LineRow): OrderLine => ({
  id: r.id, sessionId: r.session_id, guestId: r.guest_id, kind: r.kind, refId: r.ref_id, name: r.name, unitPrice: r.unit_price,
  qty: r.qty, returnedQty: r.returned_qty, providerId: r.provider_id, createdAt: r.created_at, createdBy: r.created_by
})
const toPayment = (r: PaymentRow): Payment => ({ id: r.id, sessionId: r.session_id, method: r.method, amount: r.amount, at: r.at, by: r.by })
const toDebt = (r: DebtRow): Debt => ({
  id: r.id, sessionId: r.session_id, customerName: r.customer_name, phone: r.phone, amount: r.amount, paid: r.paid, createdAt: r.created_at, closedAt: r.closed_at
})
const toDebtPayment = (r: DebtPaymentRow): DebtPayment => ({ id: r.id, debtId: r.debt_id, method: r.method, amount: r.amount, at: r.at, by: r.by })
const toReturn = (r: ReturnRow): ReturnRecord => ({ id: r.id, lineId: r.line_id, sessionId: r.session_id, qty: r.qty, reason: r.reason, at: r.at, by: r.by })
const toPayout = (r: PayoutRow): WaiterPayout => ({ id: r.id, staffId: r.staff_id, month: r.month, amount: r.amount, note: r.note, at: r.at, by: r.by })

// ───────────── Tekshiruv yordamchilari ─────────────
function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}
function reqInt(n: unknown, msg: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!isInt(n) || n < min || n > max) fail(msg)
  return n
}
function reqText(s: unknown, msg: string, max = 100): string {
  const t = typeof s === 'string' ? s.trim() : ''
  if (!t) fail(msg)
  if (t.length > max) fail(`Matn juda uzun (ko'pi bilan ${max} belgi)`)
  return t
}
function optText(s: unknown, max = 500): string {
  const t = typeof s === 'string' ? s.trim() : ''
  return t.length > max ? t.slice(0, max) : t
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}
function b2i(b: boolean): number {
  return b ? 1 : 0
}
function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}
function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
/** 'YYYY-MM' → mahalliy vaqt bo'yicha [oy boshi, keyingi oy boshi) */
function monthRange(month: unknown): { month: string; from: number; to: number } {
  const m = typeof month === 'string' ? MONTH_RE.exec(month) : null
  if (!m) fail("Oy noto'g'ri (YYYY-MM ko'rinishida bo'lishi kerak)")
  const y = Number(m[1])
  const mo = Number(m[2])
  return { month: m[0], from: new Date(y, mo - 1, 1).getTime(), to: new Date(y, mo, 1).getTime() }
}
/** Ofitsiant foizi: 0..100, ko'pi bilan 2 kasr xona */
function reqPct(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) fail("Foiz 0 dan 100 gacha bo'lishi kerak")
  return Math.round(v * 100) / 100
}
function reqMinutes(v: unknown, what: string): number {
  return reqInt(v, `${what} 1 dan ${MAX_PAID_MINUTES} daqiqagacha butun son bo'lishi kerak`, 1, MAX_PAID_MINUTES)
}

function sanitizeSettings(input: unknown, base: AppSettings): AppSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<AppSettings>
  const r = (s.receipt && typeof s.receipt === 'object' ? s.receipt : {}) as Partial<ReceiptSettings>
  const b = base.receipt
  const paperWidth = r.paperWidth === undefined ? b.paperWidth : r.paperWidth
  if (paperWidth !== 58 && paperWidth !== 80) fail("Chek qog'ozi kengligi 58 yoki 80 mm bo'lishi kerak")
  const roundTo = s.roundTo === undefined ? base.roundTo : s.roundTo
  reqInt(roundTo, "Yaxlitlash qiymati musbat butun son bo'lishi kerak", 1, 1_000_000)
  const autoLock = s.autoLockMinutes === undefined ? base.autoLockMinutes : s.autoLockMinutes
  reqInt(autoLock, "Avto-qulf daqiqasi 0 yoki musbat butun son bo'lishi kerak", 0, 24 * 60)
  const pick = <K extends keyof AppSettings>(k: K): AppSettings[K] => (s[k] === undefined ? base[k] : (s[k] as AppSettings[K]))
  const defaultHours = reqInt(pick('defaultHours'), "Standart soat 1 dan 24 gacha butun son bo'lishi kerak", 1, 24)
  const blockMinutes = reqInt(pick('blockMinutes'), "Blok daqiqasi 1 dan 1440 gacha butun son bo'lishi kerak", 1, 24 * 60)
  const graceMinutes = reqInt(pick('graceMinutes'), "Imtiyozli daqiqalar 0 dan 1440 gacha butun son bo'lishi kerak", 0, 24 * 60)
  const warnBeforeMinutes = reqInt(pick('warnBeforeMinutes'), "Ogohlantirish daqiqasi 0 dan 1440 gacha butun son bo'lishi kerak", 0, 24 * 60)
  const theme = pick('theme')
  if (theme !== 'light' && theme !== 'dark' && theme !== 'auto') fail("Interfeys rejimi noto'g'ri")
  const str = (v: unknown, d: string, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : d)
  return {
    receipt: {
      businessName: str(r.businessName, b.businessName, 100),
      address: str(r.address, b.address, 200),
      phone: str(r.phone, b.phone, 50),
      footer: str(r.footer, b.footer, 300),
      paperWidth,
      showGuestBreakdown: bool(r.showGuestBreakdown, b.showGuestBreakdown),
      showStaff: bool(r.showStaff, b.showStaff),
      showTimes: bool(r.showTimes, b.showTimes),
      autoPrintOnPay: bool(r.autoPrintOnPay, b.autoPrintOnPay),
      printerName: str(r.printerName, b.printerName, 200)
    },
    roundTo,
    defaultHours,
    blockMinutes,
    graceMinutes,
    warnBeforeMinutes,
    theme,
    lockEnabled: bool(s.lockEnabled, base.lockEnabled),
    autoLockMinutes: autoLock,
    language: 'uz'
  }
}

// ───────────── Servis ─────────────
export class PosService implements PosApi {
  readonly db: Db
  clock: () => number
  host: PosHost
  private currentId: Id | null = null
  private loginFails = new Map<Id, { count: number; until: number }>()
  /** true → ko'ruvchi konteksti (forViewer): login yo'q, faqat o'qish */
  private readonly viewer: boolean = false

  constructor(db: Db, opts: PosServiceOptions = {}) {
    this.db = db
    this.clock = opts.clock ?? (() => Date.now())
    this.host = opts.host ?? {}
    if (opts.seedDemo) this.seedDefaults()
  }

  /**
   * Ko'ruvchi konteksti: o'sha Db ustida alohida servis, sintetik ko'ruvchi bilan.
   * Asosiy kontekstning login holatiga (currentId) ta'sir qilmaydi va unga bog'liq emas.
   * Ruxsatlar: faqat VIEWER_PERMISSIONS + o'qish metodlari (needRead); yozish amallari rad etiladi.
   */
  forViewer(): PosService {
    const v = new PosService(this.db, { clock: () => this.clock(), host: {} })
    ;(v as unknown as { viewer: boolean }).viewer = true
    return v
  }

  get isViewer(): boolean {
    return this.viewer
  }

  /** Lokal kalit-qiymat (masalan tarmoq sozlamasi). Ruxsat tekshiruvi chaqiruvchida. */
  readKv(key: string): string | null {
    return this.db.get<{ value: string }>('SELECT value FROM kv WHERE key=?', [key])?.value ?? null
  }

  writeKv(key: string, value: string): void {
    this.db.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value])
  }

  /** Bazani ochib servis yaratish. file=null → faqat xotirada. */
  static async create(opts: PosServiceOptions & { file?: string | null } = {}): Promise<PosService> {
    const db = await Db.open({ file: opts.file ?? null })
    return new PosService(db, opts)
  }

  // ═════════════ Ichki yordamchilar ═════════════
  private now(): number {
    return this.clock()
  }

  private loadSettings(): AppSettings {
    const row = this.db.get<{ value: string }>("SELECT value FROM kv WHERE key='settings'")
    if (!row) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings
    try {
      return sanitizeSettings(JSON.parse(row.value), DEFAULT_SETTINGS)
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings
    }
  }

  private billingOpts(s: AppSettings = this.loadSettings()): BillingOptions {
    return { roundTo: s.roundTo, blockMinutes: s.blockMinutes, graceMinutes: s.graceMinutes }
  }

  /** Biriktirish uchun ofitsiant: mavjud, faol va isWaiter bo'lishi shart. */
  private waiterRow(id: unknown): StaffRow {
    const r = isInt(id) ? this.staffRow(id) : undefined
    if (!r || !r.is_waiter) fail('Ofitsiant topilmadi')
    if (!r.active) fail('Ofitsiant faol emas')
    return r
  }

  private storeSettings(s: AppSettings): void {
    this.db.run("INSERT INTO kv(key, value) VALUES('settings', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [JSON.stringify(s)])
  }

  private staffRow(id: Id): StaffRow | undefined {
    return this.db.get<StaffRow>('SELECT * FROM staff WHERE id=?', [id])
  }

  private me(): Staff | null {
    if (this.viewer) return { ...VIEWER_STAFF }
    if (this.currentId == null) return null
    const r = this.staffRow(this.currentId)
    if (!r || !r.active) {
      this.currentId = null
      return null
    }
    return toStaff(r)
  }

  private requireLogin(): Staff {
    const s = this.me()
    if (!s) {
      const auto = this.autoLoginIfUnlocked()
      if (auto) return auto
      fail(LOGIN_REQUIRED)
    }
    return s
  }

  private need(perm: Permission): Staff {
    const s = this.requireLogin()
    if (this.viewer) {
      if (!VIEWER_PERMISSIONS.includes(perm)) fail(VIEW_ONLY_ERROR)
      return s
    }
    if (!can(s.role, perm)) fail(PERMISSION_DENIED)
    return s
  }

  /** O'qish uchun ruxsat: ko'ruvchi kontekstiga ham ochiq (faqat ma'lumot ko'rish metodlarida). */
  private needRead(perm: Permission): Staff {
    if (this.viewer) return this.requireLogin()
    return this.need(perm)
  }

  /** Ko'ruvchi kontekstida yozish/maxsus amallarni rad etish. */
  private noViewer(): void {
    if (this.viewer) fail(VIEW_ONLY_ERROR)
  }

  /** Qulf o'chirilgan bo'lsa — birinchi faol ega avtomatik kiritiladi. */
  private autoLoginIfUnlocked(): Staff | null {
    if (this.viewer) return null
    if (this.loadSettings().lockEnabled) return null
    const r = this.db.get<StaffRow>("SELECT * FROM staff WHERE role='owner' AND active=1 ORDER BY id LIMIT 1")
    if (!r) return null
    this.currentId = r.id
    return toStaff(r)
  }

  private authInfo(s: Staff): { staff: Staff; permissions: Permission[] } {
    if (this.viewer) return { staff: s, permissions: [...VIEWER_PERMISSIONS] }
    return { staff: s, permissions: [...ROLE_PERMISSIONS[s.role]] }
  }

  private roomRow(id: Id): RoomRow {
    const r = this.db.get<RoomRow>('SELECT * FROM rooms WHERE id=? AND deleted=0', [id])
    if (!r) fail('Xona topilmadi')
    return r
  }

  private sessionRow(id: Id): SessionRow {
    const r = this.db.get<SessionRow>('SELECT * FROM sessions WHERE id=?', [id])
    if (!r) fail('Sessiya topilmadi')
    return r
  }

  private openSessionRow(id: Id): SessionRow {
    const r = this.sessionRow(id)
    if (r.status !== 'open') fail('Sessiya yopilgan')
    return r
  }

  private openSessionForRoom(roomId: Id): SessionRow | undefined {
    return this.db.get<SessionRow>("SELECT * FROM sessions WHERE kind='room' AND room_id=? AND status='open'", [roomId])
  }

  /** Faqat xona sessiyasi uchun amallar: bar savdosida tushunarli xato bilan rad etiladi. */
  private requireRoomSession(s: SessionRow, msg: string): SessionRow & { room_id: number } {
    if (s.kind === 'bar' || s.room_id == null) fail(msg)
    return s as SessionRow & { room_id: number }
  }

  /** Mehmon amallari: mehmonning ochiq xona sessiyasi */
  private guestSession(g: GuestRow): SessionRow & { room_id: number } {
    return this.requireRoomSession(this.openSessionRow(g.session_id), BAR_NO_GUESTS)
  }

  private guestRow(id: Id): GuestRow {
    const g = this.db.get<GuestRow>('SELECT * FROM guests WHERE id=?', [id])
    if (!g) fail('Mehmon topilmadi')
    return g
  }

  private activeGuestCount(sessionId: Id): number {
    const r = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM guests WHERE session_id=? AND state<>'finished'", [sessionId])
    return r?.n ?? 0
  }

  private openInterval(guestId: Id, roomId: Id, rate: number, start: number): void {
    this.db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(?,?,?,?,NULL)', [guestId, roomId, rate, start])
  }

  private closeIntervals(guestId: Id, end: number): void {
    this.db.run('UPDATE intervals SET end=? WHERE guest_id=? AND end IS NULL', [end, guestId])
  }

  private loadGuests(sessionId: Id): Guest[] {
    const gs = this.db.all<GuestRow>('SELECT * FROM guests WHERE session_id=? ORDER BY id', [sessionId])
    const ivs = this.db.all<IntervalRow>(
      'SELECT i.* FROM intervals i JOIN guests g ON g.id=i.guest_id WHERE g.session_id=? ORDER BY i.start, i.id',
      [sessionId]
    )
    return gs.map((g) => ({
      id: g.id,
      sessionId: g.session_id,
      label: g.label,
      state: g.state,
      intervals: ivs.filter((i) => i.guest_id === g.id).map(toInterval),
      paidMinutes: g.paid_minutes ?? 0
    }))
  }

  private staffNames(): Map<Id, string> {
    const m = new Map<Id, string>()
    for (const r of this.db.all<{ id: number; name: string }>('SELECT id, name FROM staff')) m.set(r.id, r.name)
    return m
  }

  /** Sessiyaning to'liq ko'rinishi (hisob-kitob bilan). Yopiq sessiyada `now` = yopilgan vaqt. */
  private view(sessionId: Id, nowArg?: number): SessionView {
    const sr = this.sessionRow(sessionId)
    const now = sr.status === 'closed' && sr.closed_at != null ? sr.closed_at : nowArg ?? this.now()
    let room: Room
    if (sr.kind === 'bar') room = { ...BAR_ROOM }
    else {
      const roomR = this.db.get<RoomRow>('SELECT * FROM rooms WHERE id=?', [sr.room_id])
      if (!roomR) fail('Xona topilmadi')
      room = toRoom(roomR)
    }
    const settings = this.loadSettings()
    const guests = this.loadGuests(sessionId)
    const lines = this.db.all<LineRow>('SELECT * FROM order_lines WHERE session_id=? ORDER BY id', [sessionId]).map(toLine)
    const names = this.staffNames()
    const opts = this.billingOpts(settings)
    const guestViews = guests.map((g) => buildGuestView(g, lines, now, opts))
    const lineViews = lines.map((l) => buildLineView(l, l.providerId != null ? names.get(l.providerId) ?? null : null))
    const totals = computeTotals(guestViews, lineViews, sr.discount)
    const payments = this.db.all<PaymentRow>('SELECT * FROM payments WHERE session_id=? ORDER BY id', [sessionId]).map(toPayment)
    const paid = payments.reduce((s, p) => s + p.amount, 0)
    return {
      session: toSession(sr),
      room,
      waiterName: sr.waiter_id != null ? names.get(sr.waiter_id) ?? null : null,
      guests: guestViews,
      lines: lineViews,
      computedAt: now,
      timeTotal: totals.timeTotal,
      linesTotal: totals.linesTotal,
      discount: totals.discount,
      total: totals.total,
      paid,
      due: Math.max(0, totals.total - paid),
      payments
    }
  }

  private buildReceipt(sessionId: Id): ReceiptData {
    const v = this.view(sessionId)
    const sr = this.sessionRow(sessionId)
    const settings = this.loadSettings()
    const names = this.staffNames()
    const labelOf = new Map(v.guests.map((g) => [g.id, g.label]))
    const debtRow = this.db.get<DebtRow>('SELECT * FROM debts WHERE session_id=? ORDER BY id LIMIT 1', [sessionId])
    // Bir xil usuldagi to'lovlarni birlashtiramiz
    const byMethod = new Map<PayMethod, number>()
    for (const p of v.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
    return {
      settings: settings.receipt,
      receiptNo: sr.receipt_no ?? 0,
      roomName: v.room.name,
      openedAt: sr.opened_at,
      closedAt: sr.closed_at ?? v.computedAt,
      cashier: names.get(sr.closed_by ?? sr.opened_by) ?? '',
      guests: v.guests.map((g) => ({ label: g.label, elapsedMs: g.elapsedMs, timeAmount: g.timeAmount })),
      lines: v.lines
        .filter((l) => l.activeQty > 0)
        .map((l) => ({
          name: l.name,
          qty: l.activeQty,
          unitPrice: l.unitPrice,
          amount: l.amount,
          guestLabel: l.guestId != null ? labelOf.get(l.guestId) ?? null : null,
          providerName: l.providerName
        })),
      timeTotal: v.timeTotal,
      linesTotal: v.linesTotal,
      discount: v.discount,
      total: v.total,
      payments: Array.from(byMethod, ([method, amount]) => ({ method, amount })),
      debtor: debtRow ? { name: debtRow.customer_name, phone: debtRow.phone } : null
    }
  }

  private addStockMove(productId: Id, delta: number, reason: string, lineId: Id | null, by: Id | null): void {
    this.db.run('INSERT INTO stock_moves(product_id, delta, reason, line_id, at, by) VALUES(?,?,?,?,?,?)', [
      productId, delta, reason, lineId, this.now(), by
    ])
  }

  /** Standart xonalar, kategoriyalar, mahsulotlar, xizmatlar (faqat bo'sh bazaga). */
  private seedDefaults(): void {
    const has = this.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM rooms) + (SELECT COUNT(*) FROM categories) + (SELECT COUNT(*) FROM services) AS n')
    if ((has?.n ?? 0) > 0) return
    this.db.tx(() => {
      const rooms: [string, number, number][] = [
        ['Sauna 1', 50_000, 6],
        ['Sauna 2', 60_000, 8],
        ['VIP xona', 100_000, 10]
      ]
      rooms.forEach(([name, price, cap], i) =>
        this.db.run('INSERT INTO rooms(name, price_per_hour, capacity, active, sort_order) VALUES(?,?,?,1,?)', [name, price, cap, i + 1])
      )
      const cats: [string, [string, number, number][]][] = [
        ['Ichimliklar', [['Suv 0.5 L', 5_000, 48], ['Coca-Cola 1 L', 15_000, 24], ['Sharbat 1 L', 18_000, 12], ['Pivo 0.5 L', 20_000, 24]]],
        ['Choy va qahva', [['Ko‘k choy (choynak)', 10_000, 0], ['Qora choy (choynak)', 10_000, 0], ['Qahva', 15_000, 0]]],
        ['Taomlar', [['Shashlik', 25_000, 0], ['Non', 4_000, 0], ['Salat', 20_000, 0]]],
        ['Gazaklar', [['Chips', 12_000, 20], ['Yong‘oq', 15_000, 20], ['Pista', 25_000, 10]]]
      ]
      cats.forEach(([cat, products], i) => {
        const catId = this.db.insert('INSERT INTO categories(name, sort_order) VALUES(?,?)', [cat, i + 1])
        for (const [name, price, stock] of products) {
          const track = stock > 0 ? 1 : 0
          this.db.run(
            'INSERT INTO products(category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(?,?,?,?,?,?,1)',
            [catId, name, price, stock, track, track ? 5 : 0]
          )
        }
      })
      const services: [string, number, number | null][] = [
        ['Klassik massaj', 150_000, 60],
        ['Peeling', 80_000, 30],
        ['Supurgi (venik)', 30_000, null]
      ]
      for (const [name, price, dur] of services)
        this.db.run('INSERT INTO services(name, price, duration_min, active) VALUES(?,?,?,1)', [name, price, dur])
    })
  }

  /** Biznes nomi (LAN e'lon / hello uchun; maxfiy emas). */
  businessName(): string {
    return this.loadSettings().receipt.businessName || 'Delfin Sauna'
  }

  /** Interfeys rejimi (Electron oyna foni uchun; ruxsat talab qilinmaydi — maxfiy emas). */
  currentTheme(): AppSettings['theme'] {
    return this.loadSettings().theme
  }

  // ═════════════ Zaxira (to'g'ridan-to'g'ri, testlar va host uchun) ═════════════
  /** Bazaning to'liq nusxasi (sql.js eksport baytlari). */
  exportBytes(): Uint8Array {
    return this.db.export()
  }

  /** Bazani zaxiradan tiklash. Joriy foydalanuvchi chiqariladi. */
  async restoreBytes(bytes: Uint8Array): Promise<void> {
    await this.db.replace(bytes)
    this.currentId = null
    this.loginFails.clear()
  }

  // ═════════════ AUTH ═════════════
  auth: PosApi['auth'] = {
    listLoginStaff: async () =>
      this.db
        .all<StaffRow>("SELECT * FROM staff WHERE active=1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END, name")
        .map(toStaff),

    login: async (staffId, pin) => {
      this.noViewer()
      const now = this.now()
      const r = isInt(staffId) ? this.staffRow(staffId) : undefined
      if (!r) fail('Xodim topilmadi')
      if (!r.active) fail('Xodim faol emas')
      const lock = this.loginFails.get(r.id)
      if (lock && lock.until > now) fail(`Juda ko'p noto'g'ri urinish. ${Math.ceil((lock.until - now) / 1000)} soniyadan keyin qayta urinib ko'ring`)
      if (typeof pin !== 'string' || !verifyPin(pin, r.pin_hash)) {
        const count = (lock && lock.until <= now && lock.until > 0 ? 0 : lock?.count ?? 0) + 1
        this.loginFails.set(r.id, { count, until: count >= MAX_LOGIN_FAILS ? now + LOGIN_LOCK_MS : 0 })
        fail("PIN noto'g'ri")
      }
      this.loginFails.delete(r.id)
      this.currentId = r.id
      return this.authInfo(toStaff(r))
    },

    logout: async () => {
      this.noViewer()
      this.currentId = null
    },

    current: async () => {
      const s = this.me() ?? this.autoLoginIfUnlocked()
      return s ? this.authInfo(s) : null
    },

    needsSetup: async () => (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM staff')?.n ?? 0) === 0,

    setupOwner: async (name, pin, businessName) => {
      this.noViewer()
      if (!(await this.auth.needsSetup())) fail("Dastur allaqachon sozlangan")
      const n = reqText(name, 'Ismni kiriting', 60)
      if (!isValidPin(pin)) fail("PIN 4–8 ta raqamdan iborat bo'lishi kerak")
      const biz = reqText(businessName, 'Biznes nomini kiriting', 100)
      const id = this.db.tx(() => {
        const sid = this.db.insert('INSERT INTO staff(name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(?,?,?,1,0,0,0,?)', [
          n, 'owner', hashPin(pin), this.now()
        ])
        const s = this.loadSettings()
        s.receipt.businessName = biz
        this.storeSettings(s)
        this.seedDefaults()
        return sid
      })
      this.currentId = id
    }
  }

  // ═════════════ ROOMS ═════════════
  rooms: PosApi['rooms'] = {
    board: async () => {
      this.requireLogin()
      const now = this.now()
      const rooms = this.db.all<RoomRow>(
        `SELECT * FROM rooms r WHERE (r.deleted=0 AND r.active=1)
           OR EXISTS (SELECT 1 FROM sessions s WHERE s.kind='room' AND s.room_id=r.id AND s.status='open')
         ORDER BY r.sort_order, r.id`
      )
      return rooms.map((r): RoomCard => {
        const s = this.openSessionForRoom(r.id)
        const view = s ? this.view(s.id, now) : null
        return {
          room: toRoom(r),
          session: view,
          guestsActive: view ? view.guests.filter((g) => g.state !== 'finished').length : 0,
          currentTotal: view ? view.total : 0
        }
      })
    },

    list: async () => {
      this.requireLogin()
      return this.db.all<RoomRow>('SELECT * FROM rooms WHERE deleted=0 ORDER BY sort_order, id').map(toRoom)
    },

    save: async (room) => {
      this.need('settings.manage')
      const name = reqText(room.name, 'Xona nomini kiriting', 60)
      const price = reqInt(room.pricePerHour, "Narx 0 yoki musbat butun son bo'lishi kerak", 0, 100_000_000)
      const cap = reqInt(room.capacity, "Sig'im 1 dan 100 gacha bo'lishi kerak", 1, 100)
      if (room.id != null) {
        const cur = this.roomRow(room.id)
        const active = bool(room.active, !!cur.active)
        const sortOrder = room.sortOrder === undefined ? cur.sort_order : reqInt(room.sortOrder, "Tartib raqami noto'g'ri", -1_000_000, 1_000_000)
        const open = this.openSessionForRoom(cur.id)
        if (open) {
          if (!active) fail("Xonada ochiq sessiya bor — avval uni yoping")
          const n = this.activeGuestCount(open.id)
          if (cap < n) fail(`Xonada hozir ${n} mehmon bor — sig'im undan kam bo'lmasligi kerak`)
        }
        this.db.tx(() =>
          this.db.run('UPDATE rooms SET name=?, price_per_hour=?, capacity=?, active=?, sort_order=? WHERE id=?', [
            name, price, cap, b2i(active), sortOrder, cur.id
          ])
        )
        return toRoom(this.roomRow(cur.id))
      }
      const maxSort = this.db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM rooms WHERE deleted=0')?.m ?? 0
      const sortOrder = room.sortOrder === undefined ? (maxSort ?? 0) + 1 : reqInt(room.sortOrder, "Tartib raqami noto'g'ri", -1_000_000, 1_000_000)
      const id = this.db.tx(() =>
        this.db.insert('INSERT INTO rooms(name, price_per_hour, capacity, active, sort_order) VALUES(?,?,?,?,?)', [
          name, price, cap, b2i(bool(room.active, true)), sortOrder
        ])
      )
      return toRoom(this.roomRow(id))
    },

    remove: async (id) => {
      this.need('settings.manage')
      const r = this.roomRow(id)
      if (this.openSessionForRoom(r.id)) fail("Xonada ochiq sessiya bor — avval uni yoping")
      this.db.tx(() => this.db.run('UPDATE rooms SET deleted=1, active=0 WHERE id=?', [r.id]))
    }
  }

  // ═════════════ SESSIONS ═════════════
  sessions: PosApi['sessions'] = {
    open: async (roomId, guestCount, paidMinutes, waiterId) => {
      const me = this.need('session.open')
      const room = this.roomRow(roomId)
      if (!room.active) fail('Xona faol emas')
      if (this.openSessionForRoom(room.id)) fail('Xona band')
      if (!isInt(guestCount) || guestCount < 1) fail("Mehmonlar soni kamida 1 bo'lishi kerak")
      if (guestCount > room.capacity) fail(`Xona sig'imi ${room.capacity} kishi`)
      const paid = reqMinutes(paidMinutes, 'Olingan vaqt')
      const waiter = waiterId == null ? null : this.waiterRow(waiterId)
      const now = this.now()
      const id = this.db.tx(() => {
        const sid = this.db.insert(
          "INSERT INTO sessions(kind, room_id, status, opened_at, opened_by, waiter_id, waiter_pct) VALUES('room', ?, 'open', ?, ?, ?, ?)",
          [room.id, now, me.id, waiter ? waiter.id : null, waiter ? waiter.commission_pct : 0]
        )
        for (let i = 1; i <= guestCount; i++) {
          const gid = this.db.insert("INSERT INTO guests(session_id, label, state, paid_minutes) VALUES(?, ?, 'running', ?)", [
            sid, `Mehmon ${i}`, paid
          ])
          this.openInterval(gid, room.id, room.price_per_hour, now)
        }
        return sid
      })
      return this.view(id)
    },

    get: async (sessionId) => {
      this.requireLogin()
      return this.view(sessionId)
    },

    addGuest: async (sessionId, paidMinutes) => {
      this.need('session.manage')
      const s = this.requireRoomSession(this.openSessionRow(sessionId), "Bar savdosiga mehmon qo'shib bo'lmaydi")
      const paid = reqMinutes(paidMinutes, 'Olingan vaqt')
      const room = this.roomRow(s.room_id)
      const n = this.activeGuestCount(s.id)
      if (n + 1 > room.capacity) fail(`Xona sig'imi ${room.capacity} kishi`)
      const total = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM guests WHERE session_id=?', [s.id])?.n ?? 0
      const now = this.now()
      this.db.tx(() => {
        const gid = this.db.insert("INSERT INTO guests(session_id, label, state, paid_minutes) VALUES(?, ?, 'running', ?)", [
          s.id, `Mehmon ${total + 1}`, paid
        ])
        this.openInterval(gid, room.id, room.price_per_hour, now)
      })
      return this.view(s.id)
    },

    extendGuest: async (guestId, minutes) => {
      this.need('session.manage')
      const g = this.guestRow(guestId)
      this.guestSession(g)
      const add = reqMinutes(minutes, "Qo'shiladigan vaqt")
      if (g.state === 'finished') fail('Mehmon chiqib ketgan — avval vaqtini davom ettiring')
      this.db.tx(() => this.db.run('UPDATE guests SET paid_minutes=paid_minutes+? WHERE id=?', [add, g.id]))
      return this.view(g.session_id)
    },

    extendAll: async (sessionId, minutes) => {
      this.need('session.manage')
      const s = this.requireRoomSession(this.openSessionRow(sessionId), BAR_NO_TIME)
      const add = reqMinutes(minutes, "Qo'shiladigan vaqt")
      if (this.activeGuestCount(s.id) === 0) fail("Sessiyada faol mehmon yo'q")
      this.db.tx(() =>
        this.db.run("UPDATE guests SET paid_minutes=paid_minutes+? WHERE session_id=? AND state<>'finished'", [add, s.id])
      )
      return this.view(s.id)
    },

    setWaiter: async (sessionId, waiterId) => {
      this.need('session.manage')
      const s = this.requireRoomSession(this.openSessionRow(sessionId), "Bar savdosiga ofitsiant biriktirilmaydi (ofitsiant haqi faqat xonalar uchun)")
      const waiter = waiterId == null ? null : this.waiterRow(waiterId)
      this.db.tx(() =>
        this.db.run('UPDATE sessions SET waiter_id=?, waiter_pct=? WHERE id=?', [waiter ? waiter.id : null, waiter ? waiter.commission_pct : 0, s.id])
      )
      return this.view(s.id)
    },

    guestPause: async (guestId) => {
      this.need('session.manage')
      const g = this.guestRow(guestId)
      this.guestSession(g)
      if (g.state !== 'running') fail(g.state === 'paused' ? 'Mehmon vaqti allaqachon to‘xtatilgan' : 'Mehmon chiqib ketgan')
      const now = this.now()
      this.db.tx(() => {
        this.closeIntervals(g.id, now)
        this.db.run("UPDATE guests SET state='paused' WHERE id=?", [g.id])
      })
      return this.view(g.session_id)
    },

    guestResume: async (guestId) => {
      this.need('session.manage')
      const g = this.guestRow(guestId)
      const s = this.guestSession(g)
      if (g.state === 'running') fail('Mehmon vaqti allaqachon ishlayapti')
      const room = this.roomRow(s.room_id)
      if (g.state === 'finished' && this.activeGuestCount(s.id) + 1 > room.capacity) fail(`Xona sig'imi ${room.capacity} kishi`)
      const now = this.now()
      this.db.tx(() => {
        this.closeIntervals(g.id, now) // xavfsizlik uchun (ochiq oraliq bo'lmasligi kerak)
        this.openInterval(g.id, room.id, room.price_per_hour, now)
        this.db.run("UPDATE guests SET state='running' WHERE id=?", [g.id])
      })
      return this.view(s.id)
    },

    guestFinish: async (guestId) => {
      this.need('session.manage')
      const g = this.guestRow(guestId)
      this.guestSession(g)
      if (g.state === 'finished') fail('Mehmon allaqachon chiqib ketgan')
      const now = this.now()
      this.db.tx(() => {
        this.closeIntervals(g.id, now)
        this.db.run("UPDATE guests SET state='finished' WHERE id=?", [g.id])
      })
      return this.view(g.session_id)
    },

    renameGuest: async (guestId, label) => {
      this.need('session.manage')
      const g = this.guestRow(guestId)
      this.guestSession(g)
      const l = reqText(label, 'Mehmon nomini kiriting', 40)
      this.db.tx(() => this.db.run('UPDATE guests SET label=? WHERE id=?', [l, g.id]))
      return this.view(g.session_id)
    },

    moveRoom: async (sessionId, newRoomId) => {
      this.need('session.manage')
      const s = this.requireRoomSession(this.openSessionRow(sessionId), "Bar savdosini xonaga o'tkazib bo'lmaydi")
      const target = this.roomRow(newRoomId)
      if (target.id === s.room_id) fail('Mehmonlar allaqachon shu xonada')
      if (!target.active) fail('Xona faol emas')
      if (this.openSessionForRoom(target.id)) fail('Xona band')
      const n = this.activeGuestCount(s.id)
      if (n > target.capacity) fail(`Xona sig'imi ${target.capacity} kishi, mehmonlar esa ${n} kishi`)
      const now = this.now()
      this.db.tx(() => {
        const running = this.db.all<GuestRow>("SELECT * FROM guests WHERE session_id=? AND state='running'", [s.id])
        for (const g of running) {
          this.closeIntervals(g.id, now)
          this.openInterval(g.id, target.id, target.price_per_hour, now)
        }
        // Pauzadagi mehmonlar: qolgan oldindan olingan vaqti yangi xona narxida hisoblansin —
        // yangi narx bilan 0 uzunlikdagi interval (billing qoldiqni oxirgi interval tarifi bilan hisoblaydi)
        const paused = this.db.all<GuestRow>("SELECT * FROM guests WHERE session_id=? AND state='paused'", [s.id])
        for (const g of paused) {
          this.openInterval(g.id, target.id, target.price_per_hour, now)
          this.closeIntervals(g.id, now)
        }
        this.db.run('UPDATE sessions SET room_id=? WHERE id=?', [target.id, s.id])
      })
      return this.view(s.id)
    },

    setDiscount: async (sessionId, amount) => {
      this.need('discount.apply')
      const s = this.openSessionRow(sessionId)
      reqInt(amount, "Chegirma 0 yoki musbat butun son bo'lishi kerak", 0)
      const v = this.view(s.id)
      if (amount > v.timeTotal + v.linesTotal) fail('Chegirma jami summadan oshmasligi kerak')
      this.db.tx(() => this.db.run('UPDATE sessions SET discount=? WHERE id=?', [amount, s.id]))
      return this.view(s.id)
    },

    stopAll: async (sessionId) => {
      this.need('session.manage')
      const s = this.openSessionRow(sessionId)
      const now = this.now()
      this.db.tx(() => {
        this.db.run(
          'UPDATE intervals SET end=? WHERE end IS NULL AND guest_id IN (SELECT id FROM guests WHERE session_id=?)',
          [now, s.id]
        )
        this.db.run("UPDATE guests SET state='finished' WHERE session_id=? AND state<>'finished'", [s.id])
      })
      return this.view(s.id)
    },

    cancel: async (sessionId) => {
      const me = this.need('session.manage')
      const s = this.openSessionRow(sessionId)
      const v = this.view(s.id)
      if (v.lines.some((l) => l.activeQty > 0)) fail("Sessiyada buyurtmalar bor — bekor qilib bo'lmaydi")
      if (v.payments.length > 0) fail("Sessiyada to'lovlar bor — bekor qilib bo'lmaydi")
      // Oldindan olingan vaqt darhol hisoblanadi, shuning uchun "vaqt o'tganmi" bo'yicha tekshiramiz
      if (v.guests.some((g) => g.elapsedMs >= CANCEL_FREE_MS) && !can(me.role, 'discount.apply'))
        fail('Vaqt hisoblangan — bekor qilish uchun administrator ruxsati kerak')
      const now = this.now()
      this.db.tx(() => {
        this.db.run(
          'UPDATE intervals SET end=? WHERE end IS NULL AND guest_id IN (SELECT id FROM guests WHERE session_id=?)',
          [now, s.id]
        )
        this.db.run("UPDATE guests SET state='finished' WHERE session_id=?", [s.id])
        this.db.run("UPDATE sessions SET status='closed', cancelled=1, closed_at=?, closed_by=? WHERE id=?", [now, me.id, s.id])
      })
    }
  }

  // ═════════════ LINES ═════════════
  lines: PosApi['lines'] = {
    addProduct: async (sessionId, productId, qty, guestId) => {
      const me = this.need('session.manage')
      const s = this.openSessionRow(sessionId)
      reqInt(qty, "Miqdor musbat butun son bo'lishi kerak", 1, 10_000)
      if (s.kind === 'bar' && guestId != null) fail("Bar savdosida mahsulot mehmonga bog'lanmaydi")
      const p = this.db.get<ProductRow>('SELECT * FROM products WHERE id=? AND deleted=0', [productId])
      if (!p) fail('Mahsulot topilmadi')
      if (!p.active) fail('Mahsulot sotuvda emas')
      if (guestId != null) {
        const g = this.guestRow(guestId)
        if (g.session_id !== s.id) fail('Mehmon bu sessiyaga tegishli emas')
      }
      if (p.track_stock && p.stock < qty) fail(`Omborda yetarli emas (qoldi: ${p.stock})`)
      const now = this.now()
      this.db.tx(() => {
        const existing = this.db.get<LineRow>(
          `SELECT * FROM order_lines WHERE session_id=? AND kind='product' AND ref_id=? AND unit_price=?
             AND ${guestId == null ? 'guest_id IS NULL' : 'guest_id=?'} ORDER BY id DESC LIMIT 1`,
          guestId == null ? [s.id, p.id, p.price] : [s.id, p.id, p.price, guestId]
        )
        let lineId: number
        if (existing) {
          this.db.run('UPDATE order_lines SET qty=qty+? WHERE id=?', [qty, existing.id])
          lineId = existing.id
        } else {
          lineId = this.db.insert(
            `INSERT INTO order_lines(session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by)
             VALUES(?,?,'product',?,?,?,?,0,NULL,?,?)`,
            [s.id, guestId ?? null, p.id, p.name, p.price, qty, now, me.id]
          )
        }
        if (p.track_stock) {
          this.db.run('UPDATE products SET stock=stock-? WHERE id=?', [qty, p.id])
          this.addStockMove(p.id, -qty, 'Sotuv', lineId, me.id)
        }
      })
      return this.view(s.id)
    },

    addService: async (sessionId, serviceId, guestId, providerId) => {
      const me = this.need('session.manage')
      const s = this.requireRoomSession(this.openSessionRow(sessionId), "Bar savdosiga xizmat qo'shib bo'lmaydi — xizmatlar faqat xonada")
      const sv = this.db.get<ServiceRow>('SELECT * FROM services WHERE id=? AND deleted=0', [serviceId])
      if (!sv) fail('Xizmat topilmadi')
      if (!sv.active) fail('Xizmat faol emas')
      if (guestId != null) {
        const g = this.guestRow(guestId)
        if (g.session_id !== s.id) fail('Mehmon bu sessiyaga tegishli emas')
      }
      if (providerId != null) {
        const pr = this.staffRow(providerId)
        if (!pr || !pr.active) fail('Xizmat ko‘rsatuvchi xodim topilmadi')
      }
      const now = this.now()
      this.db.tx(() =>
        this.db.insert(
          `INSERT INTO order_lines(session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by)
           VALUES(?,?,'service',?,?,?,1,0,?,?,?)`,
          [s.id, guestId ?? null, sv.id, sv.name, sv.price, providerId ?? null, now, me.id]
        )
      )
      return this.view(s.id)
    },

    returnLine: async (lineId, qty, reason) => {
      // To'lanmagan BAR savdosi savatidan olib tashlash — kassir ham qila oladi (session.manage);
      // xona sessiyasidagi qaytarish esa line.return ruxsatini talab qiladi.
      this.need('session.manage')
      const l = this.db.get<LineRow>('SELECT * FROM order_lines WHERE id=?', [lineId])
      if (!l) fail('Qator topilmadi')
      const s = this.openSessionRow(l.session_id)
      const me = s.kind === 'bar' ? this.need('session.manage') : this.need('line.return')
      const active = l.qty - l.returned_qty
      if (active <= 0) fail('Bu qator allaqachon to‘liq qaytarilgan')
      reqInt(qty, `Qaytarish miqdori 1 dan ${active} gacha bo'lishi kerak`, 1, active)
      const why = optText(reason, 200)
      const now = this.now()
      this.db.tx(() => {
        this.db.run('UPDATE order_lines SET returned_qty=returned_qty+? WHERE id=?', [qty, l.id])
        this.db.insert('INSERT INTO returns(line_id, session_id, qty, reason, at, by) VALUES(?,?,?,?,?,?)', [l.id, s.id, qty, why, now, me.id])
        if (l.kind === 'product') {
          const p = this.db.get<ProductRow>('SELECT * FROM products WHERE id=?', [l.ref_id])
          if (p && p.track_stock) {
            this.db.run('UPDATE products SET stock=stock+? WHERE id=?', [qty, p.id])
            this.addStockMove(p.id, qty, 'Qaytarish' + (why ? ': ' + why : ''), l.id, me.id)
          }
        }
        // Qaytarishdan keyin chegirma jami summadan oshib ketmasin
        const v = this.view(s.id, now)
        const gross = v.timeTotal + v.linesTotal
        if (v.session.discount > gross) this.db.run('UPDATE sessions SET discount=? WHERE id=?', [gross, s.id])
      })
      return this.view(s.id)
    }
  }

  // ═════════════ CHECKOUT ═════════════
  checkout: PosApi['checkout'] = {
    pay: async (sessionId, payments, debtor) => {
      const me = this.need('session.pay')
      const s = this.openSessionRow(sessionId)
      const now = this.now()
      const v = this.view(s.id, now)

      if (!Array.isArray(payments)) fail("To'lov ma'lumotlari noto'g'ri")
      const merged = new Map<PayMethod, number>()
      for (const p of payments as PaymentInput[]) {
        if (!p || (p.method !== 'cash' && p.method !== 'card' && p.method !== 'debt')) fail("To'lov usuli noto'g'ri")
        if (!isInt(p.amount) || p.amount < 0) fail("To'lov summasi musbat butun son bo'lishi kerak")
        if (p.amount === 0) continue
        merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount)
      }
      const sum = Array.from(merged.values()).reduce((a, b) => a + b, 0)
      if (sum !== v.total) fail(`To'lov summasi jami summaga teng emas (jami: ${v.total}, kiritildi: ${sum})`)
      const debtAmount = merged.get('debt') ?? 0
      let debtorClean: DebtorInput | null = null
      if (debtAmount > 0) {
        if (!can(me.role, 'debt.manage')) fail(PERMISSION_DENIED)
        if (!debtor) fail('Qarzdorning ismi va telefoni majburiy')
        const name = reqText(debtor.name, 'Qarzdorning ismini kiriting', 80)
        const phone = reqText(debtor.phone, 'Qarzdorning telefonini kiriting', 30)
        if (!/^[+\d][\d\s()-]{4,}$/.test(phone)) fail("Telefon raqami noto'g'ri")
        debtorClean = { name, phone }
      }

      this.db.tx(() => {
        this.db.run(
          'UPDATE intervals SET end=? WHERE end IS NULL AND guest_id IN (SELECT id FROM guests WHERE session_id=?)',
          [now, s.id]
        )
        this.db.run("UPDATE guests SET state='finished' WHERE session_id=?", [s.id])
        for (const [method, amount] of merged)
          this.db.insert('INSERT INTO payments(session_id, method, amount, at, by) VALUES(?,?,?,?,?)', [s.id, method, amount, now, me.id])
        if (debtorClean)
          this.db.insert('INSERT INTO debts(session_id, customer_name, phone, amount, paid, created_at, closed_at) VALUES(?,?,?,?,0,?,NULL)', [
            s.id, debtorClean.name, debtorClean.phone, debtAmount, now
          ])
        const next = (this.db.get<{ m: number | null }>('SELECT MAX(receipt_no) AS m FROM sessions')?.m ?? 0) + 1
        // Ofitsiant haqi: faqat bar mahsulotlari (qaytarishlar ayirilgan) × muzlatilgan foiz
        const productSales = waiterProductSales(v.lines)
        const commission = s.kind !== 'bar' && s.waiter_id != null ? waiterCommission(productSales, s.waiter_pct ?? 0) : 0
        this.db.run(
          `UPDATE sessions SET status='closed', closed_at=?, closed_by=?, receipt_no=?, discount=?,
             time_total=?, lines_total=?, discount_applied=?, total=?, product_sales=?, waiter_commission=? WHERE id=?`,
          [now, me.id, next, v.discount, v.timeTotal, v.linesTotal, v.discount, v.total, productSales, commission, s.id]
        )
      })
      return this.buildReceipt(s.id)
    },

    receipt: async (sessionId) => {
      this.requireLogin()
      const s = this.sessionRow(sessionId)
      if (s.cancelled) fail('Sessiya bekor qilingan')
      return this.buildReceipt(s.id)
    }
  }

  // ═════════════ BAR SAVDOSI (xonasiz) ═════════════
  barSales: PosApi['barSales'] = {
    open: async () => {
      const me = this.need('session.open')
      const now = this.now()
      const id = this.db.tx(() =>
        this.db.insert(
          "INSERT INTO sessions(kind, room_id, status, opened_at, opened_by, waiter_id, waiter_pct) VALUES('bar', NULL, 'open', ?, ?, NULL, 0)",
          [now, me.id]
        )
      )
      return this.view(id)
    },

    openList: async () => {
      this.needRead('session.open')
      const now = this.now()
      return this.db
        .all<{ id: number }>("SELECT id FROM sessions WHERE kind='bar' AND status='open' ORDER BY opened_at DESC, id DESC")
        .map((r) => this.view(r.id, now))
    },

    history: async (range) => {
      this.needRead('session.pay')
      const { from, to } = this.checkRange(range)
      return this.db
        .all<{ id: number; receipt_no: number | null; closed_at: number; total: number | null; items: number | null; cashier: string | null }>(
          `SELECT s.id, s.receipt_no, s.closed_at, s.total, st.name AS cashier,
             (SELECT SUM(l.qty - l.returned_qty) FROM order_lines l WHERE l.session_id=s.id AND l.kind='product') AS items
           FROM sessions s LEFT JOIN staff st ON st.id=COALESCE(s.closed_by, s.opened_by)
           WHERE s.kind='bar' AND s.status='closed' AND s.cancelled=0 AND s.closed_at>=? AND s.closed_at<?
           ORDER BY s.closed_at DESC, s.id DESC`,
          [from, to]
        )
        .map(
          (r): BarSaleRow => ({
            sessionId: r.id,
            receiptNo: r.receipt_no ?? null,
            closedAt: r.closed_at,
            items: r.items ?? 0,
            total: r.total ?? 0,
            cashier: r.cashier ?? ''
          })
        )
    }
  }

  // ═════════════ CATALOG ═════════════
  catalog: PosApi['catalog'] = {
    categories: async () => {
      this.requireLogin()
      return this.db.all<CategoryRow>('SELECT * FROM categories WHERE deleted=0 ORDER BY sort_order, id').map(toCategory)
    },

    saveCategory: async (c) => {
      this.need('settings.manage')
      const name = reqText(c.name, 'Kategoriya nomini kiriting', 60)
      if (c.id != null) {
        const cur = this.db.get<CategoryRow>('SELECT * FROM categories WHERE id=? AND deleted=0', [c.id])
        if (!cur) fail('Kategoriya topilmadi')
        const sortOrder = c.sortOrder === undefined ? cur.sort_order : reqInt(c.sortOrder, "Tartib raqami noto'g'ri", -1_000_000, 1_000_000)
        this.db.tx(() => this.db.run('UPDATE categories SET name=?, sort_order=? WHERE id=?', [name, sortOrder, cur.id]))
        return toCategory({ id: cur.id, name, sort_order: sortOrder })
      }
      const max = this.db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM categories WHERE deleted=0')?.m ?? 0
      const sortOrder = c.sortOrder === undefined ? (max ?? 0) + 1 : reqInt(c.sortOrder, "Tartib raqami noto'g'ri", -1_000_000, 1_000_000)
      const id = this.db.tx(() => this.db.insert('INSERT INTO categories(name, sort_order) VALUES(?,?)', [name, sortOrder]))
      return toCategory({ id, name, sort_order: sortOrder })
    },

    removeCategory: async (id) => {
      this.need('settings.manage')
      const cur = this.db.get<CategoryRow>('SELECT * FROM categories WHERE id=? AND deleted=0', [id])
      if (!cur) fail('Kategoriya topilmadi')
      const n = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE category_id=? AND deleted=0', [id])?.n ?? 0
      if (n > 0) fail("Kategoriyada mahsulotlar bor — avval ularni o'chiring yoki boshqa kategoriyaga o'tkazing")
      this.db.tx(() => this.db.run('UPDATE categories SET deleted=1 WHERE id=?', [id]))
    },

    products: async (includeInactive) => {
      this.requireLogin()
      return this.db
        .all<ProductRow>(
          `SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id
           WHERE p.deleted=0 ${includeInactive ? '' : 'AND p.active=1'}
           ORDER BY c.sort_order, c.id, p.name`
        )
        .map(toProduct)
    },

    saveProduct: async (p) => {
      const me = this.need('settings.manage')
      const name = reqText(p.name, 'Mahsulot nomini kiriting', 80)
      const price = reqInt(p.price, "Narx 0 yoki musbat butun son bo'lishi kerak", 0, 100_000_000)
      const cat = this.db.get<CategoryRow>('SELECT * FROM categories WHERE id=? AND deleted=0', [p.categoryId])
      if (!cat) fail('Kategoriya topilmadi')
      if (p.id != null) {
        const cur = this.db.get<ProductRow>('SELECT * FROM products WHERE id=? AND deleted=0', [p.id])
        if (!cur) fail('Mahsulot topilmadi')
        const stock = p.stock === undefined ? cur.stock : reqInt(p.stock, "Qoldiq 0 yoki musbat butun son bo'lishi kerak", 0)
        const low = p.lowStockAt === undefined ? cur.low_stock_at : reqInt(p.lowStockAt, "Kam qoldiq chegarasi noto'g'ri", 0)
        const track = bool(p.trackStock, !!cur.track_stock)
        const active = bool(p.active, !!cur.active)
        this.db.tx(() => {
          this.db.run(
            'UPDATE products SET category_id=?, name=?, price=?, stock=?, track_stock=?, low_stock_at=?, active=? WHERE id=?',
            [cat.id, name, price, stock, b2i(track), low, b2i(active), cur.id]
          )
          if (stock !== cur.stock) this.addStockMove(cur.id, stock - cur.stock, 'Tahrirlash', null, me.id)
        })
        return toProduct(this.db.get<ProductRow>('SELECT * FROM products WHERE id=?', [cur.id])!)
      }
      const stock = p.stock === undefined ? 0 : reqInt(p.stock, "Qoldiq 0 yoki musbat butun son bo'lishi kerak", 0)
      const low = p.lowStockAt === undefined ? 5 : reqInt(p.lowStockAt, "Kam qoldiq chegarasi noto'g'ri", 0)
      const id = this.db.tx(() => {
        const nid = this.db.insert(
          'INSERT INTO products(category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(?,?,?,?,?,?,?)',
          [cat.id, name, price, stock, b2i(bool(p.trackStock, true)), low, b2i(bool(p.active, true))]
        )
        if (stock > 0) this.addStockMove(nid, stock, 'Boshlang‘ich qoldiq', null, me.id)
        return nid
      })
      return toProduct(this.db.get<ProductRow>('SELECT * FROM products WHERE id=?', [id])!)
    },

    removeProduct: async (id) => {
      this.need('settings.manage')
      const cur = this.db.get<ProductRow>('SELECT * FROM products WHERE id=? AND deleted=0', [id])
      if (!cur) fail('Mahsulot topilmadi')
      this.db.tx(() => this.db.run('UPDATE products SET deleted=1, active=0 WHERE id=?', [id]))
    },

    adjustStock: async (productId, delta, reason) => {
      const me = this.need('stock.manage')
      const cur = this.db.get<ProductRow>('SELECT * FROM products WHERE id=? AND deleted=0', [productId])
      if (!cur) fail('Mahsulot topilmadi')
      if (!isInt(delta) || delta === 0) fail("O'zgarish nolga teng bo'lmagan butun son bo'lishi kerak")
      if (cur.stock + delta < 0) fail(`Ombor manfiy bo'lib qololmaydi (qoldiq: ${cur.stock})`)
      const why = optText(reason, 200) || (delta > 0 ? 'Kirim' : 'Hisobdan chiqarish')
      this.db.tx(() => {
        this.db.run('UPDATE products SET stock=stock+? WHERE id=?', [delta, cur.id])
        this.addStockMove(cur.id, delta, why, null, me.id)
      })
      return toProduct(this.db.get<ProductRow>('SELECT * FROM products WHERE id=?', [cur.id])!)
    },

    services: async (includeInactive) => {
      this.requireLogin()
      return this.db
        .all<ServiceRow>(`SELECT * FROM services WHERE deleted=0 ${includeInactive ? '' : 'AND active=1'} ORDER BY name`)
        .map(toService)
    },

    saveService: async (sv) => {
      this.need('settings.manage')
      const name = reqText(sv.name, 'Xizmat nomini kiriting', 80)
      const price = reqInt(sv.price, "Narx 0 yoki musbat butun son bo'lishi kerak", 0, 100_000_000)
      const dur = sv.durationMin == null ? null : reqInt(sv.durationMin, "Davomiylik musbat butun son bo'lishi kerak", 1, 24 * 60)
      if (sv.id != null) {
        const cur = this.db.get<ServiceRow>('SELECT * FROM services WHERE id=? AND deleted=0', [sv.id])
        if (!cur) fail('Xizmat topilmadi')
        const durFinal = sv.durationMin === undefined ? cur.duration_min : dur
        this.db.tx(() =>
          this.db.run('UPDATE services SET name=?, price=?, duration_min=?, active=? WHERE id=?', [
            name, price, durFinal, b2i(bool(sv.active, !!cur.active)), cur.id
          ])
        )
        return toService(this.db.get<ServiceRow>('SELECT * FROM services WHERE id=?', [cur.id])!)
      }
      const id = this.db.tx(() =>
        this.db.insert('INSERT INTO services(name, price, duration_min, active) VALUES(?,?,?,?)', [name, price, dur, b2i(bool(sv.active, true))])
      )
      return toService(this.db.get<ServiceRow>('SELECT * FROM services WHERE id=?', [id])!)
    },

    removeService: async (id) => {
      this.need('settings.manage')
      const cur = this.db.get<ServiceRow>('SELECT * FROM services WHERE id=? AND deleted=0', [id])
      if (!cur) fail('Xizmat topilmadi')
      this.db.tx(() => this.db.run('UPDATE services SET deleted=1, active=0 WHERE id=?', [id]))
    }
  }

  // ═════════════ DEBTS ═════════════
  debts: PosApi['debts'] = {
    list: async (onlyOpen) => {
      this.needRead('debt.manage')
      return this.db
        .all<DebtRow>(`SELECT * FROM debts ${onlyOpen ? 'WHERE closed_at IS NULL' : ''} ORDER BY created_at DESC, id DESC`)
        .map(toDebt)
    },

    pay: async (debtId, method, amount) => {
      const me = this.need('debt.manage')
      const d = this.db.get<DebtRow>('SELECT * FROM debts WHERE id=?', [debtId])
      if (!d) fail('Qarz topilmadi')
      if (d.closed_at != null) fail('Qarz allaqachon to‘langan')
      if (method !== 'cash' && method !== 'card') fail("To'lov usuli noto'g'ri")
      const left = d.amount - d.paid
      reqInt(amount, `To'lov summasi 1 dan ${left} gacha bo'lishi kerak`, 1, left)
      const now = this.now()
      this.db.tx(() => {
        this.db.insert('INSERT INTO debt_payments(debt_id, method, amount, at, by) VALUES(?,?,?,?,?)', [d.id, method, amount, now, me.id])
        const paid = d.paid + amount
        this.db.run('UPDATE debts SET paid=?, closed_at=? WHERE id=?', [paid, paid >= d.amount ? now : null, d.id])
      })
      return toDebt(this.db.get<DebtRow>('SELECT * FROM debts WHERE id=?', [d.id])!)
    },

    payments: async (debtId) => {
      this.needRead('debt.manage')
      return this.db.all<DebtPaymentRow>('SELECT * FROM debt_payments WHERE debt_id=? ORDER BY at, id', [debtId]).map(toDebtPayment)
    }
  }

  // ═════════════ STAFF ═════════════
  staff: PosApi['staff'] = {
    list: async () => {
      this.requireLogin()
      return this.db
        .all<StaffRow>("SELECT * FROM staff ORDER BY active DESC, CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END, name")
        .map(toStaff)
    },

    save: async (input: Partial<Staff> & StaffInput) => {
      this.need('staff.manage')
      const name = reqText(input.name, 'Xodim ismini kiriting', 60)
      const role = input.role
      if (role !== 'owner' && role !== 'admin' && role !== 'cashier' && role !== 'waiter') fail("Lavozim noto'g'ri")
      const active = bool(input.active, true)
      const pin = typeof input.pin === 'string' ? input.pin : ''
      const cur = input.id != null ? this.staffRow(input.id) : undefined
      if (input.id != null && !cur) fail('Xodim topilmadi')
      const isProvider = bool(input.isProvider, cur ? !!cur.is_provider : false)
      // 'waiter' rolidagi xodim har doim ofitsiant; admin/kassir ham ofitsiant bo'lishi mumkin
      const isWaiter = role === 'waiter' ? true : bool(input.isWaiter, cur ? !!cur.is_waiter : false)
      const commissionPct = input.commissionPct === undefined ? (cur ? cur.commission_pct ?? 0 : 0) : reqPct(input.commissionPct)
      if (cur) {
        if (pin && !isValidPin(pin)) fail("PIN 4–8 ta raqamdan iborat bo'lishi kerak")
        if (cur.role === 'owner' && cur.active && (role !== 'owner' || !active)) {
          const owners = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM staff WHERE role='owner' AND active=1")?.n ?? 0
          if (owners <= 1) fail("Kamida bitta faol ega bo'lishi kerak")
        }
        this.db.tx(() => {
          this.db.run('UPDATE staff SET name=?, role=?, active=?, is_provider=?, is_waiter=?, commission_pct=? WHERE id=?', [
            name, role, b2i(active), b2i(isProvider), b2i(isWaiter), commissionPct, cur.id
          ])
          if (pin) this.db.run('UPDATE staff SET pin_hash=? WHERE id=?', [hashPin(pin), cur.id])
        })
        this.loginFails.delete(cur.id)
        return toStaff(this.staffRow(cur.id)!)
      }
      if (!isValidPin(pin)) fail("PIN 4–8 ta raqamdan iborat bo'lishi kerak")
      const id = this.db.tx(() =>
        this.db.insert(
          'INSERT INTO staff(name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(?,?,?,?,?,?,?,?)',
          [name, role, hashPin(pin), b2i(active), b2i(isProvider), b2i(isWaiter), commissionPct, this.now()]
        )
      )
      return toStaff(this.staffRow(id)!)
    },

    changePin: async (staffId, newPin) => {
      this.noViewer()
      const me = this.requireLogin()
      if (me.id !== staffId && !can(me.role, 'staff.manage')) fail(PERMISSION_DENIED)
      const cur = this.staffRow(staffId)
      if (!cur) fail('Xodim topilmadi')
      if (!isValidPin(newPin)) fail("PIN 4–8 ta raqamdan iborat bo'lishi kerak")
      this.db.tx(() => this.db.run('UPDATE staff SET pin_hash=? WHERE id=?', [hashPin(newPin), cur.id]))
      this.loginFails.delete(cur.id)
    }
  }

  // ═════════════ WAITERS ═════════════
  waiters: PosApi['waiters'] = {
    list: async () => {
      this.needRead('session.open')
      return this.db.all<StaffRow>('SELECT * FROM staff WHERE active=1 AND is_waiter=1 ORDER BY name, id').map(toStaff)
    },

    monthly: async (month) => {
      this.need('reports.view')
      const r = monthRange(month)
      const agg = this.db.all<{ waiter_id: number; n: number; sales: number | null; comm: number | null }>(
        `SELECT waiter_id, COUNT(*) AS n, SUM(product_sales) AS sales, SUM(waiter_commission) AS comm FROM sessions
         WHERE kind='room' AND waiter_id IS NOT NULL AND status='closed' AND cancelled=0 AND closed_at>=? AND closed_at<? GROUP BY waiter_id`,
        [r.from, r.to]
      )
      const paidRows = this.db.all<{ staff_id: number; a: number | null }>(
        'SELECT staff_id, SUM(amount) AS a FROM waiter_payouts WHERE month=? GROUP BY staff_id',
        [r.month]
      )
      const ids = new Set<number>()
      for (const w of this.db.all<{ id: number }>('SELECT id FROM staff WHERE is_waiter=1 AND active=1')) ids.add(w.id)
      for (const a of agg) ids.add(a.waiter_id)
      for (const p of paidRows) ids.add(p.staff_id)
      const rows: WaiterMonthRow[] = []
      for (const id of ids) {
        const st = this.staffRow(id)
        if (!st) continue
        const a = agg.find((x) => x.waiter_id === id)
        const commission = a?.comm ?? 0
        const paid = paidRows.find((x) => x.staff_id === id)?.a ?? 0
        rows.push({
          staffId: id,
          name: st.name,
          commissionPct: st.commission_pct ?? 0,
          sessions: a?.n ?? 0,
          productSales: a?.sales ?? 0,
          commission,
          paid,
          balance: commission - paid
        })
      }
      return rows.sort((x, y) => x.name.localeCompare(y.name) || x.staffId - y.staffId)
    },

    sessions: async (staffId, month) => {
      this.need('reports.view')
      const r = monthRange(month)
      return this.db
        .all<{ id: number; closed_at: number; room_name: string; product_sales: number | null; waiter_pct: number; waiter_commission: number | null }>(
          `SELECT s.id, s.closed_at, rm.name AS room_name, s.product_sales, s.waiter_pct, s.waiter_commission
           FROM sessions s JOIN rooms rm ON rm.id=s.room_id
           WHERE s.kind='room' AND s.waiter_id=? AND s.status='closed' AND s.cancelled=0 AND s.closed_at>=? AND s.closed_at<?
           ORDER BY s.closed_at, s.id`,
          [isInt(staffId) ? staffId : -1, r.from, r.to]
        )
        .map(
          (x): WaiterSessionRow => ({
            sessionId: x.id,
            closedAt: x.closed_at,
            roomName: x.room_name,
            productSales: x.product_sales ?? 0,
            pct: x.waiter_pct ?? 0,
            commission: x.waiter_commission ?? 0
          })
        )
    },

    payout: async (staffId, month, amount, note) => {
      const me = this.need('staff.manage')
      const r = monthRange(month)
      if (r.from > this.now()) fail("Kelajak oy uchun pul berib bo'lmaydi")
      const st = isInt(staffId) ? this.staffRow(staffId) : undefined
      if (!st) fail('Xodim topilmadi')
      const hasSessions = (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE waiter_id=?', [st.id])?.n ?? 0) > 0
      if (!st.is_waiter && !hasSessions) fail('Xodim ofitsiant emas')
      reqInt(amount, "Summa musbat butun son bo'lishi kerak", 1, 1_000_000_000)
      const id = this.db.tx(() =>
        this.db.insert('INSERT INTO waiter_payouts(staff_id, month, amount, note, at, by) VALUES(?,?,?,?,?,?)', [
          st.id, r.month, amount, optText(note, 200), this.now(), me.id
        ])
      )
      return toPayout(this.db.get<PayoutRow>('SELECT * FROM waiter_payouts WHERE id=?', [id])!)
    },

    payouts: async (staffId, month) => {
      this.need('reports.view')
      const r = monthRange(month)
      return this.db
        .all<PayoutRow>('SELECT * FROM waiter_payouts WHERE staff_id=? AND month=? ORDER BY at, id', [isInt(staffId) ? staffId : -1, r.month])
        .map(toPayout)
    }
  }

  // ═════════════ SETTINGS ═════════════
  settings: PosApi['settings'] = {
    // Kirishdan oldin ham kerak (qulf ekrani, biznes nomi) — maxfiy ma'lumot yo'q.
    get: async () => this.loadSettings(),

    save: async (s) => {
      this.need('settings.manage')
      const clean = sanitizeSettings(s, this.loadSettings())
      this.db.tx(() => this.storeSettings(clean))
      return this.loadSettings()
    }
  }

  // ═════════════ REPORTS ═════════════
  reports: PosApi['reports'] = {
    sales: async (range: ReportRange): Promise<SalesReport> => {
      this.need('reports.view')
      const { from, to } = this.checkRange(range)
      const sessions = this.db.all<SessionRow & { room_name: string; staff_name: string | null }>(
        `SELECT s.*, r.name AS room_name, st.name AS staff_name FROM sessions s
         LEFT JOIN rooms r ON r.id=s.room_id LEFT JOIN staff st ON st.id=s.closed_by
         WHERE s.status='closed' AND s.cancelled=0 AND s.closed_at>=? AND s.closed_at<? ORDER BY s.closed_at`,
        [from, to]
      )
      const ids = sessions.map((s) => s.id)
      const inList = ids.length ? ids.join(',') : '-1'
      const lines = this.db.all<LineRow & { provider_name: string | null }>(
        `SELECT l.*, st.name AS provider_name FROM order_lines l LEFT JOIN staff st ON st.id=l.provider_id
         WHERE l.session_id IN (${inList})`
      )
      const pays = this.db.all<PaymentRow>(`SELECT * FROM payments WHERE session_id IN (${inList})`)

      const report: SalesReport = {
        range: { from, to },
        // Faqat xona seanslari; xonasiz bar savdolari alohida — barSales.count
        sessionsCount: sessions.filter((s) => s.kind !== 'bar').length,
        timeRevenue: 0,
        productRevenue: 0,
        serviceRevenue: 0,
        discounts: 0,
        total: 0,
        byMethod: { cash: 0, card: 0, debt: 0 },
        debtPayments: { cash: 0, card: 0 },
        returnsAmount: 0,
        byDay: [],
        byRoom: [],
        byProduct: [],
        byProvider: [],
        byStaff: [],
        byWaiter: [],
        barSales: { count: 0, total: 0 }
      }
      const byDay = new Map<string, number>()
      const byRoom = new Map<Id, { roomId: Id; roomName: string; sessions: number; total: number }>()
      const byStaff = new Map<Id, { staffId: Id; name: string; sessions: number; total: number }>()
      const byWaiter = new Map<Id, SalesReport['byWaiter'][number]>()
      const names = this.staffNames()
      for (const s of sessions) {
        const isBar = s.kind === 'bar'
        // Xonasiz bar savdosi: ofitsiant haqi yo'q (byWaiter ga kirmaydi), alohida ko'rsatkich
        if (!isBar && s.waiter_id != null) {
          const w = byWaiter.get(s.waiter_id) ?? { staffId: s.waiter_id, name: names.get(s.waiter_id) ?? '', sessions: 0, productSales: 0, commission: 0 }
          w.sessions++
          w.productSales += s.product_sales ?? 0
          w.commission += s.waiter_commission ?? 0
          byWaiter.set(s.waiter_id, w)
        }
        const total = s.total ?? 0
        report.timeRevenue += s.time_total ?? 0
        report.discounts += s.discount_applied ?? 0
        report.total += total
        const day = localDay(s.closed_at ?? s.opened_at)
        byDay.set(day, (byDay.get(day) ?? 0) + total)
        if (isBar) {
          report.barSales.count++
          report.barSales.total += total
        }
        const roomId = isBar ? BAR_ROOM.id : s.room_id ?? 0
        const r = byRoom.get(roomId) ?? { roomId, roomName: isBar ? BAR_REPORT_ROOM_NAME : s.room_name ?? '', sessions: 0, total: 0 }
        r.sessions++
        r.total += total
        byRoom.set(roomId, r)
        const staffId = s.closed_by ?? s.opened_by
        const st = byStaff.get(staffId) ?? { staffId, name: s.staff_name ?? '', sessions: 0, total: 0 }
        st.sessions++
        st.total += total
        byStaff.set(staffId, st)
      }
      const byProduct = new Map<string, { name: string; qty: number; amount: number }>()
      const byProvider = new Map<Id, { staffId: Id; name: string; count: number; amount: number }>()
      for (const l of lines) {
        const q = l.qty - l.returned_qty
        if (q <= 0) continue
        const amount = q * l.unit_price
        if (l.kind === 'product') {
          report.productRevenue += amount
          const p = byProduct.get(l.name) ?? { name: l.name, qty: 0, amount: 0 }
          p.qty += q
          p.amount += amount
          byProduct.set(l.name, p)
        } else {
          report.serviceRevenue += amount
          if (l.provider_id != null) {
            const p = byProvider.get(l.provider_id) ?? { staffId: l.provider_id, name: l.provider_name ?? '', count: 0, amount: 0 }
            p.count += q
            p.amount += amount
            byProvider.set(l.provider_id, p)
          }
        }
      }
      for (const p of pays) report.byMethod[p.method] += p.amount
      for (const d of this.db.all<{ method: 'cash' | 'card'; a: number }>(
        'SELECT method, SUM(amount) AS a FROM debt_payments WHERE at>=? AND at<? GROUP BY method',
        [from, to]
      )) report.debtPayments[d.method] += d.a ?? 0
      const ret = this.db.get<{ a: number | null }>(
        `SELECT SUM(r.qty * l.unit_price) AS a FROM returns r JOIN order_lines l ON l.id=r.line_id
         JOIN sessions s ON s.id=r.session_id WHERE s.cancelled=0 AND r.at>=? AND r.at<?`,
        [from, to]
      )
      report.returnsAmount = ret?.a ?? 0
      report.byDay = Array.from(byDay, ([day, total]) => ({ day, total })).sort((a, b) => a.day.localeCompare(b.day))
      report.byRoom = Array.from(byRoom.values()).sort((a, b) => b.total - a.total)
      report.byProduct = Array.from(byProduct.values()).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
      report.byProvider = Array.from(byProvider.values()).sort((a, b) => b.amount - a.amount)
      report.byStaff = Array.from(byStaff.values()).sort((a, b) => b.total - a.total)
      report.byWaiter = Array.from(byWaiter.values()).sort((a, b) => b.commission - a.commission || a.name.localeCompare(b.name))
      return report
    },

    returns: async (range) => {
      this.need('reports.view')
      const { from, to } = this.checkRange(range)
      return this.db
        .all<{ at: number; name: string; qty: number; unit_price: number; reason: string; by_name: string | null; room_name: string }>(
          `SELECT r.at, l.name, r.qty, l.unit_price, r.reason, st.name AS by_name,
             CASE WHEN s.kind='bar' THEN ? ELSE rm.name END AS room_name
           FROM returns r JOIN order_lines l ON l.id=r.line_id JOIN sessions s ON s.id=r.session_id
           LEFT JOIN rooms rm ON rm.id=s.room_id LEFT JOIN staff st ON st.id=r.by
           WHERE r.at>=? AND r.at<? ORDER BY r.at DESC, r.id DESC`,
          [BAR_ROOM.name, from, to]
        )
        .map((r) => ({
          at: r.at,
          productName: r.name,
          qty: r.qty,
          amount: r.qty * r.unit_price,
          reason: r.reason,
          by: r.by_name ?? '',
          roomName: r.room_name
        }))
    }
  }

  private checkRange(range: ReportRange): ReportRange {
    if (!range || !isInt(range.from) || !isInt(range.to) || range.to < range.from) fail("Hisobot oralig'i noto'g'ri")
    return { from: range.from, to: range.to }
  }

  // ═════════════ SYSTEM ═════════════
  system: PosApi['system'] = {
    printReceipt: async (data) => {
      this.noViewer()
      this.requireLogin()
      if (!data || typeof data !== 'object' || !data.settings) fail("Chek ma'lumotlari noto'g'ri")
      if (!this.host.printReceipt) return
      await this.host.printReceipt(renderReceiptHtml(data), data.settings)
    },

    listPrinters: async () => {
      this.noViewer()
      this.requireLogin()
      return this.host.listPrinters ? this.host.listPrinters() : []
    },

    receiptHtml: async (data) => {
      this.requireLogin()
      if (!data || typeof data !== 'object' || !data.settings) fail("Chek ma'lumotlari noto'g'ri")
      return renderReceiptHtml(data)
    },

    backup: async () => {
      this.need('backup.manage')
      if (!this.host.saveBackup) fail('Zaxira nusxa bu muhitda mavjud emas')
      const d = new Date(this.now())
      const name = `delfin-zaxira-${localDay(this.now())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.db`
      const path = await this.host.saveBackup(this.exportBytes(), name)
      return path ? { path } : null
    },

    restore: async () => {
      this.need('backup.manage')
      if (!this.host.openBackup) fail('Tiklash bu muhitda mavjud emas')
      const bytes = await this.host.openBackup()
      if (!bytes) return false
      await this.restoreBytes(bytes)
      return true
    },

    now: async () => this.now()
  }

  // ═════════════ NETWORK (asosiy kompyuter LAN serveri; amalga oshirish host.network da) ═════════════
  network: PosApi['network'] = {
    status: async () => {
      this.noViewer()
      this.need('settings.manage')
      if (!this.host.network) fail('Tarmoq bu muhitda mavjud emas')
      return this.host.network.status()
    },
    setEnabled: async (enabled) => {
      this.noViewer()
      this.need('settings.manage')
      if (typeof enabled !== 'boolean') fail("Qiymat noto'g'ri")
      if (!this.host.network) fail('Tarmoq bu muhitda mavjud emas')
      return this.host.network.setEnabled(enabled)
    },
    regenerateCode: async () => {
      this.noViewer()
      this.need('settings.manage')
      if (!this.host.network) fail('Tarmoq bu muhitda mavjud emas')
      return this.host.network.regenerateCode()
    }
  }

  // ═════════════ CONNECTION (lokal rejim; login talab qilinmaydi — shartnoma bo'yicha) ═════════════
  connection: PosApi['connection'] = {
    info: async () => {
      if (this.host.connection) return this.host.connection.info()
      return { mode: 'main', host: null, port: null, connected: true }
    },
    discover: async () => {
      this.noViewer()
      return this.host.connection ? this.host.connection.discover() : []
    },
    connectViewer: async (host, port, code) => {
      this.noViewer()
      if (!this.host.connection) fail('Ulanish bu muhitda mavjud emas')
      // Sozlangan asosiy kompyuterni ko'ruvchiga aylantirish — faqat ega (bazasi bor kompyuterni tasodifan "o'chirib qo'ymaslik")
      if (!(await this.auth.needsSetup())) this.need('settings.manage')
      return this.host.connection.connectViewer(host, port, code)
    },
    disconnect: async () => {
      this.noViewer()
      if (!this.host.connection) fail('Ulanish bu muhitda mavjud emas')
      return this.host.connection.disconnect()
    }
  }

  // ═════════════ LICENSE (login talab qilinmaydi; majburlash — license/guard.ts, IPC darajasida) ═════════════
  license: PosApi['license'] = {
    status: async () => {
      if (this.host.license) return this.host.license.status()
      return { state: 'active', machineCode: '', trialEndsAt: null, expiresAt: null, permanent: true, contact: '' }
    },
    activate: async (key) => {
      this.noViewer()
      if (!this.host.license) fail('Litsenziya bu muhitda mavjud emas')
      return this.host.license.activate(key)
    }
  }

  /** Testlar uchun: qaytarish yozuvlari. */
  listReturns(sessionId: Id): ReturnRecord[] {
    return this.db.all<ReturnRow>('SELECT * FROM returns WHERE session_id=? ORDER BY id', [sessionId]).map(toReturn)
  }
}
