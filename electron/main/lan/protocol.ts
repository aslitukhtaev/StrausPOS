/**
 * LAN "faqat ko'rish" protokoli — umumiy konstantalar va qat'iy allowlist.
 * Electron'ga bog'liq emas (dev-server va testlar ham ishlatadi).
 */
export const DEFAULT_LAN_PORT = 47321
export const DISCOVERY_PORT = 47322
export const DISCOVERY_QUERY = 'DELFIN?'
export const CODE_HEADER = 'x-delfin-code'
export const RPC_TIMEOUT_MS = 5000
export const DISCOVER_MS = 2000
/** Oxirgi shuncha vaqtda so'rov yuborganlar "ulangan ko'ruvchi" hisoblanadi */
export const VIEWER_TTL_MS = 2 * 60_000
/** Brute-force: bitta IP dan oynada shuncha noto'g'ri kod → blok */
export const MAX_CODE_FAILS = 10
export const CODE_FAIL_WINDOW_MS = 60_000

export const VIEW_ONLY_MESSAGE = "Bu kompyuter faqat ko'rish rejimida"
export const MSG_NOT_FOUND = 'Asosiy kompyuter topilmadi'
export const MSG_BAD_CODE = "Kod noto'g'ri"
export const MSG_NO_LINK = "Asosiy kompyuter bilan aloqa yo'q"
export const MSG_TOO_MANY = "Juda ko'p noto'g'ri urinish. Bir daqiqadan keyin qayta urinib ko'ring"

/**
 * Ko'ruvchiga ruxsat etilgan O'QISH metodlari (docs/ARCHITECTURE.md "Tarmoq").
 * Boshqa HAR QANDAY metod serverda 403 bilan rad etiladi.
 */
export const VIEWER_ALLOWLIST: ReadonlySet<string> = new Set([
  'rooms.board', 'rooms.list',
  'sessions.get',
  'catalog.categories', 'catalog.products', 'catalog.services',
  'debts.list', 'debts.payments',
  'reports.sales', 'reports.returns',
  'waiters.monthly', 'waiters.sessions', 'waiters.payouts', 'waiters.list',
  'settings.get',
  'system.now', 'system.receiptHtml',
  'staff.list'
])

export function isViewerAllowed(method: unknown): boolean {
  return typeof method === 'string' && VIEWER_ALLOWLIST.has(method)
}

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

/** User-Agent: "DelfinSauna/<versiya> (<kompyuter nomi>)" → kompyuter nomi */
export function userAgent(version: string, hostname: string): string {
  const clean = hostname.replace(/[^\w.\- ]/g, '').slice(0, 60) || 'kompyuter'
  return `DelfinSauna/${version} (${clean})`
}

export function nameFromUserAgent(ua: string | undefined): string {
  const m = /\(([^)]{1,60})\)/.exec(ua || '')
  return m ? m[1] : "Noma'lum"
}
