/**
 * EmptyState — bo'sh ro'yxat / natija yo'q / bo'lim tayyor emas holati.
 *
 *   <EmptyState icon="inbox" title="Qarzlar yo'q" description="Barcha hisoblar to'langan"
 *     action={<Button variant="primary" icon="plus">Qo'shish</Button>} />
 *
 * size: 'md' (standart) | 'lg' (butun ekran markazida)
 */
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  size?: 'md' | 'lg'
  className?: string
}

export function EmptyState({ icon = 'inbox', title, description, action, size = 'md', className }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', 'ui-empty--' + size, className)}>
      <div className="ui-empty__icon">
        <Icon name={icon} size={size === 'lg' ? 48 : 36} strokeWidth={1.8} />
      </div>
      <div className="ui-empty__title">{title}</div>
      {description && <div className="ui-empty__desc">{description}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  )
}
