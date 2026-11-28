/** Smenalar ro'yxati (oxirgi 40 ta): kim ochgan/yopgan, tushum, usullar, topshirilishi kerak naqd. Qatorni bosish — shu smena hisoboti. */
import { useEffect, useState } from 'react'
import type { ReportRange, ShiftRow } from '@shared/types'
import { api } from '@/api'
import { Badge, Card, EmptyState, Money, Spinner, formatClock, formatDateShort, toast } from '@/ui'
import { shiftRange } from '../history/ShiftSelect'

export function ShiftsTab({ onPick }: { onPick: (range: ReportRange) => void }) {
  const [rows, setRows] = useState<ShiftRow[] | null>(null)
  useEffect(() => {
    api.shifts.list(40).then(setRows).catch((e) => { toast.error(e); setRows([]) })
  }, [])
  if (!rows) return <div className="rep-center"><Spinner size={40} /></div>
  if (rows.length === 0) return <EmptyState size="lg" icon="clock" title="Hali smena ochilmagan" description="Yuqoridagi «Smenani ochish» tugmasini bosing." />
  return (
    <Card padding="none">
      <table className="ui-table rep-table" data-testid="shifts-table">
        <thead>
          <tr>
            <th>№</th><th>Ochilgan</th><th>Yopilgan</th><th>Kassir</th><th className="r">Jami</th><th className="r">Naqd</th><th className="r">Click</th>
            <th className="r">Terminal</th><th className="r">Qarz</th><th className="r">Chegirma</th><th className="r">Topshirilishi kerak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.shift.id} className="hist-row" tabIndex={0} onClick={() => onPick(shiftRange(r))} data-testid="shift-row">
              <td className="num">{r.shift.id}</td>
              <td className="num nowrap">{formatDateShort(r.shift.openedAt)} {formatClock(r.shift.openedAt)}</td>
              <td className="num nowrap">
                {r.shift.closedAt != null ? formatDateShort(r.shift.closedAt) + ' ' + formatClock(r.shift.closedAt) : <Badge tone="success" size="sm">ochiq</Badge>}
                {r.shift.autoClosed && <span className="subtle"> (avto)</span>}
              </td>
              <td>{r.shift.openedByName}{r.shift.closedByName && r.shift.closedByName !== r.shift.openedByName ? ' → ' + r.shift.closedByName : ''}</td>
              <td className="r"><Money value={r.summary?.total ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.byMethod.cash ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.byMethod.card ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.byMethod.terminal ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.byMethod.debt ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.discounts ?? 0} size="sm" currency={false} /></td>
              <td className="r"><Money value={r.summary?.expectedCash ?? 0} size="md" currency={false} tone="success" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
