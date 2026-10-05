/**
 * CheckoutDialog — to'lov oynasi (xonalar ekrani ochadi).
 *
 *   <CheckoutDialog sessionId={id} onClose={() => setPayId(null)} onPaid={(r) => { setPayId(null); reload() }} />
 *
 * Oqim: sessions.get → xulosa + to'lov usuli (Naqd / Karta / Terminal / Qarz / Aralash) → checkout.pay →
 * chek oynasi (ko'rish, chop etish). Aralash — to'rttala usul (qarz ham) summalar bilan; qarz bo'lsa qarzdor maydoni.
 * Qarzdor `debtors.search` bilan qidiriladi: mavjud odam tanlansa qarz unga qo'shiladi (debtorId).
 * To'lovdan keyin oyna yopilsa FAQAT `onPaid(receipt)` chaqiriladi (sessiya allaqachon yopilgan); to'lovgacha yopilsa — `onClose()`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Debtor, DebtorInput, DebtPayMethod, PayMethod, PaymentInput, ReceiptData, SessionView } from '@shared/types'
import { computeTotals, guestElapsedMs, guestTimeAmount } from '@shared/billing'
import { api } from '@/api'
import { useApp } from '@/store/app'
import { useCan } from '@/store/auth'
import {
  Badge, Button, EmptyState, Icon, Modal, Money, Numpad, Segmented, Spinner, cx,
  errorMessage, formatClock, formatDuration, formatMoney, formatPhone, toast, useNow, type IconName
} from '@/ui'
import { ReceiptPreview } from './ReceiptPreview'
import { DebtorPicker } from './DebtorPicker'
import { DEBT_PAY_OPTIONS, METHOD_ICON, METHOD_LABEL, PAY_METHODS } from './methods'
import './checkout.css'

export interface CheckoutDialogProps {
  sessionId: number
  onClose: () => void
  onPaid: (receipt: ReceiptData) => void
}

type Method = 'cash' | 'card' | 'terminal' | 'debt' | 'mixed'

const n = (s: string): number => (s ? Number(s) || 0 : 0)
const EMPTY_MIX: Record<PayMethod, string> = { cash: '', card: '', terminal: '', debt: '' }

/** Naqd uchun tezkor summalar: aniq summa + yaxlit yuqori qiymatlar */
function quickCash(total: number): number[] {
  const set: number[] = []
  const add = (v: number) => {
    if (v > total && set.indexOf(v) < 0) set.push(v)
  }
  for (const step of [10_000, 50_000, 100_000]) add(Math.ceil(total / step) * step)
  for (const v of [50_000, 100_000, 200_000, 500_000, 1_000_000]) add(v)
  return set.sort((a, b) => a - b).slice(0, 5)
}

interface Plan {
  payments: PaymentInput[]
  debtor: DebtorInput | null
  error: string | null
}

