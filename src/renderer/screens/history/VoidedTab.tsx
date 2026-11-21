/** Bekor qilingan hisoblar: kim, qachon, sabab va qaytarilgan pul (sessions.voided). */
import { useEffect, useRef, useState } from 'react'
import type { ReportRange, VoidedSessionRow } from '@shared/types'
import { api } from '@/api'
import { EmptyState, Money, Spinner, formatClock, formatDateShort, formatMoney, toast } from '@/ui'
import { methodBadges } from './common'

export function VoidedTab({ range }: { range: ReportRange }) {
  const [rows, setRows] = useState<VoidedSessionRow[] | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const my = ++seq.current
    setRows(null)
    api.sessions
      .voided(range)
      .then((x) => my === seq.current && setRows(x))
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setRows([])
      })
  }, [range])

  if (!rows) return <div className="hist-center"><Spinner size={40} /></div>
  if (rows.length === 0) return <EmptyState icon="inbox" size="lg" title="Bekor qilingan hisob yo'q" description="Tanlangan davrda hisob bekor qilinmagan." />
  const refund = rows.reduce((a, r) => a + r.refund, 0)
  return (
    <table className="hist-table" data-testid="voided-table">
      <thead>
        <tr>
          <th>Chek №</th><th>Xona</th><th>Bekor qilingan</th><th>Kim</th><th>Sabab</th><th>To'lov</th><th className="r">Jami</th><th className="r">Qaytarilgan pul</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.sessionId} data-testid="voided-row">
            <td className="num hist-no">{r.receiptNo != null ? '№' + r.receiptNo : '—'}</td>
            <td className="hist-room">{r.roomName}</td>
            <td className="nowrap num"><div>{formatClock(r.voidedAt)}</div><div className="hist-sub">{formatDateShort(r.voidedAt)}</div></td>
            <td>{r.voidedBy || '—'}</td>
            <td>{r.reason || '—'}</td>
            <td>{methodBadges(r.paymentMethods).join(', ')}</td>
            <td className="r"><Money value={r.total} size="md" currency={false} /></td>
            <td className="r"><Money value={r.refund} size="md" currency={false} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="hist-total">
          <td colSpan={7}><b>{rows.length}</b> ta bekor qilingan hisob</td>
          <td className="r"><b className="num">{formatMoney(refund)}</b></td>
        </tr>
      </tfoot>
    </table>
  )
}
