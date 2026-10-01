/**
 * "Xonani ochish" oynasi: mehmonlar soni (1..sig'im) — katta raqam tugmalari + Stepper, "Boshlash".
 * Klaviatura: raqam tugmasi = son, Enter = boshlash.
 */
import { useEffect, useRef, useState } from 'react'
import type { Room, SessionView } from '@shared/types'
import { api } from '@/api'
import { Button, Modal, Stepper, cx, formatMoney, toast } from '@/ui'

export function OpenRoomDialog({ room, onClose, onOpened }: { room: Room; onClose: () => void; onOpened: (v: SessionView) => void }) {
  const cap = Math.max(1, room.capacity)
  const [count, setCount] = useState(Math.min(2, cap))
  const [busy, setBusy] = useState(false)
  const submitRef = useRef<() => void>(() => undefined)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const v = await api.sessions.open(room.id, count)
      onOpened(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }
  submitRef.current = () => void submit()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
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

  const quick = Array.from({ length: Math.min(cap, 12) }, (_, i) => i + 1)

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={room.name + ' — xonani ochish'}
      subtitle={`${formatMoney(room.pricePerHour)} so'm/soat (bir kishiga) · sig'im ${cap} kishi`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Bekor qilish
          </Button>
          <div className="spacer" />
          <Button variant="primary" size="lg" icon="play" loading={busy} onClick={() => void submit()} data-autofocus>
            Boshlash · {count} kishi
          </Button>
        </>
      }
    >
      <div className="rooms-open">
        <div className="rooms-open__label">Mehmonlar soni</div>
        <div className="rooms-open__quick" style={{ gridTemplateColumns: `repeat(${Math.min(quick.length, 6)}, 1fr)` }}>
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
        {cap > 12 && (
          <div className="rooms-open__stepper">
            <Stepper value={count} onChange={setCount} min={1} max={cap} size="lg" suffix="kishi" />
          </div>
        )}
        <div className="rooms-open__hint">
          Har bir mehmonning vaqti alohida hisoblanadi. Keyin mehmon qo'shish, pauza qilish yoki chiqarish mumkin.
        </div>
      </div>
    </Modal>
  )
}
