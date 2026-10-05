/**
 * Sozlamalar ekrani (faqat `settings.manage`): chapda bo'limlar, o'ngda forma.
 * Har bir bo'lim o'z "Saqlash" tugmasiga ega; `settings.save` butun AppSettings ni oladi —
 * shuning uchun bo'lim faqat o'z qismini almashtirib, oxirgi saqlangan nusxa ustiga yozadi.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { api } from '@/api'
import { Button, EmptyState, Icon, PageHeader, Spinner, confirmDialog, cx, toast, type IconName } from '@/ui'
import { useApp } from '@/store/app'
import { useCan } from '@/store/auth'
import { RoomsSection } from './RoomsSection'
import { ReceiptSection } from './ReceiptSection'
import { SecuritySection } from './SecuritySection'
import { BillingSection } from './BillingSection'
import { AppearanceSection } from './AppearanceSection'
import { BackupSection } from './BackupSection'
import { NetworkSection } from './NetworkSection'
import { AboutSection, APP_VERSION } from './AboutSection'
import { LicenseSection } from './LicenseSection'
import { KitchenSection } from './KitchenSection'
import { InstagramSection } from './InstagramSection'
import './settings.css'

type SectionId = 'rooms' | 'kitchen' | 'receipt' | 'security' | 'billing' | 'appearance' | 'network' | 'instagram' | 'backup' | 'license' | 'about'

const NAV: { id: SectionId; label: string; desc: string; icon: IconName }[] = [
  { id: 'rooms', label: 'Xonalar', desc: 'Narx, sig\'im, tartib', icon: 'rooms' },
  { id: 'receipt', label: 'Chek', desc: 'Matn, printer', icon: 'receipt' },
  { id: 'kitchen', label: 'Oshxona', desc: 'Ulush, oshxona printeri', icon: 'flame' },
  { id: 'security', label: 'Xavfsizlik', desc: 'Qulf, PIN', icon: 'shield' },
  { id: 'billing', label: 'Hisob-kitob', desc: 'Soat, blok, yaxlitlash', icon: 'percent' },
  { id: 'appearance', label: "Ko'rinish", desc: 'Kunduzgi / tungi', icon: 'sun' },
  { id: 'instagram', label: 'Instagram', desc: 'QR kod va handle', icon: 'inbox' },
  { id: 'network', label: 'Tarmoq', desc: "Boshqa kompyuterdan ko'rish", icon: 'eye' },
  { id: 'backup', label: 'Zaxira', desc: 'Nusxa, tiklash', icon: 'database' },
  { id: 'license', label: 'Litsenziya', desc: 'Aktivatsiya kaliti', icon: 'key' },
  { id: 'about', label: 'Haqida', desc: 'Versiya ' + APP_VERSION, icon: 'info' }
]

const TAB_KEY = 'straus.settings.tab'

function readTab(): SectionId {
  try {
    const v = localStorage.getItem(TAB_KEY) as SectionId | null
    if (v && NAV.some((n) => n.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'rooms'
}

export default function SettingsScreen() {
  const allowed = useCan('settings.manage')
  const [tabState, setTab] = useState<SectionId>(readTab)
  // Terminalda Tarmoq/Zaxira/Litsenziya/Oshxona (printer asosiyda) yashirin; "Chek"dagi printer — terminalning o'z printeri
  const isTerminal = useApp((s) => s.mode === 'terminal')
  const terminalHidden: string[] = ['network', 'backup', 'license', 'kitchen']
  const nav = isTerminal ? NAV.filter((n) => terminalHidden.indexOf(n.id) < 0) : NAV
  const tab: SectionId = nav.some((n) => n.id === tabState) ? tabState : 'rooms'
  const [settings, setSettingsState] = useState<AppSettings | null>(() => useApp.getState().settings)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const s = await api.settings.get()
      setSettingsState(s)
      useApp.getState().setSettings(s)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onDirty = useCallback((d: boolean) => {
    dirtyRef.current = d
    setDirty(d)
  }, [])

  const save = useCallback(async (next: AppSettings, okMessage = 'Saqlandi') => {
    try {
      const saved = await api.settings.save(next)
      setSettingsState(saved)
      useApp.getState().setSettings(saved)
      toast.success(okMessage)
      return true
    } catch (e) {
      toast.error(e)
      return false
    }
  }, [])

  const choose = async (id: SectionId) => {
    if (id === tab) return
    if (dirtyRef.current) {
      const ok = await confirmDialog({
        title: "Saqlanmagan o'zgarishlar bor",
        message: "Bo'limdan chiqsangiz, kiritilgan o'zgarishlar yo'qoladi.",
        confirmText: 'Chiqish',
        cancelText: 'Qolish',
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    dirtyRef.current = false
    setDirty(false)
    setTab(id)
    try {
      localStorage.setItem(TAB_KEY, id)
    } catch {
      /* ignore */
    }
  }

  if (!allowed) {
    return <EmptyState size="lg" icon="lock" title="Ruxsat yo'q" description="Sozlamalarni faqat ega o'zgartira oladi." />
  }

  let body
  if (tab === 'rooms') body = <RoomsSection />
  else if (tab === 'network') body = <NetworkSection />
  else if (tab === 'backup') body = <BackupSection />
  else if (tab === 'license') body = <LicenseSection />
  else if (tab === 'about') body = <AboutSection />
  else if (!settings) {
    body = loadErr ? (
      <EmptyState
        icon="alert"
        title="Sozlamalarni yuklab bo'lmadi"
        description={loadErr}
        action={<Button icon="refresh" onClick={() => void load()}>Qayta urinish</Button>}
      />
    ) : (
      <div className="set-center"><Spinner size={40} /></div>
    )
  } else {
    const p = { settings, save, onDirty }
    body =
      tab === 'receipt' ? <ReceiptSection {...p} />
        : tab === 'kitchen' ? <KitchenSection {...p} />
        : tab === 'security' ? <SecuritySection {...p} />
          : tab === 'appearance' ? <AppearanceSection {...p} />
            : tab === 'instagram' ? <InstagramSection {...p} />
              : tab === 'billing' ? <BillingSection {...p} />
                : <BillingSection {...p} />
  }

  return (
    <div className="set-root">
      <PageHeader title="Sozlamalar" icon="settings" subtitle="Xonalar, chek, xavfsizlik va zaxira — faqat ega uchun" />
      <div className="set-layout">
        <nav className="set-nav" aria-label="Sozlamalar bo'limlari">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              className={cx('set-nav__item', tab === n.id && 'is-active')}
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => void choose(n.id)}
              data-testid={'set-nav-' + n.id}
            >
              <span className="set-nav__icon"><Icon name={n.icon} size={24} /></span>
              <span className="set-nav__text">
                <span className="set-nav__label">{n.label}</span>
                <span className="set-nav__desc">{n.desc}</span>
              </span>
              {tab === n.id && dirty && <span className="set-nav__dot" title="Saqlanmagan" />}
            </button>
          ))}
        </nav>
        <div className="set-main" key={tab}>
          {body}
        </div>
      </div>
    </div>
  )
}
