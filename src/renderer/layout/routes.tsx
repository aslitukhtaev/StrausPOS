/// <reference types="vite/client" />
/**
 * Ekranlar registri. Har bir ekran: `src/renderer/screens/<id>/index.tsx` → `export default function XScreen() {...}`
 * (props yo'q). Fayl hali yo'q bo'lsa — vaqtinchalik "tayyorlanmoqda" placeholder ko'rsatiladi.
 * Ekranlar `import.meta.glob(..., { eager: true })` bilan avtomatik topiladi — bu faylni tahrirlash shart emas.
 */
import type { ComponentType } from 'react'
import type { Permission } from '@shared/types'
import type { IconName } from '../ui/Icon'
import { EmptyState } from '../ui/EmptyState'

// ─── REGISTRY (bir qator) ───
export const SCREEN_IDS = ['rooms', 'bar', 'debts', 'reports', 'staff', 'settings'] as const

export type ScreenId = (typeof SCREEN_IDS)[number]

export interface ScreenDef {
  id: ScreenId
  label: string
  icon: IconName
  /** Ko'rinishi uchun kerakli ruxsat (yo'q = har bir kirgan xodim) */
  permission?: Permission
  Component: ComponentType
}

const META: Record<ScreenId, { label: string; icon: IconName; permission?: Permission }> = {
  rooms: { label: 'Xonalar', icon: 'rooms' },
  bar: { label: 'Bar', icon: 'bar', permission: 'stock.manage' },
  debts: { label: 'Qarzlar', icon: 'debts', permission: 'debt.manage' },
  reports: { label: 'Hisobot', icon: 'reports', permission: 'reports.view' },
  staff: { label: 'Xodimlar', icon: 'staff', permission: 'staff.manage' },
  settings: { label: 'Sozlamalar', icon: 'settings', permission: 'settings.manage' }
}

const modules = import.meta.glob<{ default?: ComponentType }>('../screens/*/index.tsx', { eager: true })

function placeholder(label: string, icon: IconName): ComponentType {
  const P = () => (
    <EmptyState
      size="lg"
      icon={icon}
      title={label + ' — tayyorlanmoqda'}
      description="Bu bo'lim tez orada qo'shiladi."
    />
  )
  P.displayName = 'Placeholder(' + label + ')'
  return P
}

export const SCREENS: ScreenDef[] = SCREEN_IDS.map((id) => {
  const m = META[id]
  const mod = modules['../screens/' + id + '/index.tsx']
  return { id, ...m, Component: (mod && mod.default) || placeholder(m.label, m.icon) }
})

export function screenAllowed(def: ScreenDef, can: (p: Permission) => boolean): boolean {
  return !def.permission || can(def.permission)
}
