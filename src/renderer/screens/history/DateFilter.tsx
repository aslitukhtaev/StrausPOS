import { useState } from 'react'
import type { ReportRange } from '@shared/types'
import { Button, Input, Segmented, getNow, toast } from '@/ui'
import { ALL_TIME, fromInputDT, presetRange, toInput, toInputDT, type Preset } from './common'
import { ShiftSelect } from './ShiftSelect'

/** Sana filtri: Bugun / Kecha / 7 kun / Bu oy / Oraliq. */
export function DateFilter({ onChange, initial = 'today', allowAll = false }: {
  onChange: (r: ReportRange) => void
  /** Boshlang'ich tanlov (davrning o'zini ota komponent mos boshlang'ich qiymat bilan beradi) */
  initial?: Preset
  /** "Hammasi" (butun davr) tugmasi */
  allowAll?: boolean
}) {
  const [preset, setPreset] = useState<Preset>(initial)
  const [fromStr, setFromStr] = useState(() => toInputDT(new Date(toInput(getNow()) + 'T00:00').getTime()))
  const [toStr, setToStr] = useState(() => toInputDT(getNow()))

  const pick = (p: Preset) => {
    setPreset(p)
    if (p === 'all') return onChange(ALL_TIME)
    if (p !== 'custom' && p !== 'shift') {
      const r = presetRange(p, getNow())
      onChange(r)
      setFromStr(toInputDT(r.from))
      setToStr(toInputDT(r.to - 1))
    }
  }
  const applyCustom = () => {
    const f = fromInputDT(fromStr)
    const t = fromInputDT(toStr)
    if (f === null || t === null) return toast.warning('Sana va vaqtni kiriting')
    if (t < f) return toast.warning("Oxirgi vaqt boshlanishidan oldin bo'lishi mumkin emas")
    onChange({ from: f, to: t + 60_000 })
  }
  return (
    <>
      <Segmented<Preset>
        size="lg"
        value={preset}
        onChange={pick}
        options={[
          ...(allowAll ? [{ value: 'all' as Preset, label: 'Hammasi' }] : []),
          { value: 'today', label: 'Bugun' },
          { value: 'yesterday', label: 'Kecha' },
          { value: 'week', label: '7 kun' },
          { value: 'month', label: 'Bu oy' },
          { value: 'shift', label: 'Smena' },
          { value: 'custom', label: 'Oraliq' }
        ]}
      />
      {preset === 'shift' && <ShiftSelect onPick={(r) => onChange(r)} />}
      {preset === 'custom' && (
        <div className="hist-custom">
          <Input size="lg" type="datetime-local" value={fromStr} onChange={(e) => setFromStr(e.target.value)} aria-label="Boshlanish vaqti" />
          <span>–</span>
          <Input size="lg" type="datetime-local" value={toStr} onChange={(e) => setToStr(e.target.value)} aria-label="Oxirgi vaqt" />
          <Button size="md" variant="primary" onClick={applyCustom}>Ko'rsatish</Button>
        </div>
      )}
    </>
  )
}
