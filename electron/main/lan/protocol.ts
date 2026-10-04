/**
 * LAN TERMINAL protokoli — umumiy konstantalar va qat'iy denylist.
 * Electron'ga bog'liq emas (dev-server va testlar ham ishlatadi).
 *
 * Terminal (ikkinchi kompyuter, ofitsiantlar monobloki) BARCHA PosApi metodlarini asosiy kompyuterda o'zining
 * alohida login konteksti bilan bajaradi. Faqat asosiy kompyuterga tegishli metodlar (TERMINAL_DENYLIST) rad etiladi.
 */
export const DEFAULT_LAN_PORT = 47321
export const DISCOVERY_PORT = 47322
export const DISCOVERY_QUERY = 'DELFIN?'
export const CODE_HEADER = 'x-delfin-code'
/** Terminal identifikatori (UUID; terminal birinchi ulanganda yaratadi va connection.json da saqlaydi) */
export const TERMINAL_HEADER = 'x-delfin-terminal'
export const RPC_TIMEOUT_MS = 8000
export const DISCOVER_MS = 2000
/** Oxirgi shuncha vaqtda so'rov yuborganlar "ulangan terminal" hisoblanadi */
export const TERMINAL_TTL_MS = 2 * 60_000
/** Shuncha vaqt so'rov bo'lmasa terminal konteksti (login) o'chiriladi */
export const TERMINAL_SESSION_TTL_MS = 12 * 60 * 60_000
/** Bir vaqtda saqlanadigan terminal kontekstlari soni (eng eskisi o'chiriladi) */
export const MAX_TERMINALS = 50
/** Brute-force: bitta IP dan oynada shuncha noto'g'ri kod → blok */
export const MAX_CODE_FAILS = 10
export const CODE_FAIL_WINDOW_MS = 60_000

export const MAIN_ONLY_MESSAGE = 'Bu amal faqat asosiy kompyuterda bajariladi'
export const MSG_NOT_FOUND = 'Asosiy kompyuter topilmadi'
export const MSG_BAD_CODE = "Kod noto'g'ri"
export const MSG_NO_LINK = "Asosiy kompyuter bilan aloqa yo'q"
export const MSG_TOO_MANY = "Juda ko'p noto'g'ri urinish. Bir daqiqadan keyin qayta urinib ko'ring"
export const MSG_NO_TERMINAL = "Terminal identifikatori yo'q yoki noto'g'ri — dasturni yangilang"
export const MSG_UNKNOWN = "Noma'lum amal"

/**
 * Terminalda ishlamaydigan (faqat asosiy kompyuterga tegishli) metodlar. Serverda 403 bilan rad etiladi;
 * terminal proksisi ham ularni asosiyga yubormaydi.
 */
export const TERMINAL_DENY_GROUPS: ReadonlySet<string> = new Set(['network', 'connection'])
export const TERMINAL_DENY_METHODS: ReadonlySet<string> = new Set([
  'system.backup', 'system.restore', 'license.activate', 'auth.setupOwner'
])

export function isTerminalDenied(method: string): boolean {
  return TERMINAL_DENY_GROUPS.has(method.split('.')[0]) || TERMINAL_DENY_METHODS.has(method)
}

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

/** Terminal identifikatori: UUID (8-4-4-4-12 hex) */
export function isValidTerminalId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
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
