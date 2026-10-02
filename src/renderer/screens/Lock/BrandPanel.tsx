/** Qulf/Setup ekranlarining chap brend paneli: logo, biznes nomi, katta soat. */
import type { ReactNode } from 'react'
import { IconButton, Logo, formatClock, formatDate, useNow } from '../../ui'
import { useApp } from '../../store/app'

export function BrandPanel({ businessName, footer }: { businessName: string; footer?: ReactNode }) {
  const now = useNow()
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  return (
    <section className="brand">
      <div className="brand__glow" aria-hidden />
      <Logo variant="glyph" size={420} className="brand__art" />
      <div className="brand__top">
        <Logo size={60} variant="full" className="brand__logo" />
        <span className="spacer" />
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}
          variant="ghost"
          className="brand__theme"
          data-testid="theme-toggle"
          onClick={() => void toggleTheme()}
        />
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
