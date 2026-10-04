/**
 * Ofitsiantlar — oylik hisob-kitob: oy tanlash, har bir ofitsiant bo'yicha o'zi olib borgan bar + oshxona savdosi, hisoblangan haq,
 * berilgan pul va qoldiq. Qatorni bosish → tafsilot (sessiyalar, berilgan pullar), "Pul berish".
 * Hisob backendda (`waiters.monthly/sessions/payouts`); UI faqat ko'rsatadi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WaiterMonthRow, WaiterPayout, WaiterSessionRow } from '@shared/types'
import { api } from '../../api'
import { useApp } from '../../store/app'
import { useCan } from '../../store/auth'
import { useNav } from '../../store/nav'
import {
  Avatar, Badge, Button, Card, EmptyState, Field, Icon, IconButton, Input, Modal, Money, MoneyInput, PageHeader, Spinner,
  confirmDialog, cx, formatDateTime, formatMoney, getNow, MONTHS, toast
} from '../../ui'
import './waiters.css'

const NOTE = 'Haq ofitsiant o\'zi olib borgan bar va oshxona mahsulotlaridan; xizmatlar va xona vaqti kirmaydi'

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
const currentMonth = () => {
  const d = new Date(getNow())
  return monthKey(d.getFullYear(), d.getMonth())
}
const pctText = (p: number) => String(Math.round(p * 100) / 100).replace('.', ',') + '%'

function balanceTone(r: { balance: number; commission: number }): 'accent' | 'success' | 'danger' | 'muted' {
  if (r.balance < 0) return 'danger'
  if (r.balance > 0) return 'accent'
  return r.commission > 0 ? 'success' : 'muted'
}

function BalanceHint({ r }: { r: { balance: number; commission: number } }) {
  if (r.balance < 0) return <span className="wt-bal__hint t-danger">ortiqcha berilgan</span>
  if (r.balance === 0 && r.commission > 0) return <span className="wt-bal__hint t-success">to'liq berilgan</span>
  return null
}

export default function WaitersScreen() {
  const businessName = useApp((s) => s.businessName)
  const readOnly = useApp((st) => st.readOnly)
  const canPay = useCan('staff.manage') && !readOnly
  const params = useNav((s) => s.params)
  const [month, setMonth] = useState(currentMonth)
  const [rows, setRows] = useState<WaiterMonthRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<number | null>(() => (typeof params.staffId === 'number' ? params.staffId : null))
  const [payFor, setPayFor] = useState<WaiterMonthRow | null>(null)
  const [detailKey, setDetailKey] = useState(0)
  const seq = useRef(0)

  const load = useCallback((m: string) => {
    const my = ++seq.current
    setLoading(true)
    setFailed(false)
    api.waiters
      .monthly(m)
      .then((r) => {
        if (my !== seq.current) return
        setRows(r)
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

  const nowMonth = currentMonth()
  const isFuture = month >= nowMonth
  const totals = useMemo(() => {
    const t = { sessions: 0, productSales: 0, commission: 0, paid: 0, balance: 0 }
    for (const r of rows ?? []) {
      t.sessions += r.sessions
      t.productSales += r.productSales
      t.commission += r.commission
      t.paid += r.paid
      t.balance += r.balance
    }
    return t
  }, [rows])

  const openRow = rows?.find((r) => r.staffId === openId) ?? null

  const afterPayout = () => {
    setPayFor(null)
    setDetailKey((k) => k + 1)
    load(month)
  }

  return (
    <div className="wt">
      <PageHeader
        title="Ofitsiantlar"
        icon="cash"
        subtitle={'Oylik hisob-kitob · ' + monthLabel(month)}
        actions={
          <Button variant="secondary" icon="printer" onClick={() => window.print()} disabled={!rows || rows.length === 0}>
            Chop etish
          </Button>
        }
      />

      <div className="wt-print-head">
        <div className="wt-print-head__biz">{businessName || 'Delfin Sauna'}</div>
        <div>Ofitsiantlar hisob-kitobi: {monthLabel(month)}</div>
        <div>Chop etildi: {formatDateTime(getNow())}</div>
      </div>

      <div className="wt-bar">
        <div className="wt-month" role="group" aria-label="Oy tanlash">
          <IconButton icon="chevronLeft" label="Oldingi oy" size="lg" onClick={() => setMonth((m) => shiftMonth(m, -1))} />
          <div className="wt-month__label" data-testid="wt-month">{monthLabel(month)}</div>
          <IconButton icon="chevronRight" label="Keyingi oy" size="lg" disabled={isFuture} onClick={() => setMonth((m) => shiftMonth(m, 1))} />
        </div>
        <Button variant="ghost" icon="calendar" disabled={month === nowMonth} onClick={() => setMonth(nowMonth)}>Joriy oy</Button>
        {loading && rows && <Spinner size={24} />}
        <div className="wt-note">
          <Icon name="info" size={22} />
          <span>{NOTE}</span>
        </div>
      </div>

      {!rows && loading && <div className="wt-center"><Spinner size={40} /></div>}
      {!rows && failed && (
        <EmptyState
          size="lg"
          icon="alert"
          title="Hisobni yuklab bo'lmadi"
          action={<Button variant="primary" icon="refresh" onClick={() => load(month)}>Qayta urinish</Button>}
        />
      )}

      {rows && rows.length === 0 && (
        <EmptyState
          size="lg"
          icon="users"
          title="Ofitsiantlar yo'q"
          description="Xodimlar bo'limida xodimni «Ofitsiant» qilib belgilang va foizini kiriting. Ofitsiant o'z PIN'i bilan kirib istalgan xonaga buyurtma qo'shadi."
          action={<Button variant="secondary" icon="staff" onClick={() => useNav.getState().go('staff')}>Xodimlar bo'limi</Button>}
        />
      )}

      {rows && rows.length > 0 && (
        <div className={cx('wt__content', loading && 'is-loading')}>
          <div className="wt-kpis">
            <Card padding="md" className="wt-kpi">
              <div className="wt-kpi__label"><Icon name="bar" size={22} /> Savdo</div>
              <Money value={totals.productSales} size="xl" />
            </Card>
            <Card padding="md" className="wt-kpi">
              <div className="wt-kpi__label"><Icon name="percent" size={22} /> Hisoblangan haq</div>
              <Money value={totals.commission} size="xl" />
            </Card>
            <Card padding="md" className="wt-kpi">
              <div className="wt-kpi__label"><Icon name="cash" size={22} /> Berilgan</div>
              <Money value={totals.paid} size="xl" />
            </Card>
            <Card tone="accent" padding="md" className="wt-kpi">
              <div className="wt-kpi__label"><Icon name="wallet" size={22} /> Qoldiq (berilishi kerak)</div>
              <Money value={totals.balance} size="2xl" tone={balanceTone(totals) === 'muted' ? 'default' : balanceTone(totals)} />
            </Card>
          </div>

          <Card padding="none" className="wt-table-card">
            <div className="wt-scroll">
              <table className="ui-table wt-table" data-testid="wt-table">
                <thead>
                  <tr>
                    <th>Ofitsiant</th>
                    <th className="r">Foiz</th>
                    <th className="r">Sessiyalar</th>
                    <th className="r">Savdo</th>
                    <th className="r">Hisoblangan haq</th>
                    <th className="r">Berilgan</th>
                    <th className="r">Qoldiq</th>
                    <th className="wt-table__tools" aria-label="Amallar" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.staffId}
                      className="wt-row"
                      tabIndex={0}
                      onClick={() => setOpenId(r.staffId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenId(r.staffId)
                        }
                      }}
                      data-testid={'wt-row-' + r.staffId}
                    >
                      <td>
                        <div className="wt-who">
                          <Avatar name={r.name} size={44} />
                          <span className="wt-who__name">{r.name}</span>
                        </div>
                      </td>
                      <td className="r num">{pctText(r.commissionPct)}</td>
                      <td className="r num">{r.sessions}</td>
                      <td className="r"><Money value={r.productSales} size="md" currency={false} /></td>
                      <td className="r"><Money value={r.commission} size="md" currency={false} /></td>
                      <td className="r"><Money value={r.paid} size="md" currency={false} tone={r.paid > 0 ? 'default' : 'muted'} /></td>
                      <td className="r wt-bal">
                        <Money value={r.balance} size="xl" currency={false} tone={balanceTone(r)} />
                        <BalanceHint r={r} />
                      </td>
                      <td className="wt-table__tools">
                        <div className="wt-tools">
                        {canPay && r.balance > 0 && (
                          <Button
                            variant="success"
                            size="sm"
                            icon="cash"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPayFor(r)
                            }}
                          >
                            Berish
                          </Button>
                        )}
                        <Icon name="chevronRight" size={24} className="wt-row__chev" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="wt-total">
                    <td>Jami</td>
                    <td />
                    <td className="r num">{totals.sessions}</td>
                    <td className="r"><Money value={totals.productSales} size="md" currency={false} /></td>
                    <td className="r"><Money value={totals.commission} size="md" currency={false} /></td>
                    <td className="r"><Money value={totals.paid} size="md" currency={false} /></td>
                    <td className="r"><Money value={totals.balance} size="xl" currency={false} tone={balanceTone(totals)} /></td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          <div className="wt-hint subtle">Batafsil ko'rish va pul berish uchun qatorni bosing. Foiz har bir buyurtma qo'shilgan paytdagi qiymat bilan hisoblanadi.</div>
        </div>
      )}

      {openRow && (
        <DetailDialog
          key={openRow.staffId + '-' + month + '-' + detailKey}
          row={openRow}
          month={month}
          canPay={canPay}
          onClose={() => setOpenId(null)}
          onPay={() => setPayFor(openRow)}
        />
      )}
      {payFor && <PayoutDialog row={payFor} month={month} onClose={() => setPayFor(null)} onDone={afterPayout} />}
    </div>
  )
}

/* ───────────── Tafsilot ───────────── */
function DetailDialog({ row, month, canPay, onClose, onPay }: {
  row: WaiterMonthRow; month: string; canPay: boolean; onClose: () => void; onPay: () => void
}) {
  const [data, setData] = useState<{ sessions: WaiterSessionRow[]; payouts: WaiterPayout[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([api.waiters.sessions(row.staffId, month), api.waiters.payouts(row.staffId, month)])
      .then(([sessions, payouts]) => {
        if (alive) setData({ sessions, payouts })
      })
      .catch((e) => {
        if (!alive) return
        toast.error(e)
        setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [row.staffId, month])

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={row.name}
      subtitle={monthLabel(month) + ' · hozirgi foiz ' + pctText(row.commissionPct)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Yopish</Button>
          {canPay && (
            <Button variant="primary" icon="cash" onClick={onPay} data-testid="wt-pay-open">
              Pul berish
            </Button>
          )}
        </>
      }
    >
      <div className="wt-detail">
        <div className="wt-sum">
          <div className="wt-sum__item">
            <span className="wt-sum__label">Sessiyalar</span>
            <span className="wt-sum__val num">{row.sessions}</span>
          </div>
          <div className="wt-sum__item">
            <span className="wt-sum__label">Savdo (bar + oshxona)</span>
            <Money value={row.productSales} size="lg" />
          </div>
          <div className="wt-sum__item">
            <span className="wt-sum__label">Hisoblangan haq</span>
            <Money value={row.commission} size="lg" />
          </div>
          <div className="wt-sum__item">
            <span className="wt-sum__label">Berilgan</span>
            <Money value={row.paid} size="lg" />
          </div>
          <div className="wt-sum__item is-main">
            <span className="wt-sum__label">Qoldiq</span>
            <Money value={row.balance} size="2xl" tone={balanceTone(row)} />
          </div>
        </div>

        <div className="wt-detail__note"><Icon name="info" size={20} /> {NOTE}</div>

        {!data && !failed && <div className="wt-center"><Spinner size={36} /></div>}
        {failed && <EmptyState icon="alert" title="Tafsilotni yuklab bo'lmadi" />}
        {data && (
          <div className="wt-detail__cols">
            <section className="wt-panel">
              <div className="wt-panel__head">
                <span className="wt-panel__title">Sessiyalar</span>
                <Badge tone="neutral" size="sm">{data.sessions.length} ta</Badge>
              </div>
              {data.sessions.length === 0 ? (
                <div className="wt-empty">Bu oyda ofitsiant buyurtma olib borgan yopilgan sessiya yo'q</div>
              ) : (
                <div className="wt-panel__scroll">
                  <table className="ui-table wt-mini">
                    <thead>
                      <tr><th>Sana</th><th>Xona</th><th className="r">Olib borgani</th><th className="r">Foiz</th><th className="r">Haq</th></tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s.sessionId}>
                          <td className="num nowrap">{formatDateTime(s.closedAt)}</td>
                          <td>{s.roomName}</td>
                          <td className="r"><Money value={s.productSales} size="sm" currency={false} tone={s.productSales > 0 ? 'default' : 'muted'} /></td>
                          <td className="r num">{pctText(s.pct)}</td>
                          <td className="r"><Money value={s.commission} size="sm" currency={false} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="wt-panel">
              <div className="wt-panel__head">
                <span className="wt-panel__title">Berilgan pullar</span>
                <Badge tone="neutral" size="sm">{data.payouts.length} ta</Badge>
              </div>
              {data.payouts.length === 0 ? (
                <div className="wt-empty">Bu oy uchun hali pul berilmagan</div>
              ) : (
                <div className="wt-panel__scroll">
                  <ul className="wt-payouts">
                    {data.payouts.map((p) => (
                      <li key={p.id} className="wt-payout">
                        <div className="wt-payout__main">
                          <span className="num">{formatDateTime(p.at)}</span>
                          {p.note && <span className="wt-payout__note">{p.note}</span>}
                        </div>
                        <Money value={p.amount} size="md" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ───────────── Pul berish ───────────── */
function PayoutDialog({ row, month, onClose, onDone }: { row: WaiterMonthRow; month: string; onClose: () => void; onDone: () => void }) {
  const rest = Math.max(0, row.balance)
  const [amount, setAmount] = useState(rest)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!(amount > 0)) return toast.warning('Summani kiriting')
    if (amount > rest) {
      const ok = await confirmDialog({
        title: 'Qoldiqdan ko\'p berilmoqda',
        message:
          formatMoney(amount) + " so'm berilmoqda, qoldiq esa " + formatMoney(rest) + " so'm. Ortiqcha " +
          formatMoney(amount - rest) + " so'm keyingi hisobda manfiy qoldiq bo'lib ko'rinadi. Davom etasizmi?",
        confirmText: 'Baribir berish',
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await api.waiters.payout(row.staffId, month, amount, note.trim())
      toast.success(row.name + 'ga ' + formatMoney(amount) + " so'm berildi")
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
      title="Pul berish"
      subtitle={row.name + ' · ' + monthLabel(month)}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <Button variant="success" icon="check" loading={busy} disabled={!(amount > 0)} onClick={() => void submit()} data-testid="wt-pay-submit">
            Berish
          </Button>
        </>
      }
    >
      <div className="wt-pay">
        <div className="wt-pay__rest">
          <span>Qoldiq</span>
          <Money value={row.balance} size="xl" tone={balanceTone(row)} />
        </div>
        <Field label="Summa" required>
          <MoneyInput
            data-autofocus
            value={amount}
            onChange={setAmount}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            data-testid="wt-pay-amount"
          />
        </Field>
        {chips.length > 0 && (
          <div className="wt-pay__chips">
            {chips.map((v, i) => (
              <button key={v} type="button" className={cx('wt-chip', amount === v && 'is-active')} onClick={() => setAmount(v)}>
                {i === 0 ? 'To\'liq qoldiq' : 'Yarmi'} · {formatMoney(v)}
              </button>
            ))}
          </div>
        )}
        <Field label="Izoh" hint="Ixtiyoriy, masalan: avans, naqd">
          <Input value={note} maxLength={200} placeholder="Izoh" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
