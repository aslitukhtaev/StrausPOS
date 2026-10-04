/**
 * Qulf / kirish ekrani: xodimni tanlash → PIN (numpad yoki klaviatura) → Kirish.
 * Terminalda ham xuddi shunday (xodimlar ro'yxati asosiy kompyuterdan); pastda "Terminal · manzil" va ulanishni o'zgartirish.
 * Asosiy kompyuterda: "Bu kompyuterni terminal qilish" — ega PIN tasdig'i bilan (sozlangan bazani tasodifan uzmaslik uchun).
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
import { TerminalConnect } from '../Setup/TerminalConnect'
import { changeConnection } from '../../layout/useViewerLink'
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

/** "Bu kompyuterni terminal qilish": avval ega PIN bilan tasdiqlaydi, keyin ulanish oqimi */
function ToTerminal({ staff, businessName, onBack }: { staff: Staff[]; businessName: string; onBack: () => void }) {
  const owners = staff.filter((s) => s.role === 'owner')
  const [owner, setOwner] = useState<Staff | null>(owners.length === 1 ? owners[0] : null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const back = () => {
    // Tasdiq uchun kirilgan bo'lsa — chiqamiz (qulf ekraniga qaytiladi)
    if (confirmed) void api.auth.logout().catch(() => undefined)
    onBack()
  }

  const submit = async (value = pin) => {
    if (!owner || busy || value.length < PIN_MIN) return
    setBusy(true)
    setError(null)
    try {
      const session = await api.auth.login(owner.id, value)
      if (session.permissions.indexOf('settings.manage') < 0) {
        void api.auth.logout().catch(() => undefined)
        throw new Error('Faqat ega tasdiqlay oladi')
      }
      setConfirmed(true)
    } catch (e) {
      setError(errorMessage(e))
      setShake((n) => n + 1)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <BrandPanel businessName={businessName} footer="Terminal rejimiga o'tkazish · ma'lumotlar asosiy kompyuterda bo'ladi" />
      <section className="auth__panel">
        <div className="setup">
          {confirmed ? (
            <TerminalConnect onBack={back} />
          ) : (
            <div className="setup__body setup__body--pin" key="owner">
              <div className="auth__head auth__head--center">
                <h1>Ega tasdig'i</h1>
                <p className="auth__lead">
                  Bu kompyuter terminalga aylantiriladi — undagi ma'lumotlar ishlatilmaydi (o'chirilmaydi). Davom etish uchun ega PIN kodini kiriting.
                </p>
              </div>
              {owners.length === 0 && <div className="lock-pin__error is-on" role="alert"><Icon name="alert" size={20} /> Ega topilmadi</div>}
              {owners.length > 1 && !owner && (
                <div className="lock-pick__grid">
                  {owners.map((s) => (
                    <button key={s.id} type="button" className="lock-tile" onClick={() => setOwner(s)}>
                      <Avatar name={s.name} size={56} />
                      <span className="lock-tile__name">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {owner && (
                <>
                  <div className="lock-pin__prompt">{owner.name} — PIN kod</div>
                  <div key={shake} className={'lock-pin__dots' + (shake ? ' is-shake' : '')}>
                    <PinDots length={pin.length} max={PIN_MAX} error={!!error} />
                  </div>
                  <div className={'lock-pin__error' + (error ? ' is-on' : '')} role="alert">
                    {error ? <><Icon name="alert" size={20} /> {error}</> : ' '}
                  </div>
                  <Numpad
                    mode="pin"
                    value={pin}
                    onChange={(v) => {
                      setError(null)
                      setPin(v)
                      if (v.length === PIN_MAX) void submit(v)
                    }}
                    maxLength={PIN_MAX}
                    onSubmit={() => void submit()}
                    submitDisabled={pin.length < PIN_MIN}
                    disabled={busy}
                    size="lg"
                    className="lock-pin__pad"
                  />
                </>
              )}
              <Button variant="ghost" icon="arrowLeft" onClick={back} disabled={busy}>
                Orqaga
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default function LockScreen() {
  const businessName = useApp((s) => s.businessName)
  const enter = useApp((s) => s.enter)
  const isTerminal = useApp((s) => s.mode === 'terminal')
  const host = useApp((s) => s.host)
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toTerminal, setToTerminal] = useState(false)

  const load = () => {
    setLoadError(null)
    api.auth
      .listLoginStaff()
      .then((list) => {
        setStaff(list)
        if (list.length === 1) setSelected(list[0])
        if (isTerminal) useApp.getState().setConnected(true)
      })
      .catch((e) => {
        setLoadError(errorMessage(e))
        if (isTerminal) useApp.getState().setConnected(false)
      })
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

  if (toTerminal && staff) {
    return <ToTerminal staff={staff} businessName={businessName} onBack={() => setToTerminal(false)} />
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
        {!selected && !isTerminal && staff && (
          <button type="button" className="lock-viewerlink" onClick={() => setToTerminal(true)} data-testid="lock-to-terminal">
            <Icon name="swap" size={18} /> Bu kompyuterni terminal qilish
          </button>
        )}
        {!selected && isTerminal && (
          <button type="button" className="lock-viewerlink" onClick={() => void changeConnection()} data-testid="lock-terminal" title="Ulanishni o'zgartirish">
            <Icon name="swap" size={18} /> Terminal{host ? ' · ' + host : ''} — ulanishni o'zgartirish
          </button>
        )}
        {!isTerminal && <LicenseLink />}
      </section>
    </div>
  )
}
