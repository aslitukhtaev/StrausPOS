/**
 * Stepper — miqdor uchun [−] 3 [+].
 *
 *   <Stepper value={qty} onChange={setQty} min={1} max={product.stock} />
 *   <Stepper value={guests} onChange={setGuests} min={1} max={room.capacity} size="lg" suffix="kishi" />
 *
 * size: 'md' (56px) | 'lg' (68px). Chegaradan chiqmaydi; tugmalar mos ravishda o'chadi.
 */
import { cx } from './cx'
import { Icon } from './Icon'

export interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  size?: 'md' | 'lg'
  suffix?: string
  disabled?: boolean
  className?: string
}

export function Stepper({ value, onChange, min = 0, max = Infinity, step = 1, size = 'md', suffix, disabled, className }: StepperProps) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)))
  return (
    <div className={cx('ui-stepper', 'ui-stepper--' + size, disabled && 'is-disabled', className)}>
      <button type="button" className="ui-stepper__btn" onClick={() => set(value - step)} disabled={disabled || value <= min} aria-label="Kamaytirish">
        <Icon name="minus" size={size === 'lg' ? 30 : 26} strokeWidth={2.6} />
      </button>
      <div className="ui-stepper__value num" aria-live="polite">
        {value}
        {suffix && <span className="ui-stepper__suffix">{suffix}</span>}
      </div>
      <button type="button" className="ui-stepper__btn" onClick={() => set(value + step)} disabled={disabled || value >= max} aria-label="Ko'paytirish">
        <Icon name="plus" size={size === 'lg' ? 30 : 26} strokeWidth={2.6} />
      </button>
    </div>
  )
}
