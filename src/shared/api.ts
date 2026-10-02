/**
 * PosApi — renderer ↔ main SHARTNOMASI.
 * Renderer faqat shu interfeys orqali ishlaydi:
 *   - Electron: window.api (preload, IPC)
 *   - Brauzer/test: HTTP /rpc (scripts/dev-server.ts), bir xil PosService
 * Xatolar: Promise reject bo'ladi, `Error.message` foydalanuvchiga ko'rsatiladigan o'zbekcha matn.
 */
import type {
  AppSettings, Debt, DebtPayment, DebtorInput, Guest, Id, OrderLine, PaymentInput, Product, ProductCategory,
  ReceiptData, ReportRange, Role, Room, RoomCard, SalesReport, ServiceItem, SessionView, Staff,
  WaiterMonthRow, WaiterPayout, WaiterSessionRow
} from './types'
import type { Permission } from './types'

export interface StaffInput {
  name: string
  role: Role
  pin: string
  isProvider: boolean
  isWaiter: boolean
  /** 0..100 */
  commissionPct: number
  active: boolean
}

export interface PosApi {
  // ── Kirish / qulf ──
  auth: {
    /** Qulf ekrani uchun: kirish ekranida ko'rsatiladigan xodimlar (PINsiz) */
    listLoginStaff(): Promise<Staff[]>
    login(staffId: Id, pin: string): Promise<{ staff: Staff; permissions: Permission[] }>
    logout(): Promise<void>
    current(): Promise<{ staff: Staff; permissions: Permission[] } | null>
    /** Birinchi ishga tushirish: hech qanday xodim yo'q bo'lsa true */
    needsSetup(): Promise<boolean>
    /** Birinchi ishga tushirish: ega yaratish (faqat needsSetup()=true bo'lganda) */
    setupOwner(name: string, pin: string, businessName: string): Promise<void>
  }

  // ── Xonalar va sessiyalar ──
  rooms: {
    board(): Promise<RoomCard[]>
    list(): Promise<Room[]>
    save(room: Partial<Room> & Pick<Room, 'name' | 'pricePerHour' | 'capacity'>): Promise<Room>
    remove(id: Id): Promise<void>
  }

  sessions: {
    /**
     * Xonani ochish: mehmonlar soni (1..sig'im), har bir mehmon uchun olingan vaqt (daqiqa, masalan 60/120),
     * ofitsiant (null = keyin biriktiriladi; UI ogohlantiradi).
     */
    open(roomId: Id, guestCount: number, paidMinutes: number, waiterId: Id | null): Promise<SessionView>
    get(sessionId: Id): Promise<SessionView>
    addGuest(sessionId: Id, paidMinutes: number): Promise<SessionView>
    /** Mehmonga vaqt qo'shish (+1 soat va h.k.). minutes > 0 */
    extendGuest(guestId: Id, minutes: number): Promise<SessionView>
    /** Sessiyadagi barcha tugamagan mehmonlarga vaqt qo'shish */
    extendAll(sessionId: Id, minutes: number): Promise<SessionView>
    /** Ofitsiant biriktirish/almashtirish (null = olib tashlash). Foiz shu paytda muzlatiladi. */
    setWaiter(sessionId: Id, waiterId: Id | null): Promise<SessionView>
    /** Mehmon vaqtini boshqarish */
    guestPause(guestId: Id): Promise<SessionView>
    guestResume(guestId: Id): Promise<SessionView>
    /** Mehmon chiqib ketdi: vaqti tugaydi (qolganlariniki davom etadi) */
    guestFinish(guestId: Id): Promise<SessionView>
    renameGuest(guestId: Id, label: string): Promise<SessionView>
    /** Butun guruhni boshqa xonaga o'tkazish (sig'im tekshiriladi, xona band bo'lmasligi kerak) */
    moveRoom(sessionId: Id, newRoomId: Id): Promise<SessionView>
    setDiscount(sessionId: Id, amount: number): Promise<SessionView>
    /** Barcha mehmonlar vaqtini to'xtatadi va to'lovga tayyorlaydi (to'lov qilinmaguncha sessiya ochiq) */
    stopAll(sessionId: Id): Promise<SessionView>
    /** Bo'sh (hech narsa qo'shilmagan) sessiyani bekor qilish */
    cancel(sessionId: Id): Promise<void>
  }

