/**
 * Tabs — bo'limlar orasida o'tish (tagi chiziqli). Kontentni o'zingiz shartli ko'rsatasiz.
 *
 *   const [tab, setTab] = useState('products')
 *   <Tabs value={tab} onChange={setTab} items={[
 *     { id: 'products', label: 'Mahsulotlar', icon: 'box' },
 *     { id: 'services', label: 'Xizmatlar', icon: 'sparkles', badge: 3 },
 *   ]} />
 *   {tab === 'products' && <Products/>}
 */
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  icon?: IconName
  badge?: number | string
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  value: T
  onChange: (id: T) => void
  items: TabItem<T>[]
  className?: string
}

export function Tabs<T extends string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div className={cx('ui-tabs', className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={cx('ui-tabs__item', t.id === value && 'is-active')}
          disabled={t.disabled}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <Icon name={t.icon} size={22} />}
          <span>{t.label}</span>
          {t.badge != null && t.badge !== 0 && t.badge !== '' && <span className="ui-tabs__badge num">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}
