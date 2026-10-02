/**
 * Sessiya ish oynasi: tepada xona va jami summa; chapda mehmonlar (taymer, pauza, tugatish), o'ngda hisob qatorlari
 * (bar/xizmat, X bilan qaytarish), chegirma va "Hisobni yopish / To'lov".
 * Har amaldan keyin API qaytargan SessionView ko'rsatiladi (optimistik emas). Xatolar — toast.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GuestView, LineView, ReceiptData, SessionView } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { MS_MIN, formatCountdown, formatHours } from '@shared/billing'
import {
  Avatar, Badge, Button, EmptyState, Icon, IconButton, Money, Spinner, StatusPill, confirmDialog, cx, formatClock,
  formatMoney, getNow, isAnyModalOpen, toast
} from '@/ui'
import { alertLabel, roomTone, useLive, useWarnMs } from './live'
import { GuestCard } from './GuestCard'
import { AddGuestDialog } from './AddGuestDialog'
import { WaiterDialog } from './WaiterPicker'
import { useBoard } from './boardStore'
import { AddItemsDialog } from './AddItemsDialog'
import { DiscountDialog, MoveRoomDialog, RenameGuestDialog, ReturnLineDialog } from './Dialogs'
import { CheckoutDialog } from './checkoutModule'

const POLL_MS = 15_000

type DialogState =
  | { kind: 'rename'; guest: GuestView }
  | { kind: 'return'; line: LineView }
  | { kind: 'move' }
  | { kind: 'add' }
  | { kind: 'discount' }
  | { kind: 'checkout' }
  | { kind: 'addGuest' }
  | { kind: 'waiter' }
  | null

export function SessionWorkspace({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const [state, setState] = useState<{ view: SessionView; at: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  const canManage = useCan('session.manage')
  const warnMs = useWarnMs()
  const canPay = useCan('session.pay')
  const canReturn = useCan('line.return')
  const canDiscount = useCan('discount.apply')

  const setView = useCallback((v: SessionView) => {
    setState({ view: v, at: getNow() })
    // Xonalar paneli va ogohlantirishlar ham darhol yangilansin
    useBoard.getState().patchSession(v)
  }, [])

  const load = useCallback(async () => {
    try {
      const v = await api.sessions.get(sessionId)
      if (v.session.status === 'closed') {
        toast.info(`${v.room.name}: hisob yopilgan`)
        onBackRef.current()
        return
      }
      setView(v)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [sessionId, setView])

  useEffect(() => {
    void load()
    const id = setInterval(() => {
      if (!isAnyModalOpen()) void load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Esc — xonalarga qaytish (modal ochiq bo'lmasa); "+" — qo'shish paneli
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isAnyModalOpen()) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') onBackRef.current()
      else if ((e.key === '+' || e.key === 'Insert') && canManage) {
        e.preventDefault()
        setDialog({ kind: 'add' })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [canManage])

  const live = useLive(state ? state.view : null, state ? state.at : 0)

  const run = async (key: string, fn: () => Promise<SessionView>, ok?: string) => {
    if (busy) return
    setBusy(key)
    try {
      const v = await fn()
      setView(v)
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  if (!state || !live) {
    return (
      <div className="rooms-ws rooms-ws--loading">
        <div className="rooms-ws__backrow">
          <Button variant="ghost" size="lg" icon="arrowLeft" onClick={onBack}>Xonalar</Button>
        </div>
        {loadError ? (
          <EmptyState
            size="lg"
            icon="alert"
            title="Sessiyani yuklab bo'lmadi"
            description={loadError}
            action={<Button icon="refresh" onClick={() => void load()}>Qayta urinish</Button>}
          />
        ) : (
          <div className="rooms-loading"><Spinner size={44} /></div>
        )}
      </div>
    )
  }

  const view = state.view
  const room = view.room
  const tone = roomTone(live)
  const active = live.running + live.paused
  const capFull = active >= room.capacity
  const activeLines = view.lines.filter((l) => l.activeQty > 0)
  // Oldindan olingan vaqt summasi darhol paydo bo'ladi — shuning uchun server kabi "o'tirgan vaqt" bo'yicha:
  // hech kim 1 daqiqa o'tirmagan bo'lsa (xato ochilgan) kassir ham bekor qila oladi
  const freshOpen = live.guests.every((g) => g.elapsedMs < MS_MIN)
  const canCancel = canManage && activeLines.length === 0 && view.payments.length === 0 && (freshOpen || canDiscount)
  const guestLabel = (id: number | null) => (id == null ? null : view.guests.find((g) => g.id === id)?.label ?? 'Mehmon')
  const lines = view.lines.slice().sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)

  const finishGuest = async (g: GuestView) => {
    const early = g.remainingMs > 0
    const ok = await confirmDialog({
      title: `${g.label} chiqib ketdimi?`,
      message:
        (early
          ? `Olingan vaqt (${formatHours(g.paidMinutes)}) baribir to'lanadi: ${formatMoney(g.timeAmount)} so'm. `
          : `Vaqt summasi: ${formatMoney(g.timeAmount)} so'm (${formatHours(g.billedMinutes)}). `) +
        (active > 1 ? 'Qolgan mehmonlar vaqti davom etadi.' : ''),
      confirmText: 'Ha, tugatish',
      cancelText: "Yo'q",
      danger: true,
      icon: 'logout'
    })
    if (ok) await run('finish:' + g.id, () => api.sessions.guestFinish(g.id))
  }

  const extendGuest = (g: GuestView) =>
    void run('extend:' + g.id, () => api.sessions.extendGuest(g.id, 60), `${g.label}: +1 soat qo'shildi`)

  const extendAll = async () => {
    const n = live.running + live.paused
    const ok = await confirmDialog({
      title: `Hammaga +1 soat qo'shilsinmi?`,
      message: `${n} ta mehmonning har biriga 1 soat qo'shiladi: +${formatMoney(n * room.pricePerHour)} so'm.`,
      confirmText: "Ha, qo'shish",
      cancelText: "Yo'q",
      icon: 'clock'
    })
    if (ok) await run('extendAll', () => api.sessions.extendAll(view.session.id, 60), `Hammaga +1 soat qo'shildi (${n} kishi)`)
  }

  const cancelSession = async () => {
    const ok = await confirmDialog({
      title: 'Sessiyani bekor qilasizmi?',
      message: `${room.name} bo'shatiladi, hisob yozilmaydi.`,
      confirmText: 'Ha, bekor qilish',
      cancelText: "Yo'q",
      danger: true,
      icon: 'xCircle'
    })
    if (!ok) return
    setBusy('cancel')
    try {
      await api.sessions.cancel(view.session.id)
      toast.success(`${room.name} bekor qilindi va bo'shatildi`)
      onBack()
    } catch (e) {
      toast.error(e)
      setBusy(null)
    }
  }

  const startCheckout = async () => {
    if (!CheckoutDialog) {
      toast.warning("To'lov moduli tayyor emas", { description: "Bu bo'lim hali qo'shilmagan." })
      return
    }
    if (live.running + live.paused > 0) {
      const ok = await confirmDialog({
        title: 'Hisobni yopish',
        message: "Barcha mehmonlar vaqti to'xtatiladi. Keyin to'lov oynasi ochiladi.",
        confirmText: "To'xtatish va davom etish",
        cancelText: 'Bekor',
        icon: 'receipt'
      })
      if (!ok) return
      setBusy('pay')
      try {
        setView(await api.sessions.stopAll(view.session.id))
      } catch (e) {
        toast.error(e)
        setBusy(null)
        return
      }
      setBusy(null)
    }
    setDialog({ kind: 'checkout' })
  }

  const onPaid = (r: ReceiptData) => {
    setDialog(null)
    toast.success(`${r.roomName}: hisob yopildi`, { description: `Chek №${r.receiptNo} · ${formatMoney(r.total)} so'm` })
    onBack()
  }

  return (
    <div className={cx('rooms-ws', 'rooms-ws--' + tone)}>
      {/* ───── Tepa: xona va jami ───── */}
      <header className="rooms-ws__head">
        <IconButton icon="arrowLeft" label="Xonalarga qaytish (Esc)" size="lg" variant="ghost" onClick={onBack} className="rooms-ws__back" />
        <div className="rooms-ws__title">
          <div className="rooms-ws__titlerow">
            <h1 className="rooms-ws__room">{room.name}</h1>
            {tone === 'busy' && <StatusPill status="busy" />}
            {tone === 'warn' && <StatusPill status="paused">Tugayapti</StatusPill>}
            {tone === 'over' && <StatusPill status="ending">Vaqt tugadi!</StatusPill>}
            {tone === 'alert' && <StatusPill status="ending">{alertLabel(live)}</StatusPill>}
          </div>
          <div className="rooms-ws__sub">
            <span>
              <Icon name="clock" size={17} /> Ochildi {formatClock(view.session.openedAt)}
            </span>
            <span>
              <Icon name="tag" size={17} /> {formatMoney(room.pricePerHour)}/soat
            </span>
            <span>
              <Icon name="users" size={17} /> {active}/{room.capacity} kishi
            </span>
          </div>
        </div>
        <div className="rooms-ws__stats">
          <Stat label="Vaqt" value={live.timeTotal} />
          <Stat label="Bar va xizmat" value={live.linesTotal} />
          {live.discount > 0 && <Stat label="Chegirma" value={-live.discount} tone="success" />}
          {view.paid > 0 && <Stat label="To'langan" value={view.paid} tone="success" />}
        </div>
        <div className="rooms-ws__total">
          <span className="rooms-ws__totallabel">{view.paid > 0 ? "Qolgan to'lov" : 'Jami summa'}</span>
          <Money value={view.paid > 0 ? live.due : live.total} size="3xl" tone="accent" className="rooms-ws__totalnum" />
        </div>
      </header>

      <WaiterStrip
        name={view.waiterName}
        pct={view.session.waiterPct}
        assigned={view.session.waiterId != null}
        canManage={canManage}
        minRemaining={live.minRemainingMs}
        onChange={() => setDialog({ kind: 'waiter' })}
      />

      <div className="rooms-ws__body">
        {/* ───── Mehmonlar ───── */}
        <section className="rooms-ws__guests">
          <div className="rooms-sec">
            <div className="rooms-sec__title">
              Mehmonlar
              <Badge tone={capFull ? 'warning' : 'neutral'} size="md">
                {active} / {room.capacity}
              </Badge>
              {live.finished > 0 && <span className="rooms-sec__muted">{live.finished} ta chiqib ketgan</span>}
            </div>
            {canManage && (
              <div className="rooms-sec__actions">
                <Button icon="swap" onClick={() => setDialog({ kind: 'move' })} disabled={busy != null} aria-label="Xonani almashtirish">
                  Xona
                </Button>
                {active > 0 && (
                  <Button
                    icon="clock"
                    onClick={() => void extendAll()}
                    disabled={busy != null && busy !== 'extendAll'}
                    loading={busy === 'extendAll'}
                  >
                    Hammaga +1 soat
                  </Button>
                )}
                <Button
                  icon="userPlus"
                  onClick={() => setDialog({ kind: 'addGuest' })}
                  aria-label="Mehmon qo'shish"
                  disabled={capFull || busy != null}
                  title={capFull ? `Xona sig'imi ${room.capacity} kishi` : undefined}
                >
                  {capFull ? `To'lgan (${room.capacity})` : 'Mehmon'}
                </Button>
              </div>
            )}
          </div>
          <div className="rooms-ws__guestgrid">
            {live.guests.map((g) => (
              <GuestCard
                key={g.id}
                guest={g}
                warnMs={warnMs}
                canManage={canManage}
                busy={busy}
                onRename={() => setDialog({ kind: 'rename', guest: g })}
                onPause={() => void run('pause:' + g.id, () => api.sessions.guestPause(g.id))}
                onResume={() => void run('resume:' + g.id, () => api.sessions.guestResume(g.id))}
                onFinish={() => void finishGuest(g)}
                onExtend={() => extendGuest(g)}
              />
            ))}
          </div>
        </section>

        {/* ───── Hisob ───── */}
        <section className="rooms-bill">
          <div className="rooms-bill__head">
            <div className="rooms-sec__title">
              Hisob
              {activeLines.length > 0 && <Badge size="md">{activeLines.length}</Badge>}
            </div>
            {canManage && (
              <Button variant="primary" icon="plus" onClick={() => setDialog({ kind: 'add' })} className="rooms-bill__add">
                Qo'shish
              </Button>
            )}
          </div>

          <div className="rooms-bill__list">
            {lines.length === 0 ? (
              <EmptyState
                icon="bar"
                title="Hali buyurtma yo'q"
                description={canManage ? "Ichimlik, taom yoki massaj qo'shish uchun «Qo'shish» ni bosing." : undefined}
              />
            ) : (
              lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  who={guestLabel(l.guestId)}
                  canReturn={canReturn}
                  onReturn={() => setDialog({ kind: 'return', line: l })}
                />
              ))
            )}
          </div>

          <div className="rooms-bill__foot">
            {(live.discount > 0 || view.paid > 0) && (
              <div className="rooms-bill__sums">
                {live.discount > 0 && (
                  <>
                    <span>Chegirma</span>
                    <Money value={-live.discount} tone="success" />
                  </>
                )}
                {view.paid > 0 && (
                  <>
                    <span>Oldin to'langan</span>
                    <Money value={view.paid} tone="success" />
                  </>
                )}
              </div>
            )}
            {(canDiscount || canCancel) && (
              <div className="rooms-bill__tools">
                {canDiscount && (
                  <Button
                    icon="percent"
                    onClick={() => setDialog({ kind: 'discount' })}
                    disabled={live.timeTotal + live.linesTotal === 0}
                    className={cx('rooms-bill__disc', live.discount > 0 && 'is-set')}
                  >
                    Chegirma
                  </Button>
                )}
                {canCancel && (
                  <Button variant="danger" icon="xCircle" onClick={() => void cancelSession()} loading={busy === 'cancel'} aria-label="Sessiyani bekor qilish">
                    Bekor qilish
                  </Button>
                )}
              </div>
            )}
            {canPay && (
              <Button variant="success" size="lg" icon="receipt" block onClick={() => void startCheckout()} loading={busy === 'pay'} className="rooms-bill__pay">
                <span className="rooms-bill__paytext">
                  <span className="rooms-bill__paylabel">Hisobni yopish va to'lash</span>
                  <Money value={live.due} size="xl" className="rooms-bill__payamount" />
                </span>
              </Button>
            )}
          </div>
        </section>
      </div>

      {dialog && dialog.kind === 'rename' && (
        <RenameGuestDialog guest={dialog.guest} onClose={() => setDialog(null)} onDone={(v) => { setView(v); setDialog(null) }} />
      )}
      {dialog && dialog.kind === 'return' && (
        <ReturnLineDialog
          line={dialog.line}
          guestLabel={guestLabel(dialog.line.guestId)}
          onClose={() => setDialog(null)}
          onDone={(v) => { setView(v); setDialog(null) }}
        />
      )}
      {dialog && dialog.kind === 'discount' && (
        <DiscountDialog
          sessionId={view.session.id}
          current={view.session.discount}
          max={live.timeTotal + live.linesTotal}
          onClose={() => setDialog(null)}
          onDone={(v) => { setView(v); setDialog(null) }}
        />
      )}
      {dialog && dialog.kind === 'move' && (
        <MoveRoomDialog view={view} activeGuests={active} onClose={() => setDialog(null)} onDone={(v) => { setView(v); setDialog(null) }} />
      )}
      {dialog && dialog.kind === 'add' && (
        <AddItemsDialog sessionId={view.session.id} guests={view.guests} onClose={() => setDialog(null)} onUpdate={setView} />
      )}
      {dialog && dialog.kind === 'addGuest' && (
        <AddGuestDialog view={view} onClose={() => setDialog(null)} onDone={(v) => { setView(v); setDialog(null) }} />
      )}
      {dialog && dialog.kind === 'waiter' && (
        <WaiterDialog view={view} onClose={() => setDialog(null)} onDone={(v) => { setView(v); setDialog(null) }} />
      )}
      {dialog && dialog.kind === 'checkout' && CheckoutDialog && (
        <CheckoutDialog
          sessionId={view.session.id}
          onClose={() => {
            setDialog(null)
            void load()
          }}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}

function WaiterStrip({
  name, pct, assigned, canManage, minRemaining, onChange
}: {
  name: string | null
  pct: number
  assigned: boolean
  canManage: boolean
  minRemaining: number | null
  onChange: () => void
}) {
  return (
    <div className={cx('rooms-wstrip', !assigned && 'is-missing')} data-testid="waiter-strip">
      {assigned ? (
        <>
          <Avatar name={name || '?'} size={40} />
          <div className="rooms-wstrip__text">
            <span className="rooms-wstrip__label">Ofitsiant</span>
            <span className="rooms-wstrip__name">
              {name} <span className="rooms-wstrip__pct num">· {pct}% bardan</span>
            </span>
          </div>
          {canManage && (
            <Button size="sm" variant="ghost" icon="swap" onClick={onChange}>
              Almashtirish
            </Button>
          )}
        </>
      ) : (
        <>
          <span className="rooms-wstrip__warnicon">
            <Icon name="alert" size={26} />
          </span>
          <div className="rooms-wstrip__text">
            <span className="rooms-wstrip__name">Ofitsiant biriktirilmagan</span>
            <span className="rooms-wstrip__label">Bar savdosidan foiz hech kimga yozilmaydi</span>
          </div>
          {canManage && (
            <Button size="md" icon="userPlus" onClick={onChange} className="rooms-wstrip__btn">
              Biriktirish
            </Button>
          )}
        </>
      )}
      <div className="spacer" />
      {minRemaining != null && (
        <div className={cx('rooms-wstrip__left', minRemaining <= 0 && 'is-over')}>
          <span className="rooms-wstrip__label">{minRemaining <= 0 ? 'Vaqt oshdi' : 'Eng kam qolgan'}</span>
          <span className="rooms-wstrip__time num">{formatCountdown(minRemaining)}</span>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' }) {
  return (
    <div className="rooms-stat">
      <span className="rooms-stat__label">{label}</span>
      <Money value={value} size="lg" tone={tone} />
    </div>
  )
}

function LineRow({ line: l, who, canReturn, onReturn }: { line: LineView; who: string | null; canReturn: boolean; onReturn: () => void }) {
  const gone = l.activeQty <= 0
  return (
    <div className={cx('rooms-line', gone && 'is-returned')} data-line={l.name}>
      <span className={cx('rooms-line__icon', l.kind === 'service' && 'is-service')}>
        <Icon name={l.kind === 'service' ? 'sparkles' : 'bar'} size={20} />
      </span>
      <div className="rooms-line__main">
        <div className="rooms-line__name">{l.name}</div>
        <div className="rooms-line__meta">
          <span className="num">
            {l.activeQty} × {formatMoney(l.unitPrice)}
          </span>
          <span className={cx('rooms-line__who', who && 'is-guest')}>{who || 'Butun guruh'}</span>
          {l.providerName && (
            <span className="rooms-line__prov">
              <Icon name="user" size={15} /> {l.providerName}
            </span>
          )}
          {l.returnedQty > 0 && <span className="rooms-line__ret">qaytarildi: {l.returnedQty} dona</span>}
        </div>
      </div>
      <Money value={gone ? l.qty * l.unitPrice : l.amount} currency={false} size="lg" strike={gone} tone={gone ? 'muted' : 'default'} />
      {canReturn && !gone ? (
        <IconButton icon="x" label="Qaytarish" variant="danger" size="sm" onClick={onReturn} className="rooms-line__x" />
      ) : (
        <span className="rooms-line__xph" />
      )}
    </div>
  )
}
