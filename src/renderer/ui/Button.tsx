/**
 * Button — asosiy tugma.
 *
 *   <Button variant="primary" size="lg" icon="plus" onClick={...}>Xonani ochish</Button>
 *   <Button variant="danger" loading={busy}>O'chirish</Button>
 *   <Button block>To'liq kenglik</Button>
 *
 * variant: 'primary' (oltin, asosiy amal) | 'secondary' (standart) | 'danger' (qizil, xavfli)
 *          | 'success' (yashil, to'lov/tasdiq) | 'ghost' (fonsiz, ikkinchi darajali)
 * size:    'sm' 48px | 'md' 56px (standart) | 'lg' 68px | 'xl' 84px
 * loading: spinner ko'rsatadi va bosishni bloklaydi.
 * Qolgan barcha <button> atributlari (type, disabled, title, ...) o'tkaziladi. Standart type="button".
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  block?: boolean
  loading?: boolean
  children?: ReactNode
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 20, md: 22, lg: 26, xl: 30 }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, block, loading, disabled, className, children, type = 'button', ...rest },
  ref
) {
  const is = ICON_SIZE[size]
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-btn', 'ui-btn--' + variant, 'ui-btn--' + size, block && 'ui-btn--block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={is} /> : icon ? <Icon name={icon} size={is} /> : null}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {iconRight && !loading ? <Icon name={iconRight} size={is} /> : null}
    </button>
  )
})
