import { useState } from 'react'
import type { AppSettings } from '@shared/types'
import { Icon, Spinner, cx, type IconName } from '@/ui'
import { useApp } from '@/store/app'
import { Note, SectionHead, type SectionProps } from './common'

type ThemePref = AppSettings['theme']

const OPTIONS: { value: ThemePref; label: string; desc: string; icon: IconName }[] = [
  { value: 'light', label: 'Kunduzgi', desc: "Yorug' oq-moviy fon. Kunduzi, yorug' xonada", icon: 'sun' },
  { value: 'dark', label: 'Tungi', desc: "Chuqur dengiz ko'ki. Kechqurun ko'zni charchatmaydi", icon: 'moon' },
  { value: 'auto', label: 'Avtomatik', desc: 'Kompyuterning (Windows) sozlamasiga qarab', icon: 'refresh' }
]

/** Ko'rinish: kunduzgi / tungi / avtomatik. Bir bosishda qo'llanadi va saqlanadi. */
export function AppearanceSection({ settings, save }: SectionProps) {
  const applied = useApp((s) => s.theme)
  const [busy, setBusy] = useState<ThemePref | null>(null)

  const choose = async (v: ThemePref) => {
    if (busy || v === settings.theme) return
    setBusy(v)
    const ok = await save({ ...settings, theme: v }, 'Rejim saqlandi: ' + OPTIONS.find((o) => o.value === v)!.label)
    // save() store'ga setSettings(saved) qiladi; rejimni aniq qo'llash uchun:
    if (ok) useApp.getState().setThemePref(v)
    setBusy(null)
  }

  return (
    <div className="set-section">
      <SectionHead icon="sun" title="Ko'rinish" description="Interfeys rejimi — barcha kompyuterlar uchun standart" />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">Rejim</div>
          <div className="set-theme" role="radiogroup" aria-label="Rejim">
            {OPTIONS.map((o) => {
              const on = settings.theme === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={cx('set-theme__opt', on && 'is-active')}
                  onClick={() => void choose(o.value)}
                  data-testid={'theme-' + o.value}
                >
                  <span className="set-theme__icon" aria-hidden="true"><Icon name={o.icon} size={40} /></span>
                  <span className="set-theme__head">
                    <span className="set-theme__label">{o.label}</span>
                    {busy === o.value ? <Spinner size={22} /> : on && <Icon name="checkCircle" size={26} className="set-theme__check" />}
                  </span>
                  <span className="set-theme__desc">{o.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
        <Note>
          Hozir qo'llanilgan: <b>{applied === 'dark' ? 'tungi' : 'kunduzgi'}</b>
          {settings.theme === 'auto' ? ' (avtomatik — tizimga qarab)' : ''}. Tepa paneldagi quyosh/oy tugmasi bilan ham tez almashtirish mumkin.
        </Note>
      </div>
    </div>
  )
}
