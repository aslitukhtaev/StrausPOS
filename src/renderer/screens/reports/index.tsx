/**
 * Hisobot ekrani: davr tanlash, KPI, to'lov ulushi, kunlar grafigi (SVG), xonalar, mahsulotlar,
 * xizmat ko'rsatuvchilar, kassirlar va qaytarishlar. Tashqi kutubxonasiz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportRange, SalesReport } from '@shared/types'
import type { IconName } from '../../ui'
import { api } from '../../api'
import { useApp } from '../../store/app'
import { useNav } from '../../store/nav'
import {
  Button, Card, EmptyState, Field, Icon, Input, Money, PageHeader, Segmented, Spinner, formatDate, formatDateShort,
  formatDateTime, formatMoney, getNow, toast, cx
} from '../../ui'
import './reports.css'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
type ReturnRow = Awaited<ReturnType<typeof api.reports.returns>>[number]

const DAY = 86_400_000
const startOfDay = (ts: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
/** Kalendar kuni qo'shish (DST xavfsiz) */
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
  switch (p) {
    case 'today': return { from: today, to: tomorrow }
    case 'yesterday': return { from: addDays(today, -1), to: today }
    case 'week': return { from: addDays(today, -6), to: tomorrow }
    case 'month': {
      const d = new Date(today)
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: tomorrow }
    }
  }
}

function rangeLabel(r: ReportRange): string {
  const last = r.to - 1
  return startOfDay(r.from) === startOfDay(last) ? formatDate(r.from, false) : formatDateShort(r.from) + ' – ' + formatDateShort(last)
}

const METHODS = [
  { key: 'cash', label: 'Naqd', color: 'var(--free-fill)', icon: 'cash' },
  { key: 'card', label: 'Karta', color: 'var(--info)', icon: 'card' },
  { key: 'terminal', label: 'Terminal', color: 'var(--busy-fill)', icon: 'receipt' },
  { key: 'debt', label: 'Qarz', color: 'var(--danger)', icon: 'wallet' }
] as const

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0)

