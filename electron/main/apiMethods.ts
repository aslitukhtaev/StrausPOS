/**
 * PosApi metodlari ro'yxati — IPC (main), preload va dev-server uchun yagona manba.
 * Tur tekshiruvi har bir guruhdagi BARCHA metodlar ro'yxatda borligini kafolatlaydi
 * (shartnomaga metod qo'shilsa, bu fayl kompilyatsiya bo'lmaydi).
 */
import type { PosApi } from '../../src/shared/api'

type MethodMap = { [G in keyof PosApi]: { [M in keyof PosApi[G]]: true } }

const MAP: MethodMap = {
  auth: { listLoginStaff: true, login: true, logout: true, current: true, needsSetup: true, setupOwner: true },
  rooms: { board: true, list: true, save: true, remove: true },
  sessions: {
    open: true, get: true, addGuest: true, extendGuest: true, extendAll: true,
    guestPause: true, guestResume: true, guestFinish: true,
    renameGuest: true, moveRoom: true, setDiscount: true, stopAll: true, cancel: true
  },
  lines: { addProduct: true, addProducts: true, addService: true, returnLine: true },
  checkout: { pay: true, receipt: true, preBill: true },
  barSales: { open: true, openList: true, history: true },
  license: { status: true, activate: true },
  catalog: {
    categories: true, saveCategory: true, removeCategory: true, products: true, saveProduct: true,
    removeProduct: true, adjustStock: true, services: true, saveService: true, removeService: true
  },
  debts: { list: true, pay: true, payments: true },
  debtors: { search: true, list: true, debts: true, pay: true, rename: true },
  kitchen: { daily: true, payout: true, payouts: true, reprint: true },
  staff: { list: true, save: true, changePin: true },
  waiters: { list: true, monthly: true, sessions: true, payout: true, payouts: true },
  settings: { get: true, save: true },
  reports: { sales: true, returns: true, sessions: true },
  network: { status: true, setEnabled: true, regenerateCode: true },
  connection: { info: true, discover: true, connectTerminal: true, disconnect: true },
  system: { printReceipt: true, receiptHtml: true, backup: true, restore: true, now: true, listPrinters: true }
}

export const API_METHODS: { group: keyof PosApi; method: string }[] = (Object.keys(MAP) as (keyof PosApi)[]).flatMap(
  (group) => Object.keys(MAP[group]).map((method) => ({ group, method }))
)

export const API_CHANNEL_PREFIX = 'api:'

export function channelOf(group: string, method: string): string {
  return `${API_CHANNEL_PREFIX}${group}.${method}`
}

/** "group.method" → ruxsat etilgan juftlik yoki null (prototip/ixtiyoriy kalitlarga kirishning oldini oladi). */
export function parseMethod(name: unknown): { group: keyof PosApi; method: string } | null {
  if (typeof name !== 'string') return null
  const [group, method, extra] = name.split('.')
  if (extra !== undefined) return null
  return API_METHODS.find((m) => m.group === group && m.method === method) ?? null
}

/** Natija konverti (IPC orqali xato matnini toza yetkazish uchun). */
export type Envelope = { ok: true; value: unknown } | { ok: false; error: string }

/** PosApi ob'ektida metodni chaqirish. */
export async function invokeApi(api: PosApi, group: keyof PosApi, method: string, args: unknown[]): Promise<unknown> {
  const g = api[group] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  const fn = g[method]
  if (typeof fn !== 'function') throw new Error("Noma'lum amal: " + group + '.' + method)
  return fn.apply(g, Array.isArray(args) ? args : [])
}
