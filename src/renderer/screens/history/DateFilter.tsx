import { useState } from 'react'
import type { ReportRange } from '@shared/types'
import { Button, Input, Segmented, getNow, toast } from '@/ui'
import { addDays, fromInput, presetRange, toInput, type Preset } from './common'

/** Sana filtri: Bugun / Kecha / 7 kun / Bu oy / Oraliq. */
export function DateFilter({ onChange }: { onChange: (r: ReportRange) => void }) {
  const [preset, setPreset] = useState<Preset>('today')
  const [fromStr, setFromStr] = useState(() => toInput(getNow()))
  const [toStr, setToStr] = useState(() => toInput(getNow()))

  const pick = (p: Preset) => {
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
    <>
      <Segmented<Preset>
        size="lg"
        value={preset}
        onChange={pick}
        options={[
          { value: 'today', label: 'Bugun' },
          { value: 'yesterday', label: 'Kecha' },
          { value: 'week', label: '7 kun' },
          { value: 'month', label: 'Bu oy' },
          { value: 'custom', label: 'Oraliq' }
        ]}
      />
      {preset === 'custom' && (
        <div className="hist-custom">
          <Input size="lg" type="date" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish sanasi" />
          <span>–</span>
          <Input size="lg" type="date" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi sana" />
          <Button size="md" variant="primary" onClick={applyCustom}>Ko'rsatish</Button>
        </div>
      )}
    </>
  )
}
