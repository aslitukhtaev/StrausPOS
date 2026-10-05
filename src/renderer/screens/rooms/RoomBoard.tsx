/**
 * Xonalar paneli (bosh ekran): barcha faol xonalar yirik kartalarda, jonli taymer va summa bilan.
 * Har ~10 soniyada `rooms.board()` dan yangilanadi; oraliqda `useNow` + billing bilan lokal yuradi.
 */
import { useMemo, useState } from 'react'
import type { RoomCard } from '@shared/types'
import { formatHours, formatTimeShown } from '@shared/billing'
import { useCan } from '@/store/auth'
import { useApp } from '@/store/app'
import {
  Button, Card, EmptyState, Icon, IconButton, Money, PageHeader, Spinner, StatusPill, cx, formatMoney, toast, useNow
} from '@/ui'
import { alertLabel, liveTotals, roomTone, useBillingOptions, useWarnMs, type LiveTotals } from './live'
import { OpenRoomDialog } from './OpenRoomDialog'
import { useBoard } from './boardStore'

export function RoomBoard({ onOpenSession }: { onOpenSession: (sessionId: number) => void }) {
  const cards = useBoard((s) => s.cards)
  const at = useBoard((s) => s.at)
  const loadError = useBoard((s) => s.error)
  const [refreshing, setRefreshing] = useState(false)
  const [opening, setOpening] = useState<RoomCard | null>(null)
  const readOnly = useApp((st) => st.readOnly)
  const canOpen = useCan('session.open') && !readOnly
  const data = cards ? { cards, at } : null
  const load = async (manual = false) => {
    if (manual) setRefreshing(true)
    await useBoard.getState().load(manual)
    if (manual) setRefreshing(false)
  }

  const now = useNow()
  const billing = useBillingOptions()
  const warnMs = useWarnMs()
  const lives = useMemo(() => {
    const m = new Map<number, LiveTotals>()
    if (cards) for (const c of cards) if (c.session) m.set(c.room.id, liveTotals(c.session, at, now, billing, warnMs))
    return m
  }, [cards, at, now, billing, warnMs])

  const stats = useMemo(() => {
    let busy = 0
    let guests = 0
    let total = 0
    if (cards)
      for (const c of cards) {
        const l = lives.get(c.room.id)
        if (!l) continue
        busy++
        guests += l.running + l.paused
        total += l.due
      }
    return { busy, guests, total, rooms: cards ? cards.length : 0 }
  }, [cards, lives])

  const onCardClick = (c: RoomCard) => {
    if (c.session) {
      onOpenSession(c.session.session.id)
      return
    }
    if (readOnly) return // ko'ruvchi: bo'sh xona bosilmaydi
    if (!canOpen) {
      toast.warning("Xonani ochishga ruxsatingiz yo'q")
      return
    }
    setOpening(c)
  }

  let body
  if (!data) {
    body = loadError ? (
      <EmptyState
        size="lg"
        icon="alert"
        title="Xonalarni yuklab bo'lmadi"
        description={loadError}
        action={<Button icon="refresh" onClick={() => void load(true)}>Qayta urinish</Button>}
      />
    ) : (
      <div className="rooms-loading"><Spinner size={44} /></div>
    )
  } else if (data.cards.length === 0) {
    body = (
      <EmptyState
        size="lg"
        icon="rooms"
        title="Hali xona qo'shilmagan"
        description="Sozlamalar bo'limida xonalar, narx va sig'imni kiriting."
      />
    )
  } else {
    body = (
      <div className="rooms-grid">
        {data.cards.map((c) => (
          <RoomTile key={c.room.id} card={c} live={lives.get(c.room.id) ?? null} readOnly={readOnly} onClick={() => onCardClick(c)} />
        ))}
      </div>
    )
  }

  return (
    <div className="rooms-board">
      <PageHeader
        title="Xonalar"
        icon="rooms"
        subtitle={
          data
            ? stats.busy === 0
              ? `${stats.rooms} ta xona · hammasi bo'sh`
              : `${stats.busy} / ${stats.rooms} xona band · ${stats.guests} mehmon`
            : 'Yuklanmoqda…'
        }
        actions={
          <div className="rooms-board__actions">
            {stats.busy > 0 && (
              <div className="rooms-board__sum">
                <span className="rooms-board__sumlabel">Ochiq hisoblar</span>
                <Money value={stats.total} size="xl" tone="accent" />
              </div>
            )}
            {loadError && data && !readOnly && (
              <span className="rooms-board__offline" title={loadError}>
                <Icon name="alert" size={18} /> Aloqa yo'q
              </span>
            )}
            <IconButton icon="refresh" label="Yangilash" loading={refreshing} onClick={() => void load(true)} />
          </div>
        }
      />
      {body}
      {opening && (
        <OpenRoomDialog
          room={opening.room}
          onClose={() => setOpening(null)}
          onOpened={(v) => {
            setOpening(null)
            useBoard.getState().patchSession(v)
            toast.success(`${v.room.name} ochildi`, {
              description: `${v.guests.length} mehmon · ${formatHours(v.guests[0] ? v.guests[0].paidMinutes : 0)}`
            })
            void load()
          }}
        />
      )}
    </div>
  )
}

