/**
 * Mehmon kartasi: nomi (bosib o'zgartiriladi), ORQAGA sanovchi taymer, olingan vaqt va progress,
 * jonli vaqt summasi; tugmalar: +1 soat, Pauza/Davom, Tugatish.
 * Bosqichlar: ok · warn (≤ warnBeforeMinutes, amber + yengil puls) · over (qizil, "+00:05:12 oshdi").
 */
import type { GuestView } from '@shared/types'
import { MS_MIN, formatCountdown, formatHours } from '@shared/billing'
import { Avatar, Button, Icon, Money, cx, formatMoney } from '@/ui'
import { guestPhase } from './live'

export interface GuestCardProps {
  guest: GuestView
  warnMs: number
  canManage: boolean
  busy: string | null
  onRename: () => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
  onExtend: () => void
}

export function GuestCard({ guest: g, warnMs, canManage, busy, onRename, onPause, onResume, onFinish, onExtend }: GuestCardProps) {
  const phase = guestPhase(g, warnMs)
  const k = (a: string) => busy === a + ':' + g.id
  const anyBusy = busy != null && busy.endsWith(':' + g.id)
  const paidMs = Math.max(1, g.paidMinutes * MS_MIN)
  const leftPct = Math.max(0, Math.min(100, (g.remainingMs / paidMs) * 100))
  const extra = g.billedMinutes - g.paidMinutes
  const over = g.remainingMs <= 0
  const stateText = g.state === 'finished' ? 'Chiqib ketdi' : g.state === 'paused' ? 'Pauza' : over ? 'Vaqt tugadi' : phase === 'warn' ? 'Tugayapti' : 'Qoldi'

  return (
    <div className={cx('rooms-guest', 'rooms-guest--' + g.state, g.state !== 'finished' && 'rooms-guest--' + phase)} data-guest={g.label}>
      <div className="rooms-guest__head">
        <Avatar name={g.label} size={36} />
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
        <span className="rooms-guest__paid" title="Oldindan olingan vaqt">
          <Icon name="clock" size={16} /> {formatHours(g.paidMinutes)} olingan
        </span>
      </div>

      <div className="rooms-guest__timerrow">
        <span className="rooms-guest__state">{stateText}</span>
        <span className="rooms-guest__countdown num" data-testid="countdown">
          {formatCountdown(g.remainingMs)}
          {over && g.state !== 'finished' && <small> oshdi</small>}
        </span>
      </div>
      <div className="rooms-guest__progress" aria-hidden>
        <span style={{ width: (over ? 100 : leftPct) + '%' }} />
      </div>
      {extra > 0 && (
        <div className="rooms-guest__overnote">
          <Icon name="alert" size={16} /> Keyingi {formatHours(extra)} hisoblandi
        </div>
      )}

      <div className="rooms-guest__money">
        <div className="rooms-guest__meta">
          <span className="num">
            {formatHours(g.paidMinutes)} olingan{extra > 0 ? ` + ${formatHours(extra)}` : ''} × {formatMoney(g.runningRate || lastRate(g))}
          </span>
          {g.linesAmount > 0 && (
            <span className="rooms-guest__extra ellipsis">
              + bar <b className="num">{formatMoney(g.linesAmount)}</b>
            </span>
          )}
        </div>
        <Money value={g.timeAmount} size="xl" tone={g.state === 'finished' ? 'muted' : over ? 'danger' : 'default'} />
      </div>

      {canManage &&
        (g.state !== 'finished' ? (
          <div className="rooms-guest__actions">
            <Button size="md" variant={over || phase === 'warn' ? 'primary' : 'secondary'} icon="plus" onClick={onExtend} loading={k('extend')} disabled={anyBusy && !k('extend')} className="rooms-guest__extend">
              1 soat
            </Button>
            {g.state === 'running' ? (
              <Button size="md" icon="pause" onClick={onPause} loading={k('pause')} disabled={anyBusy && !k('pause')} aria-label="Pauza">
                Pauza
              </Button>
            ) : (
              <Button size="md" variant="success" icon="play" onClick={onResume} loading={k('resume')} disabled={anyBusy && !k('resume')} aria-label="Davom ettirish">
                Davom
              </Button>
            )}
            <Button size="md" variant="danger" icon="logout" onClick={onFinish} loading={k('finish')} disabled={anyBusy && !k('finish')}>
              Tugatish
            </Button>
          </div>
        ) : (
          <div className="rooms-guest__actions rooms-guest__actions--one">
            <Button size="sm" variant="ghost" icon="undo" onClick={onResume} loading={k('resume')} className="rooms-guest__back">
              Qaytib keldi — davom ettirish
            </Button>
          </div>
        ))}
    </div>
  )
}

function lastRate(g: GuestView): number {
  const iv = g.intervals[g.intervals.length - 1]
  return iv ? iv.rate : 0
}
