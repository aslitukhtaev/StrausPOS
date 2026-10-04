/**
 * Oshxona — kunlik hisob-kitob (oshxona jamoasiga har kuni pul berish).
 * Tepada "Bugun" kartasi; oy tanlash; kunlar jadvali (`kitchen.daily`): buyurtmalar, oshxona savdosi,
 * oshxonaga tegishli (savdo × ulush%), berilgan, qoldiq. Kunni bosish → tafsilot va "Pul berish" (`kitchen.payout`, staff.manage).
 * Hisob backendda; UI faqat ko'rsatadi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KitchenDayRow, KitchenPayout } from '@shared/types'
import { api } from '@/api'
import { useApp } from '@/store/app'
import { useCan } from '@/store/auth'
import {
  Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, Modal, Money, MoneyInput, PageHeader, Spinner,
  confirmDialog, cx, formatClock, formatDateTime, formatMoney, getNow, MONTHS, WEEKDAYS, toast
} from '@/ui'
import './kitchen.css'

const p2 = (n: number) => (n < 10 ? '0' + n : '' + n)
const monthKey = (y: number, m0: number) => y + '-' + p2(m0 + 1)
const parseMonth = (k: string) => ({ y: Number(k.slice(0, 4)), m0: Number(k.slice(5, 7)) - 1 })
const shiftMonth = (k: string, d: number) => {
  const { y, m0 } = parseMonth(k)
  const t = new Date(y, m0 + d, 1)
  return monthKey(t.getFullYear(), t.getMonth())
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthLabel = (k: string) => {
  const { y, m0 } = parseMonth(k)
  return cap(MONTHS[m0]) + ' ' + y
}
const todayKey = () => {
  const d = new Date(getNow())
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
}
const dayDate = (day: string) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
/** "4-oktabr" */
const dayLabel = (day: string) => {
  const d = dayDate(day)
  return d.getDate() + '-' + MONTHS[d.getMonth()]
}
const weekday = (day: string) => WEEKDAYS[dayDate(day).getDay()]

const EMPTY_DAY = (day: string): KitchenDayRow => ({ day, sales: 0, due: 0, paid: 0, balance: 0, orders: 0 })
const active = (r: KitchenDayRow) => r.orders > 0 || r.sales !== 0 || r.due !== 0 || r.paid !== 0

function balTone(r: { balance: number; due: number }): 'accent' | 'success' | 'danger' | 'muted' {
  if (r.balance < 0) return 'danger'
  if (r.balance > 0) return 'accent'
  return r.due > 0 ? 'success' : 'muted'
}

