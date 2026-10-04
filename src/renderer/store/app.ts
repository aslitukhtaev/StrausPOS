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
 *
 * Tarmoq rejimi (boot'da `connection.info()`):
 *   const isTerminal = useApp((s) => s.mode === 'terminal')  // ikkinchi kompyuter (ofitsiantlar monobloki), baza asosiyda
 *   const connected = useApp((s) => s.connected)      // terminalda asosiy kompyuter bilan aloqa (asosiyda doim true)
 *   useApp.getState().setConnected(false)             // rpc xatosida (banner + qayta ulanish)
 * Terminal TO'LIQ ishlaydi: o'z Qulf/PIN ekrani (asosiydagi xodimlar), ruxsatlar kirgan xodim roliga qarab —
 * ekranlar asosiy kompyuterdagidek. Setup yo'q (biznes asosiyda sozlangan).
 *
 * Litsenziya (store/license): muddat tugagan/soat buzilgan bo'lsa `readOnly = true` (o'zgartirish tugmalari yashirin),
 * login/qulf odatdagidek. Terminalda asosiy kompyuter litsenziyasi amal qiladi (server ham majburlaydi).
 */
import { create } from 'zustand'
import type { AppMode, AppSettings, Permission, Staff } from '@shared/types'
import { getApi } from '../api'
import { useAuth } from './auth'
import { useNav } from './nav'
import { syncClock } from './clock'
import { errorMessage } from './toast'
import { setLicenseBlockedHandler, startLicenseWatch, useLicense } from './license'

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
  /** 'main' = asosiy kompyuter (baza shu yerda), 'terminal' = ikkinchi kompyuter (baza asosiyda) */
  mode: AppMode
  /** Litsenziya muddati tugagan / soat buzilgan → o'zgartirish tugmalari yashirin */
  readOnly: boolean
  /** Terminalda asosiy kompyuter bilan aloqa (asosiyda doim true) */
  connected: boolean
  /** Terminal: asosiy kompyuter manzili */
  host: string | null
  setConnected(c: boolean): void
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
  /** Terminal boot: litsenziya (asosiydan), joriy terminal login'i → qobiq yoki Qulf */
  bootTerminal(): Promise<void>
  /** Terminal: server terminal login'ini bekor qilgan (asosiy qayta ishga tushdi / kod almashdi) → Qulf ekrani */
  relogin(): Promise<void>
  lock(): Promise<void>
  /** Setup tugagach */
  setupDone(businessName: string): void
}

const startPref = initialPref()
applyTheme(resolveTheme(startPref))

export const useApp = create<AppState>((set, get) => ({
  phase: 'boot',
  mode: 'main',
  readOnly: false,
  connected: true,
  host: null,
  setConnected(c) {
    if (get().connected !== c) set({ connected: c })
  },
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
      let info = null
      try {
        info = await api.connection.info()
      } catch {
        info = null // eski backend — asosiy rejim
      }
      if (info && info.mode === 'terminal') {
        set({ mode: 'terminal', readOnly: false, connected: info.connected, host: info.host })
        await get().bootTerminal()
        return
      }
      set({ mode: 'main', readOnly: false, connected: true, host: null })
      void syncClock(() => api.system.now())
      // Litsenziya: muddat tugagan/soat buzilgan → butun ilova faqat ko'rish (server ham rad etadi)
      await useLicense.getState().load()
      set({ readOnly: useLicense.getState().blocked })
      startLicenseWatch()
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

  async bootTerminal() {
    const api = getApi()
    // Aloqa bo'lmasa ham Qulf ekrani ochiladi (xato + qayta urinish + ulanishni o'zgartirish)
    void syncClock(() => api.system.now()).catch(() => undefined)
    await useLicense.getState().load() // asosiy kompyuter litsenziyasi (proksi)
    set({ readOnly: useLicense.getState().blocked })
    startLicenseWatch()
    void get().reloadSettings()
    let cur = null
    try {
      cur = await api.auth.current()
      get().setConnected(true)
    } catch {
      get().setConnected(false)
    }
    if (cur) get().enter(cur)
    else set({ phase: 'lock' })
  },

  async relogin() {
    useAuth.getState().set(null)
    set({ phase: 'lock' })
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

// Litsenziya holati ish davomida o'zgarsa (sinov tugadi / kalit kiritildi) — readOnly'ni moslash (terminalda ham)
setLicenseBlockedHandler((blocked) => {
  useApp.setState({ readOnly: blocked })
})

// "auto" rejimda tizim mavzusi o'zgarsa — darhol qo'llash
if (darkQuery) {
  const onChange = () => {
    const st = useApp.getState()
    if (st.themePref === 'auto') st.setThemePref('auto')
  }
  if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', onChange)
  else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(onChange)
}