export function CheckoutDialog({ sessionId, onClose, onPaid }: CheckoutDialogProps) {
  const canPay = useCan('session.pay')
  const canDebt = useCan('debt.manage')
  const roundTo = useApp((s) => (s.settings ? s.settings.roundTo : null))
  const blockMinutes = useApp((s) => (s.settings ? s.settings.blockMinutes : 1))
  const graceMinutes = useApp((s) => (s.settings ? s.settings.graceMinutes : 0))
  const now = useNow()

  const [view, setView] = useState<SessionView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [method, setMethod] = useState<Method>('cash')
  const [cashGiven, setCashGiven] = useState('')
  // Aralash: to'rttala usul (qarz ham)
  const [mix, setMix] = useState<Record<PayMethod, string>>(EMPTY_MIX)
  const [activeRow, setActiveRow] = useState<PayMethod>('cash')
  // Qarzdor
  const [debtName, setDebtName] = useState('')
  const [debtPhone, setDebtPhone] = useState('')
  const [debtor, setDebtor] = useState<Debtor | null>(null)
  // "Qarz" usuli: qarzga yoziladigan summa (bo'lmasa to'liq), qolgani qaysi usulda
  const [debtAmount, setDebtAmount] = useState('')
  const [debtTouched, setDebtTouched] = useState(false)
  const [debtRest, setDebtRest] = useState<DebtPayMethod>('cash')
  const [showErrors, setShowErrors] = useState(false)

  const [paying, setPaying] = useState(false)
  const payingRef = useRef(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [paidChange, setPaidChange] = useState(0)

  // ── Yuklash ──
  useEffect(() => {
    let alive = true
    setLoadError(null)
    api.sessions
      .get(sessionId)
      .then((v) => alive && setView(v))
      .catch((e: unknown) => {
        if (!alive) return
        setLoadError(errorMessage(e))
        toast.error(e)
      })
    return () => {
      alive = false
    }
  }, [sessionId, reload])

  // ── Jonli summa (mehmon vaqti hali ishlayotgan bo'lsa) ──
  const running = !!view && view.guests.some((g) => g.state === 'running')
  const tick = running ? now : 0
  const live = useMemo(() => {
    if (!view) return null
    if (!running || roundTo == null) {
      return { guests: view.guests, timeTotal: view.timeTotal, linesTotal: view.linesTotal, discount: view.discount, serviceChargePct: view.serviceChargePct || 0, serviceCharge: view.serviceCharge || 0, total: view.total }
    }
    const t = Math.max(tick, view.computedAt)
    const guests = view.guests.map((g) => ({
      ...g,
      elapsedMs: guestElapsedMs(g.intervals, t),
      timeAmount: guestTimeAmount(g.intervals, g.paidMinutes, t, { roundTo, blockMinutes, graceMinutes })
    }))
    const pct = view.serviceChargePct || 0
    return { guests, ...computeTotals(guests, view.lines, view.session.discount, pct), serviceChargePct: pct }
  }, [view, running, tick, roundTo, blockMinutes, graceMinutes])

  const total = live ? live.total : 0

  // ── Hisob-kitob (faqat ko'rsatish / kiritilganni tekshirish) ──
  const given = n(cashGiven)
  const change = method === 'cash' && given > total ? given - total : 0
  const mixSum = n(mix.cash) + n(mix.card) + n(mix.terminal) + n(mix.debt)
  const mixLeft = total - mixSum
  const debtSum = debtTouched ? n(debtAmount) : total
  const debtLeft = Math.max(0, total - debtSum)
  const needsDebtor = method === 'debt' || (method === 'mixed' && n(mix.debt) > 0)

  /** Qarzdor ma'lumoti (tanlangan mavjud odam yoki yangi) yoki xato matni */
  const debtorPlan = (): { debtor: DebtorInput | null; error: string | null } => {
    if (debtor) return { debtor: { debtorId: debtor.id, name: debtor.name, phone: debtor.phone }, error: null }
    const name = debtName.trim()
    if (!name) return { debtor: null, error: 'Qarzdorning ismini kiriting' }
    if (debtPhone.length !== 9) return { debtor: null, error: "Telefon raqamini to'liq kiriting (9 ta raqam)" }
    return { debtor: { debtorId: null, name, phone: '+998 ' + formatPhone(debtPhone) }, error: null }
  }

  const buildPlan = (tot: number): Plan => {
    const fail = (error: string): Plan => ({ payments: [], debtor: null, error })
    if (method === 'cash') {
      if (cashGiven && given < tot) return fail('Yetarli emas: yana ' + formatMoney(tot - given) + " so'm")
      return { payments: [{ method: 'cash', amount: tot }], debtor: null, error: null }
    }
    if (method === 'card' || method === 'terminal') return { payments: [{ method, amount: tot }], debtor: null, error: null }
    if (method === 'mixed') {
      const sum = PAY_METHODS.reduce((a, m) => a + n(mix[m]), 0)
      if (sum === 0 && tot > 0) return fail('Summalarni kiriting')
      if (sum < tot) return fail('Yana ' + formatMoney(tot - sum) + " so'm kiritilishi kerak")
      if (sum > tot) return fail(formatMoney(sum - tot) + " so'm ortiqcha kiritildi")
      const payments = PAY_METHODS.filter((m) => n(mix[m]) > 0).map((m) => ({ method: m, amount: n(mix[m]) }))
      if (n(mix.debt) > 0) {
        const d = debtorPlan()
        if (d.error) return fail(d.error)
        return { payments, debtor: d.debtor, error: null }
      }
      return { payments, debtor: null, error: null }
    }
    // Qarz
    const d = debtTouched ? n(debtAmount) : tot
    const dp = debtorPlan()
    if (dp.error) return fail(dp.error)
    if (d <= 0) return fail('Qarz summasini kiriting')
    if (d > tot) return fail('Qarz summasi jami summadan katta')
    const payments: PaymentInput[] = [{ method: 'debt', amount: d }]
    if (tot - d > 0) payments.push({ method: debtRest, amount: tot - d })
    return { payments, debtor: dp.debtor, error: null }
  }
  const plan = buildPlan(total)
  /** Summa o'zgarsa ham to'lovni qayta qurish mumkinmi (kiritilgan aniq summalarga bog'liq emas) */
  const followsTotal =
    method === 'cash' ? !cashGiven : method === 'card' || method === 'terminal' || (method === 'debt' && !debtTouched)

  // ── Numpad maqsadi ──
  let padValue = ''
  let setPad: (v: string) => void = () => undefined
  if (method === 'cash') {
    padValue = cashGiven
    setPad = setCashGiven
  } else if (method === 'mixed') {
    padValue = mix[activeRow]
    setPad = (v) => setMix((m) => ({ ...m, [activeRow]: v }))
  } else if (method === 'debt') {
    padValue = debtTouched ? debtAmount : ''
    setPad = (v) => {
      setDebtAmount(v)
      setDebtTouched(true)
    }
  }

  // ── Aralash amallari ──
  const fillRest = (m: PayMethod) => {
    if (mixLeft <= 0) return
    setMix((x) => ({ ...x, [m]: String(n(x[m]) + mixLeft) }))
    setActiveRow(m)
  }

  // ── To'lash ──
  const pay = async () => {
    if (payingRef.current || !view) return
    if (plan.error) {
      setShowErrors(true)
      toast.warning(plan.error)
      return
    }
    payingRef.current = true
    setPaying(true)
    try {
      // Eng so'nggi summa bilan solishtiramiz (vaqt ishlayotgan bo'lsa daqiqa o'tgan bo'lishi mumkin)
      let tot = total
      if (running || roundTo == null) {
        const fresh = await api.sessions.get(sessionId)
        if (fresh.total !== total) {
          if (!followsTotal) {
            setView(fresh)
            toast.warning("Jami summa o'zgardi: " + formatMoney(fresh.total) + " so'm", {
              description: 'Vaqt hisoblanishda davom etdi. Summalarni tekshirib, qayta bosing.'
            })
            return
          }
          tot = fresh.total
          setView(fresh)
        }
      }
      const p = tot === total ? plan : buildPlan(tot)
      if (p.error) {
        toast.warning(p.error)
        return
      }
      const r = await api.checkout.pay(sessionId, p.payments, p.debtor)
      setPaidChange(method === 'cash' && given > r.total ? given - r.total : 0)
      setReceipt(r)
    } catch (e) {
      toast.error(e)
      // Holatni yangilaymiz (masalan boshqa joyda yopilgan bo'lsa)
      api.sessions.get(sessionId).then(setView).catch(() => undefined)
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  // ═════════ CHEK BOSQICHI ═════════
  if (receipt) {
    return <ReceiptStage receipt={receipt} change={paidChange} onDone={() => onPaid(receipt)} />
  }

  // ═════════ YUKLANISH / XATO / RUXSAT ═════════
  const title = view ? "To'lov — " + view.room.name : "To'lov"
  if (!canPay || !view || view.session.status !== 'open') {
    let body: ReactNode
    if (!canPay)
      body = <EmptyState icon="lock" title="Ruxsat yo'q" description="To'lov qabul qilish uchun kassir yoki administrator kirishi kerak." />
    else if (loadError)
      body = (
        <EmptyState
          icon="alert"
          title="Hisob ochilmadi"
          description={loadError}
          action={<Button icon="refresh" onClick={() => setReload((k) => k + 1)}>Qayta urinish</Button>}
        />
      )
    else if (!view)
      body = (
        <div className="checkout-loading">
          <Spinner size={36} />
        </div>
      )
    else
      body = (
        <EmptyState
          icon="receipt"
          title="Bu hisob allaqachon yopilgan"
          description="To'lov oldin qabul qilingan."
          action={
            <Button
              icon="receipt"
              onClick={() => api.checkout.receipt(sessionId).then(setReceipt).catch((e: unknown) => toast.error(e))}
            >
              Chekni ko'rish
            </Button>
          }
        />
      )
    return (
      <Modal open onClose={onClose} title={title} size="md" footer={<Button size="lg" onClick={onClose}>Yopish</Button>}>
        {body}
      </Modal>
    )
  }

  const methodOptions: { value: Method; label: string; icon: IconName; disabled?: boolean }[] = [
    { value: 'cash', label: 'Naqd', icon: METHOD_ICON.cash },
    { value: 'card', label: 'Karta', icon: METHOD_ICON.card },
    { value: 'terminal', label: 'Terminal', icon: METHOD_ICON.terminal },
    { value: 'debt', label: 'Qarz', icon: METHOD_ICON.debt, disabled: !canDebt },
    { value: 'mixed', label: 'Aralash', icon: 'swap' }
  ]
  const mixRows = PAY_METHODS.filter((m) => m !== 'debt' || canDebt)
  const lines = view.lines.filter((l) => l.activeQty > 0)
  const guests = live ? live.guests : view.guests
  const isBar = view.session.kind === 'bar'
  const err = plan.error
  const softErr = err && !showErrors && (method === 'debt' || method === 'mixed')
  // Biror narsa kiritilgan bo'lsa — tasodifiy fon bosishi/Esc oynani yopmasin
  const dirty = !!cashGiven || mixSum > 0 || !!debtName || !!debtPhone || !!debtor || debtTouched

  const picker = (
    <DebtorPicker
      name={debtName}
      phone={debtPhone}
      selected={debtor}
      onName={setDebtName}
      onPhone={setDebtPhone}
      onSelect={setDebtor}
      showErrors={showErrors}
      autoFocus={method === 'debt'}
    />
  )

  // ═════════ TO'LOV BOSQICHI ═════════
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!paying && !dirty}
      size="xl"
      flush
      className="checkout-modal"
      title={title}
      subtitle={'Ochilgan: ' + formatClock(view.session.openedAt) + (isBar ? ' · Bar savdosi' : ' · ' + guests.length + ' mehmon')}
      headerExtra={running ? <Badge tone="busy" icon="clock">Vaqt hisoblanmoqda</Badge> : undefined}
      footer={
        <div className="checkout-foot">
          <div className={cx('checkout-foot__status', err ? (softErr ? 'is-soft' : 'is-err') : 'is-ok')}>
            <Icon name={err ? 'info' : 'checkCircle'} size={24} />
            <span>{err || (method === 'cash' && change > 0 ? 'Qaytim: ' + formatMoney(change) + " so'm" : "Hammasi to'g'ri")}</span>
          </div>
          <Button size="lg" variant="ghost" onClick={onClose} disabled={paying}>
            Bekor qilish
          </Button>
          <Button
            size="lg"
            variant="success"
            icon="check"
            className="checkout-foot__pay"
            loading={paying}
            disabled={!!err || paying}
            onClick={() => void pay()}
          >
            To'lash · {formatMoney(total)} so'm
          </Button>
        </div>
      }
    >
      <div className="checkout-grid">
        {/* ── Xulosa ── */}
        <aside className="checkout-sum">
          <div className="checkout-sum__inner">
          <div className="checkout-sum__list">
            {!isBar && <div className="checkout-sum__h">Vaqt</div>}
            {guests.map((g) => (
              <div key={g.id} className="checkout-sum__row">
                <Icon name="user" size={20} />
                <span className="checkout-sum__name">
                  <span className="ellipsis">{g.label}</span>
                  <span className="checkout-sum__meta num">{formatDuration(g.elapsedMs)}</span>
                </span>
                <Money value={g.timeAmount} currency={false} />
              </div>
            ))}
            {lines.length > 0 && <div className="checkout-sum__h">Buyurtmalar</div>}
            {lines.map((l) => (
              <div key={l.id} className="checkout-sum__row">
                <Icon name={l.kind === 'service' ? 'sparkles' : l.department === 'kitchen' ? 'flame' : 'bar'} size={20} />
                <span className="checkout-sum__name">
                  <span className="ellipsis">{l.name}</span>
                  <span className="checkout-sum__meta num">
                    {l.activeQty} × {formatMoney(l.unitPrice)}
                    {l.providerName ? ' · ' + l.providerName : ''}
                  </span>
                </span>
                <Money value={l.amount} currency={false} />
              </div>
            ))}
          </div>
          <div className="checkout-sum__totals">
            {!isBar && (
              <div className="checkout-sum__line">
                <span>Vaqt</span>
                <Money value={live ? live.timeTotal : view.timeTotal} />
              </div>
            )}
            <div className="checkout-sum__line">
              <span>Buyurtmalar</span>
              <Money value={live ? live.linesTotal : view.linesTotal} />
            </div>
            {(live ? live.discount : view.discount) > 0 && (
              <div className="checkout-sum__line is-discount">
                <span>Chegirma</span>
                <Money value={-(live ? live.discount : view.discount)} tone="success" />
              </div>
            )}
            {(live ? live.serviceCharge : view.serviceCharge) > 0 && (
              <div className="checkout-sum__line" data-testid="checkout-service">
                <span>Obsluga {live ? live.serviceChargePct : view.serviceChargePct}%</span>
                <Money value={live ? live.serviceCharge : view.serviceCharge} />
              </div>
            )}
            <div className="checkout-sum__total">
              <span>JAMI</span>
              <Money value={total} size="3xl" tone="accent" />
            </div>
          </div>
          </div>
        </aside>

        {/* ── To'lov ── */}
        <section className="checkout-pay">
          <Segmented<Method>
            value={method}
            onChange={(m) => {
              setMethod(m)
              setShowErrors(false)
            }}
            options={methodOptions}
            size="lg"
            block
            className="checkout-methods"
          />

          {method === 'card' || method === 'terminal' ? (
            <div className="checkout-card">
              <span className="checkout-card__icon">
                <Icon name={METHOD_ICON[method]} size={44} />
              </span>
              <div className="checkout-card__label">
                {method === 'terminal' ? 'Terminaldan yechiladigan summa' : "Kartaga o'tkaziladigan summa"}
              </div>
              <Money value={total} size="3xl" tone="accent" />
              <div className="checkout-card__hint">
                {method === 'terminal'
                  ? "Terminalda to'lov o'tganini (chek chiqqanini) tekshirib, «To'lash» ni bosing."
                  : "Pul kartaga tushganini tekshirib, «To'lash» ni bosing."}
              </div>
            </div>
          ) : (
            <div className="checkout-work">
              <div className="checkout-panel">
                {method === 'cash' && (
                  <>
                    <AmountBox label="Mijoz berdi" value={given} placeholder={cashGiven ? undefined : 'Aniq summa'} active />
                    <div className="checkout-quick">
                      <Button size="sm" variant={cashGiven === String(total) ? 'primary' : 'secondary'} onClick={() => setCashGiven(String(total))}>
                        Aniq
                      </Button>
                      {quickCash(total).map((v) => (
                        <Button key={v} size="sm" variant={given === v ? 'primary' : 'secondary'} onClick={() => setCashGiven(String(v))}>
                          {formatMoney(v)}
                        </Button>
                      ))}
                    </div>
                    <div className={cx('checkout-change', change > 0 && 'is-on', cashGiven && given < total && 'is-short')}>
                      <span className="checkout-change__label">
                        {cashGiven && given < total ? 'Yetmayapti' : 'Qaytim'}
                      </span>
                      <Money
                        value={cashGiven && given < total ? total - given : change}
                        size="2xl"
                        tone={cashGiven && given < total ? 'danger' : change > 0 ? 'success' : 'muted'}
                      />
                    </div>
                  </>
                )}

                {method === 'mixed' && (
                  <>
                    <div className="checkout-rows checkout-rows--grid" role="group" aria-label="Aralash to'lov">
                      {mixRows.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={cx('checkout-row', m === activeRow && 'is-active', m === 'debt' && 'is-debt')}
                          onClick={() => setActiveRow(m)}
                          data-method={m}
                        >
                          <span className="checkout-row__m">
                            <Icon name={METHOD_ICON[m]} size={24} />
                            {METHOD_LABEL[m]}
                          </span>
                          <span className={cx('checkout-row__amt num', !n(mix[m]) && 'is-empty')}>
                            {formatMoney(n(mix[m]))}
                            <span className="checkout-amount__cur"> so'm</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="checkout-quick checkout-quick--mix">
                      <Button size="sm" icon="arrowRight" disabled={mixLeft <= 0} onClick={() => fillRest(activeRow)}>
                        Qolganini: {METHOD_LABEL[activeRow]}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="x"
                        disabled={!mixSum}
                        onClick={() => {
                          setMix(EMPTY_MIX)
                          setActiveRow('cash')
                        }}
                      >
                        Tozalash
                      </Button>
                    </div>
                    <div className={cx('checkout-change', 'is-on', 'checkout-change--mix', mixLeft < 0 && 'is-short', mixLeft === 0 && 'is-done')}>
                      <span className="checkout-change__label">{mixLeft < 0 ? 'Ortiqcha' : 'Qolgan'}</span>
                      <Money value={Math.abs(mixLeft)} size="2xl" tone={mixLeft < 0 ? 'danger' : mixLeft === 0 ? 'success' : 'warning'} />
                    </div>
                    {needsDebtor && picker}
                  </>
                )}

                {method === 'debt' && (
                  <>
                    {picker}
                    <AmountBox
                      label="Qarzga yoziladi"
                      value={debtSum}
                      active
                      tone="danger"
                      extra={
                        debtTouched ? (
                          <button type="button" className="checkout-link" onClick={() => { setDebtTouched(false); setDebtAmount('') }}>
                            To'liq summa
                          </button>
                        ) : (
                          <span className="checkout-amount__note">to'liq summa</span>
                        )
                      }
                    />
                    {debtSum < total && debtSum > 0 && (
                      <div className="checkout-rest">
                        <div className="checkout-rest__label">
                          Qolgani <Money value={debtLeft} tone="accent" /> hozir:
                        </div>
                        <Segmented<DebtPayMethod> value={debtRest} onChange={setDebtRest} options={DEBT_PAY_OPTIONS} block />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="checkout-pad">
                <Numpad mode="amount" value={padValue} onChange={setPad} maxLength={9} disabled={paying} />
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}


/** Katta summa ko'rsatkichi (numpad bilan to'ldiriladigan maydon) */
function AmountBox({
  label, value, placeholder, active, tone, extra
}: { label: string; value: number; placeholder?: string; active?: boolean; tone?: 'danger'; extra?: ReactNode }) {
  return (
    <div className={cx('checkout-amount', active && 'is-active', tone && 'is-' + tone)}>
      <div className="checkout-amount__top">
        <span className="checkout-amount__label">{label}</span>
        {extra}
      </div>
      <div className="checkout-amount__val num">
        {placeholder && !value ? (
          <span className="checkout-amount__ph">{placeholder}</span>
        ) : (
          <>
            {formatMoney(value)}
            <span className="checkout-amount__cur"> so'm</span>
          </>
        )}
      </div>
    </div>
  )
}

// ═════════ Chek oynasi ═════════
function ReceiptStage({ receipt, change, onDone }: { receipt: ReceiptData; change: number; onDone: () => void }) {
  const [printing, setPrinting] = useState(false)
  const [printed, setPrinted] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const busy = useRef(false)
  const autoDone = useRef(false)

  const print = async () => {
    if (busy.current) return
    busy.current = true
    setPrinting(true)
    setPrintError(null)
    try {
      await api.system.printReceipt(receipt)
      setPrinted(true)
    } catch (e) {
      setPrintError(errorMessage(e))
      toast.error(e, { description: "Printerni tekshirib, «Qayta urinish» ni bosing." })
    } finally {
      busy.current = false
      setPrinting(false)
    }
  }

  useEffect(() => {
    if (autoDone.current) return
    autoDone.current = true
    if (receipt.settings.autoPrintOnPay) void print()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      open
      onClose={onDone}
      size="lg"
      flush
      title="To'lov qabul qilindi"
      subtitle={'Chek № ' + receipt.receiptNo + ' · ' + receipt.roomName}
      headerExtra={
        printed ? <Badge tone="success" icon="check">Chop etildi</Badge> : printError ? <Badge tone="danger" icon="alert">Chop etilmadi</Badge> : undefined
      }
      footer={
        <>
          <Button size="lg" variant={printError ? 'primary' : 'secondary'} icon={printError ? 'refresh' : 'printer'} loading={printing} onClick={() => void print()}>
            {printError ? 'Qayta urinish' : printed ? 'Yana chop etish' : 'Chop etish'}
          </Button>
          <Button size="lg" variant={printError ? 'secondary' : 'primary'} icon="check" onClick={onDone} data-autofocus>
            Yopish
          </Button>
        </>
      }
    >
      <div className="checkout-done">
        <div className="checkout-done__info">
          <span className="checkout-done__icon">
            <Icon name="check" size={44} strokeWidth={2.6} />
          </span>
          <div className="checkout-done__label">Jami to'landi</div>
          <Money value={receipt.total} size="3xl" tone="accent" />
          <div className="checkout-done__pays">
            {receipt.payments.map((p, i) => (
              <div key={i} className="checkout-done__pay">
                <span>
                  <Icon name={METHOD_ICON[p.method]} size={22} />
                  {METHOD_LABEL[p.method]}
                </span>
                <Money value={p.amount} tone={p.method === 'debt' ? 'danger' : 'default'} />
              </div>
            ))}
            {change > 0 && (
              <div className="checkout-done__pay is-change">
                <span>
                  <Icon name="undo" size={22} />
                  Qaytim
                </span>
                <Money value={change} size="lg" tone="success" />
              </div>
            )}
          </div>
          {receipt.debtor && (
            <div className="checkout-done__debtor">
              <Icon name="wallet" size={22} />
              <div>
                <div className="t-bold">{receipt.debtor.name}</div>
                <div className="muted num">{receipt.debtor.phone}</div>
              </div>
            </div>
          )}
          {printError && (
            <div className="checkout-done__err">
              <Icon name="alert" size={22} />
              <span>{printError}</span>
            </div>
          )}
        </div>
        <div className="checkout-done__paper">
          <ReceiptPreview data={receipt} scale={1.15} />
        </div>
      </div>
    </Modal>
  )
}
