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
import { SCREENS, screenAllowed, type ScreenId } from './routes'
import { useAutoLock } from './useAutoLock'
import { useViewerLink } from './useViewerLink'
import { formatLeft, useLicense } from '../store/license'
import './license.css'

/** Ko'ruvchi (faqat ko'rish) kompyuterdagi bo'limlar */
const VIEWER_SCREENS: ScreenId[] = ['rooms', 'reports', 'waiters', 'debts']

/** Tepa paneldagi "Faqat ko'rish · <biznes>" belgisi va aloqa nuqtasi */
function ViewerBadge({ name, connected, host }: { name: string; connected: boolean; host: string | null }) {
  return (
    <div className={cx('topbar__viewer', !connected && 'is-off')} data-testid="viewer-badge" title={host ? 'Asosiy kompyuter: ' + host : undefined}>
      <Icon name="eye" size={22} strokeWidth={2.2} />
      <span className="topbar__viewertext">
        <span className="topbar__viewerlabel">Faqat ko'rish</span>
        <span className="topbar__viewername ellipsis">{name}</span>
      </span>
      <span className="topbar__dot" aria-label={connected ? 'Aloqa bor' : "Aloqa yo'q"} />
      <span className="topbar__dottext">{connected ? 'Ulangan' : "Aloqa yo'q"}</span>
    </div>
  )
}

async function changeConnection() {
  const ok = await confirmDialog({
    title: "Ulanishni o'zgartirasizmi?",
    message: "Bu kompyuter asosiy kompyuterdan uziladi. Keyin boshqa kompyuterga ulanish yoki yangi biznes ochish mumkin.",
    confirmText: 'Ha, uzish',
    cancelText: "Yo'q",
    danger: true,
    icon: 'logout'
  })
  if (!ok) return
  try {
    await api.connection.disconnect()
    toast.success('Ulanish uzildi')
    if (apiKind() === 'mock') void useApp.getState().boot()
    else location.reload()
  } catch (e) {
    toast.error(errorMessage(e))
  }
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

/** Muddat tugagan / soat buzilgan: qizil banner + Aktivatsiya */
function LicenseBanner({ tampered }: { tampered: boolean }) {
  return (
    <div className="shell__banner shell__banner--license" role="alert" data-testid="license-banner">
      <Icon name="lock" size={26} strokeWidth={2.2} />
      <span className="shell__bannertext">
        {tampered ? 'Kompyuter soati noto‘g‘ri — dastur faqat ko‘rish rejimida' : 'Litsenziya muddati tugagan — dastur faqat ko‘rish rejimida'}
      </span>
      <Button variant="danger" icon="key" onClick={() => useLicense.getState().openDialog()} data-testid="license-banner-activate">
        Aktivatsiya
      </Button>
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
  useViewerLink()
  const readOnly = useApp((s) => s.readOnly)
  /** Ko'ruvchi kompyuter (readOnly litsenziya tufayli ham bo'lishi mumkin — u holda login/qulf odatdagidek) */
  const isViewer = useApp((s) => s.mode === 'viewer')
  const license = useLicense((s) => s.status)
  const licenseBlocked = useLicense((s) => s.blocked) && !isViewer
  const trialEndsAt = !isViewer && license && license.state === 'trial' ? license.trialEndsAt : null
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

  const visible = useMemo(
    () =>
      isViewer
        ? SCREENS.filter((d) => VIEWER_SCREENS.indexOf(d.id) >= 0).sort((a, b) => VIEWER_SCREENS.indexOf(a.id) - VIEWER_SCREENS.indexOf(b.id))
        : SCREENS.filter((d) => screenAllowed(d, (p) => permissions.indexOf(p) >= 0)),
    [permissions, isViewer]
  )
  const offline = isViewer && !connected
  const active = visible.find((d) => d.id === screen) ?? visible[0]
  const Current = active ? active.Component : null

  return (
    <div className={cx('shell', (offline || licenseBlocked) && 'shell--banner', isViewer && 'shell--viewer', readOnly && 'shell--readonly')}>
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
        {isViewer ? (
          <div className="side__foot side__foot--viewer">
            <Button variant="ghost" icon="swap" block onClick={() => void changeConnection()} data-testid="viewer-disconnect">
              Ulanishni o'zgartirish
            </Button>
          </div>
        ) : (
          <div className="side__foot">v0.1 · offline</div>
        )}
      </aside>

      <header className="shell__top">
        {isViewer ? (
          <ViewerBadge name={businessName || 'Delfin Sauna'} connected={connected} host={host} />
        ) : (
          <div className="topbar__biz">
            <div className="topbar__bizname ellipsis">{businessName || 'Delfin Sauna'}</div>
            {active && <div className="topbar__crumb">{active.label}</div>}
          </div>
        )}
        <div className="spacer" />
        {trialEndsAt != null && <TrialBadge endsAt={trialEndsAt} />}
        <Clock />
        <ThemeToggle />
        {!isViewer && <div className="topbar__sep" />}
        {staff && !isViewer && (
          <div className="topbar__user">
            <Avatar name={staff.name} size={46} />
            <div className="topbar__usertext">
              <div className="topbar__username ellipsis">{staff.name}</div>
              <div className="topbar__role">{ROLE_LABELS[staff.role]}</div>
            </div>
          </div>
        )}
        {!isViewer && (
          <Button variant="secondary" icon="lock" onClick={() => void lock()} className="topbar__lock">
            Qulflash
          </Button>
        )}
      </header>

      {licenseBlocked && <LicenseBanner tampered={license?.state === 'tampered'} />}
      {offline && (
        <div className="shell__banner" role="alert" data-testid="viewer-offline">
          <Icon name="alert" size={26} strokeWidth={2.2} />
          <span className="shell__bannertext">Asosiy kompyuter bilan aloqa yo'q — qayta ulanmoqda…</span>
          <span className="shell__bannerhint">{host ? host + ' · ' : ''}har 5 soniyada urinadi</span>
        </div>
      )}

      <main className="shell__main" key={active?.id}>
        <ErrorBoundary resetKey={active?.id}>{Current ? <Current /> : null}</ErrorBoundary>
      </main>
    </div>
  )
}
