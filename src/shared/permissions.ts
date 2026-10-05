import type { Permission, Role } from './types'

const ALL: Permission[] = [
  'session.open', 'session.manage', 'session.pay', 'line.return', 'price.override',
  'discount.apply', 'debt.manage', 'stock.manage', 'reports.view', 'settings.manage',
  'staff.manage', 'backup.manage'
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'staff.manage' && p !== 'settings.manage' && p !== 'backup.manage'),
  cashier: ['session.open', 'session.manage', 'session.pay', 'line.return', 'discount.apply', 'debt.manage'],
  waiter: ['session.open', 'session.manage', 'line.return']
}

export const ROLE_LABELS: Record<Role, string> = { owner: 'Ega', admin: 'Administrator', cashier: 'Kassir', waiter: 'Ofitsiant' }

export function can(role: Role | null | undefined, perm: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(perm)
}
