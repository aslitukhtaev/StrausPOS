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
  /** Ofitsiant — xonaga biriktirilmaydi; o'zi qo'shgan bar va oshxona mahsulotlaridan foiz oladi (xizmatlardan emas). */
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
/** Bo'lim: bar (ichimlik/snek) yoki oshxona (ovqat — alohida jamoa yuritadi, oshxona cheki chiqadi) */
export type Department = 'bar' | 'kitchen'

export interface ProductCategory {
  id: Id
  name: string
  sortOrder: number
  /** Kategoriya qaysi bo'limga tegishli (mahsulotlar shu bo'limni oladi). Standart 'bar' */
  department: Department
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

/** 'room' — xona sessiyasi; 'bar' — xonasiz bar savdosi (vaqt, mehmon, ofitsiant yo'q) */
export type SessionKind = 'room' | 'bar'

export interface Session {
  id: Id
  kind: SessionKind
  /** kind='bar' bo'lsa 0 (SessionView.room — sintetik "Bar" xonasi, id=0) */
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
  /** Mahsulot bo'limi (kind='product'); xizmatlar uchun null */
  department: Department | null
  /**
   * Shu qatorni olib kelgan OFITSIANT (ofitsiant o'z profili bilan qo'shsa — avtomatik; kassir qo'shganda ixtiyoriy tanlanadi).
   * Ofitsiant haqi = shu qator summasi (qaytarishlar ayirilgan) × waiterPct%. Faqat bar va oshxona mahsulotlari; xizmatlar — yo'q.
   */
  waiterId: Id | null
  /** Qo'shilgan paytdagi ofitsiant foizi (muzlatilgan) */
  waiterPct: number
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
/** Naqd · Karta (o'tkazma) · Terminal (POS) · Qarz. Aralash to'lovda to'rttasi ham (qarz ham) bo'lishi mumkin */
export type PayMethod = 'cash' | 'card' | 'terminal' | 'debt'
/** Qarzni to'lash usullari */
export type DebtPayMethod = 'cash' | 'card' | 'terminal'

export interface PaymentInput {
  method: PayMethod
  amount: number
}

export interface DebtorInput {
  /** Mavjud qarzdor tanlangan bo'lsa — uning id si (yangi yozuv yaratilmaydi, qarz shu odamga qo'shiladi) */
  debtorId?: Id | null
  name: string
  phone: string
}

/** Qarzdor (bitta odam — bitta yozuv; telefon raqami bo'yicha takrorlanmaydi) */
export interface Debtor {
  id: Id
  name: string
  phone: string
  /** Jami olingan qarz */
  total: number
  paid: number
  /** total − paid */
  balance: number
  debtsCount: number
  lastAt: number
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
  debtorId: Id
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
  method: DebtPayMethod
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
  /** Olingan vaqtdan oshsa, shu daqiqalik bloklar bilan qo'shiladi. Standart 1 = aynan o'tirilgan daqiqa uchun (01:01 → 61 daq) */
  blockMinutes: number
  /** Oshib ketganda keyingi blok hisoblanishidan oldingi imtiyozli daqiqalar (0 = qattiq) */
  graceMinutes: number
  /** Vaqt tugashiga necha daqiqa qolganda ogohlantirilsin */
  warnBeforeMinutes: number
  /** Oshxona: ulush foizi (oshxona savdosidan oshxonaga beriladigan qism, standart 100), oshxona printeri, avtomatik chek */
  kitchen: { sharePct: number; printerName: string; paperWidth: 58 | 80; autoPrint: boolean }
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
  /** true — sessiya yopilmagan, oraliq hisob ("To'lanmagan") */
  provisional: boolean
}

// ───────────── Hisobotlar ─────────────
export interface ReportRange {
  from: number
  to: number
}

export interface SalesReport {
  range: ReportRange
  /** Faqat xona seanslari (bar savdolari — barSales.count) */
  sessionsCount: number
  timeRevenue: number
  productRevenue: number
  serviceRevenue: number
  discounts: number
  total: number
  byMethod: { cash: number; card: number; terminal: number; debt: number }
  /** Shu davrda qarzdan undirilgan to'lovlar (kassadagi naqd = byMethod.cash + debtPayments.cash) */
  debtPayments: { cash: number; card: number; terminal: number }
  returnsAmount: number
  byDay: { day: string; total: number }[]
  byRoom: { roomId: Id; roomName: string; sessions: number; total: number }[]
  byProduct: { name: string; qty: number; amount: number }[]
  byProvider: { staffId: Id; name: string; count: number; amount: number }[]
  byStaff: { staffId: Id; name: string; sessions: number; total: number }[]
  /** Ofitsiantlar: bar savdosi va hisoblangan haq */
  byWaiter: { staffId: Id; name: string; sessions: number; productSales: number; commission: number }[]
  /** Xonasiz bar savdolari (jami summalar yuqoridagi umumiy ko'rsatkichlarga ham kiradi) */
  barSales: { count: number; total: number }
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
/**
 * main — asosiy kompyuter ("miya", baza shu yerda);
 * terminal — Wi-Fi orqali asosiyga ulangan TO'LIQ ishlaydigan kompyuter (masalan ofitsiantlar monobloki):
 *   o'z login'i (xodim PIN), barcha amallar asosiy bazada bajariladi, ikkala ekran sinxron.
 */
export type AppMode = 'main' | 'terminal'

export interface NetworkStatus {
  /** Ko'ruvchi kompyuterlarga ruxsat berilganmi */
  enabled: boolean
  port: number
  /** Ulanish kodi (6 raqam) — ko'ruvchi kompyuterda bir marta kiritiladi */
  code: string
  /** Shu kompyuterning Wi-Fi/LAN manzillari (masalan 192.168.1.10) */
  addresses: string[]
  /** Oxirgi 2 daqiqada so'rov yuborgan terminallar (kompyuter nomi, IP, kirgan xodim) */
  terminals: { ip: string; name: string; staffName: string | null; lastSeen: number }[]
}

export interface DiscoveredServer {
  host: string
  port: number
  /** Biznes nomi */
  name: string
}

export interface ConnectionInfo {
  mode: AppMode
  /** terminal rejimida: asosiy kompyuter manzili */
  host: string | null
  port: number | null
  /** terminal rejimida: hozir aloqa bormi */
  connected: boolean
}

export interface BarSaleRow {
  sessionId: Id
  receiptNo: number | null
  closedAt: number
  /** Mahsulotlar soni (qaytarilganlar ayirilgan) */
  items: number
  total: number
  cashier: string
}

// ───────────── Litsenziya (oflayn aktivatsiya) ─────────────
/**
 * trial — 1 kunlik sinov; active — imzolangan kalit amalda; expired — sinov/kalit muddati tugagan yoki kalit yo'q;
 * tampered — kompyuter soati orqaga surilgani aniqlandi (expired kabi cheklanadi).
 * expired/tampered: dastur FAQAT KO'RISH rejimida (ma'lumotlar saqlanadi; hisobot, qarzlar, zaxira ishlaydi).
 */
export type LicenseState = 'trial' | 'active' | 'expired' | 'tampered'

export interface LicenseStatus {
  state: LicenseState
  /** Mijoz ishlab chiquvchiga yuboradigan kod, masalan "7K3Q9-XPM2A-B4C" */
  machineCode: string
  /** Sinov tugash vaqti (trial/expired holatida) */
  trialEndsAt: number | null
  /** Kalit tugash vaqti; null — doimiy yoki kalit yo'q */
  expiresAt: number | null
  permanent: boolean
  /** Ishlab chiquvchi bilan bog'lanish (telefon) */
  contact: string
}

// ───────────── Oshxona hisobi ─────────────
/** Oshxona kunlik hisobi: oshxona mahsulotlari savdosi va oshxonaga beriladigan ulush (AppSettings.kitchen.sharePct) */
export interface KitchenDayRow {
  /** 'YYYY-MM-DD' (mahalliy) */
  day: string
  /** Oshxona mahsulotlari savdosi (qaytarishlar ayirilgan; yopilgan sessiyalar) */
  sales: number
  /** Oshxonaga hisoblangan summa = sales × sharePct% (sessiya yopilgan paytdagi foiz bilan) */
  due: number
  /** Shu kun uchun berilgan pul */
  paid: number
  balance: number
  orders: number
}

export interface KitchenPayout {
  id: Id
  day: string
  amount: number
  note: string
  at: number
  by: Id
}
