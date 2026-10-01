/**
 * mockApi — xotiradagi soxta PosApi (faqat UI ni backendsiz ko'rish uchun!). Biznes mantiq bu yerda YO'Q.
 *
 * Ishga tushirish: `npm run dev:web` → http://localhost:5173/?mock=1
 *   ?mock=1      — tayyor ma'lumot: Aziz (Ega, PIN 1234), Dilnoza (Admin, 1111), Jasur (Kassir, 0000), Malika (Kassir/masseuse, 2222)
 *   ?mock=empty  — birinchi ishga tushirish (Setup ekrani)
 *
 * Qo'llab-quvvatlanadi: auth.*, settings.*, system.now, rooms.list/board, staff.list, catalog.categories/products/services,
 * debts.list. Qolganlari "Mock rejimida mavjud emas" xatosini beradi.
 */
import type { PosApi } from '@shared/api'
import type { AppSettings, Permission, Product, ProductCategory, Room, RoomCard, ServiceItem, Staff } from '@shared/types'
import { ROLE_PERMISSIONS } from '@shared/permissions'

const delay = <T>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms))
const fail = (msg: string, ms = 160): Promise<never> => new Promise((_r, j) => setTimeout(() => j(new Error(msg)), ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const DEFAULT_SETTINGS: AppSettings = {
  receipt: {
    businessName: 'Straus Sauna',
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
  lockEnabled: true,
  autoLockMinutes: 5,
  language: 'uz'
}

export function createMockApi(opts: { empty?: boolean } = {}): PosApi {
  let staff: Staff[] = opts.empty
    ? []
    : [
        { id: 1, name: 'Aziz Rahimov', role: 'owner', active: true, isProvider: false },
        { id: 2, name: 'Dilnoza Karimova', role: 'admin', active: true, isProvider: false },
        { id: 3, name: 'Jasur Toshmatov', role: 'cashier', active: true, isProvider: false },
        { id: 4, name: 'Malika Yusupova', role: 'cashier', active: true, isProvider: true }
      ]
  const pins = new Map<number, string>(opts.empty ? [] : [[1, '1234'], [2, '1111'], [3, '0000'], [4, '2222']])
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
    { id: 1, name: 'Ichimliklar', sortOrder: 1 },
    { id: 2, name: 'Choy va qahva', sortOrder: 2 },
    { id: 3, name: 'Gazaklar', sortOrder: 3 }
  ]
  const products: Product[] = [
    { id: 1, categoryId: 1, name: 'Coca-Cola 0.5', price: 8000, stock: 48, trackStock: true, lowStockAt: 10, active: true },
    { id: 2, categoryId: 1, name: 'Suv 1L', price: 5000, stock: 6, trackStock: true, lowStockAt: 10, active: true },
    { id: 3, categoryId: 2, name: "Ko'k choy (choynak)", price: 10000, stock: 0, trackStock: false, lowStockAt: 0, active: true },
    { id: 4, categoryId: 3, name: 'Pista', price: 15000, stock: 20, trackStock: true, lowStockAt: 5, active: true }
  ]
  const services: ServiceItem[] = [
    { id: 1, name: 'Klassik massaj', price: 150000, durationMin: 60, active: true },
    { id: 2, name: 'Venik bilan bug\'lash', price: 80000, durationMin: 20, active: true }
  ]

  const session = () => (current ? { staff: clone(current), permissions: ROLE_PERMISSIONS[current.role].slice() as Permission[] } : null)
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
        staff = [{ id: 1, name: name.trim(), role: 'owner', active: true, isProvider: false }]
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
      listPrinters: () => delay([], 20)
    },
    rooms: {
      list: () => delay(clone(rooms)),
      board: () => delay(rooms.map((room): RoomCard => ({ room: clone(room), session: null, guestsActive: 0, currentTotal: 0 })))
    },
    staff: {
      list: () => delay(clone(staff))
    },
    catalog: {
      categories: () => delay(clone(categories)),
      products: () => delay(clone(products)),
      services: () => delay(clone(services))
    },
    debts: {
      list: () => delay([])
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
