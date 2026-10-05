/** Sotuvlar: aynan qaysi xodim nima sotgani (sessions.soldItems). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportRange, SoldItemRow } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, Card, EmptyState, Input, Money, Select, Spinner, formatClock, formatDateShort, formatMoney, toast } from '@/ui'
import { useStaffList } from '../rooms/staffNames'
import { DetailDialog } from './Detail'

const DEPTS = [
  { v: 'all', label: "Barcha bo'limlar" },
  { v: 'bar', label: 'Bar' },
  { v: 'kitchen', label: 'Oshxona' },
  { v: 'service', label: 'Xizmat' }
]
const deptOf = (r: SoldItemRow) => (r.kind === 'service' ? 'service' : r.department || 'bar')

export function SoldTab({ range }: { range: ReportRange }) {
  const staff = useStaffList()
  const [staffId, setStaffId] = useState('all')
  const [dept, setDept] = useState('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<SoldItemRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const seq = useRef(0)

  const load = useCallback((r: ReportRange, sid: string) => {
    const my = ++seq.current
    setRows(null)
    setFailed(false)
    api.sessions
      .soldItems(r, sid === 'all' ? null : Number(sid))
      .then((x) => my === seq.current && setRows(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
      })
  }, [])
  useEffect(() => load(range, staffId), [range, staffId, load])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => dept === 'all' || deptOf(r) === dept)
      .filter((r) => !needle || r.name.toLowerCase().indexOf(needle) >= 0)
      .sort((a, b) => b.at - a.at)
  }, [rows, dept, q])

  const total = shown.reduce((a, r) => a + r.amount, 0)
  const byStaff = useMemo(() => {
    const m = new Map<number, { id: number; name: string; count: number; amount: number }>()
    for (const r of shown) {
      const x = m.get(r.staffId) || { id: r.staffId, name: r.staffName, count: 0, amount: 0 }
      x.count += Math.max(0, r.qty - r.returnedQty)
      x.amount += r.amount
      m.set(r.staffId, x)
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount)
  }, [shown])
  const top = byStaff[0]

  return (
    <>
      <div className="hist-filters">
        <div className="hist-sel"><Select size="lg" value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Xodim" data-testid="sold-staff">
          <option value="all">Barcha xodimlar</option>
          {(staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select></div>
        <div className="hist-sel"><Select size="lg" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Bo'lim" data-testid="sold-dept">
          {DEPTS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
        </Select></div>
        <div className="hist-search">
          <Input size="lg" icon="search" placeholder="Mahsulot nomi..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="sold-search" />
        </div>
      </div>

      {failed ? (
        <EmptyState icon="alert" title="Sotuvlarni yuklab bo'lmadi" action={<Button icon="refresh" onClick={() => load(range, staffId)}>Qayta urinish</Button>} />
      ) : !rows ? (
        <div className="hist-center"><Spinner size={40} /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon="inbox" size="lg" title="Sotuvlar topilmadi" description={rows.length > 0 ? "Filtrni o'zgartirib ko'ring." : "Bu davrda hech narsa sotilmagan."} />
      ) : (
        <>
          <div className="hist-kpis" data-testid="sold-kpis">
            <Card padding="md"><div className="hist-kpi__l">Jami summa</div><div className="hist-kpi__v" data-testid="sold-total"><Money value={total} size="xl" tone="accent" /></div></Card>
            <Card padding="md"><div className="hist-kpi__l">Sotuvlar soni</div><div className="hist-kpi__v num" data-testid="sold-count">{shown.length} ta</div></Card>
            <Card padding="md"><div className="hist-kpi__l">Eng ko'p sotgan xodim</div>
              <div className="hist-kpi__v" data-testid="sold-top">{top ? top.name : '—'}{top && <div className="hist-kpi__s">{formatMoney(top.amount)} so'm</div>}</div></Card>
          </div>

          <div className="hist-split">
            <div className="hist-bystaff">
              <h3 className="hist-h">Xodimlar bo'yicha <span className="hist-sub">— bosing, xodim filtri o'rnatiladi</span></h3>
              <div className="hist-bystaff-list" data-testid="sold-bystaff">
                {byStaff.map((x) => (
                  <button
                    type="button" key={x.id} className={'hist-bs' + (String(x.id) === staffId ? ' is-on' : '')} data-testid="sold-bystaff-row"
                    onClick={() => setStaffId(String(x.id) === staffId ? 'all' : String(x.id))}
                  >
                    <span className="hist-bs__n">{x.name}</span>
                    <span className="hist-bs__c num">{x.count} ta</span>
                    <Money value={x.amount} size="sm" currency={false} />
                  </button>
                ))}
              </div>
            </div>
            <table className="hist-table" data-testid="sold-table">
              <thead>
                <tr>
                  <th>Vaqt</th><th>Chek №</th><th>Xona</th><th>Mahsulot / xizmat</th>
                  <th className="r">Soni</th><th className="r">Narxi</th><th className="r">Summa</th><th>Sotgan xodim</th><th>Ofitsiant</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const gone = r.qty - r.returnedQty <= 0
                  return (
                    <tr key={r.lineId} className="hist-row" data-testid="sold-row" onClick={() => setOpenId(r.sessionId)}>
                      <td className="nowrap num"><div>{formatClock(r.at)}</div><div className="hist-sub">{formatDateShort(r.at)}</div></td>
                      <td className="num">{r.receiptNo != null ? '№' + r.receiptNo : '—'}</td>
                      <td>{r.roomName}</td>
                      <td className="hist-wrap">
                        <span className={gone ? 'hist-strike hist-nm' : 'hist-nm'}>{r.name}</span>
                        {r.kind === 'service' && <> <Badge tone="info" size="sm">Xizmat</Badge></>}
                      </td>
                      <td className="r num">
                        {r.returnedQty > 0 ? <><s>{r.qty}</s> {r.qty - r.returnedQty}</> : r.qty}
                      </td>
                      <td className="r num">{formatMoney(r.unitPrice)}</td>
                      <td className="r"><Money value={r.amount} size="md" currency={false} /></td>
                      <td className="hist-who" data-testid="sold-by">{r.staffName}</td>
                      <td>{r.waiterName || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

          </div>
        </>
      )}
      {openId != null && <DetailDialog sessionId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
