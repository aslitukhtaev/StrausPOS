/**
 * Badge — kichik yorliq. StatusPill — xona/mehmon holati (rangli nuqta bilan).
 *
 *   <Badge tone="accent">VIP</Badge>
 *   <Badge tone="danger" icon="alert">Kam qoldi</Badge>
 *   <StatusPill status="free" />              // "Bo'sh" (yashil)
 *   <StatusPill status="busy" size="lg" />    // "Band" (amber)
 *   <StatusPill status="ending">10 daqiqa</StatusPill>  // matnni almashtirish
 *
 * Badge tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
 * StatusPill status → rang va standart matn:
 *   free "Bo'sh" (yashil) · busy "Band" (amber) · ending "Tugayapti" (qizil) · debt "Qarz" (qizil)
 *   paused "Pauza" (kulrang) · running "Ishlayapti" (yashil, puls) · finished "Tugadi" (kulrang) · closed "Yopilgan"
 */
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps {
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  className?: string
  children?: ReactNode
}

export function Badge({ tone = 'neutral', size = 'md', icon, className, children }: BadgeProps) {
  return (
    <span className={cx('ui-badge', 'ui-badge--' + tone, 'ui-badge--' + size, className)}>
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 16} strokeWidth={2.4} />}
      {children}
    </span>
  )
}

export type Status = 'free' | 'busy' | 'ending' | 'debt' | 'paused' | 'running' | 'finished' | 'closed'

const STATUS: Record<Status, { tone: Tone; label: string; pulse?: boolean }> = {
  free: { tone: 'success', label: "Bo'sh" },
  busy: { tone: 'warning', label: 'Band' },
  ending: { tone: 'danger', label: 'Tugayapti', pulse: true },
  debt: { tone: 'danger', label: 'Qarz' },
  paused: { tone: 'neutral', label: 'Pauza' },
  running: { tone: 'success', label: 'Ishlayapti', pulse: true },
  finished: { tone: 'neutral', label: 'Tugadi' },
  closed: { tone: 'neutral', label: 'Yopilgan' }
}

export interface StatusPillProps {
  status: Status
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Standart matn o'rniga */
  children?: ReactNode
}

export function StatusPill({ status, size = 'md', className, children }: StatusPillProps) {
  const s = STATUS[status]
  return (
    <span className={cx('ui-badge', 'ui-pill', 'ui-badge--' + s.tone, 'ui-badge--' + size, className)}>
      <span className={cx('ui-pill__dot', s.pulse && 'is-pulse')} />
      {children ?? s.label}
    </span>
  )
}
