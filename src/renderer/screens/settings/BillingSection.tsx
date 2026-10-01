import { useEffect, useState } from 'react'
import type { TimeInterval } from '@shared/types'
import { guestTimeAmount, guestTimeRaw } from '@shared/billing'
import { Money, Segmented, formatMoney } from '@/ui'
import { Note, SaveBar, SectionHead, useReportDirty, type SectionProps } from './common'

const ROUND_OPTIONS = [1, 100, 500, 1000, 5000]
const EX_MIN = 97 // 1 soat 37 daqiqa
const EX_RATE = 70_000
const EX_INTERVALS: TimeInterval[] = [{ roomId: 0, rate: EX_RATE, start: 0, end: EX_MIN * 60_000 }]
const EX_NOW = EX_MIN * 60_000

function rawText(n: number) {
  const cents = Math.round(n * 100)
  const frac = cents % 100
  return formatMoney(Math.floor(cents / 100)) + (frac ? ',' + String(frac).padStart(2, '0') : '')
}

function label(r: number) {
  return r === 1 ? 'Yaxlitlamaslik' : formatMoney(r)
}

export function BillingSection({ settings, save, onDirty }: SectionProps) {
  const [roundTo, setRoundTo] = useState(settings.roundTo)
  const [saving, setSaving] = useState(false)
  useEffect(() => setRoundTo(settings.roundTo), [settings.roundTo])

  const dirty = roundTo !== settings.roundTo
  useReportDirty(dirty, onDirty)

  const raw = guestTimeRaw(EX_INTERVALS, EX_NOW)
  const rounded = guestTimeAmount(EX_INTERVALS, EX_NOW, roundTo)

  const onSave = async () => {
    setSaving(true)
    await save({ ...settings, roundTo }, 'Yaxlitlash saqlandi')
    setSaving(false)
  }

  // Nostandart qiymat (masalan oldin boshqa joyda saqlangan) bo'lsa ham ko'rsatamiz
  const options = ROUND_OPTIONS.indexOf(settings.roundTo) >= 0 ? ROUND_OPTIONS : [...ROUND_OPTIONS, settings.roundTo].sort((a, b) => a - b)

  return (
    <div className="set-section">
      <SectionHead icon="percent" title="Hisob-kitob" description="Vaqt summasi qanday yaxlitlanadi" />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">Vaqt summasini yaxlitlash (so'm)</div>
          <Segmented block size="lg" value={roundTo} onChange={setRoundTo} options={options.map((r) => ({ value: r, label: label(r) }))} />
        </div>

        <div className="set-example" data-testid="round-example">
          <div className="set-example__title">Misol</div>
          <div className="set-example__formula">
            <span className="num">1 soat 37 daqiqa</span>
            <span className="set-example__op">×</span>
            <Money value={EX_RATE} size="lg" />
            <span className="set-example__unit">/ soat</span>
          </div>
          <div className="set-example__steps">
            <div className="set-example__step">
              <span className="muted">Aniq hisob: 97 daq × {formatMoney(EX_RATE)} / 60</span>
              <span className="num">≈ {rawText(raw)} so'm</span>
            </div>
            <div className="set-example__step is-result">
              <span>Chekda {roundTo > 1 ? `(${formatMoney(roundTo)} ga yaxlitlangan)` : ''}</span>
              <Money value={rounded} size="2xl" tone="accent" />
            </div>
          </div>
        </div>

        <Note>
          Har bir mehmonning vaqti alohida hisoblanadi: to'liq daqiqalar × xona narxi / 60, keyin shu qiymatga
          eng yaqin songa yaxlitlanadi (yarmidan yuqorisi — tepaga). Mahsulot va xizmat narxlari yaxlitlanmaydi.
          Saqlangach ochiq hisoblar ham yangi qoida bilan ko'rsatiladi; yopilgan (to'langan) cheklar o'zgarmaydi.
        </Note>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => setRoundTo(settings.roundTo)} />
    </div>
  )
}
