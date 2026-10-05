/** Sessiyalar jadvali: chek №, xona, vaqt, jami, obsluga, to'lov, kassir; "Chek" tugmasi; qator → tafsilot. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportRange, Room, SessionHistoryRow } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, EmptyState, Input, Money, Select, Spinner, formatClock, formatDateShort, formatMoney, toast } from '@/ui'
import { methodBadges, roomLabel } from './common'
import { DetailDialog } from './Detail'
import { ReceiptDialog } from './ReceiptDialog'

export function SessionsTab({ range }: { range: ReportRange }) {
  const [rows, setRows] = useState<SessionHistoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('all')
  const [cashier, setCashier] = useState('all')
  const [method, setMethod] = useState('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [receiptId, setReceiptId] = useState<number | null>(null)
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

  const cashiers = useMemo(() => Array.from(new Set((rows || []).map((r) => r.cashier).filter((x): x is string => !!x))).sort(), [rows])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase().replace(/^№\s*/, '')
    return rows
      .filter((r) => roomId === 'all' || r.roomId === Number(roomId))
      .filter((r) => cashier === 'all' || r.cashier === cashier)
      .filter((r) => method === 'all' || methodBadges(r.paymentMethods).indexOf(method) >= 0)
      .filter((r) => {
        if (!needle) return true
        const hay = [roomLabel(r), r.openedBy, r.cashier || '', r.paymentMethods, String(r.receiptNo ?? ''), ...r.items.map((i) => i.name)].join(' ').toLowerCase()
        return hay.indexOf(needle) >= 0
      })
      .sort((a, b) => b.closedAt - a.closedAt)
  }, [rows, roomId, cashier, method, q])

  const sum = shown.reduce((a, r) => a + r.total, 0)
  const svc = shown.reduce((a, r) => a + (r.serviceCharge || 0), 0)
  const guests = shown.reduce((a, r) => a + (r.roomId === 0 ? 0 : r.guestCount), 0)

  return (
    <>
      <div className="hist-filters">
        <div className="hist-sel"><Select size="lg" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Xona" data-testid="hist-room">
          <option value="all">Barcha xonalar</option>
          <option value="0">Bar (xonasiz)</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select></div>
        <div className="hist-sel"><Select size="lg" value={cashier} onChange={(e) => setCashier(e.target.value)} aria-label="Kassir" data-testid="hist-cashier">
          <option value="all">Barcha kassirlar</option>
          {cashiers.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select></div>
        <div className="hist-sel"><Select size="lg" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="To'lov usuli" data-testid="hist-method">
          <option value="all">Barcha to'lovlar</option>
          {['Naqd', 'Karta', 'Terminal', 'Qarz'].map((m) => <option key={m} value={m}>{m}</option>)}
        </Select></div>
        <div className="hist-search">
          <Input size="lg" icon="search" placeholder="Chek №, xona, mahsulot..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="hist-search" />
        </div>
      </div>

      {failed ? (
        <EmptyState icon="alert" title="Tarixni yuklab bo'lmadi" action={<Button icon="refresh" onClick={() => load(range)}>Qayta urinish</Button>} />
      ) : !rows ? (
        <div className="hist-center"><Spinner size={40} /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon="inbox" size="lg" title="Yopilgan hisob topilmadi" description={rows.length > 0 ? "Filtrni o'zgartirib ko'ring." : formatDateShort(range.from) + " davrida yopilgan hisoblar yo'q."} />
      ) : (
        <table className="hist-table" data-testid="hist-table">
          <thead>
            <tr>
              <th>Chek №</th>
              <th>Xona</th>
              <th>Ochilgan</th>
              <th>Yopilgan</th>
              <th className="r">Mehmonlar</th>
              <th className="r">Jami</th>
              <th className="r">Obsluga</th>
              <th>To'lov</th>
              <th>Kassir</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.sessionId} className="hist-row" tabIndex={0} data-testid="hist-row"
                onClick={() => setOpenId(r.sessionId)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') setOpenId(r.sessionId) }}
              >
                <td className="num hist-no" data-testid="hist-no">{r.receiptNo != null ? '№' + r.receiptNo : '—'}</td>
                <td className="hist-room">{roomLabel(r)}</td>
                <td className="nowrap num"><div>{formatClock(r.openedAt)}</div><div className="hist-sub">{formatDateShort(r.openedAt)}</div></td>
                <td className="nowrap num"><div>{formatClock(r.closedAt)}</div><div className="hist-sub">{formatDateShort(r.closedAt)}</div></td>
                <td className="r num">{r.roomId === 0 ? '—' : r.guestCount}</td>
                <td className="r"><Money value={r.total} size="md" currency={false} /></td>
                <td className="r">{r.serviceCharge > 0 ? <Money value={r.serviceCharge} size="md" currency={false} /> : <span className="subtle">—</span>}</td>
                <td>
                  <div className="hist-pm">
                    {methodBadges(r.paymentMethods).map((m) => <Badge key={m} tone={m === 'Qarz' ? 'danger' : 'neutral'} size="md">{m}</Badge>)}
                  </div>
                </td>
                <td data-testid="hist-cashier-cell">{r.cashier || '—'}</td>
                <td className="r">
                  <Button
                    size="sm" variant="secondary" icon="receipt" data-testid="hist-receipt-btn" disabled={r.receiptNo == null}
                    onClick={(e) => { e.stopPropagation(); setReceiptId(r.sessionId) }}
                  >
                    Chek
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="hist-total" data-testid="hist-total">
              <td colSpan={4}><b>{shown.length}</b> ta hisob</td>
              <td className="r num">{guests}</td>
              <td className="r"><b className="num">{formatMoney(sum)}</b></td>
              <td className="r"><b className="num">{svc > 0 ? formatMoney(svc) : '—'}</b></td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      )}

      {openId != null && <DetailDialog sessionId={openId} onClose={() => setOpenId(null)} />}
      {receiptId != null && <ReceiptDialog sessionId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
