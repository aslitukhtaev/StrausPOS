/**
 * Litsenziya: holat kartasi + kompyuter kodi (nusxa olish) + kalit kiritish. Aktivatsiya oynasi (LicenseDialog)
 * va Sozlamalar → "Litsenziya" bo'limi shu komponentdan foydalanadi. Login talab qilinmaydi.
 */
import { useState } from 'react'
import type { LicenseStatus } from '@shared/types'
import { Button, Icon, Spinner, TextArea, cx, errorMessage, formatDateTime, toast, useNow, type IconName } from '../ui'
import { formatLeft, licenseDay, useLicense } from '../store/license'
import './license.css'


export function activatedText(s: LicenseStatus): string {
  if (s.permanent) return 'Faollashtirildi — doimiy'
  return 'Faollashtirildi — ' + (s.expiresAt != null ? licenseDay(s.expiresAt) + ' gacha amal qiladi' : 'faol')
}

function statusView(s: LicenseStatus, now: number): { tone: string; icon: IconName; title: string; text: string } {
  switch (s.state) {
    case 'trial':
      return {
        tone: 'trial',
        icon: 'clock',
        title: 'Sinov muddati: ' + formatLeft((s.trialEndsAt ?? now) - now),
        text: s.trialEndsAt != null ? formatDateTime(s.trialEndsAt) + ' gacha. Keyin dastur faqat ko‘rish rejimiga o‘tadi.' : ''
      }
    case 'active':
      return {
        tone: 'active',
        icon: 'checkCircle',
        title: s.permanent ? 'Faollashtirilgan — doimiy' : 'Faollashtirilgan',
        text: s.permanent
          ? 'Litsenziya muddatsiz. Rahmat!'
          : s.expiresAt != null ? licenseDay(s.expiresAt) + ' gacha amal qiladi (' + formatLeft(s.expiresAt - now) + ')' : ''
      }
    case 'tampered':
      return {
        tone: 'expired',
        icon: 'alert',
        title: 'Kompyuter soati noto‘g‘ri',
        text: 'Soat orqaga surilgani aniqlandi. Sana va vaqtni to‘g‘rilang yoki yangi kalit oling. Ma’lumotlaringiz saqlangan.'
      }
    default:
      return {
        tone: 'expired',
        icon: 'lock',
        title: 'Litsenziya muddati tugagan',
        text: 'Dastur faqat ko‘rish rejimida: hisobot, qarzlar va zaxira ishlaydi. Ma’lumotlaringiz saqlangan.'
      }
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* pastdagi usul */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function LicenseStatusCard({ status }: { status: LicenseStatus }) {
  const now = useNow()
  const v = statusView(status, now)
  return (
    <div className={cx('lic-status', 'lic-status--' + v.tone)} data-testid="license-status" data-state={status.state}>
      <Icon name={v.icon} size={34} strokeWidth={2.1} className="lic-status__icon" />
      <div className="lic-status__text">
        <div className="lic-status__title">{v.title}</div>
        {v.text && <div className="lic-status__desc">{v.text}</div>}
      </div>
    </div>
  )
}

export function LicensePanel({ onActivated }: { onActivated?: (s: LicenseStatus) => void }) {
  const status = useLicense((s) => s.status)
  const activate = useLicense((s) => s.activate)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!status) {
    return (
      <div className="lic-center">
        <Spinner size={36} />
      </div>
    )
  }

  const copy = async () => {
    const ok = await copyText(status.machineCode)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } else toast.error('Nusxa olib bo‘lmadi — kodni qo‘lda yozib oling')
  }

  const submit = async () => {
    if (busy) return
    setError(null)
    setDone(null)
    if (!key.trim()) {
      setError('Kalitni kiriting yoki joylashtiring')
      return
    }
    setBusy(true)
    try {
      const s = await activate(key)
      const msg = activatedText(s)
      setDone(msg)
      setKey('')
      toast.success(msg)
      if (onActivated) onActivated(s)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lic">
      <LicenseStatusCard status={status} />

      <div className="lic-cols">
        <div className="lic-step">
          <div className="lic-step__label"><span className="lic-step__no">1</span> Kompyuter kodi</div>
          <div className="lic-code">
            <span className="lic-code__value num" data-testid="license-machine-code">{status.machineCode || '—'}</span>
            <Button variant={copied ? 'primary' : 'secondary'} size="lg" icon={copied ? 'check' : 'copy'} onClick={() => void copy()} data-testid="license-copy">
              {copied ? 'Nusxa olindi' : 'Nusxa olish'}
            </Button>
          </div>
          <div className="lic-hint">
            <Icon name="phone" size={22} />
            <span>
              Shu kodni ishlab chiquvchiga yuboring: <b className="lic-contact">{status.contact}</b>
            </span>
          </div>
        </div>

        <div className="lic-step">
          <label className="lic-step__label" htmlFor="lic-key"><span className="lic-step__no">2</span> Aktivatsiya kaliti</label>
          <TextArea
            id="lic-key"
            className="lic-key"
            value={key}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder="Ishlab chiquvchidan olingan kalitni shu yerga joylashtiring (Ctrl+V)"
            onChange={(e) => {
              setKey(e.target.value)
              setError(null)
            }}
            invalid={!!error}
            data-testid="license-key"
          />
          {error && (
            <div className="lic-msg lic-msg--error" role="alert" data-testid="license-error">
              <Icon name="xCircle" size={22} /> {error}
            </div>
          )}
          {done && (
            <div className="lic-msg lic-msg--ok" role="status" data-testid="license-done">
              <Icon name="checkCircle" size={22} /> {done}
            </div>
          )}
          <Button variant="primary" size="lg" icon="key" onClick={() => void submit()} loading={busy} className="lic-submit" data-testid="license-activate">
            Faollashtirish
          </Button>
        </div>
      </div>
    </div>
  )
}