export default function ReportsScreen() {
  const businessName = useApp((s) => s.businessName)
  const go = useNav((s) => s.go)
  const [preset, setPreset] = useState<Preset>('today')
  const [fromStr, setFromStr] = useState(() => toInput(getNow()))
  const [toStr, setToStr] = useState(() => toInput(getNow()))
  const [range, setRange] = useState<ReportRange>(() => presetRange('today', getNow()))
  const [data, setData] = useState<{ sales: SalesReport; returns: ReturnRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)

  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setLoading(true)
    setFailed(false)
    Promise.all([api.reports.sales(r), api.reports.returns(r)])
      .then(([sales, returns]) => {
        if (my !== seq.current) return
        setData({ sales, returns })
        setLoading(false)
      })
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
        setLoading(false)
      })
  }, [])

  useEffect(() => load(range), [range, load])

  const pickPreset = (p: Preset) => {
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

  const s = data?.sales
  const empty = !!s && s.sessionsCount === 0 && (s.barSales ? s.barSales.count : 0) === 0 && data!.returns.length === 0

  return (
    <div className="rep">
      <PageHeader
        title="Hisobot"
        icon="reports"
        subtitle={rangeLabel(range)}
        actions={
          <>
            <Button variant="ghost" icon="flame" onClick={() => go('kitchen')}>
              Oshxona hisobi
            </Button>
            <Button variant="secondary" icon="printer" onClick={() => window.print()} disabled={!data}>
              Chop etish
            </Button>
          </>
        }
      />

      <div className="rep-print-head">
        <div className="rep-print-head__biz">{businessName || 'Delfin Sauna'}</div>
        <div>Savdo hisoboti: {rangeLabel(range)}</div>
        <div>Chop etildi: {formatDateTime(getNow())}</div>
      </div>

      <div className="rep-period">
        <Segmented
          size="lg"
          value={preset}
          onChange={(v) => pickPreset(v as Preset)}
          options={[
            { value: 'today', label: 'Bugun' },
            { value: 'yesterday', label: 'Kecha' },
            { value: 'week', label: '7 kun' },
            { value: 'month', label: 'Bu oy' },
            { value: 'custom', label: 'Oraliq', icon: 'calendar' }
          ]}
        />
        {preset === 'custom' && (
          <div className="rep-period__custom">
            <Field label="Dan">
              <Input type="date" value={fromStr} max={toStr || undefined} onChange={(e) => setFromStr(e.target.value)} />
            </Field>
            <Field label="Gacha">
              <Input type="date" value={toStr} min={fromStr || undefined} onChange={(e) => setToStr(e.target.value)} />
            </Field>
            <Button variant="primary" icon="check" onClick={applyCustom}>Ko'rsatish</Button>
          </div>
        )}
        {loading && data && <Spinner size={24} />}
      </div>

      {!data && loading && <div className="rep-center"><Spinner size={40} /></div>}
      {!data && failed && (
        <EmptyState
          size="lg"
          icon="alert"
          title="Hisobotni yuklab bo'lmadi"
          action={<Button variant="primary" icon="refresh" onClick={() => load(range)}>Qayta urinish</Button>}
        />
      )}

      {s && empty && (
        <EmptyState
          size="lg"
          icon="reports"
          title="Bu davrda savdo bo'lmagan"
          description={rangeLabel(range) + ' oralig\'ida yopilgan sessiya ham, qaytarish ham yo\'q. Boshqa davrni tanlang.'}
          action={preset !== 'week' ? <Button variant="secondary" onClick={() => pickPreset('week')}>Oxirgi 7 kunni ko'rish</Button> : undefined}
        />
      )}

      {s && !empty && (
        <div className={cx('rep__content', loading && 'is-loading')}>
          <Kpis s={s} />

          <div className="rep-row rep-row--pay">
            <PaymentShare s={s} />
            <DayChart s={s} range={range} />
          </div>

          <div className="rep-row">
            <Card title="Xonalar bo'yicha" subtitle="Tushum va sessiyalar" padding="md">
              {s.byRoom.length === 0 ? <Mute>Ma'lumot yo'q</Mute> : (
                <BarList
                  rows={s.byRoom.map((r) => ({ key: r.roomId, label: r.roomId === 0 ? r.roomName || 'Bar (xonasiz)' : r.roomName, value: r.total, extra: r.sessions + (r.roomId === 0 ? ' ta savdo' : ' ta sessiya') }))}
                />
              )}
            </Card>
            <TableCard title="Eng ko'p sotilgan mahsulotlar" subtitle="Qaytarilganlar chiqarilgan">
              {s.byProduct.length === 0 ? <div className="rep-pad"><Mute>Mahsulot sotilmagan</Mute></div> : (
                <table className="ui-table rep-table">
                  <thead><tr><th>#</th><th>Mahsulot</th><th className="r">Soni</th><th className="r">Summa</th></tr></thead>
                  <tbody>
                    {s.byProduct.slice(0, 10).map((p, i) => (
                      <tr key={p.name}>
                        <td className="rep-table__n">{i + 1}</td>
                        <td>{p.name}</td>
                        <td className="r num">{p.qty}</td>
                        <td className="r"><Money value={p.amount} size="sm" currency={false} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
          </div>

          <div className="rep-row">
            <TableCard title="Xizmat ko'rsatuvchilar" subtitle="Ko'rsatilgan xizmatlar summasi (ulush emas)">
              {s.byProvider.length === 0 ? <div className="rep-pad"><Mute>Xizmat ko'rsatilmagan</Mute></div> : (
                <table className="ui-table rep-table">
                  <thead><tr><th>Xodim</th><th className="r">Xizmatlar</th><th className="r">Summa</th></tr></thead>
                  <tbody>
                    {s.byProvider.map((p) => (
                      <tr key={p.staffId}>
                        <td>{p.name || '—'}</td>
                        <td className="r num">{p.count} ta</td>
                        <td className="r"><Money value={p.amount} size="sm" currency={false} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
            <TableCard title="Kassirlar bo'yicha" subtitle="Hisobni yopgan xodim">
              {s.byStaff.length === 0 ? <div className="rep-pad"><Mute>Ma'lumot yo'q</Mute></div> : (
                <table className="ui-table rep-table">
                  <thead><tr><th>Xodim</th><th className="r">Sessiyalar</th><th className="r">Tushum</th></tr></thead>
                  <tbody>
                    {s.byStaff.map((p) => (
                      <tr key={p.staffId}>
                        <td>{p.name || '—'}</td>
                        <td className="r num">{p.sessions} ta</td>
                        <td className="r"><Money value={p.total} size="sm" currency={false} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
          </div>

          <TableCard
            title="Ofitsiantlar"
            subtitle="Ofitsiant o'zi olib borgan bar va oshxona mahsulotlaridan (qaytarishlar ayirilgan); xizmatlar va xona vaqti kirmaydi"
            actions={<Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => go('waiters')}>Oylik hisob</Button>}
          >
            {s.byWaiter.length === 0 ? <div className="rep-pad"><Mute>Ofitsiantlar olib borgan buyurtma yo'q</Mute></div> : (
              <table className="ui-table rep-table" data-testid="rep-waiters">
                <thead><tr><th>Ofitsiant</th><th className="r">Sessiyalar</th><th className="r">Olib borgani</th><th className="r">Haq</th></tr></thead>
                <tbody>
                  {s.byWaiter.map((w) => (
                    <tr key={w.staffId}>
                      <td>{w.name || '—'}</td>
                      <td className="r num">{w.sessions} ta</td>
                      <td className="r"><Money value={w.productSales} size="sm" currency={false} /></td>
                      <td className="r"><Money value={w.commission} size="sm" currency={false} tone="accent" /></td>
                    </tr>
                  ))}
                </tbody>
                {s.byWaiter.length > 1 && (
                  <tfoot>
                    <tr className="rep-table__total">
                      <td>Jami</td>
                      <td className="r num">{s.byWaiter.reduce((a, w) => a + w.sessions, 0)} ta</td>
                      <td className="r"><Money value={s.byWaiter.reduce((a, w) => a + w.productSales, 0)} size="sm" currency={false} /></td>
                      <td className="r"><Money value={s.byWaiter.reduce((a, w) => a + w.commission, 0)} size="sm" currency={false} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </TableCard>

          <TableCard
            title="Qaytarishlar"
            subtitle={data!.returns.length ? data!.returns.length + ' ta, jami ' + formatMoney(s.returnsAmount) + " so'm" : undefined}
          >
            {data!.returns.length === 0 ? (
              <div className="rep-pad"><Mute>Bu davrda qaytarish bo'lmagan</Mute></div>
            ) : (
              <table className="ui-table rep-table">
                <thead>
                  <tr><th>Vaqt</th><th>Mahsulot</th><th className="r">Soni</th><th className="r">Summa</th><th>Sabab</th><th>Kim</th><th>Xona</th></tr>
                </thead>
                <tbody>
                  {data!.returns.map((r, i) => (
                    <tr key={r.at + '-' + i}>
                      <td className="num nowrap">{formatDateTime(r.at)}</td>
                      <td>{r.productName}</td>
                      <td className="r num">{r.qty}</td>
                      <td className="r"><Money value={r.amount} size="sm" currency={false} /></td>
                      <td className="rep-table__reason">{r.reason || '—'}</td>
                      <td>{r.by || '—'}</td>
                      <td>{r.roomName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
        </div>
      )}
    </div>
  )
}

function TableCard({ title, subtitle, actions, children }: {
  title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Card padding="none" className="rep-tcard">
      <div className="rep-tcard__head">
        <div className="rep-tcard__titles">
          <div className="rep-tcard__title">{title}</div>
          {subtitle && <div className="rep-tcard__sub">{subtitle}</div>}
        </div>
        {actions && <div className="rep-tcard__actions">{actions}</div>}
      </div>
      {children}
    </Card>
  )
}

const Mute = ({ children }: { children: React.ReactNode }) => <div className="rep-mute">{children}</div>

/* ───────────── KPI ───────────── */
function Kpis({ s }: { s: SalesReport }) {
  const bar = s.barSales || { count: 0, total: 0 }
  const tiles: { label: string; icon: IconName; value: number; tone?: 'warning' | 'danger'; sign?: boolean }[] = [
    { label: 'Vaqt', icon: 'clock', value: s.timeRevenue },
    { label: 'Bar + oshxona', icon: 'bar', value: s.productRevenue },
    { label: 'Xizmat', icon: 'sparkles', value: s.serviceRevenue },
    { label: 'Chegirma', icon: 'percent', value: s.discounts, tone: 'warning' },
    { label: 'Qaytarilgan', icon: 'undo', value: s.returnsAmount, tone: 'danger' }
  ]
  return (
    <div className="rep-kpis">
      <Card tone="accent" padding="lg" className="rep-kpi rep-kpi--main">
        <div className="rep-kpi__label"><Icon name="cash" size={22} /> Jami tushum</div>
        <Money value={s.total} size="3xl" tone="accent" />
        <div className="rep-kpi__note">Qaytarishlar va chegirmalar hisobga olingan</div>
        <div className="rep-kpi__bar" data-testid="rep-bar-sales" title="Xonaga bog'lanmagan bar savdolari (jami tushumga kiradi, ofitsiant ulushi yo'q)">
          <div className="rep-kpi__label"><Icon name="receipt" size={22} /> Bar (xonasiz)</div>
          <div className="rep-kpi__barval">
            <span className="rep-kpi__count num">{bar.count}<span className="rep-kpi__unit"> ta</span></span>
            <Money value={bar.total} size="xl" />
          </div>
        </div>
      </Card>
      {tiles.map((t) => (
        <Card key={t.label} padding="md" className="rep-kpi">
          <div className="rep-kpi__label"><Icon name={t.icon} size={22} /> {t.label}</div>
          <Money value={t.value} size="xl" tone={t.value > 0 && t.tone ? t.tone : 'default'} />
        </Card>
      ))}
      <Card padding="md" className="rep-kpi">
        <div className="rep-kpi__label"><Icon name="rooms" size={22} /> Xona seanslari</div>
        <div className="rep-kpi__count num">{s.sessionsCount}<span className="rep-kpi__unit"> ta</span></div>
      </Card>
    </div>
  )
}

/* ───────────── To'lov turlari ───────────── */
function PaymentShare({ s }: { s: SalesReport }) {
  const bm = { cash: s.byMethod.cash || 0, card: s.byMethod.card || 0, terminal: s.byMethod.terminal || 0, debt: s.byMethod.debt || 0 }
  const dp = { cash: s.debtPayments.cash || 0, card: s.debtPayments.card || 0, terminal: s.debtPayments.terminal || 0 }
  const dpSum = dp.cash + dp.card + dp.terminal
  const sum = bm.cash + bm.card + bm.terminal + bm.debt
  return (
    <Card title="To'lov turlari" subtitle="Ulushi, jami to'lovga nisbatan" padding="md" className="rep-pay">
      {sum === 0 ? <Mute>To'lovlar yo'q</Mute> : (
        <>
          <div className="rep-stack" role="img" aria-label="To'lov turlari ulushi">
            {METHODS.map((m) => bm[m.key] > 0 && (
              <div key={m.key} className="rep-stack__seg" style={{ width: pct(bm[m.key], sum) + '%', background: m.color }} title={m.label} />
            ))}
          </div>
          <div className="rep-pay__rows">
            {METHODS.map((m) => (
              <div key={m.key} className="rep-pay__row" data-method={m.key}>
                <span className="rep-pay__dot" style={{ background: m.color }} />
                <Icon name={m.icon} size={22} />
                <span className="rep-pay__name">{m.label}</span>
                <span className="rep-pay__pct num">{pct(bm[m.key], sum)}%</span>
                <Money value={bm[m.key]} size="md" currency={false} />
              </div>
            ))}
          </div>
          {dpSum > 0 && (
            <div className="rep-pay__row rep-pay__row--debt" title="Oldingi qarzlardan shu davrda yig'ilgan pul" data-testid="rep-debt-payments">
              <Icon name="wallet" size={22} />
              <span className="rep-pay__name">
                Qarzdan undirildi
                <span className="rep-pay__sub">
                  {[
                    dp.cash ? 'naqd ' + formatMoney(dp.cash) : '',
                    dp.card ? 'karta ' + formatMoney(dp.card) : '',
                    dp.terminal ? 'terminal ' + formatMoney(dp.terminal) : ''
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Money value={dpSum} size="md" currency={false} />
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/* ───────────── Kunlar bo'yicha ustunli grafik (SVG) ───────────── */
function compact(v: number): string {
  if (v >= 1_000_000) return (Math.round(v / 10_000) / 100).toString().replace('.', ',') + ' mln'
  if (v >= 1000) return Math.round(v / 1000) + ' ming'
  return String(v)
}

/** 4 ta bo'lakka bo'linadigan "chiroyli" yuqori chegara: {step, top} */
function niceScale(v: number): { step: number; top: number } {
  if (v <= 0) return { step: 1, top: 4 }
  const raw = v / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  const step = m * pow
  return { step, top: step * Math.max(1, Math.ceil(v / step - 1e-9)) }
}

function DayChart({ s, range }: { s: SalesReport; range: ReportRange }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = useMemo(() => {
    const map = new Map(s.byDay.map((d) => [d.day, d.total]))
    const out: { key: string; ts: number; total: number }[] = []
    const first = startOfDay(range.from)
    const last = startOfDay(range.to - 1)
    const span = Math.round((last - first) / DAY) + 1
    if (span > 92) return s.byDay.map((d) => ({ key: d.day, ts: fromInput(d.day) ?? 0, total: d.total }))
    for (let t = first; t <= last; t = addDays(t, 1)) {
      const k = toInput(t)
      out.push({ key: k, ts: t, total: map.get(k) ?? 0 })
    }
    return out
  }, [s, range])

  const W = 760
  const H = 260
  const L = 88
  const R = 12
  const T = 22
  const B = 40
  const sc = niceScale(Math.max(0, ...days.map((d) => d.total)))
  const max = sc.top
  const n = Math.max(days.length, 1)
  const slot = (W - L - R) / n
  const bw = Math.min(64, slot * 0.64)
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-6; v += sc.step) ticks.push(v / max)
  const labelEvery = Math.ceil(n / 14)
  const showVals = n <= 10

  return (
    <Card title="Kunlar bo'yicha tushum" subtitle={days.length + ' kun'} padding="md" className="rep-days">
      <svg viewBox={'0 0 ' + W + ' ' + H} className="rep-svg" role="img" aria-label="Kunlar bo'yicha tushum ustunli grafigi">
        {ticks.map((t) => {
          const y = T + (H - T - B) * (1 - t)
          return (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y} y2={y} className={t === 0 ? 'rep-svg__axis' : 'rep-svg__grid'} />
              <text x={L - 8} y={y + 5} textAnchor="end" className="rep-svg__tick">{compact(max * t)}</text>
            </g>
          )
        })}
        {days.map((d, i) => {
          const h = (H - T - B) * (d.total / max)
          const x = L + slot * i + (slot - bw) / 2
          const y = H - B - h
          const dt = new Date(d.ts)
          const active = hover === i
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" />
              {d.total > 0 && (
                <rect x={x} y={y} width={bw} height={Math.max(h, 2)} rx={4} className={cx('rep-svg__bar', active && 'is-active')}>
                  <title>{formatDateShort(d.ts) + ': ' + formatMoney(d.total) + " so'm"}</title>
                </rect>
              )}
              {(showVals || active) && d.total > 0 && (
                <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="rep-svg__val">{compact(d.total)}</text>
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - B + 22} textAnchor="middle" className="rep-svg__tick">{p2(dt.getDate()) + '.' + p2(dt.getMonth() + 1)}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && days[hover] && (
        <div className="rep-days__hover num">{formatDate(days[hover].ts) + ' — ' + formatMoney(days[hover].total) + " so'm"}</div>
      )}
    </Card>
  )
}

/* ───────────── Gorizontal ustunlar ro'yxati ───────────── */
function BarList({ rows }: { rows: { key: number; label: string; value: number; extra?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="rep-bars">
      {rows.map((r) => (
        <div key={r.key} className="rep-bars__row">
          <div className="rep-bars__head">
            <span className="rep-bars__name ellipsis">{r.label}</span>
            {r.extra && <span className="rep-bars__extra">{r.extra}</span>}
            <Money value={r.value} size="sm" currency={false} />
          </div>
          <div className="rep-bars__track"><div className="rep-bars__fill" style={{ width: Math.max(2, (r.value / max) * 100) + '%' }} /></div>
        </div>
      ))}
    </div>
  )
}
