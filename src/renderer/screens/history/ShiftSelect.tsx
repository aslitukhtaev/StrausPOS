/** Smena tanlash: oxirgi smenalar ro'yxati; tanlangach davr = smena oralig'i [ochilgan, yopilgan). */
import { useEffect, useState } from 'react'
import type { ReportRange, ShiftRow } from '@shared/types'
import { api } from '@/api'
import { Select, formatClock, formatDateShort, getNow } from '@/ui'

export const shiftRange = (r: ShiftRow): ReportRange => ({ from: r.shift.openedAt, to: r.shift.closedAt ?? getNow() + 60_000 })
export const shiftLabel = (r: ShiftRow) =>
  '№' + r.shift.id + ' · ' + r.shift.openedByName + ' · ' + formatDateShort(r.shift.openedAt) + ' ' + formatClock(r.shift.openedAt) +
  ' – ' + (r.shift.closedAt != null ? formatClock(r.shift.closedAt) : 'davom etmoqda')

export function ShiftSelect({ onPick }: { onPick: (range: ReportRange, shift: ShiftRow) => void }) {
  const [rows, setRows] = useState<ShiftRow[] | null>(null)
  const [sel, setSel] = useState('')
  useEffect(() => {
    api.shifts.list(40).then((l) => {
      setRows(l)
      if (l.length > 0) {
        setSel(String(l[0].shift.id))
        onPick(shiftRange(l[0]), l[0])
      }
    }).catch(() => setRows([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (rows && rows.length === 0) return <span className="subtle" data-testid="no-shifts">Hali smena ochilmagan</span>
  return (
    <div className="hist-sel">
      <Select
        size="lg" value={sel} aria-label="Smena" data-testid="shift-select"
        onChange={(e) => {
          setSel(e.target.value)
          const r = (rows || []).find((x) => String(x.shift.id) === e.target.value)
          if (r) onPick(shiftRange(r), r)
        }}
      >
        {(rows || []).map((r) => <option key={r.shift.id} value={r.shift.id}>{shiftLabel(r)}</option>)}
      </Select>
    </div>
  )
}
