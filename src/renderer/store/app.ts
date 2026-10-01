/**
 * Ilova holati: bosqich (setup → lock → shell), sozlamalar, qulf.
 *
 *   const settings = useApp((s) => s.settings)         // AppSettings | null
 *   const lock = useApp((s) => s.lock); lock()          // qulflash (logout + Lock ekrani)
 *   useApp.getState().setSettings(saved)                // Sozlamalar ekrani saqlagandan keyin chaqiradi
 *   useApp.getState().reloadSettings()
 */
import { create } from 'zustand'
import type { AppSettings, Permission, Staff } from '@shared/types'
import { getApi } from '../api'
import { useAuth } from './auth'
import { useNav } from './nav'
import { syncClock } from './clock'
import { errorMessage } from './toast'

export type Phase = 'boot' | 'setup' | 'lock' | 'shell' | 'error'

const BN_KEY = 'straus.businessName'

function readCachedName(): string {
  try {
    return localStorage.getItem(BN_KEY) || ''
  } catch {
    return ''
  }
}

interface AppState {
  phase: Phase
  bootError: string | null
  settings: AppSettings | null
  /** Biznes nomi (sozlamalardan; qulf ekranida keshdan) */
  businessName: string
  boot(): Promise<void>
  reloadSettings(): Promise<void>
  setSettings(s: AppSettings): void
  /** Kirish muvaffaqiyatli bo'lgandan keyin (Lock/Setup ekranlari chaqiradi) */
  enter(session: { staff: Staff; permissions: Permission[] }): void
  lock(): Promise<void>
  /** Setup tugagach */
  setupDone(businessName: string): void
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'boot',
  bootError: null,
  settings: null,
  businessName: readCachedName(),

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
    try {
      localStorage.setItem(BN_KEY, name)
    } catch {
      /* ignore */
    }
    set({ settings: s, businessName: name })
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
    try {
      localStorage.setItem(BN_KEY, businessName)
    } catch {
      /* ignore */
    }
    set({ businessName })
  }
}))