export default function KitchenScreen() {
  const businessName = useApp((s) => s.businessName)
  const readOnly = useApp((s) => s.readOnly)
  const sharePct = useApp((s) => (s.settings && s.settings.kitchen ? s.settings.kitchen.sharePct : null))
  const canPay = useCan('staff.manage') && !readOnly
  const nowMonth = todayKey().slice(0, 7)
  const [month, setMonth] = useState(nowMonth)
  const [rows, setRows] = useState<KitchenDayRow[] | null>(null)
  const [today, setToday] = useState<KitchenDayRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [payDay, setPayDay] = useState<KitchenDayRow | null>(null)
  const [ver, setVer] = useState(0)
  const seq = useRef(0)

  const load = useCallback((m: string) => {
    const my = ++seq.current
    setLoading(true)
    setFailed(false)
    const cur = todayKey()
    const curMonth = cur.slice(0, 7)
    Promise.all([api.kitchen.daily(m), m === curMonth ? null : api.kitchen.daily(curMonth)])
      .then(([r, curRows]) => {
        if (my !== seq.current) return
        setRows(r)
        setToday((curRows || r).find((x) => x.day === cur) || EMPTY_DAY(cur))
        setLoading(false)
      })
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setFailed(true)
        setLoading(false)
      })
  }, [])

  useEffect(() => load(month), [month, load])

  const shown = useMemo(() => (rows || []).filter(active).sort((a, b) => (a.day < b.day ? 1 : -1)), [rows])
  const totals = useMemo(() => {
    const t = { orders: 0, sales: 0, due: 0, paid: 0, balance: 0 }
    for (const r of rows || []) {
      t.orders += r.orders
      t.sales += r.sales
      t.due += r.due
      t.paid += r.paid
      t.balance += r.balance
    }
    return t
  }, [rows])

  const findDay = (day: string): KitchenDayRow =>
    (rows || []).find((r) => r.day === day) || (today && today.day === day ? today : null) || EMPTY_DAY(day)

  const afterPayout = () => {
    setPayDay(null)
    setVer((v) => v + 1)
    load(month)
  }

  const t = today

  return (
    <div className="kt">
      <PageHeader
        title="Oshxona"
        icon="flame"
        subtitle={'Kunlik hisob-kitob' + (sharePct != null ? ' · ulush ' + sharePct + '%' : '')}
        actions={
          <Button variant="secondary" icon="printer" onClick={() => window.print()} disabled={!rows || shown.length === 0}>
            Chop etish
          </Button>
        }
      />

      <div className="kt-print-head">
        <div className="kt-print-head__biz">{businessName || 'Delfin Sauna'}</div>
        <div>Oshxona hisobi: {monthLabel(month)}</div>
        <div>Chop etildi: {formatDateTime(getNow())}</div>
      </div>

      {t && (
        <Card tone="accent" padding="lg" className="kt-today" data-testid="kt-today">
          <div className="kt-today__head">
            <div>
              <div className="kt-today__label"><Icon name="calendar" size={22} /> Bugun · {dayLabel(t.day)}, {weekday(t.day)}</div>
              <div className="kt-today__orders">{t.orders} ta buyurtma</div>
            </div>
            <div className="kt-today__actions">
              <Button variant="secondary" icon="eye" onClick={() => setOpenDay(t.day)}>Tafsilot</Button>
              {canPay && (
                <Button variant="primary" size="lg" icon="cash" disabled={t.balance <= 0} onClick={() => setPayDay(t)} data-testid="kt-today-pay">
                  Pul berish
                </Button>
              )}
            </div>
          </div>
          <div className="kt-today__grid">
            <div className="kt-stat">
              <span className="kt-stat__label">Oshxona savdosi</span>
              <Money value={t.sales} size="xl" />
            </div>
            <div className="kt-stat">
              <span className="kt-stat__label">Oshxonaga tegishli</span>
              <Money value={t.due} size="xl" />
            </div>
            <div className="kt-stat">
              <span className="kt-stat__label">Berilgan</span>
              <Money value={t.paid} size="xl" />
            </div>
            <div className="kt-stat is-main">
              <span className="kt-stat__label">Qoldiq (berilishi kerak)</span>
              <Money value={t.balance} size="3xl" tone={balTone(t) === 'muted' ? 'default' : balTone(t)} />
            </div>
          </div>
        </Card>
      )}

      <div className="kt-bar">
        <div className="kt-month" role="group" aria-label="Oy tanlash">
          <IconButton icon="chevronLeft" label="Oldingi oy" size="lg" onClick={() => setMonth((m) => shiftMonth(m, -1))} />
          <div className="kt-month__label" data-testid="kt-month">{monthLabel(month)}</div>
          <IconButton icon="chevronRight" label="Keyingi oy" size="lg" disabled={month >= nowMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))} />
        </div>
        <Button variant="ghost" icon="calendar" disabled={month === nowMonth} onClick={() => setMonth(nowMonth)}>Joriy oy</Button>
        {loading && rows && <Spinner size={24} />}
        <div className="kt-note">
          <Icon name="info" size={22} />
          <span>Oshxonaga tegishli = oshxona savdosi × ulush foizi (Sozlamalar → Oshxona)</span>
        </div>
      </div>

      {!rows && loading && <div className="kt-center"><Spinner size={40} /></div>}
      {!rows && failed && (
        <EmptyState
          size="lg"
          icon="alert"
          title="Hisobni yuklab bo'lmadi"
          action={<Button variant="primary" icon="refresh" onClick={() => load(month)}>Qayta urinish</Button>}
        />
      )}

      {rows && shown.length === 0 && (
        <EmptyState
          size="lg"
          icon="flame"
          title={monthLabel(month) + ' — oshxona savdosi yo\'q'}
          description="Bar bo'limida kategoriyani «Oshxona» bo'limiga o'tkazing. Oshxona mahsulotlari sotilgach, kunlik hisob shu yerda paydo bo'ladi."
        />
      )}

      {rows && shown.length > 0 && (
        <Card padding="none" className={cx('kt-table-card', loading && 'is-loading')}>
          <div className="kt-scroll">
            <table className="ui-table kt-table" data-testid="kt-table">
              <thead>
                <tr>
                  <th>Kun</th>
                  <th className="r">Buyurtmalar</th>
                  <th className="r">Savdo</th>
                  <th className="r">Oshxonaga</th>
                  <th className="r">Berilgan</th>
                  <th className="r">Qoldiq</th>
                  <th className="kt-table__tools" aria-label="Amallar" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.day}
                    className={cx('kt-row', t && r.day === t.day && 'is-today')}
                    tabIndex={0}
                    onClick={() => setOpenDay(r.day)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpenDay(r.day)
                      }
                    }}
                    data-testid={'kt-row-' + r.day}
                  >
                    <td>
                      <div className="kt-day">
                        <span className="kt-day__d">{dayLabel(r.day)}</span>
                        <span className="kt-day__w">{t && r.day === t.day ? 'Bugun' : weekday(r.day)}</span>
                      </div>
                    </td>
                    <td className="r num">{r.orders}</td>
                    <td className="r"><Money value={r.sales} size="md" currency={false} /></td>
                    <td className="r"><Money value={r.due} size="md" currency={false} /></td>
                    <td className="r"><Money value={r.paid} size="md" currency={false} tone={r.paid > 0 ? 'default' : 'muted'} /></td>
                    <td className="r kt-bal">
                      <Money value={r.balance} size="lg" currency={false} tone={balTone(r)} />
                      {r.balance === 0 && r.due > 0 && <span className="kt-bal__hint t-success">berilgan</span>}
                      {r.balance < 0 && <span className="kt-bal__hint t-danger">ortiqcha</span>}
                    </td>
                    <td className="kt-table__tools">
                      <div className="kt-tools">
                        {canPay && r.balance > 0 && (
                          <Button
                            variant="success"
                            size="sm"
                            icon="cash"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPayDay(r)
                            }}
                          >
                            Berish
                          </Button>
                        )}
                        <Icon name="chevronRight" size={24} className="kt-row__chev" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="kt-total">
                  <td>Jami · {monthLabel(month)}</td>
                  <td className="r num">{totals.orders}</td>
                  <td className="r"><Money value={totals.sales} size="md" currency={false} /></td>
                  <td className="r"><Money value={totals.due} size="md" currency={false} /></td>
                  <td className="r"><Money value={totals.paid} size="md" currency={false} /></td>
                  <td className="r"><Money value={totals.balance} size="lg" currency={false} tone={balTone(totals)} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {openDay && (
        <DayDialog
          key={openDay + '-' + ver}
          row={findDay(openDay)}
          canPay={canPay}
          onClose={() => setOpenDay(null)}
          onPay={() => setPayDay(findDay(openDay))}
        />
      )}
      {payDay && <PayoutDialog row={payDay} onClose={() => setPayDay(null)} onDone={afterPayout} />}
    </div>
  )
}

