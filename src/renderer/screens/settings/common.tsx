/**
 * Sozlamalar ekrani uchun lokal yordamchi komponentlar.
 * Yoqish/o'chirish: `Switch` (@/ui); tugmalar guruhi yorlig'i: `<Field as="div">` (@/ui).
 */
import { useEffect, type ReactNode } from 'react'
import type { AppSettings } from '@shared/types'
import { Button, Icon, cx, type IconName } from '@/ui'

export interface SectionProps {
  /** Serverdagi oxirgi saqlangan sozlamalar */
  settings: AppSettings
  /** To'liq AppSettings ni saqlash (store ham yangilanadi, toast chiqadi) */
  save: (next: AppSettings, okMessage?: string) => Promise<boolean>
  /** Bo'limda saqlanmagan o'zgarish bormi */
  onDirty: (dirty: boolean) => void
}

/** Saqlanmagan o'zgarishlar holatini ota komponentga bildiradi. */
export function useReportDirty(dirty: boolean, onDirty: (d: boolean) => void) {
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
}

export function SectionHead({ icon, title, description, actions }: {
  icon: IconName
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="set-head">
      <div className="set-head__icon">
        <Icon name={icon} size={26} />
      </div>
      <div className="set-head__titles">
        <h2 className="set-head__title">{title}</h2>
        {description && <div className="set-head__desc">{description}</div>}
      </div>
      {actions && <div className="set-head__actions">{actions}</div>}
    </div>
  )
}

/** Bo'lim pastidagi yopishqoq saqlash paneli. */
export function SaveBar({ dirty, saving, onSave, onReset, label = 'Saqlash' }: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
  label?: string
}) {
  return (
    <div className={cx('set-savebar', dirty && 'is-dirty')}>
      <div className="set-savebar__msg">
        {dirty ? (
          <>
            <span className="set-savebar__dot" />
            Saqlanmagan o'zgarishlar bor
          </>
        ) : (
          <>
            <Icon name="checkCircle" size={22} />
            Barcha o'zgarishlar saqlangan
          </>
        )}
      </div>
      {dirty && (
        <Button variant="ghost" icon="undo" onClick={onReset} disabled={saving}>
          Bekor qilish
        </Button>
      )}
      <Button variant="primary" icon="check" onClick={onSave} disabled={!dirty} loading={saving} data-testid="set-save">
        {label}
      </Button>
    </div>
  )
}

export function Note({ tone = 'info', icon = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={cx('set-note', 'set-note--' + tone)}>
      <Icon name={icon} size={22} className="set-note__icon" />
      <div>{children}</div>
    </div>
  )
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
