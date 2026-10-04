/**
 * TERMINAL rejimiga ulanish oqimi (ofitsiantlar kompyuteri): asosiy kompyuterni topish (qidirish yoki qo'lda IP) →
 * 6 raqamli kod → Ulanish. Setup tanlov sahifasidan va Qulf ekranidagi havoladan (ega tasdig'i bilan) ochiladi.
 */
import { useEffect, useState } from 'react'
import type { DiscoveredServer } from '@shared/types'
import { api, apiKind } from '../../api'
import { useApp } from '../../store/app'
import { Button, Field, Icon, Input, Numpad, Spinner, cx, errorMessage, toast } from '../../ui'

const DEFAULT_PORT = 47321
const CODE_LEN = 6
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

export function TerminalConnect({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'find' | 'code'>('find')
  const [found, setFound] = useState<DiscoveredServer[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [manual, setManual] = useState(false)
  const [ip, setIp] = useState('')
  const [port, setPort] = useState(String(DEFAULT_PORT))
  const [target, setTarget] = useState<DiscoveredServer | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)

  const search = async () => {
    setSearching(true)
    try {
      const list = await api.connection.discover()
      setFound(list)
      if (list.length === 0) setManual(true)
    } catch (e) {
      setFound([])
      setManual(true)
      toast.error(errorMessage(e))
    } finally {
      setSearching(false)
    }
  }
  useEffect(() => {
    void search()
  }, [])

  const pick = (s: DiscoveredServer) => {
    setTarget(s)
    setCode('')
    setError(null)
    setStep('code')
  }

  const ipErr = ip && !IP_RE.test(ip.trim()) ? "Manzil 192.168.1.10 ko'rinishida bo'lsin" : null
  const portNum = Number(port)
  const portErr = port && !(portNum > 0 && portNum < 65536) ? "Port noto'g'ri" : null
  const pickManual = () => {
    if (!IP_RE.test(ip.trim()) || portErr) return
    pick({ host: ip.trim(), port: portNum || DEFAULT_PORT, name: '' })
  }

  const connect = async (value = code) => {
    if (!target || busy) return
    if (value.length !== CODE_LEN) {
      setError('Kod ' + CODE_LEN + ' ta raqamdan iborat')
      setShake((n) => n + 1)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.connection.connectTerminal(target.host, target.port, value)
      toast.success('Ulandi', { description: (target.name || target.host) + ' — terminal rejimi' })
      // Electron ilovani o'zi qayta yuklaydi; brauzer/mock uchun qayta boot
      if (apiKind() === 'mock') void useApp.getState().boot()
      else location.reload()
    } catch (e) {
      setError(errorMessage(e))
      setShake((n) => n + 1)
      setCode('')
      setBusy(false)
    }
  }

  if (step === 'code' && target) {
    return (
      <div className="setup__body setup__body--pin vc" key="code">
        <div className="auth__head auth__head--center">
          <h1>Ulanish kodi</h1>
          <p className="auth__lead">
            Asosiy kompyuterda: <b>Sozlamalar → Tarmoq</b>. U yerdagi 6 raqamli kodni kiriting.
          </p>
        </div>
        <div className="vc-target">
          <Icon name="swap" size={22} />
          <span className="ellipsis">{target.name || 'Asosiy kompyuter'}</span>
          <span className="vc-target__host num">{target.host}:{target.port}</span>
        </div>
        <div key={shake} className={cx('vc-code', shake && 'is-shake', !!error && 'is-error')} data-testid="vc-code">
          {Array.from({ length: CODE_LEN }, (_, i) => (
            <span key={i} className={cx('vc-code__cell', 'num', i === code.length && 'is-cur')}>{code[i] ?? ''}</span>
          ))}
        </div>
        <div className={'lock-pin__error' + (error ? ' is-on' : '')} role="alert">
          {error ? <><Icon name="alert" size={20} /> {error}</> : ' '}
        </div>
        <Numpad
          mode="pin"
          size="lg"
          className="lock-pin__pad"
          value={code}
          maxLength={CODE_LEN}
          disabled={busy}
          submitLabel="Ulanish"
          submitDisabled={code.length !== CODE_LEN}
          onChange={(v) => {
            setError(null)
            setCode(v)
            if (v.length === CODE_LEN) void connect(v)
          }}
          onSubmit={() => void connect()}
        />
        {busy && <div className="vc-busy"><Spinner size={22} /> Ulanmoqda…</div>}
        <Button variant="ghost" icon="arrowLeft" onClick={() => { setStep('find'); setError(null) }} disabled={busy}>
          Boshqa kompyuter
        </Button>
      </div>
    )
  }

  return (
    <div className="setup__body vc" key="find">
      <div className="auth__head">
        <h1>Asosiy kompyuterga ulanish</h1>
        <p className="auth__lead">
          Bu kompyuter terminal bo'ladi: xodimlar o'z PIN kodi bilan kirib to'liq ishlaydi, ma'lumotlar asosiy kompyuterda.
          Ikkalasi bitta Wi-Fi'da bo'lsin.
        </p>
      </div>

      <div className="vc-list" data-testid="vc-list">
        {searching && (
          <div className="vc-searching"><Spinner size={26} /> Wi-Fi'da qidirilmoqda…</div>
        )}
        {!searching && found && found.length === 0 && (
          <div className="vc-none">
            <Icon name="alert" size={22} /> Asosiy kompyuter topilmadi. U yerda <b>Sozlamalar → Tarmoq</b> yoqilganini tekshiring yoki manzilni qo'lda kiriting.
          </div>
        )}
        {!searching && found && found.map((s) => (
          <button key={s.host + ':' + s.port} type="button" className="vc-server" onClick={() => pick(s)}>
            <span className="vc-server__icon"><Icon name="rooms" size={28} /></span>
            <span className="vc-server__text">
              <span className="vc-server__name ellipsis">{s.name || 'Delfin Sauna'}</span>
              <span className="vc-server__host num">{s.host}:{s.port}</span>
            </span>
            <Icon name="chevronRight" size={28} />
          </button>
        ))}
      </div>
      <Button icon="refresh" size="lg" onClick={() => void search()} loading={searching} block>
        Qayta qidirish
      </Button>

      {!manual ? (
        <Button variant="ghost" icon="edit" onClick={() => setManual(true)}>Manzilni qo'lda kiritish</Button>
      ) : (
        <form
          className="vc-manual"
          onSubmit={(e) => {
            e.preventDefault()
            pickManual()
          }}
        >
          <Field label="Asosiy kompyuter manzili (IP)" error={ipErr} hint="Asosiy kompyuterda Sozlamalar → Tarmoq'da ko'rsatilgan">
            <Input size="lg" value={ip} onChange={(e) => setIp(e.target.value.replace(/[^\d.]/g, ''))} placeholder="192.168.1.10" inputMode="decimal" invalid={!!ipErr} data-testid="vc-ip" />
          </Field>
          <Field label="Port" error={portErr} className="vc-manual__port">
            <Input size="lg" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" invalid={!!portErr} />
          </Field>
          <Button type="submit" variant="primary" size="lg" iconRight="arrowRight" disabled={!IP_RE.test(ip.trim()) || !!portErr} className="vc-manual__go">
            Davom etish
          </Button>
        </form>
      )}

      <Button variant="ghost" icon="arrowLeft" onClick={onBack}>Orqaga</Button>
    </div>
  )
}
