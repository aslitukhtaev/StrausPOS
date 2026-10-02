/**
 * Vaqt tanlash (olinadigan vaqt): katta tugmalar 1/2/3/4 soat + "Boshqa" (soat va daqiqa stepperlari).
 * Qiymat — daqiqa. Klaviatura: ochish oynasida emas (u yerda raqamlar mehmonlar soni uchun).
 */
import { useState } from 'react'
import { Stepper, cx } from '@/ui'

const QUICK = [60, 120, 180, 240]
const MAX_MIN = 24 * 60

export function TimePicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const [custom, setCustom] = useState(QUICK.indexOf(value) < 0)
  const h = Math.floor(value / 60)
  const m = value % 60
  const setHM = (hh: number, mm: number) => {
    let total = hh * 60 + mm
    if (total < 15) total = hh === 0 ? 15 : total
    onChange(Math.min(MAX_MIN, total))
  }
  return (
    <div className="rooms-time">
      <div className="rooms-time__quick">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            className={cx('rooms-time__btn', !custom && q === value && 'is-active')}
            aria-pressed={!custom && q === value}
            onClick={() => {
              setCustom(false)
              onChange(q)
            }}
          >
            <span className="rooms-time__n num">{q / 60}</span>
            <span className="rooms-time__u">soat</span>
          </button>
        ))}
        <button
          type="button"
          className={cx('rooms-time__btn', 'rooms-time__btn--other', custom && 'is-active')}
          aria-pressed={custom}
          onClick={() => setCustom(true)}
        >
          <span className="rooms-time__u">Boshqa</span>
        </button>
      </div>
      {custom && (
        <div className="rooms-time__custom">
          <Stepper value={h} onChange={(v) => setHM(v, v === 0 && m === 0 ? 15 : m)} min={0} max={24} suffix="soat" />
          <Stepper value={m} onChange={(v) => setHM(h, v)} min={h === 0 ? 15 : 0} max={45} step={15} suffix="daq" />
        </div>
      )}
    </div>
  )
}
