/**
 * Sozlamalar → Tarmoq (asosiy kompyuterda): boshqa kompyuterlarga FAQAT KO'RISH uchun ruxsat.
 * Ruxsat switch'i, ulanish ma'lumoti (manzil, port, 6 raqamli kod), yangi kod, ulangan ko'ruvchilar ro'yxati.
 */
import { useCallback, useEffect, useState } from 'react'
import type { NetworkStatus } from '@shared/types'
import { api } from '@/api'
import { Button, EmptyState, Icon, Spinner, Switch, confirmDialog, cx, errorMessage, toast, useNow } from '@/ui'
import { Note, SectionHead } from './common'

const POLL_MS = 5000

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'hozirgina'
  if (s < 60) return s + ' soniya oldin'
  const m = Math.round(s / 60)
  return m + ' daqiqa oldin'
}

export function NetworkSection() {
  const [st, setSt] = useState<NetworkStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'toggle' | 'code' | null>(null)
  const now = useNow()

  const load = useCallback(async () => {
    try {
      setSt(await api.network.status())
      setErr(null)
    } catch (e) {
      setErr(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const toggle = async (v: boolean) => {
    if (!v) {
      const ok = await confirmDialog({
        title: "Ko'rishga ruxsatni o'chirasizmi?",
        message: "Ulangan kompyuterlar ma'lumotni ko'ra olmay qoladi.",
        confirmText: "Ha, o'chirish",
        cancelText: "Yo'q",
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    setBusy('toggle')
    try {
      setSt(await api.network.setEnabled(v))
      toast.success(v ? "Ko'rishga ruxsat yoqildi" : "Ko'rishga ruxsat o'chirildi")
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const regen = async () => {
    const ok = await confirmDialog({
      title: 'Yangi kod yaratilsinmi?',
      message: "Eski kod bilan ulangan barcha kompyuterlar uziladi — ularga yangi kodni qayta kiritish kerak bo'ladi.",
      confirmText: 'Ha, yangi kod',
      cancelText: "Yo'q",
      danger: true,
      icon: 'key'
    })
    if (!ok) return
    setBusy('code')
    try {
      setSt(await api.network.regenerateCode())
      toast.success('Yangi kod yaratildi')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  if (!st) {
    return (
      <div className="set-section">
        <SectionHead icon="eye" title="Tarmoq" description="Boshqa kompyuterdan faqat ko'rish" />
        <div className="set-section__body">
          {err ? (
            <EmptyState icon="alert" title="Tarmoq holatini yuklab bo'lmadi" description={err} action={<Button icon="refresh" onClick={() => void load()}>Qayta urinish</Button>} />
          ) : (
            <div className="set-center"><Spinner size={40} /></div>
          )}
        </div>
      </div>
    )
  }

  const code = st.code || '——————'
  return (
    <div className="set-section">
      <SectionHead icon="eye" title="Tarmoq" description="Boshqa kompyuter (masalan, yuqori qavatdagi) Wi-Fi orqali faqat ko'rishi uchun" />
      <div className="set-section__body">
        <div className="set-group">
          <Switch
            size="lg"
            checked={st.enabled}
            onChange={(v) => void toggle(v)}
            disabled={busy != null}
            label="Boshqa kompyuterlarga ko'rishga ruxsat"
            description="Ular xonalar, hisobot, ofitsiantlar va qarzlarni ko'radi — hech narsani o'zgartira olmaydi"
            data-testid="net-enabled"
          />
        </div>

        {st.enabled && (
          <div className="set-group">
            <div className="set-group__title">Ulanish ma'lumoti</div>
            <div className="net-card" data-testid="net-card">
              <div className="net-card__cell">
                <span className="net-card__label">Shu kompyuter manzili</span>
                {st.addresses.length === 0 ? (
                  <span className="net-card__warn"><Icon name="alert" size={20} /> Wi-Fi/LAN topilmadi</span>
                ) : (
                  st.addresses.map((a) => (
                    <span key={a} className="net-card__addr num">{a}</span>
                  ))
                )}
                <span className="net-card__port">Port: <b className="num">{st.port}</b></span>
              </div>
              <div className="net-card__cell net-card__cell--code">
                <span className="net-card__label">Ulanish kodi</span>
                <span className="net-card__code num" data-testid="net-code">
                  {code.slice(0, 3)}<span className="net-card__gap" />{code.slice(3)}
                </span>
                <Button size="sm" variant="ghost" icon="refresh" onClick={() => void regen()} loading={busy === 'code'} disabled={busy === 'toggle'}>
                  Yangi kod
                </Button>
              </div>
            </div>
          </div>
        )}

        {st.enabled && (
          <div className="set-group">
            <div className="set-group__title">
              Ulangan kompyuterlar <span className="set-group__sub">· oxirgi 2 daqiqa</span>
            </div>
            {st.viewers.length === 0 ? (
              <div className="net-empty">Hozircha hech kim ulanmagan</div>
            ) : (
              <div className="net-viewers">
                {st.viewers.map((v) => {
                  const fresh = now - v.lastSeen < 20_000
                  return (
                    <div key={v.ip + v.name} className="net-viewer">
                      <span className={cx('net-viewer__dot', fresh && 'is-on')} />
                      <Icon name="eye" size={22} />
                      <span className="net-viewer__name ellipsis">{v.name || "Noma'lum kompyuter"}</span>
                      <span className="net-viewer__ip num">{v.ip}</span>
                      <span className="net-viewer__seen">{ago(now - v.lastSeen)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <Note icon="info">
          <b>Qanday ulanadi:</b> ikkinchi kompyuterga Delfin Sauna o'rnating → birinchi ochilishda
          «Asosiy kompyuterga ulanish» ni tanlang → shu yerdagi kodni kiriting. Ikkala kompyuter bitta Wi-Fi'da bo'lishi kerak.
        </Note>
      </div>
    </div>
  )
}
