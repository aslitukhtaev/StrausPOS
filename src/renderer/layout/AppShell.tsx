/**
 * Ilova qobig'i: chapda logotip + navigatsiya, tepada biznes nomi / soat / rejim (quyosh/oy) / xodim / Qulflash, o'rtada joriy ekran.
 * Ekran `.shell__main` ichida to'liq balandlikda chiziladi (o'zi skrollni boshqaradi; standart padding bor).
 */
import { useMemo } from 'react'
import { ROLE_LABELS } from '@shared/permissions'
import { useAuth } from '../store/auth'
import { useApp } from '../store/app'
import { useNav } from '../store/nav'
import { useNow } from '../store/clock'
import { api, apiKind } from '../api'
import { Avatar, Button, ErrorBoundary, Icon, IconButton, Logo, confirmDialog, errorMessage, formatClock, formatDate, cx, toast } from '../ui'
import { SCREENS, screenAllowed } from './routes'
import { useAutoLock } from './useAutoLock'
import { changeConnection, useTerminalLink } from './useViewerLink'
import { formatLeft, useLicense } from '../store/license'
import './license.css'

/** Tepa paneldagi kichik "Terminal · <asosiy nomi>" belgisi va aloqa nuqtasi */
function TerminalBadge({ name, connected, host }: { name: string; connected: boolean; host: string | null }) {
  return (
    <div className={cx('topbar__viewer', !connected && 'is-off')} data-testid="terminal-badge" title={host ? 'Asosiy kompyuter: ' + host : undefined}>
      <Icon name="swap" size={22} strokeWidth={2.2} />
      <span className="topbar__viewertext">
        <span className="topbar__viewerlabel">Terminal</span>
        <span className="topbar__viewername ellipsis">{name}</span>
      </span>
      <span className="topbar__dot" aria-label={connected ? 'Aloqa bor' : "Aloqa yo'q"} />
      <span className="topbar__dottext">{connected ? 'Ulangan' : "Aloqa yo'q"}</span>
    </div>
  )
}

import { useRoomsBackground } from '../screens/rooms/background'

/** Kunduzgi ↔ tungi tezkor almashtirgich */
function ThemeToggle() {
  const theme = useApp((s) => s.theme)
  const toggle = useApp((s) => s.toggleTheme)
  const toLight = theme === 'dark'
  return (
    <IconButton
      icon={toLight ? 'sun' : 'moon'}
      label={toLight ? 'Kunduzgi rejim' : 'Tungi rejim'}
      variant="ghost"
      className="topbar__theme"
      data-testid="theme-toggle"
      onClick={() => void toggle()}
    />
  )
}

/** Sinov rejimida tepada kichik belgi: "Sinov: 14 soat qoldi" (bosilsa — aktivatsiya oynasi) */
function TrialBadge({ endsAt }: { endsAt: number }) {
  const now = useNow()
  return (
    <button type="button" className="topbar__trial" onClick={() => useLicense.getState().openDialog()} data-testid="license-trial-badge">
      <Icon name="clock" size={20} strokeWidth={2.2} />
      Sinov: {formatLeft(endsAt - now)}
    </button>
  )
}

/** Muddat tugagan / soat buzilgan: qizil banner + Aktivatsiya (terminalda — faqat xabar: aktivatsiya asosiy kompyuterda) */
function LicenseBanner({ tampered, terminal }: { tampered: boolean; terminal: boolean }) {
  return (
    <div className="shell__banner shell__banner--license" role="alert" data-testid="license-banner">
      <Icon name="lock" size={26} strokeWidth={2.2} />
      <span className="shell__bannertext">
        {terminal
          ? 'Asosiy kompyuterda litsenziya muddati tugagan — dastur faqat ko‘rish rejimida'
          : tampered ? 'Kompyuter soati noto‘g‘ri — dastur faqat ko‘rish rejimida' : 'Litsenziya muddati tugagan — dastur faqat ko‘rish rejimida'}
      </span>
      {!terminal && (
        <Button variant="danger" icon="key" onClick={() => useLicense.getState().openDialog()} data-testid="license-banner-activate">
          Aktivatsiya
        </Button>
      )}
    </div>
  )
}

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
  useTerminalLink()
  const readOnly = useApp((s) => s.readOnly)
  /** Terminal (ikkinchi kompyuter): to'liq ishlaydi, login odatdagidek; tepada belgi, aloqa banneri */
  const isTerminal = useApp((s) => s.mode === 'terminal')
  const license = useLicense((s) => s.status)
  const licenseBlocked = useLicense((s) => s.blocked)
  const trialEndsAt = !isTerminal && license && license.state === 'trial' ? license.trialEndsAt : null
  const connected = useApp((s) => s.connected)
  const host = useApp((s) => s.host)
  // Vaqt tugash ogohlantirishlari har qanday ekranda ham chalinsin
  useRoomsBackground()
  const staff = useAuth((s) => s.staff)
  const permissions = useAuth((s) => s.permissions)
  const businessName = useApp((s) => s.businessName)
  const lock = useApp((s) => s.lock)
  const screen = useNav((s) => s.screen)
  const go = useNav((s) => s.go)

  const visible = useMemo(() => SCREENS.filter((d) => screenAllowed(d, (p) => permissions.indexOf(p) >= 0)), [permissions])
  const canChangeLink = permissions.indexOf('settings.manage') >= 0
  const offline = isTerminal && !connected
  const active = visible.find((d) => d.id === screen) ?? visible[0]
  const Current = active ? active.Component : null

  return (
    <div className={cx('shell', (offline || licenseBlocked) && 'shell--banner', isTerminal && 'shell--terminal', readOnly && 'shell--readonly')}>
      <aside className="shell__side">
        <div className="side__brand" title="Delfin Sauna">
          <Logo size={44} variant="full" />
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
        {isTerminal && canChangeLink ? (
          <div className="side__foot side__foot--viewer">
            <Button variant="ghost" icon="swap" block onClick={() => void changeConnection()} data-testid="terminal-disconnect">
              Ulanishni o'zgartirish
            </Button>
          </div>
        ) : (
          <div className="side__foot">v0.1 · offline</div>
        )}
      </aside>

      <header className="shell__top">
        <div className="topbar__biz">
          <div className="topbar__bizname ellipsis">{businessName || 'Delfin Sauna'}</div>
          {active && <div className="topbar__crumb">{active.label}</div>}
        </div>
        {isTerminal && <TerminalBadge name={businessName || 'Delfin Sauna'} connected={connected} host={host} />}
        <div className="spacer" />
        {trialEndsAt != null && <TrialBadge endsAt={trialEndsAt} />}
        <Clock />
        <ThemeToggle />
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

      {licenseBlocked && <LicenseBanner tampered={license?.state === 'tampered'} terminal={isTerminal} />}
      {offline && (
        <div className="shell__banner" role="alert" data-testid="terminal-offline">
          <Icon name="alert" size={26} strokeWidth={2.2} />
          <span className="shell__bannertext">Asosiy kompyuter bilan aloqa yo'q — qayta ulanmoqda…</span>
          <span className="shell__bannerhint">{host ? host + ' · ' : ''}har 5 soniyada urinadi</span>
          {canChangeLink && (
            <Button size="sm" variant="ghost" icon="swap" onClick={() => void changeConnection()}>
              Ulanishni o'zgartirish
            </Button>
          )}
        </div>
      )}

      <main className="shell__main" key={active?.id}>
        <ErrorBoundary resetKey={active?.id}>{Current ? <Current /> : null}</ErrorBoundary>
      </main>
    </div>
  )
}
