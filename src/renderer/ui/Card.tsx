/**
 * Card — sirt (panel). Sarlavha va amallar ixtiyoriy.
 *
 *   <Card title="Bugungi tushum" actions={<Button size="sm">...</Button>}>...</Card>
 *   <Card padding="lg" tone="accent">...</Card>
 *   <Card interactive onClick={...}>Bosiladigan karta (button sifatida)</Card>
 *
 * padding: 'none' | 'sm' (12) | 'md' (20, standart) | 'lg' (28)
 * tone: 'default' | 'raised' (ochroq) | 'accent' | 'success' | 'warning' | 'danger' — chap chegara/fon tusi
 * interactive: hover/press effekti, klaviatura bilan bosiladi (role=button).
 */
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'

export type CardTone = 'default' | 'raised' | 'accent' | 'success' | 'warning' | 'danger'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  tone?: CardTone
  interactive?: boolean
  selected?: boolean
  disabled?: boolean
}

export function Card({
  title, subtitle, actions, padding = 'md', tone = 'default', interactive, selected, disabled,
  className, children, onClick, onKeyDown, ...rest
}: CardProps) {
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (interactive && !disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      ;(e.currentTarget as HTMLDivElement).click()
    }
  }
  return (
    <div
      className={cx(
        'ui-card', 'ui-card--pad-' + padding, tone !== 'default' && 'ui-card--' + tone,
        interactive && 'ui-card--interactive', selected && 'is-selected', disabled && 'is-disabled', className
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      aria-pressed={interactive && selected !== undefined ? selected : undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKey}
      {...rest}
    >
      {(title || actions) && (
        <div className="ui-card__head">
          <div className="ui-card__titles">
            {title && <div className="ui-card__title">{title}</div>}
            {subtitle && <div className="ui-card__subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="ui-card__actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
