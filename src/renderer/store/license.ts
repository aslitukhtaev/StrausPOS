/**
 * Litsenziya holati (UI). Majburlash main jarayonda — bu yerda faqat ko'rsatish:
 *
 *   const st = useLicense((s) => s.status)        // LicenseStatus | null
 *   const blocked = useLicense((s) => s.blocked)  // expired/tampered → ilova readOnly (useApp.readOnly)
 *   useLicense.getState().openDialog()            // Aktivatsiya oynasi (login'siz ham)
 *
 * boot'da `load()`; keyin har daqiqada yangilanadi (sinov ish davomida tugashi mumkin).
 * Muddatli kalit tugashiga ≤3 kun qolganda kuniga bir marta ogohlantirish toast.
 */
import { create } from 'zustand'
import type { LicenseStatus } from '@shared/types'
import { getApi } from '../api'
import { toast } from './toast'
import { getNow } from './clock'

export const LICENSE_POLL_MS = 60_000
const WARN_DAYS = 3
const DAY = 86_400_000
const WARN_KEY = 'delfin.licenseWarnDay'

interface LicenseStore {
  status: LicenseStatus | null
  blocked: boolean
  dialogOpen: boolean
  load(): Promise<LicenseStatus | null>
  activate(key: string): Promise<LicenseStatus>
  openDialog(): void
  closeDialog(): void
}

function isBlocked(s: LicenseStatus | null): boolean {
  return !!s && (s.state === 'expired' || s.state === 'tampered')
}

/** Holat o'zgarsa — ilova readOnly'ini moslash (app store'ni aylanma importsiz chaqiramiz) */
let onBlockedChange: ((blocked: boolean) => void) | null = null
export function setLicenseBlockedHandler(fn: (blocked: boolean) => void): void {
  onBlockedChange = fn
}

function localDayKey(ms: number): string {
  const d = new Date(ms)
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

function maybeWarn(s: LicenseStatus): void {
  if (s.state !== 'active' || s.permanent || s.expiresAt == null) return
  const left = s.expiresAt - getNow()
  if (left > WARN_DAYS * DAY || left <= 0) return
  const today = localDayKey(getNow())
  try {
    if (localStorage.getItem(WARN_KEY) === today) return
    localStorage.setItem(WARN_KEY, today)
  } catch {
    /* localStorage yo'q — baribir ko'rsatamiz */
  }
  toast.warning('Litsenziya tez orada tugaydi: ' + formatLeft(left), {
    description: licenseDay(s.expiresAt) + ' gacha amal qiladi. Yangi kalit uchun ishlab chiquvchiga murojaat qiling: ' + s.contact,
    duration: 12_000
  })
}

export const useLicense = create<LicenseStore>((set, get) => ({
  status: null,
  blocked: false,
  dialogOpen: false,

  async load() {
    let s: LicenseStatus | null = null
    try {
      s = await getApi().license.status()
    } catch {
      return get().status // eski backend / aloqa yo'q — oldingi holat
    }
    const blocked = isBlocked(s)
    const was = get().blocked
    set({ status: s, blocked })
    if (blocked !== was && onBlockedChange) onBlockedChange(blocked)
    maybeWarn(s)
    return s
  },

  async activate(key) {
    const s = await getApi().license.activate(key)
    const blocked = isBlocked(s)
    const was = get().blocked
    set({ status: s, blocked })
    if (blocked !== was && onBlockedChange) onBlockedChange(blocked)
    return s
  },

  openDialog() {
    set({ dialogOpen: true })
    void get().load()
  },

  closeDialog() {
    set({ dialogOpen: false })
  }
}))

let timer: ReturnType<typeof setInterval> | null = null
/** Davriy yangilash (boot'dan keyin bir marta) */
export function startLicenseWatch(): void {
  if (timer) return
  timer = setInterval(() => void useLicense.getState().load(), LICENSE_POLL_MS)
}

function p2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** Kalit tugash kuni (UTC kun — kalit formati shunday): "05.11.2026" */
export function licenseDay(expiresAt: number): string {
  const d = new Date(expiresAt - 1)
  return p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear()
}

/** "14 soat qoldi" / "35 daqiqa qoldi" / "3 kun qoldi" */
export function formatLeft(ms: number): string {
  if (ms <= 0) return 'tugadi'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return min + ' daqiqa qoldi'
  const h = Math.floor(ms / 3_600_000)
  if (h < 48) return h + ' soat qoldi'
  return Math.floor(ms / DAY) + ' kun qoldi'
}
