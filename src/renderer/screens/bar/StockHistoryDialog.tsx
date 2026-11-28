/**
 * Ombor tarixi (Bar sahifasidagi soat tugmasi): qachon, qaysi mahsulotdan, qancha qo'shilgan/chiqarilgan va kim qilgan.
 * Kunlar bo'yicha guruhlanadi; filtrlar: davr (smena va soat:daqiqa ham), turi, mahsulot, kategoriya, xodim, qidiruv.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportRange, StockHistoryRow, StockMoveKind } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, Card, EmptyState, Input, Modal, Segmented, Select, Spinner, formatClock, formatDateShort, getNow, toast } from '@/ui'
import { DateFilter } from '../history/DateFilter'
import { presetRange, startOfDay } from '../history/common'
import '../history/history.css'

type Kind = StockMoveKind | 'all'

const KIND: Record<StockMoveKind, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  in: { label: "Qo'shilgan", tone: 'success' },
  out: { label: 'Chiqim', tone: 'warning' },
  sale: { label: 'Sotuv', tone: 'info' },
  return: { label: 'Qaytarish', tone: 'neutral' }
}

/** Takrorlanmas (id, nom) ro'yxati, nom bo'yicha tartiblangan */
function options(rows: StockHistoryRow[], pick: (r: StockHistoryRow) => [number | null, string]): [number, string][] {
  const m = new Map<number, string>()
  for (const r of rows) {
    const [id, name] = pick(r)
    if (id != null) m.set(id, name)
  }
  return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
}

const signed = (n: number) => (n > 0 ? '+' + n : String(n))

