/**
 * Tarix: yopilgan sessiyalar jadvali (reports.sessions) + qator bosilganda tafsilot (sessions.detail):
 * aynan nima sotilgan, kim qo'shgan, qaytarishlar, to'lovlar, qarz; chekni qayta chop etish.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportRange, Room, SessionDetail, SessionHistoryRow } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { formatDuration } from '@shared/billing'
import {
  Badge, Button, EmptyState, Icon, Input, Modal, Money, PageHeader, Segmented, Select, Spinner, errorMessage, formatClock, formatDate,
  formatDateShort, formatDateTime, formatMinutes, formatMoney, getNow, toast
} from '@/ui'
import { staffName, useStaffList } from '../rooms/staffNames'
import './history.css'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const startOfDay = (ts: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
const addDays = (ts: number, n: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}
const p2 = (n: number) => (n < 10 ? '0' + n : '' + n)
const toInput = (ts: number) => {
  const d = new Date(ts)
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
}
const fromInput = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null
}
function presetRange(p: Exclude<Preset, 'custom'>, now: number): ReportRange {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  if (p === 'today') return { from: today, to: tomorrow }
  if (p === 'yesterday') return { from: addDays(today, -1), to: today }
  if (p === 'week') return { from: addDays(today, -6), to: tomorrow }
  const d = new Date(today)
  return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: tomorrow }
}

const METHOD_LABEL: Record<string, string> = { cash: 'Naqd', card: 'Karta', terminal: 'Terminal', debt: 'Qarz' }
const roomLabel = (r: { roomId: number; roomName: string }) => (r.roomId === 0 ? 'Bar' : r.roomName)

/** paymentMethods ("cash,card" yoki "Naqd, Karta") ni yorliqlarga aylantiradi */
function methodBadges(s: string): string[] {
  return s
    .split(/[,+/]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => METHOD_LABEL[x.toLowerCase()] || x)
}

