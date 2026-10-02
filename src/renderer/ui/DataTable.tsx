/**
 * DataTable — barcha ekranlarda bir xil jadval/ro'yxat uslubi (bar, qarzlar, sozlamalar...).
 * Ustunlar CSS grid orqali: `columns` = grid-template-columns qiymati.
 *
 *   <DataTable columns="minmax(0,1fr) 140px 200px" header={['Nomi', <span className="r">Narxi</span>, '']}>
 *     {items.map((p) => (
 *       <DataRow key={p.id} tone={p.low ? 'danger' : undefined} muted={!p.active}>
 *         <div>{p.name}</div><Money value={p.price} className="r" /><div className="ui-dt__tools">…</div>
 *       </DataRow>
 *     ))}
 *   </DataTable>
 *
 * Katakcha tekislash: `.r` (o'ngga), `.c` (markazga). Asboblar ustuni: `.ui-dt__tools`.
 * Oddiy <table> kerak bo'lsa (hisobotlar): `<table className="ui-table">` — xuddi shu ko'rinish.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export interface DataTableProps extends HTMLAttributes<HTMLDivElement> {
  /** grid-template-columns. Bermasangiz CSS da `.sizning-klass { --dt-cols: ... }` (media query bilan moslash uchun) */
  columns?: string
  header?: ReactNode[]
  children: ReactNode
}

export function DataTable({ columns, header, children, className, style, ...rest }: DataTableProps) {
  const st = (columns ? { ...(style || {}), ['--dt-cols' as string]: columns } : style) as CSSProperties | undefined
  return (
    <div className={cx('ui-dt', className)} style={st} role="table" {...rest}>
      {header && (
        <div className="ui-dt__row ui-dt__head" role="row">
          {header.map((h, i) => (
            <div key={i} role="columnheader" className="ui-dt__th">
              {h}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

export interface DataRowProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'danger' | 'warning' | 'success'
  muted?: boolean
  children: ReactNode
}

export function DataRow({ tone, muted, className, children, ...rest }: DataRowProps) {
  return (
    <div role="row" className={cx('ui-dt__row', tone && 'is-' + tone, muted && 'is-muted', className)} {...rest}>
      {children}
    </div>
  )
}
