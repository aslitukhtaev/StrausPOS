/**
 * PageHeader — ekran tepasidagi sarlavha qatori (barcha ekranlarda bir xil ko'rinish uchun).
 *
 *   <PageHeader title="Qarzlar" subtitle="12 ta ochiq qarz" icon="debts"
 *     actions={<Button variant="primary" icon="plus">Yangi</Button>} />
 */
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: IconName
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cx('ui-pagehead', className)}>
      {icon && (
        <div className="ui-pagehead__icon">
          <Icon name={icon} size={28} />
        </div>
      )}
      <div className="ui-pagehead__titles">
        <h1 className="ui-pagehead__title">{title}</h1>
        {subtitle && <div className="ui-pagehead__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="ui-pagehead__actions">{actions}</div>}
    </div>
  )
}
