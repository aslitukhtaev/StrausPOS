/**
 * Segmented — bir nechta variantdan bittasini tanlash (radio guruh).
 *
 *   <Segmented value={method} onChange={setMethod} options={[
 *     { value: 'cash', label: 'Naqd', icon: 'cash' },
 *     { value: 'card', label: 'Karta', icon: 'card' },
 *     { value: 'debt', label: 'Qarz', icon: 'wallet' },
 *   ]} block size="lg" />
 *
 * size: 'md' (56px) | 'lg' (68px); block — to'liq kenglik, teng bo'laklar.
 */
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
  icon?: IconName
  disabled?: boolean
}

export interface SegmentedProps<T extends string | number> {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  size?: 'md' | 'lg'
  block?: boolean
  className?: string
}

export function Segmented<T extends string | number>({ value, onChange, options, size = 'md', block, className }: SegmentedProps<T>) {
  return (
    <div className={cx('ui-seg', 'ui-seg--' + size, block && 'ui-seg--block', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('ui-seg__item', o.value === value && 'is-active')}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={size === 'lg' ? 26 : 22} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
