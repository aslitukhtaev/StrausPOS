import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, TimeInterval } from '@shared/types'
import { MS_MIN, billedMinutes, formatHours, guestTimeAmount } from '@shared/billing'
import { api } from '@/api'
import { Icon, Money, Segmented, formatMoney } from '@/ui'
import { Note, SaveBar, SectionHead, useReportDirty, type SectionProps } from './common'

type BillingKeys = 'defaultHours' | 'blockMinutes' | 'graceMinutes' | 'warnBeforeMinutes' | 'roundTo'
type Draft = Pick<AppSettings, BillingKeys>

const HOURS = [1, 2, 3, 4]
const BLOCKS = [30, 60]
const GRACE = [0, 5, 10, 15]
const WARN = [5, 10, 15]
const ROUND = [1, 100, 500, 1000, 5000]
const FALLBACK_RATE = 100_000

const pick = (s: AppSettings): Draft => ({
  defaultHours: s.defaultHours,
  blockMinutes: s.blockMinutes,
  graceMinutes: s.graceMinutes,
  warnBeforeMinutes: s.warnBeforeMinutes,
  roundTo: s.roundTo
})
const same = (a: Draft, b: Draft) => (Object.keys(a) as BillingKeys[]).every((k) => a[k] === b[k])

/** Standart variantlar + (agar boshqacha saqlangan bo'lsa) joriy qiymat */
function withCurrent(list: number[], cur: number): number[] {
  return list.indexOf(cur) >= 0 ? list : [...list, cur].sort((a, b) => a - b)
}

/** "25 daqiqa", "2 soat 10 daqiqa" — misollar uchun to'liq so'z bilan */
function longDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return h + ' soat ' + m + ' daqiqa'
  if (h) return h + ' soat'
  return m + ' daqiqa'
}

