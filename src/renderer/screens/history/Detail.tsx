import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionDetail } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { formatDuration } from '@shared/billing'
import { Button, EmptyState, Icon, Modal, Money, Spinner, errorMessage, formatClock, formatDate, formatDateTime, formatMinutes, formatMoney, toast } from '@/ui'
import { staffName, useStaffList } from '../rooms/staffNames'
import { METHOD_LABEL } from './common'
import './history.css'

/* ───────────── Tafsilot ───────────── */
export function DetailDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [d, setD] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const staff = useStaffList()
  const canPrint = useCan('session.pay') || useCan('reports.view')

  const load = useCallback(() => {
    setD(null)
    setError(null)
    api.sessions
      .detail(sessionId)
      .then(setD)
      .catch((e: unknown) => {
        setError(errorMessage(e))
        toast.error(e)
      })
  }, [sessionId])
  useEffect(load, [load])

  const reprint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const r = await api.checkout.receipt(sessionId)
      await api.system.printReceipt(r)
      toast.success('Chek chop etildi', { description: '№' + r.receiptNo })
    } catch (e) {
      toast.error(e, { description: "Printerni tekshirib, qayta urinib ko'ring." })
    } finally {
      setPrinting(false)
    }
  }

  const v = d ? d.view : null
  const byStaff = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; amount: number }>()
    if (v) for (const l of v.lines) {
      if (l.activeQty <= 0) continue
      const name = l.createdByName || '—'
      const x = m.get(name) || { name, qty: 0, amount: 0 }
      x.qty += l.activeQty
      x.amount += l.amount
      m.set(name, x)
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount)
  }, [v])
  const isBar = !!v && v.session.kind === 'bar'
  const title = v ? (isBar ? 'Bar savdosi' : v.room.name) : 'Hisob'
  const guestLabel = (id: number | null) => (id == null ? null : v ? (v.guests.find((g) => g.id === id) || { label: '' }).label : null)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={title + (d && d.receiptNo != null ? ' · chek №' + d.receiptNo : '')}
      subtitle={v ? formatDateTime(v.session.openedAt) + (v.session.closedAt ? ' – ' + formatClock(v.session.closedAt) : ' (ochiq)') : undefined}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Yopish</Button>
          <div className="spacer" />
          <Button
            variant="primary" size="lg" icon="printer" onClick={() => void reprint()} loading={printing}
            disabled={!d || d.receiptNo == null || !canPrint} data-testid="hist-reprint"
          >
            Chekni qayta chop etish
          </Button>
        </>
      }
    >
      <div className="hist-det" data-testid="hist-detail">
        {error ? (
          <EmptyState icon="alert" title="Tafsilotni yuklab bo'lmadi" description={error} action={<Button icon="refresh" onClick={load}>Qayta urinish</Button>} />
        ) : !v || !d ? (
          <div className="hist-center"><Spinner size={40} /></div>
        ) : (
          <>
            <div className="hist-det__head">
              <span><Icon name="user" size={18} /> Ochdi: {d.openedBy || '—'}</span>
              <span><Icon name="cash" size={18} /> Kassir: {d.cashier || '—'}</span>
              {v.waiterName && <span><Icon name="user" size={18} /> Ofitsiant: {v.waiterName}</span>}
              {!isBar && <span><Icon name="users" size={18} /> {v.guests.length} mehmon</span>}
            </div>

            {!isBar && (
              <section>
                <h3 className="hist-h">Mehmonlar</h3>
                <table className="hist-tbl">
                  <thead>
                    <tr><th>Mehmon</th><th>Keldi – ketdi</th><th>Olingan</th><th>O'tirdi</th><th>Hisoblangan</th><th className="r">Summa</th></tr>
                  </thead>
                  <tbody>
                    {v.guests.map((g) => {
                      const first = g.intervals.length ? g.intervals[0].start : null
                      const last = g.intervals.length ? g.intervals[g.intervals.length - 1].end : null
                      return (
                        <tr key={g.id} data-testid="hist-guest">
                          <td className="hist-nm">{g.label}</td>
                          <td className="num">{first != null ? formatClock(first) : '—'} – {last != null ? formatClock(last) : '—'}</td>
                          <td>{formatMinutes(g.paidMinutes)}</td>
                          <td className="num">{formatDuration(g.elapsedMs)}</td>
                          <td>{formatMinutes(g.billedMinutes)}</td>
                          <td className="r"><Money value={g.timeAmount} size="sm" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h3 className="hist-h">Sotilgan mahsulot va xizmatlar</h3>
              {v.lines.length === 0 ? (
                <div className="subtle">Hech narsa qo'shilmagan</div>
              ) : (
                <table className="hist-tbl" data-testid="hist-lines">
                  <thead>
                    <tr><th>Nomi</th><th className="r">Soni</th><th className="r">Narxi</th><th>Sotgan xodim</th><th>Ofitsiant</th><th className="r">Summa</th></tr>
                  </thead>
                  <tbody>
                    {v.lines.map((l) => {
                      const gone = l.activeQty <= 0
                      const who = guestLabel(l.guestId)
                      return (
                        <tr key={l.id} className={gone ? 'is-gone' : undefined} data-testid="hist-line">
                          <td>
                            <div className="hist-nm">{l.name}</div>
                            <div className="hist-sub">{who || (isBar ? '' : 'Butun guruh')}{l.providerName ? ' · ' + l.providerName : ''}</div>
                          </td>
                          <td className="r num">
                            {l.activeQty}
                            {l.returnedQty > 0 && <div className="hist-ret">−{l.returnedQty} qaytdi</div>}
                          </td>
                          <td className="r num">{formatMoney(l.unitPrice)}</td>
                          <td><div className="hist-who" data-testid="hist-line-by">{l.createdByName || '—'}</div><div className="hist-sub num">{formatClock(l.createdAt)}</div></td>
                          <td>{staffName(staff, l.waiterId) || '—'}</td>
                          <td className="r"><Money value={gone ? l.qty * l.unitPrice : l.amount} size="sm" strike={gone} tone={gone ? 'muted' : 'default'} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {byStaff.length > 0 && (
              <section>
                <h3 className="hist-h">Xodimlar bo'yicha</h3>
                <table className="hist-tbl hist-tbl--sm" data-testid="hist-bystaff">
                  <thead><tr><th>Xodim</th><th className="r">Mahsulot soni</th><th className="r">Summa</th></tr></thead>
                  <tbody>
                    {byStaff.map((x) => (
                      <tr key={x.name} data-testid="hist-bystaff-row">
                        <td className="hist-nm">{x.name}</td>
                        <td className="r num">{x.qty}</td>
                        <td className="r"><Money value={x.amount} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {d.returns.length > 0 && (
              <section>
                <h3 className="hist-h">Qaytarishlar</h3>
                <table className="hist-tbl" data-testid="hist-returns">
                  <thead>
                    <tr><th>Nomi</th><th className="r">Soni</th><th>Sabab</th><th>Kim</th><th>Qachon</th></tr>
                  </thead>
                  <tbody>
                    {d.returns.map((r, i) => (
                      <tr key={i}>
                        <td className="hist-nm">{r.name}</td>
                        <td className="r num">{r.qty}</td>
                        <td>{r.reason || '—'}</td>
                        <td>{r.byName || '—'}</td>
                        <td className="num">{formatDate(r.at, false)} · {formatClock(r.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h3 className="hist-h">Hisob</h3>
              <div className="hist-totals" data-testid="hist-totals">
                {!isBar && (<><span>Vaqt</span><Money value={v.timeTotal} /></>)}
                <span>Buyurtmalar</span><Money value={v.linesTotal} />
                {v.discount > 0 && (<><span>Chegirma</span><Money value={-v.discount} tone="success" /></>)}
                {v.serviceCharge > 0 && (<><span>Obsluga {v.serviceChargePct}%</span><Money value={v.serviceCharge} /></>)}
                <span className="is-total">JAMI</span><span className="is-total"><Money value={v.total} size="xl" tone="accent" /></span>
                {v.payments.map((p) => (
                  <PayRow key={p.id} label={(METHOD_LABEL[p.method] || p.method) + ' · ' + formatClock(p.at)} amount={p.amount} debt={p.method === 'debt'} />
                ))}
                {v.due > 0 && (<><span className="hist-debt">Qarz / to'lanmagan</span><Money value={v.due} tone="danger" /></>)}
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function PayRow({ label, amount, debt }: { label: string; amount: number; debt: boolean }) {
  return (
    <>
      <span className={debt ? 'hist-debt' : undefined}>{label}</span>
      <Money value={amount} tone={debt ? 'danger' : 'default'} />
    </>
  )
}
