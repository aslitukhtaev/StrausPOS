/**
 * Timer — davomiylik "hh:mm:ss" (tabular-nums).
 *
 *   <Timer ms={guest.elapsedMs} />                             // statik qiymat
 *   <Timer ms={guestElapsedMs(g.intervals, now)} running />    // jonli: now = useNow()
 *   <Timer since={session.openedAt} running size="xl" />      // boshlanish vaqtidan beri (o'zi har soniya yangilanadi)
 *
 * running — yashil nuqta (ishlayapti); paused — kulrang; tone bilan rangni majburlash mumkin.
 * size: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
 */
import { formatDuration } from '@shared/billing'
import { useNow } from '../store/clock'
import { cx } from './cx'

export interface TimerProps {
  ms?: number
  since?: number
  running?: boolean
  paused?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'muted'
  showDot?: boolean
  className?: string
}

function SinceValue({ since }: { since: number }) {
  const now = useNow()
  return <>{formatDuration(Math.max(0, now - since))}</>
}

export function Timer({ ms, since, running, paused, size = 'md', tone = 'default', showDot = true, className }: TimerProps) {
  return (
    <span className={cx('ui-timer', 'num', 'ui-timer--' + size, tone !== 'default' && 'ui-timer--' + tone, paused && 'is-paused', className)}>
      {showDot && (running || paused) && <span className={cx('ui-timer__dot', running && 'is-running')} />}
      {since != null ? <SinceValue since={since} /> : formatDuration(ms ?? 0)}
    </span>
  )
}
