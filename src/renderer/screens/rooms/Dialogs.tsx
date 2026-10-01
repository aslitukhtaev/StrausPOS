/**
 * Sessiya oynasining kichik dialoglari: mehmon nomi, qatorni qaytarish (X), chegirma, xonani almashtirish.
 * Har biri amalni o'zi chaqiradi va API qaytargan SessionView ni `onDone` ga beradi (optimistik emas).
 */
import { useEffect, useState } from 'react'
import type { GuestView, LineView, RoomCard, SessionView } from '@shared/types'
import { api } from '@/api'
import {
  Button, Field, Icon, Input, Modal, Money, Numpad, Spinner, Stepper, cx, formatMoney, toast, EmptyState
} from '@/ui'

type Done = (v: SessionView) => void

// ───────────── Mehmon nomi ─────────────
export function RenameGuestDialog({ guest, onClose, onDone }: { guest: GuestView; onClose: () => void; onDone: Done }) {
  const [name, setName] = useState(guest.label)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const v = name.trim()
    if (!v) {
      toast.warning('Mehmon nomini kiriting')
      return
    }
    setBusy(true)
    try {
      onDone(await api.sessions.renameGuest(guest.id, v))
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Mehmon nomi"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <div className="spacer" />
          <Button variant="primary" icon="check" loading={busy} onClick={() => void submit()}>Saqlash</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Ism yoki belgi" hint="Masalan: Aziz aka, Shkaf 12">
          <Input
            size="lg"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            data-autofocus
            icon="user"
          />
        </Field>
      </form>
    </Modal>
  )
}

// ───────────── Qaytarish (X) ─────────────
const REASONS = ['Xato kiritildi', 'Mijoz voz kechdi', 'Sifatsiz']

export function ReturnLineDialog({ line, guestLabel, onClose, onDone }: { line: LineView; guestLabel: string | null; onClose: () => void; onDone: Done }) {
  const [qty, setQty] = useState(line.activeQty)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const v = await api.lines.returnLine(line.id, qty, reason.trim())
      toast.success(`Qaytarildi: ${line.name} × ${qty}`)
      onDone(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Qatorni qaytarish"
      subtitle={line.kind === 'product' ? 'Mahsulot omborga qaytadi, summa hisobdan chiqadi' : 'Xizmat summasi hisobdan chiqadi'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <div className="spacer" />
          <Button variant="danger" className="is-solid" icon="undo" loading={busy} onClick={() => void submit()} data-autofocus>
            Qaytarish · <Money value={qty * line.unitPrice} currency={false} />
          </Button>
        </>
      }
    >
      <div className="rooms-ret">
        <div className="rooms-ret__line">
          <div>
            <div className="rooms-ret__name">{line.name}</div>
            <div className="rooms-ret__meta">
              {line.activeQty} dona × {formatMoney(line.unitPrice)} · {guestLabel || 'Butun guruh'}
              {line.providerName ? ' · ' + line.providerName : ''}
            </div>
          </div>
          <Money value={line.amount} size="lg" />
        </div>
        {line.activeQty > 1 && (
          <Field as="div" label="Nechta qaytariladi?">
            <div className="rooms-ret__qty">
              <Stepper value={qty} onChange={setQty} min={1} max={line.activeQty} size="lg" suffix="dona" />
              <Button variant="ghost" size="sm" onClick={() => setQty(line.activeQty)} disabled={qty === line.activeQty}>
                Hammasi ({line.activeQty})
              </Button>
            </div>
          </Field>
        )}
        <Field as="div" label="Sabab (ixtiyoriy)">
          <div className="rooms-ret__chips">
            {REASONS.map((r) => (
              <button key={r} type="button" className={cx('rooms-chip', reason === r && 'is-active')} onClick={() => setReason(reason === r ? '' : r)}>
                {r}
              </button>
            ))}
          </div>
          <Input aria-label="Sabab" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Yoki o'zingiz yozing…" />
        </Field>
      </div>
    </Modal>
  )
}

