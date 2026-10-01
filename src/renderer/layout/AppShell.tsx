/**
 * Ilova qobig'i: chapda navigatsiya, tepada biznes nomi / soat / xodim / Qulflash, o'rtada joriy ekran.
 * Ekran `.shell__main` ichida to'liq balandlikda chiziladi (o'zi skrollni boshqaradi; standart padding bor).
 */
import { useMemo } from 'react'
import { ROLE_LABELS } from '@shared/permissions'
import { useAuth } from '../store/auth'
import { useApp } from '../store/app'
import { useNav } from '../store/nav'
import { useNow } from '../store/clock'
import { Avatar, Button, ErrorBoundary, Icon, formatClock, formatDate, cx } from '../ui'
import { SCREENS, screenAllowed } from './routes'
import { useAutoLock } from './useAutoLock'

function Clock() {
  const now = useNow()
  return (
    <div className="topbar__clock">
      <div className="topbar__time num">{formatClock(now)}</div>
      <div className="topbar__date">{formatDate(now)}</div>
    </div>
  )
}

export function AppShell() {
  useAutoLock()
  const staff = useAuth((s) => s.staff)
  const permissions = useAuth((s) => s.permissions)
  const businessName = useApp((s) => s.businessName)
  const lock = useApp((s) => s.lock)
  const screen = useNav((s) => s.screen)
  const go = useNav((s) => s.go)

  const visible = useMemo(() => SCREENS.filter((d) => screenAllowed(d, (p) => permissions.indexOf(p) >= 0)), [permissions])
  const active = visible.find((d) => d.id === screen) ?? visible[0]
  const Current = active ? active.Component : null

  return (
    <div className="shell">
      <aside className="shell__side">
        <div className="side__brand" title="StrausPOS">
          <span className="side__logo">
            <Icon name="flame" size={26} strokeWidth={2.2} />
          </span>
          <span className="side__brandtext">
            Straus<b>POS</b>
          </span>
        </div>
        <nav className="side__nav">
          {visible.map((d) => (
            <button
              key={d.id}
              type="button"
              className={cx('side__item', d.id === active?.id && 'is-active')}
              onClick={() => go(d.id)}
              aria-current={d.id === active?.id ? 'page' : undefined}
            >
              <Icon name={d.icon} size={28} strokeWidth={d.id === active?.id ? 2.2 : 1.9} />
              <span>{d.label}</span>
            </button>
          ))}
        </nav>
        <div className="side__foot">v0.1 · offline</div>
      </aside>

      <header className="shell__top">
        <div className="topbar__biz">
          <div className="topbar__bizname ellipsis">{businessName || 'StrausPOS'}</div>
          {active && <div className="topbar__crumb">{active.label}</div>}
        </div>
        <div className="spacer" />
        <Clock />
        <div className="topbar__sep" />
        {staff && (
          <div className="topbar__user">
            <Avatar name={staff.name} size={46} />
            <div className="topbar__usertext">
              <div className="topbar__username ellipsis">{staff.name}</div>
              <div className="topbar__role">{ROLE_LABELS[staff.role]}</div>
            </div>
          </div>
        )}
        <Button variant="secondary" icon="lock" onClick={() => void lock()} className="topbar__lock">
          Qulflash
        </Button>
      </header>

      <main className="shell__main" key={active?.id}>
        <ErrorBoundary resetKey={active?.id}>{Current ? <Current /> : null}</ErrorBoundary>
      </main>
    </div>
  )
}
