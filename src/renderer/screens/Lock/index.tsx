/**
 * Qulf / kirish ekrani: xodimni tanlash → PIN (numpad yoki klaviatura) → Kirish.
 */
import { useEffect, useState } from 'react'
import type { Staff } from '@shared/types'
import { ROLE_LABELS } from '@shared/permissions'
import { api } from '../../api'
import { useApp } from '../../store/app'
import { Avatar, Button, EmptyState, Icon, Numpad, PinDots, Spinner, cx, errorMessage, useNow } from '../../ui'
import { formatLeft, useLicense } from '../../store/license'
import '../../layout/license.css'
import { BrandPanel } from './BrandPanel'
import { ViewerConnect } from '../Setup/ViewerConnect'
import '../Setup/setup.css'
import './lock.css'

const PIN_MAX = 6
const PIN_MIN = 4

/** Litsenziya havolasi (login'siz aktivatsiya oynasi) */
function LicenseLink() {
  const st = useLicense((s) => s.status)
  const now = useNow()
  if (!st) return null
  const blocked = st.state === 'expired' || st.state === 'tampered'
  const trial = st.state === 'trial'
  const text = blocked
    ? (st.state === 'tampered' ? 'Kompyuter soati noto‘g‘ri' : 'Litsenziya muddati tugagan') + ' — Aktivatsiya'
    : trial && st.trialEndsAt != null ? 'Sinov: ' + formatLeft(st.trialEndsAt - now) + ' — Faollashtirish' : 'Litsenziya'
  return (
    <button
      type="button"
      className={cx('lock-licenselink', blocked && 'is-danger', trial && 'is-trial')}
      onClick={() => useLicense.getState().openDialog()}
      data-testid="lock-license"
    >
      <Icon name={blocked ? 'lock' : trial ? 'clock' : 'key'} size={18} /> {text}
    </button>
  )
}

export default function LockScreen() {
  const businessName = useApp((s) => s.businessName)
  const enter = useApp((s) => s.enter)
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toViewer, setToViewer] = useState(false)

  const load = () => {
    setLoadError(null)
    api.auth
      .listLoginStaff()
      .then((list) => {
        setStaff(list)
        if (list.length === 1) setSelected(list[0])
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }
  useEffect(load, [])

  const submit = async (value = pin) => {
    if (!selected || busy) return
    if (value.length < PIN_MIN) {
      setError('PIN kamida ' + PIN_MIN + ' ta raqam')
      setShake((n) => n + 1)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = await api.auth.login(selected.id, value)
      enter(session)
    } catch (e) {
      setError(errorMessage(e))
      setShake((n) => n + 1)
      setPin('')
      setBusy(false)
    }
  }

  const onPin = (v: string) => {
    setError(null)
    setPin(v)
    if (v.length === PIN_MAX) void submit(v)
  }

  const back = () => {
    setSelected(null)
    setPin('')
    setError(null)
  }

  // Esc — xodim tanlashga qaytish
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (staff?.length ?? 0) > 1) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, staff])

  if (toViewer) {
    return (
      <div className="auth">
        <BrandPanel businessName={businessName} footer="Faqat ko'rish rejimiga o'tkazish" />
        <section className="auth__panel">
          <div className="setup">
            <ViewerConnect onBack={() => setToViewer(false)} />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="auth">
      <BrandPanel businessName={businessName} />
      <section className="auth__panel">
        {!staff && !loadError && (
          <div className="auth__center">
            <Spinner size={40} />
          </div>
        )}
        {loadError && (
          <EmptyState
            size="lg"
            icon="alert"
            title="Xodimlar ro'yxatini yuklab bo'lmadi"
            description={loadError}
            action={<Button variant="primary" icon="refresh" onClick={load}>Qayta urinish</Button>}
          />
        )}

        {staff && !selected && (
          <div className="lock-pick" key="pick">
            <div className="auth__head">
              <h1>Xush kelibsiz</h1>
              <p className="auth__lead">Ishni boshlash uchun o'zingizni tanlang</p>
            </div>
            <div className={'lock-pick__grid' + (staff.length > 6 ? ' is-dense' : '')}>
              {staff.map((s) => (
                <button key={s.id} type="button" className="lock-tile" onClick={() => setSelected(s)}>
                  <Avatar name={s.name} size={staff.length > 6 ? 56 : 68} />
                  <span className="lock-tile__name">{s.name}</span>
                  <span className={'lock-tile__role role--' + s.role}>{ROLE_LABELS[s.role]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {staff && selected && (
          <div className="lock-pin" key={'pin-' + selected.id}>
            <div className="lock-pin__who">
              {staff.length > 1 && (
                <button type="button" className="lock-pin__back" onClick={back} aria-label="Boshqa xodim">
                  <Icon name="chevronLeft" size={30} />
                </button>
              )}
              <Avatar name={selected.name} size={64} />
              <div className="lock-pin__whotext">
                <div className="lock-pin__name">{selected.name}</div>
                <div className="lock-pin__role">{ROLE_LABELS[selected.role]}</div>
              </div>
            </div>
            <div className="lock-pin__prompt">PIN kodni kiriting</div>
            <div key={shake} className={'lock-pin__dots' + (shake ? ' is-shake' : '')}>
              <PinDots length={pin.length} max={PIN_MAX} error={!!error} />
            </div>
            <div className={'lock-pin__error' + (error ? ' is-on' : '')} role="alert">
              {error ? <><Icon name="alert" size={20} /> {error}</> : ' '}
            </div>
            <Numpad
              mode="pin"
              value={pin}
              onChange={onPin}
              maxLength={PIN_MAX}
              onSubmit={() => void submit()}
              submitDisabled={pin.length < PIN_MIN}
              disabled={busy}
              size="lg"
              className="lock-pin__pad"
            />
            {staff.length > 1 && (
              <Button variant="ghost" icon="users" onClick={back} className="lock-pin__switch">
                Boshqa xodim
              </Button>
            )}
          </div>
        )}
        {!selected && (
          <button type="button" className="lock-viewerlink" onClick={() => setToViewer(true)} data-testid="lock-to-viewer">
            <Icon name="eye" size={18} /> Bu kompyuterni ko'rish rejimiga o'tkazish
          </button>
        )}
        <LicenseLink />
      </section>
    </div>
  )
}
