/** Qulf/Setup ekranlarining chap brend paneli: logo, biznes nomi, katta soat. */
import type { ReactNode } from 'react'
import { Icon, formatClock, formatDate, useNow } from '../../ui'

export function BrandPanel({ businessName, footer }: { businessName: string; footer?: ReactNode }) {
  const now = useNow()
  return (
    <section className="brand">
      <div className="brand__glow" aria-hidden />
      <div className="brand__top">
        <span className="brand__logo">
          <Icon name="flame" size={34} strokeWidth={2.1} />
        </span>
        <span className="brand__product">
          Straus<b>POS</b>
        </span>
      </div>
      <div className="brand__center">
        <div className="brand__time num">{formatClock(now)}</div>
        <div className="brand__date">{formatDate(now)}</div>
      </div>
      <div className="brand__bottom">
        {businessName ? <div className="brand__biz">{businessName}</div> : null}
        <div className="brand__foot">{footer ?? 'Oflayn ishlaydi · Ma\'lumotlar shu kompyuterda saqlanadi'}</div>
      </div>
    </section>
  )
}
