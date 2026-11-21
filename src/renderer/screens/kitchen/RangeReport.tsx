/** Oshxona hisobi — ixtiyoriy vaqt oralig'i (sana + soat:daqiqa) bo'yicha: jami, kunlar kesimi, berilgan pullar. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KitchenRangeReport, ReportRange } from '@shared/types'
import { api } from '@/api'
import { Button, Card, EmptyState, Input, Money, Segmented, Spinner, formatDateTime, formatMoney, getNow, toast } from '@/ui'
import { addDays, fromInputDT, startOfDay, toInputDT } from '../history/common'

type Quick = 'today' | 'yesterday' | 'week' | 'custom'

const quickRange = (q: Exclude<Quick, 'custom'>, now: number): ReportRange => {
  const today = startOfDay(now)
  if (q === 'today') return { from: today, to: now + 60_000 }
  if (q === 'yesterday') return { from: addDays(today, -1), to: today }
  return { from: addDays(today, -6), to: now + 60_000 }
}

export function RangeReport() {
  const [quick, setQuick] = useState<Quick>('today')
  const [fromStr, setFromStr] = useState(() => toInputDT(startOfDay(getNow())))
  const [toStr, setToStr] = useState(() => toInputDT(getNow()))
  const [range, setRange] = useState<ReportRange>(() => quickRange('today', getNow()))
  const [data, setData] = useState<KitchenRangeReport | null>(null)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)

  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setFailed(false)
    api.kitchen
      .range(r)
      .then((x) => my === seq.current && setData(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
      })
  }, [])
  useEffect(() => load(range), [range, load])

  const pick = (q: Quick) => {
    setQuick(q)
    if (q !== 'custom') {
      const r = quickRange(q, getNow())
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

  return (
    <div className="kt-range" data-testid="kt-range">
      <div className="kt-range__bar">
        <Segmented<Quick>
          size="lg"
          value={quick}
          onChange={pick}
          options={[
            { value: 'today', label: 'Bugun' },
            { value: 'yesterday', label: 'Kecha' },
            { value: 'week', label: '7 kun' },
            { value: 'custom', label: 'Oraliq (soat bilan)', icon: 'calendar' }
          ]}
        />
        {quick === 'custom' && (
          <div className="kt-range__custom">
            <Input size="lg" type="datetime-local" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish vaqti" data-testid="kt-from" />
            <span>–</span>
            <Input size="lg" type="datetime-local" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi vaqt" data-testid="kt-to" />
            <Button variant="primary" icon="check" onClick={apply} data-testid="kt-apply">Ko'rsatish</Button>
          </div>
        )}
      </div>

      {!data && !failed && <div className="kt-center"><Spinner size={40} /></div>}
      {failed && <EmptyState size="lg" icon="alert" title="Hisobni yuklab bo'lmadi" action={<Button icon="refresh" onClick={() => load(range)}>Qayta urinish</Button>} />}

      {data && (
        <>
          <Card padding="lg" tone="accent" className="kt-today" data-testid="kt-range-sum">
            <div className="kt-today__label">
              {formatDateTime(data.range.from)} – {formatDateTime(data.range.to - 1)} · {data.orders} ta buyurtma
            </div>
            <div className="kt-today__grid">
              <div className="kt-stat"><span className="kt-stat__label">Oshxona savdosi</span><Money value={data.sales} size="xl" /></div>
              <div className="kt-stat"><span className="kt-stat__label">Oshxonaga tegishli</span><Money value={data.due} size="xl" /></div>
              <div className="kt-stat"><span className="kt-stat__label">Berilgan</span><Money value={data.paid} size="xl" /></div>
              <div className="kt-stat is-main">
                <span className="kt-stat__label">Qoldiq</span>
                <Money value={data.balance} size="3xl" tone={data.balance < 0 ? 'danger' : 'accent'} />
              </div>
            </div>
          </Card>

          {data.days.length === 0 ? (
            <EmptyState size="lg" icon="flame" title="Bu oraliqda oshxona savdosi va pul berish yo'q" />
          ) : (
            <Card padding="none">
              <table className="ui-table kt-table" data-testid="kt-range-days">
                <thead>
                  <tr><th>Kun</th><th className="r">Buyurtmalar</th><th className="r">Savdo</th><th className="r">Oshxonaga</th><th className="r">Berilgan</th><th className="r">Qoldiq</th></tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.day}>
                      <td className="num">{d.day.slice(8, 10) + '.' + d.day.slice(5, 7) + '.' + d.day.slice(0, 4)}</td>
                      <td className="r num">{d.orders}</td>
                      <td className="r"><Money value={d.sales} size="md" currency={false} /></td>
                      <td className="r"><Money value={d.due} size="md" currency={false} /></td>
                      <td className="r"><Money value={d.paid} size="md" currency={false} /></td>
                      <td className="r"><Money value={d.balance} size="md" currency={false} tone={d.balance < 0 ? 'danger' : 'default'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {data.payouts.length > 0 && (
            <Card title="Berilgan pullar" subtitle={data.payouts.length + ' ta, jami ' + formatMoney(data.paid) + " so'm"} padding="md">
              <ul className="kt-payouts" data-testid="kt-range-payouts">
                {data.payouts.map((p) => (
                  <li key={p.id} className="kt-payout">
                    <div className="kt-payout__main">
                      <span className="num">{formatDateTime(p.at)}</span>
                      {p.note && <span className="kt-payout__note">{p.note}</span>}
                    </div>
                    <Money value={p.amount} size="md" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
