import type { Permission, Role } from './types'

export const ALL_PERMISSIONS: Permission[] = [
  'session.open', 'session.manage', 'session.pay', 'line.return', 'price.override',
  'discount.apply', 'debt.manage', 'stock.manage', 'reports.view', 'expense.view', 'expense.manage',
  'profit.view', 'history.view', 'kitchen.view', 'waiters.view',
  'settings.manage', 'staff.manage', 'backup.manage'
]

/** Standart ruxsatlar (ega Sozlamalarda o'zgartirmaguncha). Ega — doim ALL_PERMISSIONS */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== 'staff.manage' && p !== 'settings.manage' && p !== 'backup.manage'),
  cashier: ['session.open', 'session.manage', 'session.pay', 'line.return', 'discount.apply', 'debt.manage'],
  waiter: ['session.open', 'session.manage', 'line.return']
}
/** Eski nom (standart jadval) */
export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS

export const ROLE_LABELS: Record<Role, string> = { owner: 'Ega', admin: 'Administrator', cashier: 'Kassir', waiter: 'Ofitsiant' }
/** Ruxsatlari o'zgartiriladigan rollar (ega doim hamma narsaga ega) */
export const EDITABLE_ROLES = ['admin', 'cashier', 'waiter'] as const

export interface PermissionInfo {
  perm: Permission
  label: string
  description: string
  group: string
}

/** Ruxsatlar katalogi (UI matritsasi tartibi shu) */
export const PERMISSION_CATALOG: PermissionInfo[] = [
  { perm: 'session.open', group: 'Xonalar', label: 'Xonani ochish', description: "Xona ochish, mehmon qo'shish, bar savdosi" },
  { perm: 'session.manage', group: 'Xonalar', label: 'Sessiyani boshqarish', description: "Pauza, tugatish, +1 soat, xona almashtirish, buyurtma qo'shish, bekor qilish" },
  { perm: 'session.pay', group: 'Xonalar', label: "To'lovni qabul qilish", description: "Hisobni yopish va to'lov (naqd, karta, terminal, qarz)" },
  { perm: 'line.return', group: 'Xonalar', label: 'Qaytarish (X)', description: "Qo'shilgan mahsulot yoki xizmatni qaytarish" },
  { perm: 'discount.apply', group: 'Xonalar', label: 'Chegirma berish', description: 'Hisobga chegirma qo\'llash' },
  { perm: 'price.override', group: 'Xonalar', label: "Narxni o'zgartirish", description: "Sessiyada narxni qo'lda o'zgartirish" },
  { perm: 'debt.manage', group: 'Qarzlar', label: 'Qarzlar bilan ishlash', description: "Qarzdorlar ro'yxati, qarz to'lovini qabul qilish" },
  { perm: 'stock.manage', group: 'Bar va ombor', label: 'Bar va ombor', description: "Mahsulot, kategoriya, xizmatlar, ombor qoldig'i, tannarx" },
  { perm: 'reports.view', group: 'Hisobotlar', label: 'Savdo hisoboti', description: 'Hisobot bo\'limi' },
  { perm: 'history.view', group: 'Hisobotlar', label: 'Tarix', description: 'Sessiyalar tarixi va sotuvlar (kim sotgani)' },
  { perm: 'waiters.view', group: 'Hisobotlar', label: 'Ofitsiantlar hisobi', description: "Ofitsiantlar oylik hisob-kitobi (to'lov berish — Xodimlar ruxsati)" },
  { perm: 'kitchen.view', group: 'Hisobotlar', label: 'Oshxona hisobi', description: "Oshxona kunlik hisob-kitobi (pul berish — Xodimlar ruxsati)" },
  { perm: 'expense.view', group: 'Moliya', label: "Xarajatlarni ko'rish", description: "Xarajatlar bo'limi" },
  { perm: 'expense.manage', group: 'Moliya', label: 'Xarajat kiritish', description: "Xarajat qo'shish, o'zgartirish, o'chirish" },
  { perm: 'profit.view', group: 'Moliya', label: "Sof foydani ko'rish", description: 'Sof foyda hisoboti' },
  { perm: 'staff.manage', group: 'Boshqaruv', label: 'Xodimlar', description: "Xodim qo'shish, PIN, ofitsiantlar va oshxonaga pul berish" },
  { perm: 'settings.manage', group: 'Boshqaruv', label: 'Sozlamalar', description: "Xonalar, chek, hisob-kitob, tarmoq, rollar ruxsatlari" },
  { perm: 'backup.manage', group: 'Boshqaruv', label: 'Zaxira nusxa', description: "Zaxira olish va tiklash, ma'lumotlarni tozalash" }
]

/** Rolning samarali ruxsatlari: ega — hamma; boshqalar — sozlamadagi ro'yxat (noto'g'ri qiymatlar tashlanadi), yo'q bo'lsa standart */
export function effectivePermissions(
  role: Role,
  overrides?: Partial<Record<Role, Permission[]>> | null
): Permission[] {
  if (role === 'owner') return ALL_PERMISSIONS.slice()
  const o = overrides?.[role]
  if (!Array.isArray(o)) return DEFAULT_ROLE_PERMISSIONS[role].slice()
  return ALL_PERMISSIONS.filter((p) => o.includes(p))
}

export function can(
  role: Role | null | undefined,
  perm: Permission,
  overrides?: Partial<Record<Role, Permission[]>> | null
): boolean {
  return !!role && effectivePermissions(role, overrides).includes(perm)
}
