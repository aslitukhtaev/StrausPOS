/**
 * Litsenziya majburlashi (main jarayon, IPC / dev-server /rpc darajasida — UI'ga ishonilmaydi).
 * Holat expired/tampered bo'lsa faqat quyidagilar bajariladi:
 *   LAN ko'ruvchi allowlist'idagi o'qish metodlari, auth.*, license.*, connection.*, system.backup, system.now, settings.get.
 * Qolgan HAR QANDAY metod "Litsenziya muddati tugagan…" xatosi bilan rad etiladi. Ma'lumotlar o'zgarmaydi.
 * Muvaffaqiyatli yozish amalidan keyin lastSeen yangilanadi (soat orqaga surilishini aniqlash uchun).
 */
import type { PosApi } from '../../../src/shared/api'
import type { LicenseStatus } from '../../../src/shared/types'
import { API_METHODS } from '../apiMethods'
import { PosError } from '../PosService'
import { VIEWER_ALLOWLIST } from '../lan/protocol'
import type { LicenseManager } from './manager'
import { DEVELOPER_CONTACT } from './publicKey'

const ALWAYS_GROUPS: ReadonlySet<string> = new Set(['auth', 'license', 'connection'])
const ALWAYS_METHODS: ReadonlySet<string> = new Set(['system.backup', 'system.now', 'settings.get'])

/** Litsenziya tugaganda ham ruxsat etilgan metod (o'qish / kirish / litsenziya / zaxira) */
export function allowedWhenBlocked(name: string): boolean {
  const group = name.split('.')[0]
  return ALWAYS_GROUPS.has(group) || ALWAYS_METHODS.has(name) || VIEWER_ALLOWLIST.has(name)
}

/** Majburlash uchun kerakli qism (LicenseManager yoki dev-server'dagi "doim faol" stub) */
export type LicenseGate = Pick<LicenseManager, 'isBlocked' | 'blockedMessage' | 'touch' | 'sync'>

/** Doim faol (dev-server standarti, --license-trial'siz) */
export const ALWAYS_ACTIVE: LicenseGate = {
  isBlocked: () => false,
  blockedMessage: () => '',
  touch: () => undefined,
  sync: () => undefined
}

/** PosApi ni litsenziya majburlashi bilan o'rash (IPC va dev-server shu ob'ektni ishlatadi) */
export function createLicensedApi(api: PosApi, lic: LicenseGate): PosApi {
  const out: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> = {}
  for (const { group, method } of API_METHODS) {
    const name = `${group}.${method}`
    const g = api[group] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
    if (!out[group]) out[group] = {}
    const free = allowedWhenBlocked(name)
    out[group][method] = async (...args: unknown[]) => {
      if (!free && lic.isBlocked()) throw new PosError(lic.blockedMessage())
      const fn = g[method]
      if (typeof fn !== 'function') throw new PosError("Noma'lum amal: " + name)
      const result = await fn.apply(g, args)
      if (!free) lic.touch()
      if (name === 'system.restore') lic.sync()
      return result
    }
  }
  return out as unknown as PosApi
}

/** Ko'ruvchi kompyuter: o'zi faqat o'qiydi — lokal holat doim 'active' (asosiyning holati emas) */
export function viewerLicenseStatus(machineCode: string): LicenseStatus {
  return { state: 'active', machineCode, trialEndsAt: null, expiresAt: null, permanent: true, contact: DEVELOPER_CONTACT }
}
