import { useEffect, useMemo, useState } from 'react'
import type { Permission, Role } from '@shared/types'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, EDITABLE_ROLES, PERMISSION_CATALOG, ROLE_LABELS, effectivePermissions } from '@shared/permissions'
import { Button, Switch, confirmDialog } from '@/ui'
import { SaveBar, SectionHead, useReportDirty, type SectionProps } from './common'

type ERole = (typeof EDITABLE_ROLES)[number]
type Draft = Record<ERole, Permission[]>

const permLabel = (p: Permission) => PERMISSION_CATALOG.find((c) => c.perm === p)?.label ?? p

function fromSettings(rp: SectionProps['settings']['rolePermissions'] | undefined): Draft {
  const o = {} as Draft
  for (const r of EDITABLE_ROLES) o[r] = effectivePermissions(r, rp)
  return o
}

/** Bog'liqlik: expense.manage → expense.view; expense.view o'chsa expense.manage ham o'chadi */
function setPerm(list: Permission[], perm: Permission, on: boolean): Permission[] {
  const s = new Set(list)
  if (on) {
    s.add(perm)
    if (perm === 'expense.manage') s.add('expense.view')
  } else {
    s.delete(perm)
    if (perm === 'expense.view') s.delete('expense.manage')
  }
  return ALL_PERMISSIONS.filter((p) => s.has(p))
}

function normalize(list: Permission[]): Permission[] {
  let out = list
  if (out.includes('expense.manage') && !out.includes('expense.view')) out = setPerm(out, 'expense.manage', true)
  return out
}

const sameList = (a: Permission[], b: Permission[]) => a.length === b.length && a.every((p) => b.includes(p))

/** Xavfli o'zgarishlar ro'yxati */
function risks(saved: Draft, draft: Draft): string[] {
  const out: string[] = []
  const had = (r: ERole, p: Permission) => saved[r].includes(p)
  const has = (r: ERole, p: Permission) => draft[r].includes(p)
  for (const p of ['settings.manage', 'staff.manage'] as Permission[]) {
    if (had('admin', p) !== has('admin', p)) {
      out.push(has('admin', p) ? `Administratorga «${permLabel(p)}» beriladi` : `Administratordan «${permLabel(p)}» olinadi`)
    }
  }
  for (const p of ['session.pay', 'discount.apply', 'reports.view'] as Permission[]) {
    if (!had('waiter', p) && has('waiter', p)) out.push(`Ofitsiantga «${permLabel(p)}» beriladi`)
  }
  return out
}

export function RolesSection({ settings, save, onDirty }: SectionProps) {
  const saved = useMemo(() => fromSettings(settings.rolePermissions), [settings.rolePermissions])
  const [draft, setDraft] = useState<Draft>(saved)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(saved), [saved])

  const dirty = EDITABLE_ROLES.some((r) => !sameList(draft[r], saved[r]))
  useReportDirty(dirty, onDirty)

  const toggle = (r: ERole, p: Permission, on: boolean) => setDraft((d) => ({ ...d, [r]: setPerm(d[r], p, on) }))
  const setCol = (r: ERole, list: Permission[]) => setDraft((d) => ({ ...d, [r]: normalize(ALL_PERMISSIONS.filter((p) => list.includes(p))) }))

  const onSave = async () => {
    const rs = risks(saved, draft)
    if (rs.length > 0) {
      const ok = await confirmDialog({
        title: 'Bu ruxsat xavfli',
        message: rs.join('. ') + ". Rostdan ham saqlaysizmi?",
        confirmText: 'Ha, saqlash',
        cancelText: 'Yo\'q',
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    setSaving(true)
    await save({ ...settings, rolePermissions: { admin: draft.admin, cashier: draft.cashier, waiter: draft.waiter } }, 'Ruxsatlar yangilandi')
    setSaving(false)
  }

  const groups: { name: string; items: typeof PERMISSION_CATALOG }[] = []
  for (const c of PERMISSION_CATALOG) {
    let g = groups.find((x) => x.name === c.group)
    if (!g) groups.push((g = { name: c.group, items: [] }))
    g.items.push(c)
  }

  return (
    <div className="set-section">
      <SectionHead icon="shield" title="Rollar va ruxsatlar" description="Ega doim hamma narsaga ega. O'zgarishlar kirgan xodimlarda bir necha soniyada kuchga kiradi" />
      <div className="set-section__body">
        <div className="roles-grid" data-testid="roles-matrix">
          <div className="roles-grid__head">
            <div className="roles-grid__perm roles-grid__title">Ruxsat</div>
            <div className="roles-grid__col">
              <div className="roles-grid__role">{ROLE_LABELS.owner}</div>
              <div className="roles-grid__sub">doim hamma narsa</div>
            </div>
            {EDITABLE_ROLES.map((r) => {
              const all = draft[r].length === ALL_PERMISSIONS.length
              const isDef = sameList(draft[r], DEFAULT_ROLE_PERMISSIONS[r])
              return (
                <div key={r} className="roles-grid__col">
                  <div className="roles-grid__role">{ROLE_LABELS[r]}</div>
                  <div className="roles-grid__acts">
                    <Button size="sm" variant="ghost" title="Standartga qaytarish" disabled={isDef} onClick={() => setCol(r, DEFAULT_ROLE_PERMISSIONS[r])} data-testid={'roles-default-' + r}>
                      Standart
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCol(r, all ? [] : ALL_PERMISSIONS)} data-testid={'roles-all-' + r}>
                      {all ? "Hammasini o'chirish" : 'Hammasini yoqish'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          {groups.map((g) => (
            <div key={g.name} className="roles-grid__group">
              <div className="roles-grid__gname">{g.name}</div>
              {g.items.map((c) => (
                <div key={c.perm} className="roles-grid__row" data-testid={'roles-row-' + c.perm}>
                  <div className="roles-grid__perm">
                    <div className="roles-grid__label">{c.label}</div>
                    <div className="roles-grid__desc">{c.description}</div>
                  </div>
                  <div className="roles-grid__col">
                    <Switch checked disabled onChange={() => undefined} aria-label={`${c.label}: ${ROLE_LABELS.owner}`} />
                  </div>
                  {EDITABLE_ROLES.map((r) => (
                    <div key={r} className="roles-grid__col">
                      <Switch
                        checked={draft[r].includes(c.perm)}
                        onChange={(v) => toggle(r, c.perm, v)}
                        aria-label={`${c.label}: ${ROLE_LABELS[r as Role]}`}
                        data-testid={`perm-${r}-${c.perm}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => setDraft(saved)} />
    </div>
  )
}
