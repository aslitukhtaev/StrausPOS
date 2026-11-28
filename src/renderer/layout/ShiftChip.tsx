/** Tepadagi smena tugmasi: kim ochgan, qancha vaqt; bosilsa — smenani ochish/yopish oynasi (xulosa bilan). */
import { useEffect, useState } from 'react'
import type { ShiftRow } from '@shared/types'
import { api } from '../api'
import { useCan, useStaff } from '../store/auth'
import { useShift } from '../store/shift'
import { useNow } from '../store/clock'
import { Button, Icon, Modal, Money, confirmDialog, cx, formatClock, formatMoney, toast } from '../ui'

const dur = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return Math.floor(m / 60) + ' soat ' + (m % 60) + ' daq'
}

export function ShiftSummaryView({ row }: { row: ShiftRow }) {
  const s = row.summary
  if (!s) return null
  const items: [string, number][] = [['Naqd', s.byMethod.cash], ['Click', s.byMethod.card], ['Terminal', s.byMethod.terminal], ['Qarz', s.byMethod.debt]]
  return (
    <div className="shift-sum" data-testid="shift-summary">
      <div className="shift-sum__main">
        <span>Jami tushum</span>
        <Money value={s.total} size="2xl" tone="accent" />
      </div>
      <div className="shift-sum__grid">
        {items.map(([l, v]) => (<div key={l}><span>{l}</span><b className="num">{formatMoney(v)}</b></div>))}
        {s.discounts > 0 && <div><span>Chegirma ({s.discountCount} ta)</span><b className="num">{formatMoney(s.discounts)}</b></div>}
        {s.expenses > 0 && <div><span>Xarajat</span><b className="num">{formatMoney(s.expenses)}</b></div>}
        {s.waiterPayouts + s.kitchenPayouts > 0 && <div><span>Ofitsiant/oshxonaga berilgan</span><b className="num">{formatMoney(s.waiterPayouts + s.kitchenPayouts)}</b></div>}
        {s.debtCollected > 0 && <div><span>Eski qarzdan naqd</span><b className="num">{formatMoney(s.debtCollected)}</b></div>}
        {s.voidedCount > 0 && <div><span>Bekor qilingan ({s.voidedCount} ta)</span><b className="num">{formatMoney(s.refunds)}</b></div>}
      </div>
      <div className="shift-sum__cash" data-testid="shift-expected">
        <span>Kassada bo'lishi kerak naqd (topshiriladi)</span>
        <Money value={s.expectedCash} size="xl" tone="success" />
      </div>
    </div>
  )
}

export function ShiftChip() {
  const staff = useStaff()
  const canPay = useCan('session.pay')
  const row = useShift((s) => s.row)
  const loaded = useShift((s) => s.loaded)
  const refresh = useShift((s) => s.refresh)
  const now = useNow()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!staff) return
    void refresh()
    const id = setInterval(() => void refresh(), 20_000)
    return () => clearInterval(id)
  }, [staff, refresh])

  if (!staff || !loaded) return null
  const cur = row?.shift ?? null
  return (
    <>
      <button
        type="button" className={cx('topbar__shift', cur ? 'is-open' : 'is-closed')} data-testid="shift-chip"
        onClick={canPay ? () => setOpen(true) : undefined} disabled={!canPay}
        title={canPay ? 'Smenani ochish / yopish' : undefined}
      >
        <Icon name="clock" size={20} />
        <span className="topbar__shifttext">
          <span className="topbar__shiftlabel">{cur ? 'Smena ochiq' : 'Smena yopiq'}</span>
          <span className="topbar__shiftsub ellipsis">{cur ? cur.openedByName + ' · ' + formatClock(cur.openedAt) + ' · ' + dur(now - cur.openedAt) : 'Smenani oching'}</span>
        </span>
      </button>
      {open && <ShiftDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function ShiftDialog({ onClose }: { onClose: () => void }) {
  const staff = useStaff()
  const row = useShift((s) => s.row)
  const refresh = useShift((s) => s.refresh)
  const [busy, setBusy] = useState(false)
  const cur = row?.shift ?? null
  const mine = cur != null && staff != null && cur.openedBy === staff.id

  const done = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await refresh()
      onClose()
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  const doOpen = () =>
    done(async () => {
      const r = await api.shifts.open()
      toast.success('Smena ochildi', { description: r.closed ? 'Oldingi smena (' + r.closed.shift.openedByName + ') avtomatik yopildi' : undefined })
    })

  const doClose = async () => {
    const ok = await confirmDialog({
      title: 'Smenani yopasizmi?',
      message: "Smena yopilgach xulosa Telegram botga yuboriladi. Keyingi kassir smenani o'zi ochadi.",
      confirmText: 'Ha, yopish',
      cancelText: "Yo'q",
      icon: 'lock'
    })
    if (!ok) return
    await done(async () => {
      const r = await api.shifts.close()
      toast.success('Smena yopildi', { description: r.summary ? 'Topshirilishi kerak naqd: ' + formatMoney(r.summary.expectedCash) + " so'm" : undefined })
    })
  }

  return (
    <Modal
      open onClose={busy ? () => undefined : onClose} size="md"
      title={cur ? 'Joriy smena' : 'Smenani ochish'}
      subtitle={cur ? cur.openedByName + ' · ' + formatClock(cur.openedAt) + ' dan' : "Smenasiz to'lov qabul qilib bo'lmaydi"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Yopish</Button>
          <div className="spacer" />
          {cur && !mine && (
            <Button variant="secondary" icon="user" onClick={() => void doOpen()} loading={busy} data-testid="shift-takeover">
              Smenani o'zimga olish
            </Button>
          )}
          {cur ? (
            <Button variant="danger" icon="lock" onClick={() => void doClose()} loading={busy} data-testid="shift-close">Smenani yopish</Button>
          ) : (
            <Button variant="primary" icon="play" onClick={() => void doOpen()} loading={busy} data-testid="shift-open">Smenani ochish</Button>
          )}
        </>
      }
    >
      {cur && row ? (
        <>
          <ShiftSummaryView row={row} />
          {!mine && <p className="subtle" style={{ marginTop: 12 }}>«O'zimga olish» — oldingi smena avtomatik yopiladi va yangi smena sizning nomingizga ochiladi.</p>}
        </>
      ) : (
        <p>Smena ochilgach hamma to'lovlar, xarajat va berilgan pullar shu smenaga yoziladi. Oldingi smena ochiq bo'lsa, u avtomatik yopiladi.</p>
      )}
    </Modal>
  )
}