// ───────────── Chegirma ─────────────
export function DiscountDialog({
  sessionId, current, max, onClose, onDone
}: { sessionId: number; current: number; max: number; onClose: () => void; onDone: Done }) {
  const [val, setVal] = useState(current > 0 ? String(current) : '')
  const [busy, setBusy] = useState(false)
  const amount = Number(val || 0)
  const over = amount > max
  const submit = async (n: number) => {
    setBusy(true)
    try {
      const v = await api.sessions.setDiscount(sessionId, n)
      toast.success(n > 0 ? `Chegirma: ${formatMoney(n)} so'm` : 'Chegirma olib tashlandi')
      onDone(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Chegirma"
      subtitle={`Ko'pi bilan ${formatMoney(max)} so'm (hozirgi hisob)`}
      size="sm"
      footer={
        <>
          {current > 0 ? (
            <Button variant="danger" icon="trash" onClick={() => void submit(0)} disabled={busy}>Olib tashlash</Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>Bekor</Button>
          )}
          <div className="spacer" />
          <Button variant="primary" icon="percent" loading={busy} disabled={over || (amount === 0 && current === 0)} onClick={() => void submit(amount)}>
            Qo'llash
          </Button>
        </>
      }
    >
      <div className="rooms-disc">
        <div className={cx('rooms-disc__value', over && 'is-invalid')}>
          <Money value={amount} size="3xl" tone={over ? 'danger' : 'accent'} />
        </div>
        {over && <div className="rooms-disc__err">Chegirma jami summadan oshmasligi kerak</div>}
        <Numpad mode="amount" value={val} onChange={setVal} maxLength={9} size="md" />
      </div>
    </Modal>
  )
}

// ───────────── Xonani almashtirish ─────────────
export function MoveRoomDialog({
  view, activeGuests, onClose, onDone
}: { view: SessionView; activeGuests: number; onClose: () => void; onDone: Done }) {
  const [cards, setCards] = useState<RoomCard[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.rooms
      .board()
      .then((c) => alive && setCards(c))
      .catch((e) => {
        toast.error(e)
        if (alive) setCards([])
      })
    return () => {
      alive = false
    }
  }, [])

  const free = (cards || []).filter((c) => !c.session && c.room.id !== view.room.id && c.room.active)
  const target = free.find((c) => c.room.id === sel)?.room ?? null

  const submit = async () => {
    if (!target) return
    setBusy(true)
    try {
      const v = await api.sessions.moveRoom(view.session.id, target.id)
      toast.success(`Mehmonlar ${target.name} ga o'tkazildi`)
      onDone(v)
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Xonani almashtirish"
      subtitle={`Hozir: ${view.room.name} · ${formatMoney(view.room.pricePerHour)} so'm/soat · ${activeGuests} mehmon`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <div className="spacer" />
          <Button variant="primary" icon="swap" disabled={!target} loading={busy} onClick={() => void submit()}>
            {target ? target.name + ' ga o\'tkazish' : 'Xonani tanlang'}
          </Button>
        </>
      }
    >
      {!cards ? (
        <div className="rooms-loading rooms-loading--sm"><Spinner size={36} /></div>
      ) : free.length === 0 ? (
        <EmptyState icon="rooms" title="Bo'sh xona yo'q" description="Hozir barcha boshqa xonalar band." />
      ) : (
        <div className="rooms-move">
          <div className="rooms-move__list">
            {free.map((c) => {
              const r = c.room
              const tooSmall = r.capacity < activeGuests
              const diff = r.pricePerHour - view.room.pricePerHour
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cx('rooms-move__item', sel === r.id && 'is-active')}
                  disabled={tooSmall}
                  onClick={() => setSel(r.id)}
                  aria-pressed={sel === r.id}
                  data-room={r.name}
                >
                  <span className="rooms-move__radio">{sel === r.id && <Icon name="check" size={20} strokeWidth={3} />}</span>
                  <span className="rooms-move__name">{r.name}</span>
                  <span className="rooms-move__cap">
                    <Icon name="users" size={18} /> {r.capacity} kishigacha
                    {tooSmall && <em> · sig'im yetmaydi</em>}
                  </span>
                  <span className="rooms-move__price">
                    <Money value={r.pricePerHour} size="lg" />
                    <span className="rooms-move__per">/soat</span>
                    {diff !== 0 && (
                      <span className={cx('rooms-move__diff', diff > 0 ? 'is-up' : 'is-down')}>
                        {diff > 0 ? '+' : '−'}
                        {formatMoney(Math.abs(diff))}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="rooms-note">
            <Icon name="info" size={22} />
            <span>
              Hozirgacha o'tgan vaqt eski narxda ({formatMoney(view.room.pricePerHour)} so'm/soat) qoladi. O'tkazilgandan keyin
              ishlayotgan mehmonlar vaqti yangi xona narxida hisoblanadi. Bar va xizmatlar o'zgarmaydi.
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}