/* ───────────── Kun tafsiloti ───────────── */
function DayDialog({ row, canPay, onClose, onPay }: { row: KitchenDayRow; canPay: boolean; onClose: () => void; onPay: () => void }) {
  const [payouts, setPayouts] = useState<KitchenPayout[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api.kitchen
      .payouts(row.day.slice(0, 7))
      .then((p) => {
        if (alive) setPayouts(p.filter((x) => x.day === row.day).sort((a, b) => b.at - a.at))
      })
      .catch((e) => {
        if (!alive) return
        toast.error(e)
        setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [row.day])

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={'Oshxona · ' + dayLabel(row.day)}
      subtitle={weekday(row.day) + ' · ' + row.orders + ' ta buyurtma'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Yopish</Button>
          {canPay && (
            <Button variant="primary" icon="cash" onClick={onPay} data-testid="kt-pay-open">
              Pul berish
            </Button>
          )}
        </>
      }
    >
      <div className="kt-detail">
        <div className="kt-sum">
          <div className="kt-sum__item">
            <span className="kt-stat__label">Oshxona savdosi</span>
            <Money value={row.sales} size="lg" />
          </div>
          <div className="kt-sum__item">
            <span className="kt-stat__label">Oshxonaga tegishli</span>
            <Money value={row.due} size="lg" />
          </div>
          <div className="kt-sum__item">
            <span className="kt-stat__label">Berilgan</span>
            <Money value={row.paid} size="lg" />
          </div>
          <div className="kt-sum__item is-main">
            <span className="kt-stat__label">Qoldiq</span>
            <Money value={row.balance} size="2xl" tone={balTone(row)} />
          </div>
        </div>

        <section className="kt-panel">
          <div className="kt-panel__head">
            <span className="kt-panel__title">Berilgan pullar</span>
            {payouts && <Badge tone="neutral" size="sm">{payouts.length} ta</Badge>}
          </div>
          {!payouts && !failed && <div className="kt-center"><Spinner size={32} /></div>}
          {failed && <div className="kt-empty">Tarixni yuklab bo'lmadi</div>}
          {payouts && payouts.length === 0 && <div className="kt-empty">Bu kun uchun hali pul berilmagan</div>}
          {payouts && payouts.length > 0 && (
            <ul className="kt-payouts" data-testid="kt-payouts">
              {payouts.map((p) => (
                <li key={p.id} className="kt-payout">
                  <div className="kt-payout__main">
                    <span className="num">{formatDateTime(p.at)}</span>
                    {p.note && <span className="kt-payout__note">{p.note}</span>}
                  </div>
                  <Money value={p.amount} size="md" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

/* ───────────── Pul berish ───────────── */
function PayoutDialog({ row, onClose, onDone }: { row: KitchenDayRow; onClose: () => void; onDone: () => void }) {
  const rest = Math.max(0, row.balance)
  const [amount, setAmount] = useState(rest)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!(amount > 0)) return toast.warning('Summani kiriting')
    if (amount > rest) {
      const ok = await confirmDialog({
        title: "Qoldiqdan ko'p berilmoqda",
        message:
          formatMoney(amount) + " so'm berilmoqda, qoldiq esa " + formatMoney(rest) + " so'm. Ortiqcha " +
          formatMoney(amount - rest) + " so'm shu kunda manfiy qoldiq bo'lib ko'rinadi. Davom etasizmi?",
        confirmText: 'Baribir berish',
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await api.kitchen.payout(row.day, amount, note.trim())
      toast.success('Oshxonaga ' + formatMoney(amount) + " so'm berildi", { description: dayLabel(row.day) + ' · ' + formatClock(getNow()) })
      onDone()
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  const chips = [rest, Math.round(rest / 2 / 1000) * 1000].filter((v, i, a) => v > 0 && a.indexOf(v) === i)

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Oshxonaga pul berish"
      subtitle={dayLabel(row.day) + ', ' + weekday(row.day)}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <Button variant="success" icon="check" loading={busy} disabled={!(amount > 0)} onClick={() => void submit()} data-testid="kt-pay-submit">
            Berish
          </Button>
        </>
      }
    >
      <div className="kt-pay">
        <div className="kt-pay__rest">
          <span>Qoldiq</span>
          <Money value={row.balance} size="xl" tone={balTone(row)} />
        </div>
        <Field label="Summa" required>
          <MoneyInput
            data-autofocus
            value={amount}
            onChange={setAmount}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            data-testid="kt-pay-amount"
          />
        </Field>
        {chips.length > 0 && (
          <div className="kt-pay__chips">
            {chips.map((v, i) => (
              <button key={v} type="button" className={cx('kt-chip', amount === v && 'is-active')} onClick={() => setAmount(v)}>
                {i === 0 ? "To'liq qoldiq" : 'Yarmi'} · {formatMoney(v)}
              </button>
            ))}
          </div>
        )}
        <Field label="Izoh" hint="Ixtiyoriy, masalan: oshpazga naqd">
          <Input value={note} maxLength={200} placeholder="Izoh" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
