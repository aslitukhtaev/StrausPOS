/**
 * Delfin Sauna — domen turlari (SHARTNOMA). Bu fayl main va renderer uchun umumiy.
 * Pul: butun son, so'm (UZS). Vaqt: epoch millisekund (number).
 */

export type Id = number

// ───────────── Xodimlar va ruxsatlar ─────────────
export type Role = 'owner' | 'admin' | 'cashier' | 'waiter'

export interface Staff {
  id: Id
  name: string
  role: Role
  /** PIN faqat main jarayonda saqlanadi/tekshiriladi; UI ga hech qachon yuborilmaydi. */
  active: boolean
  /** Xizmat ko'rsatuvchi (masalan masseuse) — xizmat qo'shishda tanlanadi. */
  isProvider: boolean
  /** Ofitsiant — xonaga biriktiriladi va shu xonadagi BAR mahsulotlaridan foiz oladi (xizmatlardan emas). */
  isWaiter: boolean
  /** Ofitsiant foizi, 0..100 (masalan 10). Biriktirilgan paytdagi qiymat sessiyada muzlatiladi. */
  commissionPct: number
}

export type Permission =
  | 'session.open'
  | 'session.manage' // vaqtni pauza/tugatish, xona almashtirish, mahsulot qo'shish
  | 'session.pay'
  | 'line.return' // X tugmasi: qaytarish
  | 'price.override'
  | 'discount.apply'
  | 'debt.manage'
  | 'stock.manage'
  | 'reports.view'
  | 'settings.manage' // xonalar, narxlar, mahsulotlar, chek, parol
  | 'staff.manage'
  | 'backup.manage'

// ───────────── Xonalar ─────────────
export interface Room {
  id: Id
  name: string
  /** Bir kishiga 1 soat narxi */
  pricePerHour: number
  /** Maksimal odam soni (ega belgilaydi) */
  capacity: number
  active: boolean
  sortOrder: number
}

// ───────────── Mahsulot / xizmat ─────────────
export interface ProductCategory {
  id: Id
  name: string
  sortOrder: number
}

export interface Product {
  id: Id
  categoryId: Id
  name: string
  price: number
  stock: number
  trackStock: boolean
  lowStockAt: number
  active: boolean
}

/** Xizmat (massaj va h.k.) — qat'iy narx, ulush yo'q. */
export interface ServiceItem {
  id: Id
  name: string
  price: number
  durationMin: number | null
  active: boolean
}

// ───────────── Sessiya (guruh tashrifi) ─────────────
export type SessionStatus = 'open' | 'closed'

export interface Session {
  id: Id
  roomId: Id
  status: SessionStatus
  openedAt: number
  closedAt: number | null
  openedBy: Id
  /** Hisob umumiy chegirmasi, so'm (0 = yo'q) */
  discount: number
  note: string
  /** Biriktirilgan ofitsiant (null = biriktirilmagan — UI ogohlantiradi) */
  waiterId: Id | null
  /** Biriktirilgan paytdagi ofitsiant foizi (muzlatilgan) */
  waiterPct: number
}

/** Mehmonning bitta uzluksiz "ishlayotgan" oralig'i. Tarif shu paytdagi xona narxi. */
export interface TimeInterval {
  roomId: Id
  /** so'm/soat — oraliq boshlangan paytdagi xona narxi (muzlatilgan) */
  rate: number
  start: number
  /** null = hozir ishlayapti */
  end: number | null
}

export type GuestState = 'running' | 'paused' | 'finished'

export interface Guest {
  id: Id
  sessionId: Id
  label: string // "Mehmon 1"
  state: GuestState
  intervals: TimeInterval[]
  /**
   * Oldindan olingan (to'lanadigan) vaqt, daqiqa. Xona ochilganda 1/2/3... soat tanlanadi.
   * Mehmon kamroq o'tirsa ham shu vaqt to'liq to'lanadi; oshsa — keyingi bloklar (AppSettings.blockMinutes) qo'shiladi.
   */
  paidMinutes: number
}

// ───────────── Buyurtma qatorlari ─────────────
export type LineKind = 'product' | 'service'

