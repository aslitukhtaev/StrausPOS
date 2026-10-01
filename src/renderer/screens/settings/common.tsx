/**
 * Sozlamalar ekrani uchun lokal yordamchi komponentlar.
 * UI TAKLIFI: `Switch` (katta yoqish/o'chirish tugmasi) ui/ ga ko'chirilsa boshqa ekranlarga ham kerak bo'ladi.
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

/** Katta yoqish/o'chirish tugmasi (sarlavha + izoh bilan qator). */
export function SwitchRow({ checked, onChange, title, description, disabled, testId }: {
  checked: boolean
  onChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  disabled?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx('set-switch', checked && 'is-on')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span className="set-switch__text">
        <span className="set-switch__title">{title}</span>
        {description && <span className="set-switch__desc">{description}</span>}
      </span>
      <span className="set-switch__track" aria-hidden="true">
        <span className="set-switch__thumb" />
      </span>
    </button>
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

/** Field kabi, lekin <label> emas — ichida tugmalar (Segmented, Stepper) bo'lganda ishlatiladi. */
export function FieldBox({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-field" role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <span className="ui-field__label">{label}</span>
      <div className="ui-field__control">{children}</div>
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
    </div>
  )
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
