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
  WaiterMonthRow, WaiterPayout, WaiterSessionRow, BarSaleRow, LicenseStatus, Debtor, DebtPayMethod, KitchenDayRow, KitchenPayout, NetworkStatus, DiscoveredServer, ConnectionInfo, SessionHistoryRow, SessionDetail, SoldItemRow, Expense, ExpenseCategory, ProfitReport
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
     * Xonani ochish: mehmonlar soni (1..sig'im), har bir mehmon uchun olingan vaqt (daqiqa, masalan 60/120).
     * Ofitsiant xonaga BIRIKTIRILMAYDI — har bir ofitsiant o'z profili bilan istalgan xonaga buyurtma qo'shadi
     * (OrderLine.waiterId). Eski sessiyalardagi waiterId/waiterPct faqat tarix uchun saqlanadi.
     */
    open(roomId: Id, guestCount: number, paidMinutes: number): Promise<SessionView>
    get(sessionId: Id): Promise<SessionView>
    /** Yopilgan (yoki ochiq) sessiya to'liq tafsiloti: qatorlar (kim, qachon), qaytarishlar, to'lovlar. Ruxsat: reports.view */
    detail(sessionId: Id): Promise<SessionDetail>
    /**
     * Yopilgan sessiyalardagi sotuvlar ro'yxati (har qator — kim sotgani bilan), eng yangisi birinchi.
     * staffId berilsa faqat shu xodim sotganlari. Ruxsat: reports.view
     */
    soldItems(range: ReportRange, staffId: Id | null): Promise<SoldItemRow[]>
    addGuest(sessionId: Id, paidMinutes: number): Promise<SessionView>
    /** Mehmonga vaqt qo'shish (+1 soat va h.k.). minutes > 0 */
    extendGuest(guestId: Id, minutes: number): Promise<SessionView>
    /** Sessiyadagi barcha tugamagan mehmonlarga vaqt qo'shish */
    extendAll(sessionId: Id, minutes: number): Promise<SessionView>
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
    /**
     * waiterId: ofitsiant o'zi kirgan bo'lsa e'tiborsiz (u avtomatik yoziladi); kassir/admin qo'shsa ixtiyoriy
     * "kim olib bordi" (null = ofitsiantsiz, haq yo'q). Oshxona mahsuloti bo'lsa oshxona cheki avtomatik chiqadi.
     */
    addProduct(sessionId: Id, productId: Id, qty: number, guestId: Id | null, waiterId?: Id | null): Promise<SessionView>
    /** Bir nechta mahsulotni bitta amalda qo'shish (qo'shish oynasidagi −/+ savat; oshxona cheki bitta bo'lib chiqadi) */
    addProducts(sessionId: Id, items: { productId: Id; qty: number }[], guestId: Id | null, waiterId?: Id | null): Promise<SessionView>
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
    /** Sessiya yopilmasdan oraliq hisob cheki (provisional=true, "To'lanmagan"). Ruxsat: session.manage */
    preBill(sessionId: Id): Promise<ReceiptData>
  }

  /**
   * Xonasiz bar savdosi (kassa). Oddiy sessiya kabi: kind='bar', roomId=0, mehmonlar/vaqt/ofitsiant YO'Q.
   * Mahsulot qo'shish — lines.addProduct(sessionId, productId, qty, null); X — lines.returnLine;
   * to'lov — checkout.pay (CheckoutDialog o'zgarishsiz ishlaydi); bo'sh savdo — sessions.cancel.
   * Xizmat qo'shib bo'lmaydi, extend/moveRoom/addGuest rad etiladi; ofitsiant haqi hisoblanmaydi (waiterId e'tiborsiz).
   * Xonalar paneli (rooms.board) bar savdolarini ko'rsatmaydi.
   */
  barSales: {
    /** Yangi bar savdosi. Ruxsat: session.open */
    open(): Promise<SessionView>
    /** Ochiq (to'lanmagan) bar savdolari, eng yangisi birinchi */
    openList(): Promise<SessionView[]>
    /** Yopilgan bar savdolari oralig'da (chekni qayta ko'rish uchun checkout.receipt). Ruxsat: session.pay */
    history(range: ReportRange): Promise<BarSaleRow[]>
  }

  /**
   * Litsenziya (login talab qilmaydi). Muddat tugagan bo'lsa main jarayon barcha YOZISH metodlarini rad etadi
   * ("Litsenziya muddati tugagan…"), faqat o'qish, auth.*, license.*, system.backup va connection.* ishlaydi.
   */
  license: {
    status(): Promise<LicenseStatus>
    /** Imzolangan kalitni kiritish. Noto'g'ri/boshqa kompyuterniki/muddati o'tgan bo'lsa tushunarli xato */
    activate(key: string): Promise<LicenseStatus>
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
    pay(debtId: Id, method: DebtPayMethod, amount: number): Promise<Debt>
    payments(debtId: Id): Promise<DebtPayment[]>
  }

  /** Qarzdorlar (bir odam — bitta yozuv). Qarz yozishda avval qidiriladi, topilsa shu odamga qo'shiladi */
  debtors: {
    /** Ism yoki telefon bo'yicha qidiruv (to'lov oynasidagi avtomatik taklif). Ruxsat: debt.manage */
    search(query: string): Promise<Debtor[]>
    list(onlyOpen: boolean): Promise<Debtor[]>
    /** Odamning barcha qarzlari (eng yangisi birinchi) */
    debts(debtorId: Id): Promise<Debt[]>
    /** Odamning qarzini to'lash — eng eski qarzdan boshlab yopiladi (FIFO). amount ≤ balance */
    pay(debtorId: Id, method: DebtPayMethod, amount: number): Promise<Debtor>
    /** Ism/telefonni tuzatish (telefon boshqa qarzdorniki bo'lsa — rad) */
    rename(debtorId: Id, name: string, phone: string): Promise<Debtor>
  }

  /** Oshxona kunlik hisob-kitobi (oshxona jamoasiga har kuni pul berish). Ruxsat: reports.view; payout — staff.manage */
  kitchen: {
    /** Oy ichidagi kunlar ('YYYY-MM') */
    daily(month: string): Promise<KitchenDayRow[]>
    payout(day: string, amount: number, note: string): Promise<KitchenPayout>
    payouts(month: string): Promise<KitchenPayout[]>
    /** Oshxona chekini qayta chop etish (sessiyadagi barcha faol oshxona qatorlari) */
    reprint(sessionId: Id): Promise<void>
  }

  // ── Xodimlar ──
  staff: {
    list(): Promise<Staff[]>
    save(input: Partial<Staff> & StaffInput): Promise<Staff>
    /** PIN o'zgartirish (faqat ega yoki o'z PINi) */
    changePin(staffId: Id, newPin: string): Promise<void>
  }

  // ── Ofitsiantlar oylik hisob-kitobi ──
  /** Xarajatlar. O'qish: reports.view; yozish/o'chirish: expense.manage (ega, administrator) */
  expenses: {
    list(range: ReportRange): Promise<Expense[]>
    /** id yo'q = yangi. day 'YYYY-MM-DD' (kelajak kun mumkin emas), amount > 0 butun so'm */
    save(e: { id?: Id; day: string; categoryId: Id; amount: number; note: string }): Promise<Expense>
    remove(id: Id): Promise<void>
    categories(): Promise<ExpenseCategory[]>
    /** Standart: Ijara, Kommunal (svet, gaz, suv), Maosh, Mahsulot xaridi, Ta'mirlash, Reklama, Boshqa */
    saveCategory(c: { id?: Id; name: string; active: boolean }): Promise<ExpenseCategory>
  }

  /** Sof foyda hisoboti. Ruxsat: reports.view */
  profit: {
    report(range: ReportRange): Promise<ProfitReport>
  }

  waiters: {
    /** Faol ofitsiantlar (xonaga biriktirish uchun; session.open ruxsati yetarli) */
    list(): Promise<Staff[]>
    /** Oylik hisob: month = 'YYYY-MM' (mahalliy vaqt). Ruxsat: reports.view */
    monthly(month: string): Promise<WaiterMonthRow[]>
    /** Ofitsiantning shu oydagi sessiyalari (tafsilot). Ruxsat: reports.view */
    sessions(staffId: Id, month: string): Promise<WaiterSessionRow[]>
    /** Ofitsiantga pul berildi (oylik hisob-kitob). Ruxsat: staff.manage */
    payout(staffId: Id, month: string, amount: number, note: string): Promise<WaiterPayout>
    /** Ruxsat: reports.view */
    payouts(staffId: Id, month: string): Promise<WaiterPayout[]>
  }

  // ── Tarmoq (asosiy kompyuterda): ko'ruvchi kompyuterlarga ruxsat. Ruxsat: settings.manage ──
  network: {
    status(): Promise<NetworkStatus>
    setEnabled(enabled: boolean): Promise<NetworkStatus>
    /** Yangi ulanish kodi — eski kod bilan ulangan terminallar uziladi */
    regenerateCode(): Promise<NetworkStatus>
  }

  /**
   * Ulanish rejimi (har bir kompyuterning o'zida, login talab qilmaydi; lokal konfiguratsiyada saqlanadi).
   * TERMINAL — ikkinchi kompyuter (ofitsiantlar monobloki): asosiyga Wi-Fi orqali ulanadi, o'z qulf/login ekrani bor
   * (xodim PIN), barcha PosApi amallari asosiy bazada SHU TERMINALNING login konteksti bilan bajariladi.
   * Terminalda ishlamaydigan (faqat asosiy kompyuterga tegishli): network.*, system.backup/restore, license.activate,
   * auth.setupOwner. Kassa cheki terminalning o'z printeriga, oshxona cheki asosiy kompyuterdagi oshxona printeriga.
   */
  connection: {
    info(): Promise<ConnectionInfo>
    /** Wi-Fi'dagi asosiy kompyuterlarni qidirish (UDP broadcast, ~2 soniya) */
    discover(): Promise<DiscoveredServer[]>
    /** Terminal rejimiga o'tish: manzil + kod tekshiriladi, saqlanadi, ilova qayta yuklanadi */
    connectTerminal(host: string, port: number, code: string): Promise<void>
    /** Terminal rejimidan chiqish (asosiy rejimga qaytish) */
    disconnect(): Promise<void>
  }

  // ── Sozlamalar / hisobot / zaxira ──
  settings: {
    get(): Promise<AppSettings>
    save(s: AppSettings): Promise<AppSettings>
  }
  reports: {
    sales(range: ReportRange): Promise<SalesReport>
    returns(range: ReportRange): Promise<{ at: number; productName: string; qty: number; amount: number; reason: string; by: string; roomName: string }[]>
    sessions(range: ReportRange): Promise<SessionHistoryRow[]>
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