export interface OrderLine {
  id: Id
  sessionId: Id
  /** null = butun guruhga */
  guestId: Id | null
  kind: LineKind
  /** productId yoki serviceId */
  refId: Id
  name: string
  unitPrice: number
  /** Dastlabki miqdor */
  qty: number
  /** Qaytarilgan miqdor (X tugmasi). Hisobga olinadigan miqdor = qty - returnedQty */
  returnedQty: number
  /** Xizmat ko'rsatuvchi xodim (faqat kind='service') */
  providerId: Id | null
  createdAt: number
  createdBy: Id
}

export interface ReturnRecord {
  id: Id
  lineId: Id
  sessionId: Id
  qty: number
  reason: string
  at: number
  by: Id
}

// ───────────── To'lov va qarz ─────────────
export type PayMethod = 'cash' | 'card' | 'debt'

export interface PaymentInput {
  method: PayMethod
  amount: number
}

export interface DebtorInput {
  name: string
  phone: string
}

export interface Payment {
  id: Id
  sessionId: Id
  method: PayMethod
  amount: number
  at: number
  by: Id
}

export interface Debt {
  id: Id
  sessionId: Id | null
  customerName: string
  phone: string
  amount: number
  paid: number
  createdAt: number
  closedAt: number | null
}

export interface DebtPayment {
  id: Id
  debtId: Id
  method: 'cash' | 'card'
  amount: number
  at: number
  by: Id
}

// ───────────── Sozlamalar ─────────────
export interface ReceiptSettings {
  businessName: string
  address: string
  phone: string
  footer: string
  paperWidth: 58 | 80
  showGuestBreakdown: boolean
  showStaff: boolean
  showTimes: boolean
  autoPrintOnPay: boolean
  /** Bo'sh = tizimning standart printeri */
  printerName: string
}

export interface AppSettings {
  receipt: ReceiptSettings
  /** Vaqt summasi shu songa yaxlitlanadi (masalan 1000). 1 = yaxlitlamaslik */
  roundTo: number
  /** Xona ochilganda standart tanlanadigan soat (1, 2, ...) */
  defaultHours: number
  /** Olingan vaqtdan oshib ketsa, shu daqiqalik bloklar bilan qo'shiladi (standart 60 = har boshlangan soat) */
  blockMinutes: number
  /** Oshib ketganda keyingi blok hisoblanishidan oldingi imtiyozli daqiqalar (0 = qattiq) */
  graceMinutes: number
  /** Vaqt tugashiga necha daqiqa qolganda ogohlantirilsin */
  warnBeforeMinutes: number
  /** Interfeys rejimi: kunduzgi / tungi / tizimga qarab */
  theme: 'light' | 'dark' | 'auto'
  /** Qulf ekrani yoqilganmi */
  lockEnabled: boolean
  /** Hech narsa bosilmasa necha daqiqada qulflansin (0 = hech qachon) */
  autoLockMinutes: number
  language: 'uz'
}

// ───────────── Ko'rinish modellari (UI uchun, hisoblangan) ─────────────
export interface GuestView extends Guest {
  /** Barcha oraliqlar bo'yicha jami millisekund (hozirgi `now` ga qadar) */
  elapsedMs: number
  /** Vaqt uchun summa (yaxlitlangan) */
  timeAmount: number
  /** Qolgan vaqt (ms): paidMinutes − o'tgan vaqt. Manfiy = oshib ketgan (overtime) */
  remainingMs: number
  /** Hisoblanadigan daqiqalar (olingan vaqt + oshgan bloklar) */
  billedMinutes: number
  /** Hozirgi ishlayotgan oraliq tarifi (running bo'lsa), aks holda 0 */
  runningRate: number
  /** Ushbu mehmonga tegishli (guestId) qatorlar summasi */
  linesAmount: number
}

export interface LineView extends OrderLine {
  activeQty: number // qty - returnedQty
  amount: number // activeQty * unitPrice
  providerName: string | null
}

export interface SessionView {
  session: Session
  room: Room
  /** Biriktirilgan ofitsiant ismi (null = yo'q) */
  waiterName: string | null
  guests: GuestView[]
  lines: LineView[]
  /** Hisoblangan `now` (server vaqti) — UI shu bilan har soniya o'zi yangilaydi */
  computedAt: number
  timeTotal: number
  linesTotal: number
  discount: number
  /** timeTotal + linesTotal - discount */
  total: number
  paid: number
  /** total - paid (>= 0) */
  due: number
  payments: Payment[]
}