export function StockHistoryDialog({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<ReportRange>(() => presetRange('week', getNow()))
  const [rows, setRows] = useState<StockHistoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState<Kind>('in')
  const [product, setProduct] = useState('all')
  const [category, setCategory] = useState('all')
  const [staff, setStaff] = useState('all')
  const [q, setQ] = useState('')
  const seq = useRef(0)

  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setRows(null)
    setFailed(false)
    api.catalog
      .stockHistory(r)
      .then((x) => my === seq.current && setRows(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
      })
  }, [])
  useEffect(() => load(range), [range, load])

  const all = rows || []
  const products = useMemo(() => options(rows || [], (r) => [r.productId, r.productName]), [rows])
  const categories = useMemo(() => options(rows || [], (r) => [r.categoryId, r.categoryName]), [rows])
  const people = useMemo(() => options(rows || [], (r) => [r.staffId, r.staffName]), [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows || []).filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (product === 'all' || String(r.productId) === product) &&
        (category === 'all' || String(r.categoryId) === category) &&
        (staff === 'all' || String(r.staffId) === staff) &&
        (!needle || r.productName.toLowerCase().includes(needle) || r.reason.toLowerCase().includes(needle))
    )
  }, [rows, kind, product, category, staff, q])

  const days = useMemo(() => {
    const m = new Map<number, StockHistoryRow[]>()
    for (const r of shown) {
      const d = startOfDay(r.at)
      const list = m.get(d)
      if (list) list.push(r)
      else m.set(d, [r])
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0])
  }, [shown])

  const added = shown.reduce((a, r) => a + (r.delta > 0 ? r.delta : 0), 0)
  const removed = shown.reduce((a, r) => a + (r.delta < 0 ? -r.delta : 0), 0)

  /** Mahsulotlar bo'yicha jami (tanlangan davr va filtrlar uchun) */
  const byProduct = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number }>()
    for (const r of shown) {
      const x = m.get(r.productId) || { id: r.productId, name: r.productName, n: 0 }
      x.n += r.delta
      m.set(r.productId, x)
    }
    return Array.from(m.values()).sort((a, b) => Math.abs(b.n) - Math.abs(a.n))
  }, [shown])

  return (
    <Modal open onClose={onClose} size="full" title="Ombor tarixi" subtitle="Qachon, nima, qancha qo'shilgan va kim qo'shgan"
      footer={<><span className="spacer" /><Button size="lg" variant="secondary" onClick={onClose}>Yopish</Button></>}>
      <div className="hist bar-history" data-testid="stock-history">
        <div className="hist-filters"><DateFilter initial="week" onChange={setRange} /></div>
        <div className="hist-filters">
          <Segmented<Kind>
            size="lg" value={kind} onChange={setKind}
            options={[
              { value: 'in', label: "Qo'shilgan" },
              { value: 'out', label: 'Chiqim' },
              { value: 'sale', label: 'Sotuv' },
              { value: 'return', label: 'Qaytarish' },
              { value: 'all', label: 'Hammasi' }
            ]}
          />
        </div>
        <div className="hist-filters">
          <div className="hist-sel"><Select size="lg" value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Mahsulot">
            <option value="all">Barcha mahsulotlar</option>
            {products.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select></div>
          <div className="hist-sel"><Select size="lg" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategoriya">
            <option value="all">Barcha kategoriyalar</option>
            {categories.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select></div>
          <div className="hist-sel"><Select size="lg" value={staff} onChange={(e) => setStaff(e.target.value)} aria-label="Xodim">
            <option value="all">Barcha xodimlar</option>
            {people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select></div>
          <div className="hist-search"><Input size="lg" icon="search" placeholder="Mahsulot yoki izoh…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>

        {failed ? (
          <EmptyState icon="alert" title="Tarixni yuklab bo'lmadi" action={<Button icon="refresh" onClick={() => load(range)}>Qayta urinish</Button>} />
        ) : !rows ? (
          <div className="hist-center"><Spinner size={40} /></div>
        ) : shown.length === 0 ? (
          <EmptyState icon="inbox" size="lg" title="Yozuv topilmadi" description={all.length ? "Filtrni o'zgartirib ko'ring." : 'Bu davrda omborda harakat bo\'lmagan.'} />
        ) : (
          <>
            <div className="hist-kpis">
              <Card padding="md"><div className="hist-kpi__l">Omborga qo'shilgan</div><div className="hist-kpi__v num t-success" data-testid="stock-added">+{added} dona</div></Card>
              <Card padding="md"><div className="hist-kpi__l">Ombordan ketgan</div><div className="hist-kpi__v num">{removed ? '−' + removed : 0} dona</div></Card>
              <Card padding="md"><div className="hist-kpi__l">Amallar soni</div><div className="hist-kpi__v num">{shown.length} ta</div></Card>
            </div>

            <div>
              <h3 className="hist-h">Mahsulotlar bo'yicha <span className="hist-sub">— bosing, mahsulot filtri o'rnatiladi</span></h3>
              <div className="hist-bystaff-list">
                {byProduct.map((x) => (
                  <button type="button" key={x.id} className={'hist-bs' + (String(x.id) === product ? ' is-on' : '')}
                    onClick={() => setProduct(String(x.id) === product ? 'all' : String(x.id))}>
                    <span className="hist-bs__n">{x.name}</span>
                    <span className="num">{signed(x.n)}</span>
                  </button>
                ))}
              </div>
            </div>

            <table className="hist-table" data-testid="stock-table">
              <thead>
                <tr><th>Vaqt</th><th>Mahsulot</th><th>Kategoriya</th><th>Turi</th><th className="r">Soni</th><th>Izoh</th><th>Chek / xona</th><th>Kim</th></tr>
              </thead>
              {days.map(([day, list]) => {
                const plus = list.reduce((a, r) => a + (r.delta > 0 ? r.delta : 0), 0)
                const minus = list.reduce((a, r) => a + (r.delta < 0 ? -r.delta : 0), 0)
                return (
                  <tbody key={day}>
                    <tr className="hist-total" data-testid="stock-day">
                      <td colSpan={8}>
                        <b>{formatDateShort(day)}</b>
                        {plus > 0 && <> · <span className="t-success">+{plus} qo'shilgan</span></>}
                        {minus > 0 && <> · −{minus} chiqqan</>}
                        <span className="hist-sub"> · {list.length} ta amal</span>
                      </td>
                    </tr>
                    {list.map((r) => (
                      <tr key={r.id} data-testid="stock-row">
                        <td className="num">{formatClock(r.at)}</td>
                        <td className="hist-nm">{r.productName}</td>
                        <td>{r.categoryName}</td>
                        <td><Badge tone={KIND[r.kind].tone} size="sm">{KIND[r.kind].label}</Badge></td>
                        <td className={'r num t-bold' + (r.delta > 0 ? ' t-success' : '')}>{signed(r.delta)}</td>
                        <td className="hist-wrap">{r.reason || '—'}</td>
                        <td>{r.kind === 'sale' || r.kind === 'return' ? (r.receiptNo != null ? '№' + r.receiptNo + ' · ' : '') + (r.roomName || '—') : '—'}</td>
                        <td className="hist-who">{r.staffName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </>
        )}
      </div>
    </Modal>
  )
}
