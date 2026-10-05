/**
 * Sof foyda — tushum − tannarx − ofitsiant haqi − oshxona ulushi − xarajatlar (`profit.report`).
 * Hisob backendda; bu yerda faqat ko'rsatiladi.
 */
import { useEffect, useRef, useState } from 'react'
import type { ProfitReport, ReportRange } from '@shared/types'
import { api } from '@/api'
import { useNav } from '@/store/nav'
import { Button, Card, EmptyState, Icon, Money, PageHeader, Spinner, cx, formatMoney, toast } from '@/ui'
import { RangePicker, initialRange } from '../expenses/RangePicker'
import { CAT_COLORS, dayDMY, dayShort } from '../expenses/range'
import './profit.css'

function Chart({ days }: { days: ProfitReport['byDay'] }) {
  const W = 900
  const H = 240
  const L = 8
  const B = 28
  const T = 12
  const vals = days.flatMap((d) => [d.revenue, d.expenses, d.profit, 0])
  const max = Math.max(1, ...vals)
  const min = Math.min(0, ...vals)
  const span = max - min
  const x = (i: number) => L + (days.length === 1 ? (W - L) / 2 : (i * (W - L - 8)) / (days.length - 1))
  const y = (v: number) => T + ((max - v) / span) * (H - T - B)
  const line = (k: 'revenue' | 'expenses' | 'profit') => days.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d[k]).toFixed(1)).join(' ')
  const step = Math.max(1, Math.ceil(days.length / 10))
  return (
    <svg className="pf-svg" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Kunlar bo'yicha tushum, xarajat va foyda" data-testid="pf-chart">
      <line className="pf-svg__zero" x1={L} x2={W} y1={y(0)} y2={y(0)} />
      <path className="pf-svg__line is-rev" d={line('revenue')} />
      <path className="pf-svg__line is-exp" d={line('expenses')} />
      <path className="pf-svg__line is-profit" d={line('profit')} />
      {days.length <= 40 && days.map((d, i) => <circle key={d.day} className="pf-svg__dot" cx={x(i)} cy={y(d.profit)} r={3.5} />)}
      {days.map((d, i) => i % step === 0 && (
        <text key={d.day} className="pf-svg__tick" x={x(i)} y={H - 6} textAnchor="middle">{dayShort(d.day)}</text>
      ))}
    </svg>
  )
}