export interface RoomCard {
  room: Room
  /** null = bo'sh */
  session: SessionView | null
  guestsActive: number
  /** Hozirgi hisob summasi (bo'sh bo'lsa 0) */
  currentTotal: number
}

// ───────────── Chek ─────────────
export interface ReceiptData {
  settings: ReceiptSettings
  receiptNo: number
  roomName: string
  openedAt: number
  closedAt: number
  cashier: string
  guests: { label: string; elapsedMs: number; timeAmount: number }[]
  lines: { name: string; qty: number; unitPrice: number; amount: number; guestLabel: string | null; providerName: string | null }[]
  timeTotal: number
  linesTotal: number
  discount: number
  total: number
  payments: { method: PayMethod; amount: number }[]
  debtor: DebtorInput | null
}

// ───────────── Hisobotlar ─────────────
export interface ReportRange {
  from: number
  to: number
}

export interface SalesReport {
  range: ReportRange
  sessionsCount: number
  timeRevenue: number
  productRevenue: number
  serviceRevenue: number
  discounts: number
  total: number
  byMethod: { cash: number; card: number; debt: number }
  /** Shu davrda qarzdan undirilgan to'lovlar (kassadagi naqd = byMethod.cash + debtPayments.cash) */
  debtPayments: { cash: number; card: number }
  returnsAmount: number
  byDay: { day: string; total: number }[]
  byRoom: { roomId: Id; roomName: string; sessions: number; total: number }[]
  byProduct: { name: string; qty: number; amount: number }[]
  byProvider: { staffId: Id; name: string; count: number; amount: number }[]
  byStaff: { staffId: Id; name: string; sessions: number; total: number }[]
  /** Ofitsiantlar: bar savdosi va hisoblangan haq */
  byWaiter: { staffId: Id; name: string; sessions: number; productSales: number; commission: number }[]
}

// ───────────── Ofitsiantlar hisob-kitobi ─────────────
export interface WaiterMonthRow {
  staffId: Id
  name: string
  /** Hozirgi foiz (ma'lumot uchun; hisob sessiyalardagi muzlatilgan foiz bilan) */
  commissionPct: number
  /** Shu oyda yopilgan, ofitsiant biriktirilgan sessiyalar soni */
  sessions: number
  /** Shu sessiyalardagi bar mahsulotlari savdosi (qaytarishlar ayirilgan, xizmatlar kirmaydi) */
  productSales: number
  /** Hisoblangan haq */
  commission: number
  /** Shu oy uchun berilgan to'lovlar */
  paid: number
  /** commission − paid */
  balance: number
}

export interface WaiterPayout {
  id: Id
  staffId: Id
  /** 'YYYY-MM' */
  month: string
  amount: number
  note: string
  at: number
  by: Id
}

export interface WaiterSessionRow {
  sessionId: Id
  closedAt: number
  roomName: string
  productSales: number
  pct: number
  commission: number
}

// ───────────── Tarmoq: ikkinchi kompyuter "faqat ko'rish" rejimida ─────────────
/** Asosiy kompyuter (baza shu yerda) yoki ko'ruvchi (Wi-Fi orqali asosiyga ulangan, faqat o'qiydi) */
export type AppMode = 'main' | 'viewer'

export interface NetworkStatus {
  /** Ko'ruvchi kompyuterlarga ruxsat berilganmi */
  enabled: boolean
  port: number
  /** Ulanish kodi (6 raqam) — ko'ruvchi kompyuterda bir marta kiritiladi */
  code: string
  /** Shu kompyuterning Wi-Fi/LAN manzillari (masalan 192.168.1.10) */
  addresses: string[]
  /** Oxirgi 2 daqiqada so'rov yuborgan ko'ruvchilar */
  viewers: { ip: string; name: string; lastSeen: number }[]
}

export interface DiscoveredServer {
  host: string
  port: number
  /** Biznes nomi */
  name: string
}

export interface ConnectionInfo {
  mode: AppMode
  /** viewer rejimida: asosiy kompyuter manzili */
  host: string | null
  port: number | null
  /** viewer rejimida: hozir aloqa bormi */
  connected: boolean
}