function RoomTile({ card, live, readOnly, onClick }: { card: RoomCard; live: LiveTotals | null; readOnly: boolean; onClick: () => void }) {
  const { room, session } = card
  const tone = roomTone(live)
  const cardTone = tone === 'free' ? 'success' : tone === 'busy' ? 'busy' : tone === 'warn' ? 'warning' : 'danger'
  const people = live ? live.running + live.paused : 0
  const left = live ? live.minRemainingMs : null
  return (
    <Card
      interactive={!(readOnly && !session)}
      tone={cardTone}
      padding="none"
      className={cx('rooms-tile', 'rooms-tile--' + tone)}
      onClick={readOnly && !session ? undefined : onClick}
      aria-label={room.name + (session ? ' — band' : " — bo'sh")}
      data-room={room.name}
    >
      <div className="rooms-tile__bar" />
      <div className="rooms-tile__inner">
        <div className="rooms-tile__top">
          <div className="rooms-tile__name" title={room.name}>{room.name}</div>
          {tone === 'free' && <StatusPill status="free" size="lg" />}
          {tone === 'busy' && <StatusPill status="busy" size="lg" />}
          {tone === 'warn' && <StatusPill status="paused" size="lg">Tugayapti</StatusPill>}
          {tone === 'over' && <StatusPill status="ending" size="lg">Vaqt tugadi!</StatusPill>}
          {tone === 'alert' && live && <StatusPill status="ending" size="lg">{alertLabel(live)}</StatusPill>}
        </div>
        <div className="rooms-tile__meta">
          <span>
            <b className="num">{formatMoney(room.pricePerHour)}</b> so'm/soat
          </span>
          <span className="rooms-tile__dot" />
          <span>
            <Icon name="users" size={18} /> {room.capacity} kishi
          </span>
        </div>

        {!session || !live ? (
          readOnly ? (
            <div className="rooms-tile__free is-readonly">
              <span className="rooms-tile__play">
                <Icon name="check" size={30} strokeWidth={2.4} />
              </span>
              <span>
                <span className="rooms-tile__freetitle">Bo'sh</span>
                <span className="rooms-tile__freehint">Mehmon yo'q</span>
              </span>
            </div>
          ) : (
            <div className="rooms-tile__free">
              <span className="rooms-tile__play">
                <Icon name="play" size={30} strokeWidth={2.4} />
              </span>
              <span>
                <span className="rooms-tile__freetitle">Xonani ochish</span>
                <span className="rooms-tile__freehint">Bosing: mehmonlar va vaqt</span>
              </span>
            </div>
          )
        ) : (
          <>
            <div className="rooms-tile__live">
              <div className="rooms-tile__timer">
                <span className="rooms-tile__since">
                  {left == null ? 'Vaqt' : left <= 0 ? 'Oshib ketdi' : live.anyRunning ? 'Qolgan vaqt' : 'Pauzada qolgan'}
                </span>
                <span className={cx('rooms-tile__countdown', 'num', !live.anyRunning && 'is-paused')} data-testid="tile-countdown">
                  {left == null ? '—' : formatTimeShown(left, live.minGuest ? live.minGuest.paidMinutes : 0)}
                </span>
              </div>
            </div>
            <div className="rooms-tile__total">
              <span className="rooms-tile__info">
                <span className="rooms-tile__people" title="Xonadagi mehmonlar">
                  <Icon name="users" size={16} />
                  <span className="num">{people}/{room.capacity}</span>
                </span>
              </span>
              <Money value={live.due} size="3xl" tone={tone === 'alert' || tone === 'over' ? 'danger' : 'accent'} />
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
