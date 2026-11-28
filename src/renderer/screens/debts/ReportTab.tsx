/** Qarzlar hisoboti (tanlangan filtrlar bo'yicha): kim qancha bergan, kimga, qaysi kuni, to'lovlarni kim qabul qilgan. */
import type { DebtJournalRow } from '@shared/types'
import { Badge, Card, Money, formatClock, formatDateShort } from '@/ui'
import { METHOD_LABEL } from '../checkout/methods'
import { startOfDay } from '../history/common'
import { byDebtor, byIssuer, totalsOf, type Collection } from './model'

interface Props {
  /** Davrda berilgan (filtrlangan) qarzlar */
  rows: DebtJournalRow[]
  /** Davrda qabul qilingan to'lovlar */
  pays: Collection[]
  onStaff: (id: number) => void
  onDebtor: (id: number) => void
}

const money = (v: number, tone?: 'success' | 'danger') => <Money value={v} size="md" currency={false} tone={tone} />

export function ReportTab({ rows, pays, onStaff, onDebtor }: Props) {
  const t = totalsOf(rows)
  const collected = pays.reduce((a, p) => a + p.amount, 0)
  const issuers = byIssuer(rows)
  const debtors = byDebtor(rows).sort((a, b) => b.left - a.left || b.amount - a.amount)

  const days = new Map<number, { count: number; issued: number; collected: number }>()
  const day = (at: number) => {
    const k = startOfDay(at)
    let x = days.get(k)
    if (!x) days.set(k, (x = { count: 0, issued: 0, collected: 0 }))
    return x
  }
  for (const d of rows) {
    const x = day(d.createdAt)
    x.count++
    x.issued += d.amount
  }
  for (const p of pays) day(p.at).collected += p.amount

  const takers = new Map<number, { name: string; count: number; cash: number; card: number; terminal: number; total: number }>()
  for (const p of pays) {
    let x = takers.get(p.byId)
    if (!x) takers.set(p.byId, (x = { name: p.byName || 'Nomaʼlum', count: 0, cash: 0, card: 0, terminal: 0, total: 0 }))
    x.count++
    x[p.method] += p.amount
    x.total += p.amount
  }

  return (
    <div className="hist" data-testid="debts-report">
      <div className="debts-kpis">
        <Card padding="md"><div className="hist-kpi__l">Qarzga berilgan ({t.count} ta)</div><Money value={t.amount} size="xl" /></Card>
        <Card padding="md"><div className="hist-kpi__l">Shundan qaytgan</div><Money value={t.paid} size="xl" tone="success" /></Card>
        <Card padding="md"><div className="hist-kpi__l">Qaytmagan qoldiq ({t.debtors} qarzdor)</div><Money value={t.left} size="xl" tone={t.left ? 'danger' : 'success'} /></Card>
        <Card padding="md"><div className="hist-kpi__l">Davrda undirilgan ({pays.length} ta to'lov)</div><Money value={collected} size="xl" tone="accent" /></Card>
      </div>

      <section>
        <h3 className="hist-h">Kim qancha qarzga bergan <span className="hist-sub">— bosing, shu xodimning qarzlari ochiladi</span></h3>
        <table className="hist-table" data-testid="report-issuers">
          <thead><tr><th>Xodim</th><th className="r">Qarzlar</th><th className="r">Qarzdorlar</th><th className="r">Berilgan</th><th className="r">Qaytgan</th><th className="r">Qoldiq</th><th>Oxirgi marta</th></tr></thead>
          <tbody>
            {issuers.map((g) => (
              <tr key={g.key} className="hist-row" onClick={() => g.key && onStaff(g.key)}>
                <td className="hist-who">{g.name}</td>
                <td className="r num">{g.count}</td><td className="r num">{g.debtors}</td>
                <td className="r">{money(g.amount)}</td><td className="r">{money(g.paid, 'success')}</td><td className="r">{money(g.left, g.left ? 'danger' : undefined)}</td>
                <td className="num">{formatDateShort(g.lastAt)} {formatClock(g.lastAt)}</td>
              </tr>
            ))}
            {!issuers.length && <tr><td colSpan={7} className="subtle">Bu davrda qarz berilmagan</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="hist-h">Kimga berilgan</h3>
        <table className="hist-table" data-testid="report-debtors">
          <thead><tr><th>Qarzdor</th><th>Kim bergan</th><th className="r">Qarzlar</th><th className="r">Berilgan</th><th className="r">Qaytgan</th><th className="r">Qoldiq</th><th>Oxirgi marta</th></tr></thead>
          <tbody>
            {debtors.map((g) => (
              <tr key={g.key} className="hist-row" onClick={() => onDebtor(g.key)}>
                <td className="hist-wrap"><div className="hist-nm">{g.name}</div><div className="hist-sub num">{g.phone}</div></td>
                <td className="hist-wrap">{g.issuers.join(', ') || '—'}</td>
                <td className="r num">{g.count}</td>
                <td className="r">{money(g.amount)}</td><td className="r">{money(g.paid, 'success')}</td><td className="r">{money(g.left, g.left ? 'danger' : undefined)}</td>
                <td className="num">{formatDateShort(g.lastAt)} {formatClock(g.lastAt)}</td>
              </tr>
            ))}
            {!debtors.length && <tr><td colSpan={7} className="subtle">Bu davrda qarz berilmagan</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="hist-h">Kunlar bo'yicha</h3>
        <table className="hist-table" data-testid="report-days">
          <thead><tr><th>Kun</th><th className="r">Qarzlar</th><th className="r">Berilgan</th><th className="r">Undirilgan</th></tr></thead>
          <tbody>
            {Array.from(days.entries()).sort((a, b) => b[0] - a[0]).map(([k, x]) => (
              <tr key={k}><td className="num">{formatDateShort(k)}</td><td className="r num">{x.count}</td><td className="r">{money(x.issued)}</td><td className="r">{money(x.collected, x.collected ? 'success' : undefined)}</td></tr>
            ))}
            {!days.size && <tr><td colSpan={4} className="subtle">Ma'lumot yo'q</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="hist-h">Qarz to'lovini kim qabul qilgan</h3>
        <table className="hist-table" data-testid="report-takers">
          <thead><tr><th>Xodim</th><th className="r">To'lovlar</th><th className="r">{METHOD_LABEL.cash}</th><th className="r">{METHOD_LABEL.card}</th><th className="r">{METHOD_LABEL.terminal}</th><th className="r">Jami</th></tr></thead>
          <tbody>
            {Array.from(takers.entries()).sort((a, b) => b[1].total - a[1].total).map(([id, x]) => (
              <tr key={id}><td className="hist-who">{x.name}</td><td className="r num">{x.count}</td><td className="r">{money(x.cash)}</td><td className="r">{money(x.card)}</td><td className="r">{money(x.terminal)}</td><td className="r">{money(x.total, 'success')}</td></tr>
            ))}
            {!takers.size && <tr><td colSpan={6} className="subtle">Bu davrda to'lov qabul qilinmagan</td></tr>}
          </tbody>
        </table>
      </section>

      {pays.length > 0 && (
        <section>
          <h3 className="hist-h">To'lovlar ro'yxati</h3>
          <table className="hist-table" data-testid="report-pays">
            <thead><tr><th>Vaqt</th><th>Qarzdor</th><th>Chek №</th><th>Qarz sanasi</th><th>Kim bergan</th><th>Kim qabul qilgan</th><th>Usul</th><th className="r">Summa</th></tr></thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id} className="hist-row" onClick={() => onDebtor(p.debt.debtorId)}>
                  <td className="num">{formatDateShort(p.at)} {formatClock(p.at)}</td>
                  <td className="hist-nm">{p.debt.customerName}</td>
                  <td className="num">{p.debt.receiptNo != null ? '№' + p.debt.receiptNo : '—'}</td>
                  <td className="num">{formatDateShort(p.debt.createdAt)}</td>
                  <td>{p.debt.issuedByName || '—'}</td>
                  <td className="hist-who">{p.byName || '—'}</td>
                  <td><Badge tone={p.method === 'cash' ? 'success' : 'info'} size="sm">{METHOD_LABEL[p.method]}</Badge></td>
                  <td className="r">{money(p.amount, 'success')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
