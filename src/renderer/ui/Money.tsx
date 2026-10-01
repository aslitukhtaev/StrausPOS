/**
 * Money — pul summasi (so'm), raqamlar bir xil kenglikda (tabular-nums), minglar probel bilan.
 *
 *   <Money value={125000} />                 → 125 000 so'm
 *   <Money value={total} size="2xl" tone="accent" />
 *   <Money value={-5000} sign />             → −5 000 so'm
 *   <Money value={x} currency={false} />     → 125 000
 *
 * size: 'sm' | 'md' (standart, meros) | 'lg' | 'xl' | '2xl' | '3xl'
 * tone: 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'
 * sign: musbatga "+" va manfiyga "−" belgisi.
 */
import { formatMoney } from '@shared/billing'
import { cx } from './cx'

export interface MoneyProps {
  value: number
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'
  currency?: boolean
  sign?: boolean
  strike?: boolean
  className?: string
}

export function Money({ value, size = 'md', tone = 'default', currency = true, sign, strike, className }: MoneyProps) {
  const neg = value < 0
  const prefix = neg ? '−' : sign && value > 0 ? '+' : ''
  return (
    <span className={cx('ui-money', 'num', 'ui-money--' + size, tone !== 'default' && 'ui-money--' + tone, strike && 'is-strike', className)}>
      {prefix}
      {formatMoney(Math.abs(value))}
      {currency && <span className="ui-money__cur"> so'm</span>}
    </span>
  )
}
