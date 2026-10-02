/**
 * Ofitsiant tanlash: plitalar (ism + foiz). `useWaiters()` — faol ofitsiantlar ro'yxati (waiters.list()).
 * WaiterDialog — sessiyaga ofitsiant biriktirish / almashtirish (sessions.setWaiter).
 */
import { useEffect, useState } from 'react'
import type { Id, SessionView, Staff } from '@shared/types'
import { api } from '@/api'
import { Avatar, Button, Icon, Modal, Spinner, cx, toast } from '@/ui'

export interface WaitersState {
  list: Staff[] | null
  error: string | null
  reload(): void
}

export function useWaiters(): WaitersState {
  const [list, setList] = useState<Staff[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    setError(null)
    api.waiters
      .list()
      .then((l) => {
        if (alive) setList(l.filter((w) => w.active))
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setList([])
        toast.error(e)
      })
    return () => {
      alive = false
    }
  }, [n])
  return { list, error, reload: () => setN((x) => x + 1) }
}

export function WaiterPicker({
  waiters, value, onChange, highlight
}: {
  waiters: WaitersState
  value: Id | null
  onChange: (id: Id | null) => void
  /** Ogohlantirishdan keyin — e'tiborni tortish */
  highlight?: boolean
}) {
  if (waiters.list === null) {
    return (
      <div className="rooms-waiters__empty">
        <Spinner size={28} /> Ofitsiantlar yuklanmoqda…
      </div>
    )
  }
  if (waiters.list.length === 0) {
    return (
      <div className="rooms-waiters__empty">
        <Icon name="info" size={20} />
        {waiters.error ? (
          <>
            Ofitsiantlar yuklanmadi.
            <Button size="sm" variant="ghost" icon="refresh" onClick={waiters.reload}>Qayta</Button>
          </>
        ) : (
          "Ofitsiantlar yo'q — «Xodimlar» bo'limida qo'shing"
        )}
      </div>
    )
  }
  return (
    <div className={cx('rooms-waiters', highlight && value == null && 'is-highlight')} role="radiogroup" aria-label="Ofitsiant">
      {waiters.list.map((w) => {
        const on = w.id === value
        return (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={cx('rooms-waiter', on && 'is-active')}
            onClick={() => onChange(on ? null : w.id)}
            data-waiter={w.name}
          >
            <Avatar name={w.name} size={40} />
            <span className="rooms-waiter__text">
              <span className="rooms-waiter__name ellipsis">{w.name}</span>
              <span className="rooms-waiter__pct num">{w.commissionPct}% bardan</span>
            </span>
            {on && (
              <span className="rooms-waiter__check">
                <Icon name="check" size={20} strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Sessiyaga ofitsiant biriktirish / almashtirish */
export function WaiterDialog({
  view, onClose, onDone
}: {
  view: SessionView
  onClose: () => void
  onDone: (v: SessionView) => void
}) {
  const waiters = useWaiters()
  const current = view.session.waiterId
  const [sel, setSel] = useState<Id | null>(current)
  const [busy, setBusy] = useState(false)
  const save = async (id: Id | null) => {
    setBusy(true)
    try {
      const v = await api.sessions.setWaiter(view.session.id, id)
      toast.success(id == null ? 'Ofitsiant olib tashlandi' : `Ofitsiant biriktirildi: ${v.waiterName ?? ''}`)
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
      title={current == null ? 'Ofitsiant biriktirish' : 'Ofitsiantni almashtirish'}
      subtitle={`${view.room.name} · ofitsiant shu xonadagi bar mahsulotlaridan foiz oladi`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          {current != null && (
            <Button variant="danger" size="lg" icon="x" onClick={() => void save(null)} disabled={busy}>
              Olib tashlash
            </Button>
          )}
          <div className="spacer" />
          <Button
            variant="primary"
            size="lg"
            icon="check"
            loading={busy}
            disabled={sel == null || sel === current}
            onClick={() => void save(sel)}
          >
            Biriktirish
          </Button>
        </>
      }
    >
      <WaiterPicker waiters={waiters} value={sel} onChange={setSel} />
    </Modal>
  )
}
