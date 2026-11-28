/** Qarzlar jurnali: har bir qarz alohida qator — qachon, qaysi chek, kimga, kim bergan, nima olingan, qoldiq. */
import type { DebtJournalRow } from '@shared/types'
import { Badge, Money, formatClock, formatDateShort } from '@/ui'
import { itemsText, leftOf, totalsOf } from './model'

export function JournalTab({ rows, onOpen }: { rows: DebtJournalRow[]; onOpen: (d: DebtJournalRow) => void }) {
  const t = totalsOf(rows)
  return (
    <table className="hist-table" data-testid="debts-journal">
      <thead>
        <tr>
          <th>Sana</th><th>Chek №</th><th>Qarzdor</th><th>Kim bergan</th><th>Qayerdan / nima olingan</th>
          <th className="r">Summa</th><th className="r">To'langan</th><th className="r">Qoldiq</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const left = leftOf(d)
          return (
            <tr key={d.id} className="hist-row" tabIndex={0} data-testid="debt-row" onClick={() => onOpen(d)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(d))}>
              <td className="num"><div>{formatDateShort(d.createdAt)}</div><div className="hist-sub">{formatClock(d.createdAt)}</div></td>
              <td className="num hist-no">{d.receiptNo != null ? '№' + d.receiptNo : '—'}</td>
              <td className="hist-wrap"><div className="hist-nm">{d.customerName}</div><div className="hist-sub num">{d.phone || '—'}</div></td>
              <td className="hist-who" data-testid="debt-by">{d.issuedByName || '—'}</td>
              <td className="hist-wrap debts-items">
                <div className="t-bold">{d.roomName || '—'}</div>
                <div className="hist-sub debts-items__txt">{itemsText(d) || (d.source === 'room' ? 'Xona vaqti' : '—')}</div>
              </td>
              <td className="r"><Money value={d.amount} size="md" currency={false} /></td>
              <td className="r"><Money value={d.paid} size="md" currency={false} tone={d.paid ? 'success' : 'muted'} /></td>
              <td className="r">{left > 0 ? <Money value={left} size="md" currency={false} tone="danger" /> : <Badge tone="success" size="sm" icon="check">Yopilgan</Badge>}</td>
            </tr>
          )
        })}
        <tr className="hist-total">
          <td colSpan={5}><b>Jami: {t.count} ta qarz, {t.debtors} qarzdor</b></td>
          <td className="r"><Money value={t.amount} size="md" currency={false} /></td>
          <td className="r"><Money value={t.paid} size="md" currency={false} tone="success" /></td>
          <td className="r"><Money value={t.left} size="md" currency={false} tone="danger" /></td>
        </tr>
      </tbody>
    </table>
  )
}
