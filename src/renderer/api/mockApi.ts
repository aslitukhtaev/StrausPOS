/**
 * mockApi — xotiradagi soxta PosApi (faqat UI ni backendsiz ko'rish uchun!). Biznes mantiq bu yerda YO'Q.
 *
 * Ishga tushirish: `npm run dev:web` → http://localhost:5173/?mock=1
 *   ?mock=1      — tayyor ma'lumot: Aziz (Ega, PIN 1234), Dilnoza (Admin, 1111), Jasur (Kassir, 0000), Malika (Kassir/masseuse, 2222),
 *                Bekzod (Ofitsiant 10%, 3333)
 *   ?mock=empty  — birinchi ishga tushirish (Setup ekrani)
 *   &terminal=1  — terminal rejimi: connection.info().mode='terminal' (odatdagi login), bitta band xona bilan
 *   &offline=1   — terminalda aloqa uzilgan holat (connection.info().connected=false, board xato)
 *
 * Qo'llab-quvvatlanadi: auth.*, settings.*, system.now, rooms.list/board, staff.list, waiters.list, catalog.categories/products/services,
 * debts.list, xonasiz bar savdosi (barSales.*, lines.addProduct/returnLine, sessions.get/cancel, checkout.pay/receipt — faqat bar
 * savdolari uchun soddalashtirilgan). Qolganlari "Mock rejimida mavjud emas" xatosini beradi.
 */
import type { PosApi } from '@shared/api'
import type { AppSettings, BarSaleRow, ConnectionInfo, NetworkStatus, Permission, ReceiptData, SessionView, Product, ProductCategory, Room, RoomCard, ServiceItem, Staff } from '@shared/types'
import { DEFAULT_ROLE_PERMISSIONS, effectivePermissions } from '@shared/permissions'

