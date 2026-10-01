/**
 * Switch — katta yoqish/o'chirish tugmasi (sarlavha + izoh bilan butun qator bosiladi).
 *
 *   <Switch checked={on} onChange={setOn} label="Avtomatik qulflash" description="Harakatsizlikdan keyin" />
 *
 * role="switch" + aria-checked. `label`siz ishlatilsa `aria-label` bering.
 * size: 'md' (56px qator, standart) | 'lg' (68px).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'role'> {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  size?: 'md' | 'lg'
}

export function Switch({ checked, onChange, label, description, size = 'md', className, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx('ui-switch', 'ui-switch--' + size, checked && 'is-on', !label && 'is-bare', className)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      {label != null && (
        <span className="ui-switch__text">
          <span className="ui-switch__label">{label}</span>
          {description && <span className="ui-switch__desc">{description}</span>}
        </span>
      )}
      <span className="ui-switch__state" aria-hidden="true">{checked ? 'Yoqilgan' : "O'chiq"}</span>
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
    </button>
  )
}
