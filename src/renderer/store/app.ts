/**
 * Ilova holati: bosqich (setup → lock → shell), sozlamalar, qulf.
 *
 *   const settings = useApp((s) => s.settings)         // AppSettings | null
 *   const lock = useApp((s) => s.lock); lock()          // qulflash (logout + Lock ekrani)
 *   useApp.getState().setSettings(saved)                // Sozlamalar ekrani saqlagandan keyin chaqiradi
 *   useApp.getState().reloadSettings()
 *
 * Rejim (kunduzgi/tungi):
 *   const theme = useApp((s) => s.theme)              // 'light' | 'dark' — hozir qo'llanilgan
 *   const pref = useApp((s) => s.themePref)           // 'light' | 'dark' | 'auto' — tanlov
 *   useApp.getState().toggleTheme()                   // tepa paneldagi quyosh/oy tugmasi
 *   useApp.getState().setThemePref('auto')            // Sozlamalar ekrani uchun (faqat lokal qo'llash)
 * `<html data-theme>` shu store tomonidan qo'yiladi. Login'dan oldin — localStorage keshi.
 */
import { create } from 'zustand'
import type { AppSettings, Permission, Staff } from '@shared/types'
import { getApi } from '../api'
import { useAuth } from './auth'
import { useNav } from './nav'
import { syncClock } from './clock'
import { errorMessage } from './toast'

export type Phase = 'boot' | 'setup' | 'lock' | 'shell' | 'error'

const BN_KEY = 'delfin.businessName'
const LEGACY_BN_KEY = 'straus.businessName'
/** Oxirgi ma'lum rejim tanlovi (sozlamalardan yoki lokal) — qulf/setup ekranlarida ham to'g'ri rejim */
const THEME_KEY = 'delfin.theme'
/** Ruxsati yo'q xodim tanlagan lokal rejim (sozlamalarni o'zgartirmaydi) */
const THEME_LOCAL_KEY = 'delfin.themeLocal'

export type ThemePref = AppSettings['theme']
export type Theme = 'light' | 'dark'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function asPref(v: unknown): ThemePref | null {
  return v === 'light' || v === 'dark' || v === 'auto' ? v : null
}

const darkQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'auto') return darkQuery && !darkQuery.matches ? 'light' : 'dark'
  return pref
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (el.getAttribute('data-theme') !== theme) el.setAttribute('data-theme', theme)
}

function initialPref(): ThemePref {
  return asPref(lsGet(THEME_LOCAL_KEY)) ?? asPref(lsGet(THEME_KEY)) ?? 'auto'
}

function readCachedName(): string {
  return lsGet(BN_KEY) || lsGet(LEGACY_BN_KEY) || ''
}

interface AppState {
  phase: Phase
  bootError: string | null
  settings: AppSettings | null
  /** Biznes nomi (sozlamalardan; qulf ekranida keshdan) */
  businessName: string
  /** Rejim tanlovi (auto = tizimga qarab) */
  themePref: ThemePref
  /** Hozir qo'llanilgan rejim */
  theme: Theme
  /** Tanlovni qo'llash (saqlamaydi). Sozlamalar ekrani oldindan ko'rsatish uchun ham ishlatishi mumkin. */
  setThemePref(pref: ThemePref): void
  /** Kunduzgi ↔ tungi. Ruxsat (settings.manage) bo'lsa settings.save bilan saqlanadi, aks holda faqat shu kompyuterda. */
  toggleTheme(): Promise<void>
  boot(): Promise<void>
  reloadSettings(): Promise<void>
  setSettings(s: AppSettings): void
  /** Kirish muvaffaqiyatli bo'lgandan keyin (Lock/Setup ekranlari chaqiradi) */
  enter(session: { staff: Staff; permissions: Permission[] }): void
  lock(): Promise<void>
  /** Setup tugagach */
  setupDone(businessName: string): void
}

const startPref = initialPref()
applyTheme(resolveTheme(startPref))

export const useApp = create<AppState>((set, get) => ({
  phase: 'boot',
  bootError: null,
  settings: null,
  businessName: readCachedName(),
  themePref: startPref,
  theme: resolveTheme(startPref),

  setThemePref(pref) {
    const theme = resolveTheme(pref)
    applyTheme(theme)
    set({ themePref: pref, theme })
  },

  async toggleTheme() {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    get().setThemePref(next)
    const s = get().settings
    const canSave = useAuth.getState().permissions.indexOf('settings.manage') >= 0
    if (s && canSave) {
      try {
        const saved = await getApi().settings.save({ ...s, theme: next })
        lsSet(THEME_LOCAL_KEY, null)
        get().setSettings(saved)
        return
      } catch {
        /* saqlanmadi — lokal tanlov sifatida qoladi */
      }
    }
    lsSet(THEME_LOCAL_KEY, next)
  },

  async boot() {
    const api = getApi()
    set({ phase: 'boot', bootError: null })
    try {
      void syncClock(() => api.system.now())
      if (await api.auth.needsSetup()) {
        set({ phase: 'setup' })
        return
      }
      void get().reloadSettings()
      const cur = await api.auth.current()
      if (cur) get().enter(cur)
      else set({ phase: 'lock' })
    } catch (e) {
      set({ phase: 'error', bootError: errorMessage(e) })
    }
  },

  async reloadSettings() {
    try {
      const s = await getApi().settings.get()
      get().setSettings(s)
    } catch {
      /* kirishdan oldin ruxsat bo'lmasligi mumkin — kesh ishlatiladi */
    }
  },

  setSettings(s) {
    const name = s.receipt.businessName || ''
    lsSet(BN_KEY, name)
    const fromSettings = asPref(s.theme)
    if (fromSettings) lsSet(THEME_KEY, fromSettings)
    // Lokal tanlov (ruxsatsiz xodim) ustun; aks holda sozlamalardagi rejim
    const pref = asPref(lsGet(THEME_LOCAL_KEY)) ?? fromSettings ?? get().themePref
    set({ settings: s, businessName: name })
    get().setThemePref(pref)
  },

  enter(session) {
    useAuth.getState().set(session)
    // Har bir kirishda bosh ekran — Xonalar
    useNav.getState().go('rooms')
    set({ phase: 'shell' })
    void get().reloadSettings()
  },

  async lock() {
    try {
      await getApi().auth.logout()
    } catch {
      /* oflayn — baribir qulflaymiz */
    }
    useAuth.getState().set(null)
    set({ phase: 'lock' })
  },

  setupDone(businessName) {
    lsSet(BN_KEY, businessName)
    set({ businessName })
  }
}))

// "auto" rejimda tizim mavzusi o'zgarsa — darhol qo'llash
if (darkQuery) {
  const onChange = () => {
    const st = useApp.getState()
    if (st.themePref === 'auto') st.setThemePref('auto')
  }
  if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', onChange)
  else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(onChange)
}
