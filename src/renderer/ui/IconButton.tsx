/**
 * IconButton — faqat ikonli kvadrat tugma. `label` MAJBURIY (title + aria-label).
 *
 *   <IconButton icon="x" label="Yopish" onClick={onClose} />
 *   <IconButton icon="trash" label="O'chirish" variant="danger" size="lg" />
 *
 * variant: Button bilan bir xil ('secondary' standart, 'ghost' fonsiz)
 * size: 'sm' 48 | 'md' 56 | 'lg' 68 | 'xl' 84 (kvadrat)
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import type { ButtonSize, ButtonVariant } from './Button'
import { Spinner } from './Spinner'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Ixtiyoriy kichik raqam belgisi (masalan savatdagi soni) */
  badge?: number | string
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 22, md: 24, lg: 28, xl: 34 }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'secondary', size = 'md', loading, disabled, className, badge, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-btn', 'ui-iconbtn', 'ui-btn--' + variant, 'ui-btn--' + size, className)}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={ICON_SIZE[size]} /> : <Icon name={icon} size={ICON_SIZE[size]} />}
      {badge != null && badge !== 0 && badge !== '' ? <span className="ui-iconbtn__badge num">{badge}</span> : null}
    </button>
  )
})
