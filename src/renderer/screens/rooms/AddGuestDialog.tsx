/**
 * "+ Mehmon qo'shish": yangi mehmonga olinadigan vaqtni tanlash (sessions.addGuest(id, minutes)).
 */
import { useState } from 'react'
import type { SessionView } from '@shared/types'
import { formatHours, guestTimeAmount } from '@shared/billing'
import { api } from '@/api'
import { Button, Modal, formatMoney, toast } from '@/ui'
import { useBillingOptions, useDefaultHours } from './live'
import { TimePicker } from './TimePicker'

export function AddGuestDialog({ view, onClose, onDone }: { view: SessionView; onClose: () => void; onDone: (v: SessionView) => void }) {
  const defaultHours = useDefaultHours()
  const billing = useBillingOptions()
  const [minutes, setMinutes] = useState(defaultHours * 60)
  const [busy, setBusy] = useState(false)
  const room = view.room
  const amount = guestTimeAmount([{ roomId: room.id, rate: room.pricePerHour, start: 0, end: 0 }], minutes, 0, billing)

  const submit = async () => {
    setBusy(true)
    try {
      const v = await api.sessions.addGuest(view.session.id, minutes)
      const g = v.guests[v.guests.length - 1]
      toast.success(`${g ? g.label : 'Mehmon'} qo'shildi`, { description: `${formatHours(minutes)} olingan · vaqt boshlandi` })
      onDone(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Mehmon qo'shish"
      subtitle={`${room.name} · ${formatMoney(room.pricePerHour)} so'm/soat`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <div className="spacer" />
          <Button variant="primary" size="lg" icon="userPlus" loading={busy} onClick={() => void submit()} data-autofocus>
            Qo'shish · {formatHours(minutes)}
          </Button>
        </>
      }
    >
      <div className="rooms-open">
        <div className="rooms-open__label">Vaqt</div>
        <TimePicker value={minutes} onChange={setMinutes} />
        <div className="rooms-open__price">
          <span className="rooms-open__formula num">
            1 kishi × {formatHours(minutes)} × {formatMoney(room.pricePerHour)}
          </span>
          <span className="rooms-open__eq">=</span>
          <span className="rooms-open__total num">
            {formatMoney(amount)} <small>so'm</small>
          </span>
        </div>
      </div>
    </Modal>
  )
}