  // ── Qatorlar (bar/xizmat) ──
  lines: {
    addProduct(sessionId: Id, productId: Id, qty: number, guestId: Id | null): Promise<SessionView>
    addService(sessionId: Id, serviceId: Id, guestId: Id | null, providerId: Id | null): Promise<SessionView>
    /** X tugmasi: qaytarish. qty <= faol miqdor. Mahsulot omborga qaytadi. */
    returnLine(lineId: Id, qty: number, reason: string): Promise<SessionView>
  }

  // ── To'lov ──
  checkout: {
    /**
     * To'lovni yopish. payments yig'indisi == total bo'lishi shart.
     * method='debt' bo'lsa debtor majburiy. Sessiyani yopadi va chek ma'lumotini qaytaradi.
     */
    pay(sessionId: Id, payments: PaymentInput[], debtor: DebtorInput | null): Promise<ReceiptData>
    receipt(sessionId: Id): Promise<ReceiptData>
  }

  // ── Bar / ombor ──
  catalog: {
    categories(): Promise<ProductCategory[]>
    saveCategory(c: Partial<ProductCategory> & Pick<ProductCategory, 'name'>): Promise<ProductCategory>
    removeCategory(id: Id): Promise<void>
    products(includeInactive?: boolean): Promise<Product[]>
    saveProduct(p: Partial<Product> & Pick<Product, 'name' | 'categoryId' | 'price'>): Promise<Product>
    removeProduct(id: Id): Promise<void>
    adjustStock(productId: Id, delta: number, reason: string): Promise<Product>
    services(includeInactive?: boolean): Promise<ServiceItem[]>
    saveService(s: Partial<ServiceItem> & Pick<ServiceItem, 'name' | 'price'>): Promise<ServiceItem>
    removeService(id: Id): Promise<void>
  }

  // ── Qarzlar ──
  debts: {
    list(onlyOpen: boolean): Promise<Debt[]>
    pay(debtId: Id, method: 'cash' | 'card', amount: number): Promise<Debt>
    payments(debtId: Id): Promise<DebtPayment[]>
  }

  // ── Xodimlar ──
  staff: {
    list(): Promise<Staff[]>
    save(input: Partial<Staff> & StaffInput): Promise<Staff>
    /** PIN o'zgartirish (faqat ega yoki o'z PINi) */
    changePin(staffId: Id, newPin: string): Promise<void>
  }

  // ── Ofitsiantlar oylik hisob-kitobi ──
  waiters: {
    /** Faol ofitsiantlar (xonaga biriktirish uchun; session.open ruxsati yetarli) */
    list(): Promise<Staff[]>
    /** Oylik hisob: month = 'YYYY-MM' (mahalliy vaqt). Ruxsat: reports.view */
    monthly(month: string): Promise<WaiterMonthRow[]>
    /** Ofitsiantning shu oydagi sessiyalari (tafsilot). Ruxsat: reports.view */
    sessions(staffId: Id, month: string): Promise<WaiterSessionRow[]>
    /** Ofitsiantga pul berildi (oylik hisob-kitob). Ruxsat: staff.manage */
    payout(staffId: Id, month: string, amount: number, note: string): Promise<WaiterPayout>
    payouts(staffId: Id, month: string): Promise<WaiterPayout[]>
  }

  // ── Sozlamalar / hisobot / zaxira ──
  settings: {
    get(): Promise<AppSettings>
    save(s: AppSettings): Promise<AppSettings>
  }
  reports: {
    sales(range: ReportRange): Promise<SalesReport>
    returns(range: ReportRange): Promise<{ at: number; productName: string; qty: number; amount: number; reason: string; by: string; roomName: string }[]>
  }
  system: {
    /** Chekni chop etish (Electron: silent print; brauzer: window.print) */
    printReceipt(data: ReceiptData): Promise<void>
    /** HTML ko'rinishini qaytaradi (oldindan ko'rish uchun) */
    receiptHtml(data: ReceiptData): Promise<string>
    /** Zaxira nusxa: Electron'da fayl saqlash oynasi; brauzerda yuklab olish */
    backup(): Promise<{ path: string } | null>
    restore(): Promise<boolean>
    /** Serverdagi hozirgi vaqt (UI soatini sinxronlash uchun) */
    now(): Promise<number>
    /** Tizimdagi printerlar (Electron). Brauzerda bo'sh ro'yxat. */
    listPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
  }
}

export type ApiGroup = keyof PosApi
