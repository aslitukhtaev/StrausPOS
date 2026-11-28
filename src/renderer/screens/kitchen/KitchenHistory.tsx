/** Oshxona tarixi: oshxonaga aynan nima sotilgan, qaysi sessiyada (chek №, xona), kim qo'shgan, ofitsiant. Vaqt oralig'i soat bilan. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KitchenSaleRow, ReportRange } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, Card, EmptyState, Input, Money, Segmented, Spinner, formatDateTime, formatMoney, getNow, toast } from '@/ui'
import { addDays, fromInputDT, startOfDay, toInputDT } from '../history/common'

type Quick = 'today' | 'yesterday' | 'week' | 'custom'
const quickRange = (q: Exclude<Quick, 'custom'>, now: number): ReportRange => {
  const today = startOfDay(now)
  if (q === 'today') return { from: today, to: now + 60_000 }
  if (q === 'yesterday') return { from: addDays(today, -1), to: today }
  return { from: addDays(today, -6), to: now + 60_000 }
}

export function KitchenHistory() {
  const [quick, setQuick] = useState<Quick>('today')
  const [fromStr, setFromStr] = useState(() => toInputDT(startOfDay(getNow())))
  const [toStr, setToStr] = useState(() => toInputDT(getNow()))
  const [range, setRange] = useState<ReportRange>(() => quickRange('today', getNow()))
  const [rows, setRows] = useState<KitchenSaleRow[] | null>(null)
  const [q, setQ] = useState('')
  const seq = useRef(0)

  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setRows(null)
    api.kitchen
      .history(r)
      .then((x) => my === seq.current && setRows(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setRows([])
      })
  }, [])
  useEffect(() => load(range), [range, load])

  const pick = (v: Quick) => {
    setQuick(v)
    if (v !== 'custom') {
      const r = quickRange(v, getNow())
      setRange(r)
      setFromStr(toInputDT(r.from))
      setToStr(toInputDT(r.to - 1))
    }
  }
  const apply = () => {
    const f = fromInputDT(fromStr)
    const t = fromInputDT(toStr)
    if (f === null || t === null) return toast.warning('Sana va vaqtni kiriting')
    if (t < f) return toast.warning("Oxirgi vaqt boshlanishidan oldin bo'lishi mumkin emas")
    setRange({ from: f, to: t + 60_000 })
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^№\s*/, '')
    return (rows || []).filter((r) => !needle || [r.name, r.roomName, r.addedBy, r.waiterName || '', String(r.receiptNo ?? '')].join(' ').toLowerCase().indexOf(needle) >= 0)
  }, [rows, q])
  const totalQty = shown.reduce((a, r) => a + (r.qty - r.returnedQty), 0)
  const totalSum = shown.reduce((a, r) => a + r.amount, 0)

  // Mahsulot bo'yicha jami
  const byProduct = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; amount: number }>()
    for (const r of shown) {
      const x = m.get(r.name) ?? { name: r.name, qty: 0, amount: 0 }
      x.qty += r.qty - r.returnedQty
      x.amount += r.amount
      m.set(r.name, x)
    }
    return Array.from(m.values()).filter((x) => x.qty > 0).sort((a, b) => b.amount - a.amount)
  }, [shown])

  return (
    <div className="kt-range" data-testid="kt-history">
      <div className="kt-range__bar">
        <Segmented<Quick>
          size="lg" value={quick} onChange={pick}
          options={[
            { value: 'today', label: 'Bugun' }, { value: 'yesterday', label: 'Kecha' }, { value: 'week', label: '7 kun' },
            { value: 'custom', label: 'Oraliq (soat bilan)', icon: 'calendar' }
          ]}
        />
        {quick === 'custom' && (
          <div className="kt-range__custom">
            <Input size="lg" type="datetime-local" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish vaqti" />
            <span>–</span>
            <Input size="lg" type="datetime-local" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi vaqt" />
            <Button variant="primary" icon="check" onClick={apply}>Ko'rsatish</Button>
          </div>
        )}
        <Input size="lg" icon="search" placeholder="Mahsulot, xona, chek №, xodim..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="kt-hist-search" />
      </div>

      {!rows && <div className="kt-center"><Spinner size={40} /></div>}
      {rows && shown.length === 0 && <EmptyState size="lg" icon="flame" title="Oshxonaga hech narsa sotilmagan" description="Tanlangan oraliqda oshxona mahsuloti qo'shilmagan." />}
      {rows && shown.length > 0 && (
        <>
          <Card padding="md" className="kt-hist-sum" data-testid="kt-hist-sum">
            <span><b className="num">{totalQty}</b> dona</span>
            <span>Jami <b className="num">{formatMoney(totalSum)}</b> so'm</span>
            {byProduct.slice(0, 6).map((p) => <Badge key={p.name} tone="neutral" size="md">{p.name} × {p.qty}</Badge>)}
          </Card>
          <Card padding="none">
            <table className="ui-table kt-table" data-testid="kt-hist-table">
              <thead>
                <tr><th>Vaqt</th><th>Mahsulot</th><th className="r">Soni</th><th className="r">Narxi</th><th className="r">Summa</th><th>Sessiya</th><th>Qo'shdi</th><th>Ofitsiant</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.lineId} className={r.qty - r.returnedQty <= 0 ? 'is-returned' : undefined}>
                    <td className="num nowrap">{formatDateTime(r.at)}</td>
                    <td>{r.name}{r.returnedQty > 0 && <span className="subtle"> (qaytarilgan {r.returnedQty})</span>}</td>
                    <td className="r num">{r.qty - r.returnedQty}</td>
                    <td className="r"><Money value={r.unitPrice} size="sm" currency={false} /></td>
                    <td className="r"><Money value={r.amount} size="sm" currency={false} /></td>
                    <td>{r.roomName} · {r.receiptNo != null ? 'chek №' + r.receiptNo : r.status === 'open' ? 'ochiq' : '—'}</td>
                    <td>{r.addedBy || '—'}</td>
                    <td>{r.waiterName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
