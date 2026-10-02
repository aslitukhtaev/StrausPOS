/**
 * Delfin Sauna logotipi — sakrayotgan delfin + to'lqin.
 *
 *   <Logo />                         // belgi (mark): moviy gradient yumaloq kvadrat, oq delfin, 44px
 *   <Logo size={60} variant="full" /> // belgi + "Delfin Sauna" yozuvi
 *   <Logo variant="glyph" size={40} />// faqat delfin siluet (currentColor) — fon ustida bezak uchun
 *
 * Ranglar: --brand-1/2/3 va --brand-ink (tokens.css) — ikkala rejimda bir xil.
 * Ilova ikonkasi (scripts/make-icon.py) shu shakldan chiziladi — yo'llarni o'zgartirsangiz, u yerda ham yangilang.
 */
import { useId } from 'react'
import { cx } from './cx'

/** Delfin siluet (viewBox 0 0 64 64): tana + dum suzgichlari, orqa suzgich, yon suzgich. */
export const DOLPHIN_PATH =
  'M61 28C58 27.5 55.5 26 54.5 24C53 18 46.5 13.5 38.5 13.8C29 14.2 21.5 20 17 28C15 31.5 13.8 35 13.4 38.5' +
  'C11 36.6 7 35.6 3.2 36.6C6.5 38.8 9.6 41.4 11.3 44C9.2 46.6 7.9 50 8.2 53.8C11.2 50.6 14.6 47.6 17.2 45' +
  'C21 37.5 27 31.5 34 28C41 25 47.5 25.5 52.5 27.3C55.5 28.3 58.5 28.6 61 28Z' +
  'M37 14.1C32 12.6 27.6 10 23.6 6C24.6 11 24.2 16 22.5 22Z' +
  'M42 25.5C41.5 30.5 39.5 34 36 36.5C36.3 32.5 36.8 30 37 27.5Z'

const WAVE_PATH = 'M5 52C12 47.5 18 47.5 25 52S38 56.5 45 52S55 48 60 50'

export interface LogoProps {
  /** Belgi o'lchami, px (standart 44) */
  size?: number
  variant?: 'mark' | 'full' | 'glyph'
  /** full: yozuv o'lchami belgiga nisbatan avtomatik; kerak bo'lsa yashirish uchun className bilan */
  className?: string
  title?: string
}

function Mark({ size, title }: { size: number; title?: string }) {
  const id = useId().replace(/:/g, '')
  const g = 'dl-g-' + id
  const s = 'dl-s-' + id
  const small = size < 40
  return (
    <svg className="ui-logo__mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? 'Delfin Sauna'}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--brand-1)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--brand-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-3)' }} />
        </linearGradient>
        <radialGradient id={s} cx="0.3" cy="0.12" r="0.7">
          <stop offset="0" style={{ stopColor: 'var(--brand-ink)', stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-ink)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${g})`} />
      <rect width="64" height="64" rx="15" fill={`url(#${s})`} />
      <path d={DOLPHIN_PATH} style={{ fill: 'var(--brand-ink)' }} />
      {!small && <circle cx="49.5" cy="19.5" r="1.3" style={{ fill: 'var(--brand-3)' }} />}
      {!small && (
        <path d={WAVE_PATH} fill="none" style={{ stroke: 'var(--brand-ink)' }} strokeOpacity={0.85} strokeWidth={3} strokeLinecap="round" />
      )}
    </svg>
  )
}

export function Logo({ size = 44, variant = 'mark', className, title }: LogoProps) {
  if (variant === 'glyph') {
    return (
      <svg className={cx('ui-logo__glyph', className)} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path d={DOLPHIN_PATH} fill="currentColor" />
        <path d={WAVE_PATH} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
      </svg>
    )
  }
  if (variant === 'mark') {
    return (
      <span className={cx('ui-logo', className)} title={title}>
        <Mark size={size} title={title} />
      </span>
    )
  }
  return (
    <span className={cx('ui-logo', 'ui-logo--full', className)} style={{ fontSize: Math.round(size * 0.42) }}>
      <Mark size={size} title={title} />
      <span className="ui-logo__text">
        Delfin <b>Sauna</b>
      </span>
    </span>
  )
}
