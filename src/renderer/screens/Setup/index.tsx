/**
 * Birinchi ishga tushirish: avval tanlov — [Yangi biznes (asosiy kompyuter)] / [Asosiy kompyuterga ulanish (faqat ko'rish)].
 * Yangi biznes: biznes nomi + ega ismi → PIN → PIN tasdig'i → ega yaratiladi va avtomatik kirish.
 */
import { useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../store/app'
import { Button, Field, Icon, Input, Numpad, PinDots, cx, errorMessage, toast } from '../../ui'
import { BrandPanel } from '../Lock/BrandPanel'
import { ViewerConnect } from './ViewerConnect'
import '../Lock/lock.css'
import './setup.css'

type Step = 0 | 1 | 2
const STEPS = ['Biznes', 'PIN kod', 'Tasdiqlash']
const PIN_MIN = 4
const PIN_MAX = 6

export default function SetupScreen() {
  const [kind, setKind] = useState<'choose' | 'owner' | 'viewer'>('choose')
  if (kind === 'owner') return <OwnerSetup onBack={() => setKind('choose')} />
  return (
    <div className="auth">
      <BrandPanel businessName="" footer={kind === 'viewer' ? "Faqat ko'rish · ma'lumotlar asosiy kompyuterda" : 'Birinchi sozlash · bir daqiqa vaqt oladi'} />
      <section className="auth__panel">
        <div className="setup">
          {kind === 'viewer' ? (
            <ViewerConnect onBack={() => setKind('choose')} />
          ) : (
            <div className="setup__body" key="choose">
              <div className="auth__head">
                <h1>Xush kelibsiz!</h1>
                <p className="auth__lead">Bu kompyuter qanday ishlatiladi?</p>
              </div>
              <button type="button" className="setup-choice" onClick={() => setKind('owner')} data-testid="setup-owner">
                <span className="setup-choice__icon"><Icon name="rooms" size={34} /></span>
                <span className="setup-choice__text">
                  <span className="setup-choice__title">Yangi biznes</span>
                  <span className="setup-choice__desc">Asosiy kompyuter — kassa shu yerda, ma'lumotlar shu kompyuterda saqlanadi</span>
                </span>
                <Icon name="chevronRight" size={30} />
              </button>
              <button type="button" className="setup-choice setup-choice--viewer" onClick={() => setKind('viewer')} data-testid="setup-viewer">
                <span className="setup-choice__icon"><Icon name="eye" size={34} /></span>
                <span className="setup-choice__text">
                  <span className="setup-choice__title">Asosiy kompyuterga ulanish</span>
                  <span className="setup-choice__desc">Faqat ko'rish — Wi-Fi orqali xonalar, hisobot va qarzlarni kuzatish</span>
                </span>
                <Icon name="chevronRight" size={30} />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function OwnerSetup({ onBack }: { onBack: () => void }) {
  const enter = useApp((s) => s.enter)
  const setupDone = useApp((s) => s.setupDone)
  const [step, setStep] = useState<Step>(0)
  const [biz, setBiz] = useState('')
  const [owner, setOwner] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const bizErr = touched && !biz.trim() ? 'Biznes nomini kiriting' : null
  const ownerErr = touched && !owner.trim() ? 'Ismingizni kiriting' : null

  const next0 = () => {
    setTouched(true)
    if (!biz.trim() || !owner.trim()) return
    setStep(1)
  }
  const next1 = () => {
    if (pin.length < PIN_MIN) {
      setError('PIN kamida ' + PIN_MIN + ' ta raqam bo\'lsin')
      setShake((n) => n + 1)
      return
    }
    setError(null)
    setPin2('')
    setStep(2)
  }
  const finish = async (value = pin2) => {
    if (busy) return
    if (value !== pin) {
      setError('PIN kodlar mos kelmadi. Qaytadan kiriting')
      setShake((n) => n + 1)
      setPin2('')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.auth.setupOwner(owner.trim(), pin, biz.trim())
      setupDone(biz.trim())
      const list = await api.auth.listLoginStaff()
      const me = list.find((s) => s.role === 'owner') ?? list[0]
      if (!me) throw new Error('Ega topilmadi')
      const session = await api.auth.login(me.id, pin)
      toast.success('Xush kelibsiz, ' + me.name + '!', { description: 'Endi Sozlamalar bo\'limida xonalar va narxlarni kiriting.' })
      enter(session)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <BrandPanel businessName={biz.trim()} footer="Birinchi sozlash · bir daqiqa vaqt oladi" />
      <section className="auth__panel">
        <div className="setup">
          <ol className="setup__steps">
            {STEPS.map((label, i) => (
              <li key={label} className={cx('setup__step', i === step && 'is-active', i < step && 'is-done')}>
                <span className="setup__stepnum">{i < step ? <Icon name="check" size={20} strokeWidth={3} /> : i + 1}</span>
                <span className="setup__steplabel">{label}</span>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <form
              className="setup__body"
              onSubmit={(e) => {
                e.preventDefault()
                next0()
              }}
            >
              <div className="auth__head">
                <h1>Xush kelibsiz!</h1>
                <p className="auth__lead">Keling, dasturni sizning biznesingizga moslaymiz.</p>
              </div>
              <Field label="Biznes nomi" error={bizErr} hint="Chekda va ekranda ko'rinadi">
                <Input size="lg" icon="rooms" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Masalan: Delfin Sauna" autoFocus maxLength={60} invalid={!!bizErr} />
              </Field>
              <Field label="Egasining ismi" error={ownerErr}>
                <Input size="lg" icon="user" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Ism Familiya" maxLength={60} invalid={!!ownerErr} />
              </Field>
              <Button type="submit" variant="primary" size="xl" iconRight="arrowRight" block>
                Davom etish
              </Button>
              <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
                Orqaga
              </Button>
            </form>
          )}

          {step > 0 && (
            <div className="setup__body setup__body--pin" key={'s' + step}>
              <div className="auth__head auth__head--center">
                <h1>{step === 1 ? 'PIN kod o\'rnating' : 'PIN kodni takrorlang'}</h1>
                <p className="auth__lead">
                  {step === 1 ? PIN_MIN + '–' + PIN_MAX + ' ta raqam. Har safar kirishda so\'raladi.' : 'Xato bo\'lmasligi uchun yana bir marta kiriting.'}
                </p>
              </div>
              <div key={shake} className={'lock-pin__dots' + (shake ? ' is-shake' : '')}>
                <PinDots length={(step === 1 ? pin : pin2).length} max={PIN_MAX} error={!!error} />
              </div>
              <div className={'lock-pin__error' + (error ? ' is-on' : '')} role="alert">
                {error ? <><Icon name="alert" size={20} /> {error}</> : ' '}
              </div>
              <Numpad
                mode="pin"
                size="lg"
                className="lock-pin__pad"
                value={step === 1 ? pin : pin2}
                maxLength={PIN_MAX}
                disabled={busy}
                onChange={(v) => {
                  setError(null)
                  if (step === 1) setPin(v)
                  else {
                    setPin2(v)
                    if (v.length === pin.length) void finish(v)
                  }
                }}
                onSubmit={() => (step === 1 ? next1() : void finish())}
                submitDisabled={(step === 1 ? pin : pin2).length < PIN_MIN}
              />
              <Button variant="ghost" icon="arrowLeft" onClick={() => { setError(null); setStep(step === 2 ? 1 : 0) }} disabled={busy}>
                Orqaga
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