export default function HistoryScreen() {
  const [preset, setPreset] = useState<Preset>('today')
  const [fromStr, setFromStr] = useState(() => toInput(getNow()))
  const [toStr, setToStr] = useState(() => toInput(getNow()))
  const [range, setRange] = useState<ReportRange>(() => presetRange('today', getNow()))
  const [roomId, setRoomId] = useState<string>('all')
  const [q, setQ] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [rows, setRows] = useState<SessionHistoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    api.rooms.list().then(setRooms).catch(() => undefined)
  }, [])

  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setRows(null)
    setFailed(false)
    api.reports
      .sessions(r)
      .then((x) => my === seq.current && setRows(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
      })
  }, [])
  useEffect(() => load(range), [range, load])

  const pick = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p, getNow())
      setRange(r)
      setFromStr(toInput(r.from))
      setToStr(toInput(r.to - 1))
    }
  }
  const applyCustom = () => {
    const f = fromInput(fromStr)
    const t = fromInput(toStr)
    if (f === null || t === null) return toast.warning('Ikkala sanani ham kiriting')
    if (t < f) return toast.warning("Oxirgi sana boshlanishidan oldin bo'lishi mumkin emas")
    setRange({ from: f, to: addDays(t, 1) })
  }

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => roomId === 'all' || r.roomId === Number(roomId))
      .filter((r) => {
        if (!needle) return true
        const hay = [roomLabel(r), r.openedBy, r.paymentMethods, String(r.sessionId), ...r.items.map((i) => i.name)].join(' ').toLowerCase()
        return hay.indexOf(needle) >= 0
      })
      .sort((a, b) => b.closedAt - a.closedAt)
  }, [rows, roomId, q])

  const sum = shown.reduce((a, r) => a + r.total, 0)
  const svc = shown.reduce((a, r) => a + (r.serviceCharge || 0), 0)

  return (
    <div className="hist" data-testid="history-screen">
      <PageHeader title="Tarix" subtitle="Yopilgan hisoblar va ularning tafsiloti" icon="clock" />
      <div className="hist-filters">
        <Segmented<Preset>
          size="lg"
          value={preset}
          onChange={pick}
          options={[
            { value: 'today', label: 'Bugun' },
            { value: 'yesterday', label: 'Kecha' },
            { value: 'week', label: 'Hafta' },
            { value: 'month', label: 'Oy' },
            { value: 'custom', label: 'Oraliq' }
          ]}
        />
        {preset === 'custom' && (
          <div className="hist-custom">
            <Input size="lg" type="date" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish sanasi" />
            <span>–</span>
            <Input size="lg" type="date" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi sana" />
            <Button size="md" variant="primary" onClick={applyCustom}>Ko'rsatish</Button>
          </div>
        )}
        <div className="hist-room-sel"><Select size="lg" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Xona" data-testid="hist-room">
          <option value="all">Barcha xonalar</option>
          <option value="0">Bar (xonasiz)</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select></div>
        <div className="hist-search">
          <Input
            size="lg" icon="search" placeholder="Qidirish..."
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="hist-search"
          />
        </div>
      </div>

      {failed ? (
        <EmptyState icon="alert" title="Tarixni yuklab bo'lmadi" action={<Button icon="refresh" onClick={() => load(range)}>Qayta urinish</Button>} />
      ) : !rows ? (
        <div className="hist-center"><Spinner size={40} /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon="inbox" size="lg" title="Yopilgan hisob topilmadi" description={rows.length > 0 ? "Filtrni o'zgartirib ko'ring." : formatDateShort(range.from) + ' kuni yopilgan hisoblar yo\'q.'} />
      ) : (
        <>
          <div className="hist-sum">
            <span><b>{shown.length}</b> ta hisob</span>
            <span>Jami: <b className="num">{formatMoney(sum)} so'm</b></span>
            {svc > 0 && <span>Obsluga: <b className="num">{formatMoney(svc)} so'm</b></span>}
          </div>
          <table className="hist-table" data-testid="hist-table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Xona</th>
                <th className="r">Mehmon</th>
                <th className="r">Jami</th>
                <th className="r">Obsluga</th>
                <th>To'lov</th>
                <th>Kassir</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.sessionId} className="hist-row" tabIndex={0} data-testid="hist-row"
                  onClick={() => setOpenId(r.sessionId)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.sessionId) }}
                >
                  <td className="nowrap num">
                    <div>{formatDateShort(r.closedAt)} · {formatClock(r.closedAt)}</div>
                    <div className="hist-sub">ochildi {formatClock(r.openedAt)}</div>
                  </td>
                  <td className="hist-room">{roomLabel(r)}</td>
                  <td className="r num">{r.roomId === 0 ? '—' : r.guestCount}</td>
                  <td className="r"><Money value={r.total} size="md" currency={false} /></td>
                  <td className="r">{r.serviceCharge > 0 ? <Money value={r.serviceCharge} size="md" currency={false} /> : <span className="subtle">—</span>}</td>
                  <td>
                    <div className="hist-pm">
                      {methodBadges(r.paymentMethods).map((m) => (
                        <Badge key={m} tone={m === 'Qarz' ? 'danger' : 'neutral'} size="md">{m}</Badge>
                      ))}
                    </div>
                  </td>
                  <td>{r.openedBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {openId != null && <DetailDialog sessionId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/* ───────────── Tafsilot ───────────── */
function DetailDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [d, setD] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const staff = useStaffList()
  const canPrint = useCan('session.pay') || useCan('reports.view')

  const load = useCallback(() => {
    setD(null)
    setError(null)
    api.sessions
      .detail(sessionId)
      .then(setD)
      .catch((e: unknown) => {
        setError(errorMessage(e))
        toast.error(e)
      })
  }, [sessionId])
  useEffect(load, [load])

  const reprint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const r = await api.checkout.receipt(sessionId)
      await api.system.printReceipt(r)
      toast.success('Chek chop etildi', { description: '№' + r.receiptNo })
    } catch (e) {
      toast.error(e, { description: "Printerni tekshirib, qayta urinib ko'ring." })
    } finally {
      setPrinting(false)
    }
  }

  const v = d ? d.view : null
  const isBar = !!v && v.session.kind === 'bar'
  const title = v ? (isBar ? 'Bar savdosi' : v.room.name) : 'Hisob'
  const guestLabel = (id: number | null) => (id == null ? null : v ? (v.guests.find((g) => g.id === id) || { label: '' }).label : null)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={title + (d && d.receiptNo != null ? ' · chek №' + d.receiptNo : '')}
      subtitle={v ? formatDateTime(v.session.openedAt) + (v.session.closedAt ? ' – ' + formatClock(v.session.closedAt) : ' (ochiq)') : undefined}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Yopish</Button>
          <div className="spacer" />
          <Button
            variant="primary" size="lg" icon="printer" onClick={() => void reprint()} loading={printing}
            disabled={!d || d.receiptNo == null || !canPrint} data-testid="hist-reprint"
          >
            Chekni qayta chop etish
          </Button>
        </>
      }
    >
      <div className="hist-det" data-testid="hist-detail">
        {error ? (
          <EmptyState icon="alert" title="Tafsilotni yuklab bo'lmadi" description={error} action={<Button icon="refresh" onClick={load}>Qayta urinish</Button>} />
        ) : !v || !d ? (
          <div className="hist-center"><Spinner size={40} /></div>
        ) : (
          <>
            <div className="hist-det__head">
              <span><Icon name="user" size={18} /> Ochdi: {d.openedBy || '—'}</span>
              <span><Icon name="cash" size={18} /> Kassir: {d.cashier || '—'}</span>
              {v.waiterName && <span><Icon name="user" size={18} /> Ofitsiant: {v.waiterName}</span>}
              {!isBar && <span><Icon name="users" size={18} /> {v.guests.length} mehmon</span>}
            </div>

            {!isBar && (
              <section>
                <h3 className="hist-h">Mehmonlar</h3>
                <table className="hist-tbl">
                  <thead>
                    <tr><th>Mehmon</th><th>Keldi – ketdi</th><th>Olingan</th><th>O'tirdi</th><th>Hisoblangan</th><th className="r">Summa</th></tr>
                  </thead>
                  <tbody>
                    {v.guests.map((g) => {
                      const first = g.intervals.length ? g.intervals[0].start : null
                      const last = g.intervals.length ? g.intervals[g.intervals.length - 1].end : null
                      return (
                        <tr key={g.id} data-testid="hist-guest">
                          <td className="hist-nm">{g.label}</td>
                          <td className="num">{first != null ? formatClock(first) : '—'} – {last != null ? formatClock(last) : '—'}</td>
                          <td>{formatMinutes(g.paidMinutes)}</td>
                          <td className="num">{formatDuration(g.elapsedMs)}</td>
                          <td>{formatMinutes(g.billedMinutes)}</td>
                          <td className="r"><Money value={g.timeAmount} size="sm" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h3 className="hist-h">Sotilgan mahsulot va xizmatlar</h3>
              {v.lines.length === 0 ? (
                <div className="subtle">Hech narsa qo'shilmagan</div>
              ) : (
                <table className="hist-tbl" data-testid="hist-lines">
                  <thead>
                    <tr><th>Nomi</th><th className="r">Soni</th><th className="r">Narxi</th><th>Kim qo'shdi · qachon</th><th>Ofitsiant</th><th className="r">Summa</th></tr>
                  </thead>
                  <tbody>
                    {v.lines.map((l) => {
                      const gone = l.activeQty <= 0
                      const who = guestLabel(l.guestId)
                      return (
                        <tr key={l.id} className={gone ? 'is-gone' : undefined} data-testid="hist-line">
                          <td>
                            <div className="hist-nm">{l.name}</div>
                            <div className="hist-sub">{who || (isBar ? '' : 'Butun guruh')}{l.providerName ? ' · ' + l.providerName : ''}</div>
                          </td>
                          <td className="r num">
                            {l.activeQty}
                            {l.returnedQty > 0 && <div className="hist-ret">−{l.returnedQty} qaytdi</div>}
                          </td>
                          <td className="r num">{formatMoney(l.unitPrice)}</td>
                          <td className="num">{l.createdByName || '—'} · {formatClock(l.createdAt)}</td>
                          <td>{staffName(staff, l.waiterId) || '—'}</td>
                          <td className="r"><Money value={gone ? l.qty * l.unitPrice : l.amount} size="sm" strike={gone} tone={gone ? 'muted' : 'default'} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {d.returns.length > 0 && (
              <section>
                <h3 className="hist-h">Qaytarishlar</h3>
                <table className="hist-tbl" data-testid="hist-returns">
                  <thead>
                    <tr><th>Nomi</th><th className="r">Soni</th><th>Sabab</th><th>Kim</th><th>Qachon</th></tr>
                  </thead>
                  <tbody>
                    {d.returns.map((r, i) => (
                      <tr key={i}>
                        <td className="hist-nm">{r.name}</td>
                        <td className="r num">{r.qty}</td>
                        <td>{r.reason || '—'}</td>
                        <td>{r.byName || '—'}</td>
                        <td className="num">{formatDate(r.at, false)} · {formatClock(r.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h3 className="hist-h">Hisob</h3>
              <div className="hist-totals" data-testid="hist-totals">
                {!isBar && (<><span>Vaqt</span><Money value={v.timeTotal} /></>)}
                <span>Buyurtmalar</span><Money value={v.linesTotal} />
                {v.discount > 0 && (<><span>Chegirma</span><Money value={-v.discount} tone="success" /></>)}
                {v.serviceCharge > 0 && (<><span>Obsluga {v.serviceChargePct}%</span><Money value={v.serviceCharge} /></>)}
                <span className="is-total">JAMI</span><span className="is-total"><Money value={v.total} size="xl" tone="accent" /></span>
                {v.payments.map((p) => (
                  <PayRow key={p.id} label={(METHOD_LABEL[p.method] || p.method) + ' · ' + formatClock(p.at)} amount={p.amount} debt={p.method === 'debt'} />
                ))}
                {v.due > 0 && (<><span className="hist-debt">Qarz / to'lanmagan</span><Money value={v.due} tone="danger" /></>)}
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function PayRow({ label, amount, debt }: { label: string; amount: number; debt: boolean }) {
  return (
    <>
      <span className={debt ? 'hist-debt' : undefined}>{label}</span>
      <Money value={amount} tone={debt ? 'danger' : 'default'} />
    </>
  )
}
