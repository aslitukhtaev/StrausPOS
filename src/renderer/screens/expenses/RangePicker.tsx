import { useState } from 'react'
import type { ReportRange } from '@shared/types'
import { Button, Input, Segmented, getNow, toast } from '@/ui'
import { addDays, fromInput, presetRange, toInput, type RangePreset } from './range'

/** Davr tanlash: Bugun / 7 kun / Bu oy / O'tgan oy / Oraliq. `initial` — boshlang'ich tanlov. */
export function RangePicker({ initial = 'month', onChange }: { initial?: RangePreset; onChange: (r: ReportRange) => void }) {
  const [preset, setPreset] = useState<RangePreset>(initial)
  const [fromStr, setFromStr] = useState(() => toInput(getNow()))
  const [toStr, setToStr] = useState(() => toInput(getNow()))

  const pick = (p: RangePreset) => {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p, getNow())
      onChange(r)
      setFromStr(toInput(r.from))
      setToStr(toInput(r.to - 1))
    }
  }
  const applyCustom = () => {
    const f = fromInput(fromStr)
    const t = fromInput(toStr)
    if (f === null || t === null) return toast.warning('Ikkala sanani ham kiriting')
    if (t < f) return toast.warning("Oxirgi sana boshlanishidan oldin bo'lishi mumkin emas")
    onChange({ from: f, to: addDays(t, 1) })
  }
  return (
    <div className="exp-period">
      <Segmented<RangePreset>
        size="lg"
        value={preset}
        onChange={pick}
        options={[
          { value: 'today', label: 'Bugun' },
          { value: 'week', label: '7 kun' },
          { value: 'month', label: 'Bu oy' },
          { value: 'lastMonth', label: "O'tgan oy" },
          { value: 'custom', label: 'Oraliq' }
        ]}
      />
      {preset === 'custom' && (
        <div className="exp-period__custom">
          <Input size="lg" type="date" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish sanasi" />
          <span>–</span>
          <Input size="lg" type="date" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi sana" />
          <Button size="md" variant="primary" onClick={applyCustom}>Ko'rsatish</Button>
        </div>
      )}
    </div>
  )
}

/** Boshlang'ich oraliq (initial bilan mos) */
export function initialRange(p: RangePreset = 'month'): ReportRange {
  return presetRange(p === 'custom' ? 'month' : p, getNow())
}
