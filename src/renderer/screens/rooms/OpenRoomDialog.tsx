/**
 * "Xonani ochish" oynasi: mehmonlar soni + olinadigan vaqt (1/2/3/4 soat yoki boshqa) + ofitsiant,
 * oldindan narx ("4 kishi × 2 soat × 70 000 = 560 000"). Ofitsiant tanlanmasa — aniq ogohlantirish.
 * Klaviatura: raqam tugmasi = mehmonlar soni, Enter = boshlash.
 */
import { useEffect, useRef, useState } from 'react'
import type { Id, Room, SessionView } from '@shared/types'
import { formatHours, guestTimeAmount } from '@shared/billing'
import { api } from '@/api'
import { Button, Icon, Modal, Stepper, cx, formatMoney, toast } from '@/ui'
import { useBillingOptions, useDefaultHours } from './live'
import { TimePicker } from './TimePicker'
import { WaiterPicker, useWaiters } from './WaiterPicker'

export function OpenRoomDialog({ room, onClose, onOpened }: { room: Room; onClose: () => void; onOpened: (v: SessionView) => void }) {
  const cap = Math.max(1, room.capacity)
  const defaultHours = useDefaultHours()
  const billing = useBillingOptions()
  const waiters = useWaiters()
  const [count, setCount] = useState(Math.min(2, cap))
  const [minutes, setMinutes] = useState(defaultHours * 60)
  const [waiterId, setWaiterId] = useState<Id | null>(null)
  const [busy, setBusy] = useState(false)
  const [askWaiter, setAskWaiter] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const submitRef = useRef<() => void>(() => undefined)
  const waiterRef = useRef<HTMLDivElement>(null)

  // Oldindan narx: bir kishi uchun olingan vaqt summasi (billing.ts) × kishi
  const perGuest = guestTimeAmount([{ roomId: room.id, rate: room.pricePerHour, start: 0, end: 0 }], minutes, 0, billing)
  const total = perGuest * count

  const start = async () => {
    if (busy) return
    setAskWaiter(false)
    setBusy(true)
    try {
      const v = await api.sessions.open(room.id, count, minutes, waiterId)
      onOpened(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  const submit = () => {
    if (busy || askWaiter) return
    // Ofitsiantlar umuman bo'lmasa — ogohlantirish ma'nosiz
    if (waiterId == null && waiters.list && waiters.list.length > 0) {
      setAskWaiter(true)
      return
    }
    void start()
  }
  submitRef.current = submit

  const chooseWaiter = () => {
    setAskWaiter(false)
    setHighlight(true)
    const el = waiterRef.current
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
      const first = el.querySelector<HTMLElement>('.rooms-waiter')
      if (first) setTimeout(() => first.focus(), 50)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (document.querySelectorAll('.ui-modal').length > 1) return // ogohlantirish oynasi ochiq
      if (/^[0-9]$/.test(e.key)) {
        const n = e.key === '0' ? 10 : Number(e.key)
        if (n >= 1 && n <= cap) {
          e.preventDefault()
          setCount(n)
        }
      } else if (e.key === 'Enter' && !(t && t.tagName === 'BUTTON')) {
        e.preventDefault()
        submitRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cap])

  const quick = Array.from({ length: Math.min(cap, 10) }, (_, i) => i + 1)

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={room.name + ' — xonani ochish'}
      subtitle={`${formatMoney(room.pricePerHour)} so'm/soat (bir kishiga) · sig'im ${cap} kishi`}
      size="lg"
      className="rooms-openmodal"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Bekor qilish
          </Button>
          <div className="spacer" />
          <Button variant="primary" size="lg" icon="play" loading={busy} onClick={submit} data-autofocus>
            Boshlash · {count} kishi · {formatHours(minutes)}
          </Button>
        </>
      }
    >
      <div className="rooms-open">
        <section className="rooms-open__sec">
          <div className="rooms-open__label">Mehmonlar soni</div>
          <div className="rooms-open__quick" style={{ gridTemplateColumns: `repeat(${Math.max(quick.length, 5)}, 1fr)` }}>
            {quick.map((n) => (
              <button
                key={n}
                type="button"
                className={cx('rooms-open__n', 'num', n === count && 'is-active')}
                onClick={() => setCount(n)}
                aria-pressed={n === count}
              >
                {n}
              </button>
            ))}
          </div>
          {cap > 10 && (
            <div className="rooms-open__stepper">
              <Stepper value={count} onChange={setCount} min={1} max={cap} suffix="kishi" />
            </div>
          )}
        </section>

        <section className="rooms-open__sec">
          <div className="rooms-open__label">
            Vaqt <span className="rooms-open__labelhint">— har bir mehmonga oldindan olinadi</span>
          </div>
          <TimePicker value={minutes} onChange={setMinutes} />
        </section>

        <section className="rooms-open__sec" ref={waiterRef}>
          <div className="rooms-open__label">
            Ofitsiant
            {waiterId == null && waiters.list && waiters.list.length > 0 && (
              <span className={cx('rooms-open__need', highlight && 'is-strong')}>
                <Icon name="alert" size={18} /> Tanlanmagan
              </span>
            )}
          </div>
          <WaiterPicker waiters={waiters} value={waiterId} onChange={setWaiterId} highlight={highlight} />
        </section>

        <div className="rooms-open__price" data-testid="open-price">
          <span className="rooms-open__formula num">
            {count} kishi × {formatHours(minutes)} × {formatMoney(room.pricePerHour)}
          </span>
          <span className="rooms-open__eq">=</span>
          <span className="rooms-open__total num">
            {formatMoney(total)} <small>so'm</small>
          </span>
        </div>
        <div className="rooms-open__hint">
          Olingan vaqt kamroq o'tirilsa ham to'liq to'lanadi; oshib ketsa keyingi soat qo'shiladi.
        </div>
      </div>

      {askWaiter && (
        <Modal open onClose={() => setAskWaiter(false)} size="sm" className="rooms-nowaiter">
          <div className="ui-confirm">
            <div className="ui-confirm__icon rooms-nowaiter__icon">
              <Icon name="alert" size={34} />
            </div>
            <div className="ui-confirm__title">Ofitsiant biriktirilmadi!</div>
            <div className="ui-confirm__msg">
              Ofitsiant biriktiring — aks holda bar savdosidan foiz hech kimga yozilmaydi.
            </div>
            <div className="rooms-nowaiter__actions">
              <Button size="lg" variant="primary" icon="user" onClick={chooseWaiter} data-autofocus block>
                Ofitsiant tanlash
              </Button>
              <Button size="lg" variant="ghost" onClick={() => void start()} block>
                Ofitsiantsiz boshlash
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