export function BillingSection({ settings, save, onDirty }: SectionProps) {
  const base = useMemo(() => pick(settings), [settings])
  const [d, setD] = useState<Draft>(base)
  const [saving, setSaving] = useState(false)
  const [room, setRoom] = useState<{ name: string; rate: number } | null>(null)
  useEffect(() => setD(base), [base])

  useEffect(() => {
    let alive = true
    api.rooms
      .list()
      .then((rs) => {
        const r = rs.filter((x) => x.active && x.pricePerHour > 0).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0]
        if (alive && r) setRoom({ name: r.name, rate: r.pricePerHour })
      })
      .catch(() => {
        /* misol standart narx bilan ko'rsatiladi */
      })
    return () => {
      alive = false
    }
  }, [])

  const dirty = !same(d, base)
  useReportDirty(dirty, onDirty)
  const set = <K extends BillingKeys>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  const rate = room?.rate ?? FALLBACK_RATE
  const paid = d.defaultHours * 60
  const opts = { roundTo: d.roundTo, blockMinutes: d.blockMinutes, graceMinutes: d.graceMinutes }
  const examples = [25, paid + 10, paid + d.blockMinutes + 10].map((sat) => {
    const ms = sat * MS_MIN
    const iv: TimeInterval[] = [{ roomId: 0, rate, start: 0, end: ms }]
    const billed = billedMinutes(ms, paid, opts)
    return { sat, billed, extra: billed > paid, amount: guestTimeAmount(iv, paid, ms, opts) }
  })

  const onSave = async () => {
    setSaving(true)
    await save({ ...settings, ...d }, 'Hisob-kitob sozlamalari saqlandi')
    setSaving(false)
  }

  return (
    <div className="set-section">
      <SectionHead icon="percent" title="Hisob-kitob" description="Oldindan olinadigan vaqt, oshib ketganda bloklar va yaxlitlash" />
      <div className="set-section__body">
        <div className="set-bill">
          <div className="set-bill__item">
            <div className="set-bill__head">
              <div className="set-bill__title"><Icon name="clock" size={22} /> Standart soat</div>
              <div className="set-bill__hint">Xona ochilganda har mehmonga shuncha vaqt tanlangan holda chiqadi</div>
            </div>
            <Segmented
              block size="lg" value={d.defaultHours} onChange={(v) => set('defaultHours', v)}
              options={withCurrent(HOURS, settings.defaultHours).map((h) => ({ value: h, label: h + ' soat' }))}
            />
          </div>
          <div className="set-bill__item">
            <div className="set-bill__head">
              <div className="set-bill__title"><Icon name="plus" size={22} /> Oshib ketganda blok</div>
              <div className="set-bill__hint">Olingan vaqtdan oshsa, har boshlangan blok to'liq qo'shiladi</div>
            </div>
            <Segmented
              block size="lg" value={d.blockMinutes} onChange={(v) => set('blockMinutes', v)}
              options={withCurrent(BLOCKS, settings.blockMinutes).map((m) => ({ value: m, label: m === 60 ? '1 soat' : m + ' daqiqa' }))}
            />
          </div>
          <div className="set-bill__item">
            <div className="set-bill__head">
              <div className="set-bill__title"><Icon name="timer" size={22} /> Imtiyozli daqiqa</div>
              <div className="set-bill__hint">
                {d.graceMinutes === 0 ? "Qattiq: 1 daqiqa oshsa ham keyingi blok qo'shiladi" : d.graceMinutes + " daqiqagacha oshsa — qo'shimcha to'lov yo'q"}
              </div>
            </div>
            <Segmented
              block size="lg" value={d.graceMinutes} onChange={(v) => set('graceMinutes', v)}
              options={withCurrent(GRACE, settings.graceMinutes).map((m) => ({ value: m, label: m === 0 ? "Yo'q" : m + ' daq' }))}
            />
          </div>
          <div className="set-bill__item">
            <div className="set-bill__head">
              <div className="set-bill__title"><Icon name="alert" size={22} /> Ogohlantirish</div>
              <div className="set-bill__hint">Vaqt tugashiga shuncha qolganda xona kartasi va taymer qizaradi</div>
            </div>
            <Segmented
              block size="lg" value={d.warnBeforeMinutes} onChange={(v) => set('warnBeforeMinutes', v)}
              options={withCurrent(WARN, settings.warnBeforeMinutes).map((m) => ({ value: m, label: m + ' daqiqa' }))}
            />
          </div>
          <div className="set-bill__item is-wide">
            <div className="set-bill__head">
              <div className="set-bill__title"><Icon name="cash" size={22} /> Yaxlitlash (so'm)</div>
              <div className="set-bill__hint">Vaqt summasi shu songa yaxlitlanadi</div>
            </div>
            <Segmented
              block size="lg" value={d.roundTo} onChange={(v) => set('roundTo', v)}
              options={withCurrent(ROUND, settings.roundTo).map((r) => ({ value: r, label: r === 1 ? "Yo'q" : formatMoney(r) }))}
            />
          </div>
        </div>

        <div className="set-example" data-testid="billing-example">
          <div className="set-example__title">
            Jonli misol — {room ? '«' + room.name + '»' : 'xona'}, {formatMoney(rate)} so'm / soat, 1 mehmon
          </div>
          <div className="set-example__steps">
            {examples.map((e) => (
              <div key={e.sat} className="set-example__step set-bill__ex">
                <span className="set-bill__ex-text">
                  <b>{formatHours(paid)}</b> olingan, <b>{longDuration(e.sat)}</b> o'tirdi
                  <span className="set-example__op"> → </span>
                  <b className={e.extra ? 't-danger' : 't-success'}>{formatHours(e.billed)}</b> to'lanadi
                </span>
                <Money value={e.amount} size="xl" tone={e.extra ? 'default' : 'accent'} />
              </div>
            ))}
          </div>
        </div>

        <Note>
          Mehmon kamroq o'tirsa ham olingan vaqt to'liq to'lanadi. Oshib ketsa{' '}
          {d.graceMinutes > 0 ? d.graceMinutes + ' daqiqa imtiyozdan keyin ' : ''}har boshlangan {formatHours(d.blockMinutes)} to'liq qo'shiladi.
          Mahsulot va xizmat narxlari yaxlitlanmaydi. Saqlangach ochiq hisoblar yangi qoida bilan ko'rsatiladi; yopilgan (to'langan)
          cheklar o'zgarmaydi.
        </Note>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => setD(base)} />
    </div>
  )
}