export default function ProfitScreen() {
  const go = useNav((s) => s.go)
  const [range, setRange] = useState<ReportRange>(() => initialRange('month'))
  const [rep, setRep] = useState<ProfitReport | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  useEffect(() => {
    const my = ++seq.current
    setLoading(true)
    api.profit
      .report(range)
      .then((r) => {
        if (my !== seq.current) return
        setRep(r)
        setLoading(false)
      })
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setLoading(false)
      })
  }, [range])

  const r = rep
  const positive = !!r && r.netProfit >= 0
  const days = r ? r.byDay.filter((d) => d.revenue !== 0 || d.expenses !== 0 || d.profit !== 0) : []

  return (
    <div className="pf">
      <PageHeader title="Sof foyda" icon="percent" subtitle="Tushumdan barcha xarajatlar ayirilgandan keyingi foyda" />
      <RangePicker initial="month" onChange={setRange} />

      {!r ? (
        <div className="pf-center">{loading ? <Spinner size={40} /> : <EmptyState icon="alert" title="Hisobotni yuklab bo'lmadi" description="Davrni qayta tanlang." />}</div>
      ) : (
        <div className={cx('pf__content', loading && 'is-loading')}>
          {r.noCostSales > 0 && (
            <div className="pf-warn" role="alert" data-testid="pf-warn">
              <Icon name="alert" size={28} />
              <div className="pf-warn__text">
                Tannarxi kiritilmagan mahsulotlar sotuvi: <b className="num">{formatMoney(r.noCostSales)} so'm</b> — foyda aniq emas
              </div>
              <Button variant="secondary" icon="bar" onClick={() => go('bar')}>Bar sahifasiga o'tish</Button>
            </div>
          )}

          <div className="pf-top">
            <Card tone={positive ? 'success' : 'danger'} padding="lg" className="pf-hero" data-testid="pf-hero">
              <div className="pf-hero__label">SOF FOYDA</div>
              <Money value={r.netProfit} size="3xl" tone={positive ? 'success' : 'danger'} className="pf-hero__val" />
              <div className={cx('pf-hero__margin', positive ? 't-success' : 't-danger')} data-testid="pf-margin">
                Marja: <b className="num">{(Math.round(r.marginPct * 10) / 10).toString().replace('.', ',')}%</b>
              </div>
            </Card>

            <Card padding="none" className="pf-calc">
              <table className="ui-table pf-table" data-testid="pf-table">
                <tbody>
                  <tr>
                    <td>
                      Tushum
                      <div className="pf-sub">shundan obsluga: <span className="num">{formatMoney(r.serviceCharge)} so'm</span></div>
                    </td>
                    <td className="r"><Money value={r.revenue} size="lg" /></td>
                  </tr>
                  <tr><td>− Tannarx</td><td className="r"><Money value={r.cogs} size="lg" tone="muted" /></td></tr>
                  <tr><td>− Ofitsiant haqi</td><td className="r"><Money value={r.waiterCommission} size="lg" tone="muted" /></td></tr>
                  <tr><td>− Oshxona ulushi</td><td className="r"><Money value={r.kitchenDue} size="lg" tone="muted" /></td></tr>
                  <tr><td>− Xarajatlar</td><td className="r"><Money value={r.expenses} size="lg" tone="muted" /></td></tr>
                  <tr className="pf-table__net">
                    <td>= Sof foyda</td>
                    <td className="r"><Money value={r.netProfit} size="xl" tone={positive ? 'success' : 'danger'} /></td>
                  </tr>
                  <tr className="pf-table__info">
                    <td>Qarzga yozilgan (hali tushmagan)</td>
                    <td className="r"><Money value={r.debtIssued} size="md" tone="muted" /></td>
                  </tr>
                </tbody>
              </table>
              <div className="pf-hint">
                Hisob hisoblangan summalar bo'yicha: ofitsiant haqi va oshxona ulushi berilgan pul emas, hisoblangan summa.
              </div>
            </Card>
          </div>

          <div className="pf-row">
            <Card title="Xarajatlar kategoriya bo'yicha" padding="lg">
              {r.expensesByCategory.length === 0 ? (
                <div className="pf-mute">Bu davrda xarajat yo'q</div>
              ) : (
                <div className="pf-bars">
                  {r.expensesByCategory.slice().sort((a, b) => b.amount - a.amount).map((c, i, arr) => (
                    <div key={c.categoryId}>
                      <div className="pf-bar__head">
                        <span className="ellipsis">{c.name}</span>
                        <Money value={c.amount} size="sm" />
                      </div>
                      <div className="pf-bar__track">
                        <div className="pf-bar__fill" style={{ width: Math.max(2, (c.amount / (arr[0].amount || 1)) * 100) + '%', background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Kunlar bo'yicha" padding="lg">
              {days.length === 0 ? (
                <div className="pf-mute">Bu davrda ma'lumot yo'q</div>
              ) : (
                <>
                  <div className="pf-legend">
                    <span><i className="pf-dot is-rev" />Tushum</span>
                    <span><i className="pf-dot is-exp" />Xarajat</span>
                    <span><i className="pf-dot is-profit" />Foyda</span>
                  </div>
                  <Chart days={r.byDay} />
                </>
              )}
            </Card>
          </div>

          {days.length > 0 && (
            <Card padding="none">
              <table className="ui-table" data-testid="pf-days">
                <thead>
                  <tr><th>Kun</th><th className="r">Tushum</th><th className="r">Xarajat</th><th className="r">Foyda</th></tr>
                </thead>
                <tbody>
                  {days.slice().reverse().map((d) => (
                    <tr key={d.day}>
                      <td className="num">{dayDMY(d.day)}</td>
                      <td className="r"><Money value={d.revenue} /></td>
                      <td className="r"><Money value={d.expenses} tone="muted" /></td>
                      <td className="r"><Money value={d.profit} tone={d.profit >= 0 ? 'success' : 'danger'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