const delay = <T>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms))
const fail = (msg: string, ms = 160): Promise<never> => new Promise((_r, j) => setTimeout(() => j(new Error(msg)), ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const DEFAULT_SETTINGS: AppSettings = {
  rolePermissions: { admin: DEFAULT_ROLE_PERMISSIONS.admin, cashier: DEFAULT_ROLE_PERMISSIONS.cashier, waiter: DEFAULT_ROLE_PERMISSIONS.waiter },
  receipt: {
    businessName: 'Delfin Sauna',
    address: "Toshkent sh., Chilonzor 12",
    phone: '+998 90 123 45 67',
    footer: 'Tashrifingiz uchun rahmat!',
    paperWidth: 80,
    showGuestBreakdown: true,
    showStaff: true,
    showTimes: true,
    autoPrintOnPay: false,
    printerName: ''
  },
  roundTo: 1000,
  defaultHours: 2,
  serviceChargePct: 10,
  blockMinutes: 1,
  graceMinutes: 0,
  warnBeforeMinutes: 10,
  kitchen: { sharePct: 100, printerName: '', paperWidth: 80, autoPrint: true },
  theme: 'auto',
  lockEnabled: true,
  autoLockMinutes: 5,
  language: 'uz',
  instagram: { qrCodeBase64: '', handle: '@delfin_sauna' }
}

export function createMockApi(opts: { empty?: boolean; terminal?: boolean; offline?: boolean } = {}): PosApi {
  let terminal = !!opts.terminal
  let offline = !!opts.offline
  let staff: Staff[] = opts.empty
    ? []
    : [
        { id: 1, name: 'Aziz Rahimov', role: 'owner', active: true, isProvider: false, isWaiter: false, commissionPct: 0 },
        { id: 2, name: 'Dilnoza Karimova', role: 'admin', active: true, isProvider: false, isWaiter: false, commissionPct: 0 },
        { id: 3, name: 'Jasur Toshmatov', role: 'cashier', active: true, isProvider: false, isWaiter: false, commissionPct: 0 },
        { id: 4, name: 'Malika Yusupova', role: 'cashier', active: true, isProvider: true, isWaiter: false, commissionPct: 0 },
        { id: 5, name: 'Bekzod Aliyev', role: 'waiter', active: true, isProvider: false, isWaiter: true, commissionPct: 10 }
      ]
  const pins = new Map<number, string>(opts.empty ? [] : [[1, '1234'], [2, '1111'], [3, '0000'], [4, '2222'], [5, '3333']])
  let settings: AppSettings = clone(DEFAULT_SETTINGS)
  if (opts.empty) settings.receipt.businessName = ''
  let current: Staff | null = null

  const rooms: Room[] = [
    { id: 1, name: 'Fin saunasi', pricePerHour: 120000, capacity: 6, active: true, sortOrder: 1 },
    { id: 2, name: 'Turk hammomi', pricePerHour: 150000, capacity: 8, active: true, sortOrder: 2 },
    { id: 3, name: 'VIP-1', pricePerHour: 250000, capacity: 10, active: true, sortOrder: 3 },
    { id: 4, name: 'VIP-2', pricePerHour: 250000, capacity: 10, active: true, sortOrder: 4 },
    { id: 5, name: "Bug' xonasi", pricePerHour: 90000, capacity: 4, active: true, sortOrder: 5 },
    { id: 6, name: 'Oilaviy', pricePerHour: 180000, capacity: 12, active: true, sortOrder: 6 }
  ]
  const categories: ProductCategory[] = [
    { id: 1, name: 'Ichimliklar', sortOrder: 1, department: 'bar' },
    { id: 2, name: 'Choy va qahva', sortOrder: 2, department: 'bar' },
    { id: 3, name: 'Gazaklar', sortOrder: 3, department: 'bar' }
  ]
  const products: Product[] = [
    { id: 1, categoryId: 1, name: 'Coca-Cola 0.5', price: 8000, stock: 48, trackStock: true, lowStockAt: 10, active: true, costPrice: 0 },
    { id: 2, categoryId: 1, name: 'Suv 1L', price: 5000, stock: 6, trackStock: true, lowStockAt: 10, active: true, costPrice: 0 },
    { id: 3, categoryId: 2, name: "Ko'k choy (choynak)", price: 10000, stock: 0, trackStock: false, lowStockAt: 0, active: true, costPrice: 0 },
    { id: 4, categoryId: 3, name: 'Pista', price: 15000, stock: 20, trackStock: true, lowStockAt: 5, active: true, costPrice: 0 }
  ]
  const services: ServiceItem[] = [
    { id: 1, name: 'Klassik massaj', price: 150000, durationMin: 60, active: true },
    { id: 2, name: 'Venik bilan bug\'lash', price: 80000, durationMin: 20, active: true }
  ]

  let net: NetworkStatus = {
    enabled: false,
    port: 47321,
    code: '482913',
    addresses: ['192.168.1.10'],
    terminals: [{ ip: '192.168.1.24', name: 'OFITSIANT-MONOBLOK', staffName: 'Bekzod Aliyev', lastSeen: Date.now() - 4000 }]
  }
  const conn = (): ConnectionInfo =>
    terminal ? { mode: 'terminal', host: '192.168.1.10', port: 47321, connected: !offline } : { mode: 'main', host: null, port: null, connected: true }
  const online = () => {
    if (offline) throw new Error("Asosiy kompyuter bilan aloqa yo'q")
  }

  // Ko'ruvchi mock uchun bitta band xona (VIP-1): 2 mehmon, 1 qator
  const busyView = (): SessionView => {
    const now = Date.now()
    const start = now - 47 * 60_000
    const room = rooms[2]
    const g = (id: number, label: string, st: number) => ({
      id, sessionId: 1, label, state: 'running' as const, paidMinutes: 60,
      intervals: [{ roomId: room.id, rate: room.pricePerHour, start: st, end: null }],
      elapsedMs: now - st, timeAmount: room.pricePerHour, remainingMs: 60 * 60_000 - (now - st), billedMinutes: 60,
      runningRate: room.pricePerHour, linesAmount: 0
    })
    const guests = [g(1, 'Mehmon 1', start), g(2, 'Mehmon 2', now - 52 * 60_000)]
    const lines = [{
      id: 1, sessionId: 1, guestId: null, kind: 'product' as const, refId: 1, name: 'Coca-Cola 0.5', unitPrice: 8000, qty: 2,
      returnedQty: 0, providerId: null, createdAt: now - 30 * 60_000, createdBy: 1, activeQty: 2, amount: 16000, providerName: null
    }]
    const timeTotal = guests.length * room.pricePerHour
    return {
      session: { id: 1, roomId: room.id, status: 'open', openedAt: start, closedAt: null, openedBy: 1, discount: 0, note: '', waiterId: 5, waiterPct: 10 },
      room: clone(room), waiterName: 'Bekzod Aliyev', guests, lines, computedAt: now,
      timeTotal, linesTotal: 16000, discount: 0, total: timeTotal + 16000, paid: 0, due: timeTotal + 16000, payments: []
    } as unknown as SessionView
  }

  // ── Xonasiz bar savdolari (soddalashtirilgan, faqat UI ko'rinishi uchun) ──
  const BAR_ROOM: Room = { id: 0, name: 'Bar', pricePerHour: 0, capacity: 0, active: true, sortOrder: 0 }
  const bars = new Map<number, SessionView>()
  const barReceipts = new Map<number, ReceiptData>()
  let barSeq = 100
  let lineSeq = 1000
  let receiptSeq = 1
  const barFind = (id: number): SessionView => {
    const v = bars.get(id)
    if (!v) throw new Error('Savdo topilmadi')
    return v
  }
  const barTotals = (v: SessionView): SessionView => {
    for (const l of v.lines) {
      l.activeQty = l.qty - l.returnedQty
      l.amount = l.activeQty * l.unitPrice
    }
    v.linesTotal = v.lines.reduce((a, l) => a + l.amount, 0)
    v.total = v.linesTotal
    v.due = v.total - v.paid
    v.computedAt = Date.now()
    return v
  }
  const barOpen = (id: number): SessionView => {
    const v = barFind(id)
    if (v.session.status !== 'open') throw new Error('Savdo allaqachon yopilgan')
    return v
  }

  const session = () => (current ? { staff: clone(current), permissions: effectivePermissions(current.role, settings.rolePermissions) } : null)
  const needAuth = () => {
    if (!current) throw new Error('Avval tizimga kiring')
  }

  const impl: { [G in keyof PosApi]?: Partial<PosApi[G]> } = {
    auth: {
      listLoginStaff: () => delay(clone(staff.filter((s) => s.active))),
      login: (staffId, pin) => {
        const s = staff.find((x) => x.id === staffId && x.active)
        if (!s) return fail('Xodim topilmadi')
        if (pins.get(staffId) !== pin) return fail("PIN noto'g'ri", 260)
        current = s
        return delay(session()!)
      },
      logout: () => {
        current = null
        return delay(undefined)
      },
      current: () => delay(session()),
      needsSetup: () => delay(staff.length === 0),
      setupOwner: (name, pin, businessName) => {
        if (staff.length > 0) return fail("Ega allaqachon yaratilgan")
        if (!/^\d{4,6}$/.test(pin)) return fail("PIN 4–6 ta raqamdan iborat bo'lishi kerak")
        if (!name.trim()) return fail('Ismni kiriting')
        staff = [{ id: 1, name: name.trim(), role: 'owner', active: true, isProvider: false, isWaiter: false, commissionPct: 0 }]
        pins.set(1, pin)
        settings = { ...settings, receipt: { ...settings.receipt, businessName: businessName.trim() } }
        return delay(undefined, 300)
      }
    },
    settings: {
      get: () => delay(clone(settings)),
      save: (s) => {
        needAuth()
        settings = clone(s)
        return delay(clone(settings))
      }
    },
    system: {
      now: () => delay(Date.now(), 20),
      printReceipt: () => delay(undefined, 300),
      receiptHtml: (d) =>
        delay(
          '<html><body style="font:13px monospace;margin:8px">' +
            '<b>' + d.settings.businessName + '</b><br>Chek № ' + d.receiptNo + ' · ' + d.roomName + '<hr>' +
            d.lines.map((l) => l.name + ' × ' + l.qty + ' = ' + l.amount).join('<br>') +
            '<hr><b>Jami: ' + d.total + '</b></body></html>',
          40
        ),
      listPrinters: () => delay([], 20)
    },
    rooms: {
      list: () => delay(clone(rooms)),
      board: () => {
        online()
        return delay(
          rooms.map((room): RoomCard => {
            if (terminal && room.id === 3) {
              const v = busyView()
              return { room: clone(room), session: v, guestsActive: v.guests.length, currentTotal: v.total }
            }
            return { room: clone(room), session: null, guestsActive: 0, currentTotal: 0 }
          })
        )
      }
    },
    sessions: {
      get: (id) => {
        online()
        if (bars.has(id)) return delay(clone(barTotals(barFind(id))))
        return delay(busyView())
      },
      cancel: (id) => {
        const v = barOpen(id)
        if (v.lines.some((l) => l.qty - l.returnedQty > 0)) return fail("Sessiyada buyurtmalar bor — bekor qilib bo'lmaydi")
        bars.delete(id)
        return delay(undefined)
      }
    },
    barSales: {
      open: () => {
        needAuth()
        const id = ++barSeq
        const now = Date.now()
        const v = {
          session: { id, kind: 'bar', roomId: 0, status: 'open', openedAt: now, closedAt: null, openedBy: current!.id, discount: 0, note: '', waiterId: null, waiterPct: 0 },
          room: clone(BAR_ROOM), waiterName: null, guests: [], lines: [], computedAt: now,
          timeTotal: 0, linesTotal: 0, discount: 0, serviceChargePct: 0, serviceCharge: 0, total: 0, paid: 0, due: 0, payments: []
        } as SessionView
        bars.set(id, v)
        return delay(clone(v))
      },
      openList: () =>
        delay(
          Array.from(bars.values())
            .filter((v) => v.session.status === 'open')
            .sort((a, b) => b.session.openedAt - a.session.openedAt)
            .map((v) => clone(barTotals(v)))
        ),
      history: (range) =>
        delay(
          Array.from(bars.values())
            .filter((v) => v.session.status === 'closed' && v.session.closedAt! >= range.from && v.session.closedAt! < range.to)
            .sort((a, b) => b.session.closedAt! - a.session.closedAt!)
            .map((v): BarSaleRow => ({
              sessionId: v.session.id,
              receiptNo: barReceipts.get(v.session.id)?.receiptNo ?? null,
              closedAt: v.session.closedAt!,
              items: v.lines.reduce((a, l) => a + l.qty - l.returnedQty, 0),
              total: v.total,
              cashier: current ? current.name : ''
            }))
        )
    },
    lines: {
      addProduct: (sessionId, productId, qty) => {
        const v = barOpen(sessionId)
        const p = products.find((x) => x.id === productId)
        if (!p) return fail('Mahsulot topilmadi')
        if (p.trackStock && p.stock < qty) return fail(`Omborda yetarli emas (qoldi: ${p.stock})`)
        const ex = v.lines.find((l) => l.refId === p.id && l.unitPrice === p.price)
        if (ex) ex.qty += qty
        else
          v.lines.push({
            id: ++lineSeq, sessionId, guestId: null, kind: 'product', refId: p.id, name: p.name, unitPrice: p.price, qty, returnedQty: 0,
            providerId: null, createdAt: Date.now(), createdBy: current ? current.id : 0, activeQty: qty, amount: qty * p.price, providerName: null,
            department: 'bar', waiterId: null, waiterPct: 0, costPrice: 0, createdByName: current ? current.name : ''
          })
        if (p.trackStock) p.stock -= qty
        return delay(clone(barTotals(v)), 60)
      },
      returnLine: (lineId, qty) => {
        const v = Array.from(bars.values()).find((x) => x.lines.some((l) => l.id === lineId))
        if (!v) return fail('Qator topilmadi')
        const l = v.lines.find((x) => x.id === lineId)!
        if (qty < 1 || qty > l.qty - l.returnedQty) return fail("Qaytarish miqdori noto'g'ri")
        l.returnedQty += qty
        const p = products.find((x) => x.id === l.refId)
        if (p && p.trackStock) p.stock += qty
        return delay(clone(barTotals(v)), 60)
      }
    },
    checkout: {
      pay: (sessionId, payments, debtor) => {
        const v = barTotals(barOpen(sessionId))
        const sum = payments.reduce((a, p) => a + p.amount, 0)
        if (sum !== v.total) return fail("To'lov summasi jami summaga teng emas")
        const now = Date.now()
        v.session.status = 'closed'
        v.session.closedAt = now
        v.paid = sum
        v.due = 0
        const r: ReceiptData = {
          settings: clone(settings.receipt), receiptNo: receiptSeq++, roomName: 'Bar', openedAt: v.session.openedAt, closedAt: now,
          cashier: current ? current.name : '', guests: [],
          lines: v.lines.filter((l) => l.activeQty > 0).map((l) => ({ name: l.name, qty: l.activeQty, unitPrice: l.unitPrice, amount: l.amount, guestLabel: null, providerName: null })),
          timeTotal: 0, linesTotal: v.linesTotal, discount: 0, serviceCharge: { pct: 0, amount: 0 }, total: v.total, payments: clone(payments), debtor: debtor ? clone(debtor) : null, provisional: false
        }
        barReceipts.set(sessionId, r)
        return delay(clone(r), 200)
      },
      receipt: (sessionId) => {
        const r = barReceipts.get(sessionId)
        return r ? delay(clone(r)) : fail('Chek topilmadi')
      }
    },
    network: {
      status: () => delay(clone(net)),
      setEnabled: (enabled) => {
        net = { ...net, enabled }
        return delay(clone(net), 300)
      },
      regenerateCode: () => {
        net = { ...net, code: String(100000 + Math.floor(Math.random() * 900000)), terminals: [] }
        return delay(clone(net), 300)
      }
    },
    license: {
      status: () =>
        delay({ state: 'trial' as const, machineCode: '7K3Q9-XPM2A-B4C', trialEndsAt: Date.now() + 14 * 3_600_000, expiresAt: null, permanent: false, contact: '+998 __ ___ __ __' }, 40),
      activate: () => fail("Kalit noto'g'ri", 400)
    },
    connection: {
      info: () => delay(conn(), 40),
      discover: () =>
        delay([{ host: '192.168.1.10', port: 47321, name: 'Delfin Sauna' }, { host: '192.168.1.15', port: 47321, name: 'Delfin Sauna (2-filial)' }], 1500),
      connectTerminal: (host, _port, code) => {
        if (!host.trim()) return fail('Manzilni kiriting')
        if (code !== '482913') return fail("Kod noto'g'ri. Asosiy kompyuterdagi Sozlamalar → Tarmoq bo'limidagi kodni kiriting.", 700)
        terminal = true
        return delay(undefined, 700)
      },
      disconnect: () => {
        terminal = false
        offline = false
        return delay(undefined, 200)
      }
    },
    staff: {
      list: () => delay(clone(staff))
    },
    waiters: {
      list: () => delay(clone(staff.filter((s) => s.active && s.isWaiter))),
      monthly: () => delay([]),
      sessions: () => delay([]),
      payouts: () => delay([])
    },
    catalog: {
      categories: () => delay(clone(categories)),
      products: () => delay(clone(products)),
      services: () => delay(clone(services))
    },
    debts: {
      list: () => delay([])
    },
    expenses: {
      list: () => delay([]),
      categories: () => delay([{ id: 1, name: 'Ijara', active: true }, { id: 2, name: 'Boshqa', active: true }]),
      save: () => Promise.reject(new Error('Mock rejimida mavjud emas')),
      remove: () => Promise.reject(new Error('Mock rejimida mavjud emas')),
      saveCategory: () => Promise.reject(new Error('Mock rejimida mavjud emas'))
    }
  }

  return new Proxy({} as PosApi, {
    get(_t, group) {
      if (typeof group !== 'string' || group === 'then') return undefined
      const g = (impl as Record<string, Record<string, unknown> | undefined>)[group] ?? {}
      return new Proxy(g, {
        get(target, method) {
          if (typeof method !== 'string' || method === 'then') return undefined
          const f = target[method]
          if (typeof f === 'function') {
            return (...args: unknown[]) => {
              try {
                return (f as (...a: unknown[]) => Promise<unknown>)(...args)
              } catch (e) {
                return Promise.reject(e)
              }
            }
          }
          return () => fail('Mock rejimida mavjud emas: ' + group + '.' + method)
        }
      })
    }
  })
}
