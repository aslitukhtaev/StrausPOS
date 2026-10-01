/**
 * Xonalar paneli (bosh ekran): barcha faol xonalar yirik kartalarda, jonli taymer va summa bilan.
 * Har ~10 soniyada `rooms.board()` dan yangilanadi; oraliqda `useNow` + billing bilan lokal yuradi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomCard } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import {
  Button, Card, EmptyState, Icon, IconButton, Money, PageHeader, Spinner, StatusPill, Timer, cx, formatClock, formatMoney,
  getNow, toast, useNow
} from '@/ui'
import { alertLabel, liveTotals, roomTone, useRoundTo, type LiveTotals } from './live'
import { OpenRoomDialog } from './OpenRoomDialog'

const REFRESH_MS = 10_000

interface BoardData {
  cards: RoomCard[]
  at: number
}

export function RoomBoard({ onOpenSession }: { onOpenSession: (sessionId: number) => void }) {
  const [data, setData] = useState<BoardData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [opening, setOpening] = useState<RoomCard | null>(null)
  const failStreak = useRef(0)
  const canOpen = useCan('session.open')

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const cards = await api.rooms.board()
      setData({ cards, at: getNow() })
      setLoadError(null)
      failStreak.current = 0
    } catch (e) {
      failStreak.current++
      const msg = e instanceof Error ? e.message : String(e)
      setLoadError(msg)
      // Fon yangilanishida xatoni faqat bir marta ko'rsatamiz (spam bo'lmasin)
      if (manual || failStreak.current === 1) toast.error(e)
    } finally {
      if (manual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const now = useNow()
  const roundTo = useRoundTo()
  const lives = useMemo(() => {
    const m = new Map<number, LiveTotals>()
    if (data) for (const c of data.cards) if (c.session) m.set(c.room.id, liveTotals(c.session, data.at, now, roundTo))
    return m
  }, [data, now, roundTo])

  const stats = useMemo(() => {
    let busy = 0
    let guests = 0
    let total = 0
    if (data)
      for (const c of data.cards) {
        const l = lives.get(c.room.id)
        if (!l) continue
        busy++
        guests += l.running + l.paused
        total += l.due
      }
    return { busy, guests, total, rooms: data ? data.cards.length : 0 }
  }, [data, lives])

  const onCardClick = (c: RoomCard) => {
    if (c.session) {
      onOpenSession(c.session.session.id)
      return
    }
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
          <RoomTile key={c.room.id} card={c} live={lives.get(c.room.id) ?? null} onClick={() => onCardClick(c)} />
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
            {loadError && data && (
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
            toast.success(`${v.room.name} ochildi`, { description: `${v.guests.length} mehmon · vaqt boshlandi` })
            void load()
          }}
        />
      )}
    </div>
  )
}

function RoomTile({ card, live, onClick }: { card: RoomCard; live: LiveTotals | null; onClick: () => void }) {
  const { room, session } = card
  const tone = roomTone(live)
  const cardTone = tone === 'free' ? 'success' : tone === 'busy' ? 'warning' : 'danger'
  const people = live ? live.running + live.paused : 0
  return (
    <Card
      interactive
      tone={cardTone}
      padding="none"
      className={cx('rooms-tile', 'rooms-tile--' + tone)}
      onClick={onClick}
      aria-label={room.name + (session ? ' — band' : " — bo'sh")}
      data-room={room.name}
    >
      <div className="rooms-tile__bar" />
      <div className="rooms-tile__inner">
        <div className="rooms-tile__top">
          <div className="rooms-tile__name ellipsis">{room.name}</div>
          {tone === 'free' && <StatusPill status="free" size="lg" />}
          {tone === 'busy' && <StatusPill status="busy" size="lg" />}
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
          <div className="rooms-tile__free">
            <span className="rooms-tile__play">
              <Icon name="play" size={30} strokeWidth={2.4} />
            </span>
            <span>
              <span className="rooms-tile__freetitle">Xonani ochish</span>
              <span className="rooms-tile__freehint">Bosing va mehmonlar sonini tanlang</span>
            </span>
          </div>
        ) : (
          <>
            <div className="rooms-tile__live">
              <div className="rooms-tile__timer">
                <Timer ms={live.longestMs} running={live.anyRunning} paused={!live.anyRunning} size="xl" />
                <span className="rooms-tile__since">{formatClock(session.session.openedAt)} dan beri</span>
              </div>
              <div className="rooms-tile__people" title="Xonadagi mehmonlar">
                <Icon name="users" size={26} />
                <span className="num">
                  {people}
                  <small>/{room.capacity}</small>
                </span>
              </div>
            </div>
            <div className="rooms-tile__total">
              <span className="rooms-tile__totallabel">
                {live.paused > 0 && live.running > 0 ? `${live.paused} ta pauzada · ` : ''}Hozirgi hisob
              </span>
              <Money value={live.due} size="3xl" tone={tone === 'alert' ? 'danger' : 'accent'} />
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
