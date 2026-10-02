/**
 * Mehmon kartasi: nomi (bosib o'zgartiriladi), jonli taymer, vaqt summasi, holat, Pauza/Davom va Tugatish.
 */
import type { GuestView } from '@shared/types'
import { guestElapsedMs } from '@shared/billing'
import { Avatar, Button, Icon, Money, StatusPill, Timer, cx, formatMoney } from '@/ui'

export interface GuestCardProps {
  guest: GuestView
  /** Jonli hisoblash vaqti */
  t: number
  canManage: boolean
  busy: string | null
  onRename: () => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
}

export function GuestCard({ guest: g, t, canManage, busy, onRename, onPause, onResume, onFinish }: GuestCardProps) {
  const ms = guestElapsedMs(g.intervals, t)
  const rates = uniqueRates(g)
  const k = (a: string) => busy === a + ':' + g.id
  const anyBusy = busy != null && busy.endsWith(':' + g.id)
  return (
    <div className={cx('rooms-guest', 'rooms-guest--' + g.state)} data-guest={g.label}>
      <div className="rooms-guest__head">
        <Avatar name={g.label} size={38} />
        <button
          type="button"
          className="rooms-guest__name"
          onClick={canManage ? onRename : undefined}
          disabled={!canManage}
          title={canManage ? "Nomini o'zgartirish" : undefined}
        >
          <span className="ellipsis">{g.label}</span>
          {canManage && <Icon name="edit" size={18} />}
        </button>
      </div>

      <div className="rooms-guest__timerrow">
        <Timer ms={ms} running={g.state === 'running'} paused={g.state === 'paused'} size="xl" showDot={false} className="rooms-guest__timer" />
        <StatusPill size="sm" status={g.state === 'running' ? 'running' : g.state === 'paused' ? 'paused' : 'finished'}>
          {g.state === 'finished' ? 'Chiqib ketdi' : undefined}
        </StatusPill>
      </div>
      <div className="rooms-guest__money">
        <div className="rooms-guest__meta">
          <span className="ellipsis" title={rates.title}>{rates.text}</span>
          {g.linesAmount > 0 && (
            <span className="rooms-guest__extra ellipsis">
              + bar <b className="num">{formatMoney(g.linesAmount)}</b>
            </span>
          )}
        </div>
        <Money value={g.timeAmount} size="xl" tone={g.state === 'finished' ? 'muted' : 'default'} />
      </div>

      {canManage && (
        <div className="rooms-guest__actions">
          {g.state === 'running' && (
            <Button size="md" icon="pause" onClick={onPause} loading={k('pause')} disabled={anyBusy && !k('pause')}>
              Pauza
            </Button>
          )}
          {g.state === 'paused' && (
            <Button size="md" variant="success" icon="play" title="Davom ettirish" onClick={onResume} loading={k('resume')} disabled={anyBusy && !k('resume')}>
              Davom ettirish
            </Button>
          )}
          {g.state !== 'finished' ? (
            <Button size="md" variant="danger" icon="logout" onClick={onFinish} loading={k('finish')} disabled={anyBusy && !k('finish')}>
              Tugatish
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon="undo" onClick={onResume} loading={k('resume')} className="rooms-guest__back">
              Qaytib keldi — davom ettirish
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function uniqueRates(g: GuestView): { text: string; title: string } {
  const seen: number[] = []
  for (const iv of g.intervals) if (seen.indexOf(iv.rate) < 0) seen.push(iv.rate)
  if (seen.length === 0) return { text: '', title: '' }
  const cur = g.state === 'running' && g.runningRate ? g.runningRate : seen[seen.length - 1]
  const title = seen.length > 1 ? 'Tariflar: ' + seen.map(formatMoney).join(' → ') + " so'm/soat" : formatMoney(cur) + " so'm/soat"
  return { text: formatMoney(cur) + '/soat' + (seen.length > 1 ? ' · narx o‘zgargan' : ''), title }
}
