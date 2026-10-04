/**
 * Terminal rejimi: asosiy kompyuter bilan aloqani kuzatish (fayl nomi tarixiy — avval "ko'ruvchi" edi).
 * Har RETRY_MS da `connection.info()` (aloqa uzilgan bo'lsa main jarayon o'zi yengil so'rov bilan qayta tekshiradi);
 * aloqa tiklansa — soat, sozlamalar va xonalar paneli darhol yangilanadi.
 * Server terminal login'ini bekor qilgan bo'lsa (asosiy qayta ishga tushdi / kod almashdi) — Qulf ekraniga qaytaradi.
 */
import { useEffect } from 'react'
import { api, apiKind } from '../api'
import { confirmDialog } from '../ui'
import { useApp } from '../store/app'
import { useAuth } from '../store/auth'
import { syncClock } from '../store/clock'
import { errorMessage, toast } from '../store/toast'
import { useBoard } from '../screens/rooms/boardStore'

export const RETRY_MS = 5000
/** Terminal login'i serverda hali amaldami — shuncha vaqtda bir tekshiriladi */
export const SESSION_CHECK_MS = 30_000

async function checkSession(): Promise<void> {
  if (useApp.getState().phase !== 'shell') return
  let cur
  try {
    cur = await api.auth.current()
  } catch {
    return // aloqa yo'q — banner ko'rsatiladi
  }
  if (cur) return
  if (useApp.getState().phase !== 'shell' || !useAuth.getState().staff) return
  toast.warning('Qayta kiring', { description: 'Asosiy kompyuter bilan ulanish yangilandi — PIN kodingizni qayta kiriting.' })
  void useApp.getState().relogin()
}

export function useTerminalLink(): void {
  const isTerminal = useApp((s) => s.mode === 'terminal')
  useEffect(() => {
    if (!isTerminal) return
    let alive = true
    let lastSession = Date.now()
    const tick = async () => {
      let ok = false
      try {
        ok = (await api.connection.info()).connected
      } catch {
        ok = false
      }
      if (!alive) return
      const was = useApp.getState().connected
      useApp.getState().setConnected(ok)
      if (ok && !was) {
        void syncClock(() => api.system.now())
        void useApp.getState().reloadSettings()
        void useBoard.getState().load()
        lastSession = Date.now()
        void checkSession()
      } else if (ok && Date.now() - lastSession >= SESSION_CHECK_MS) {
        lastSession = Date.now()
        void checkSession()
      }
    }
    const id = setInterval(() => void tick(), RETRY_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [isTerminal])
}

/** Terminaldan chiqish (asosiy rejimga qaytish): tasdiq → connection.disconnect → qayta yuklash */
export async function changeConnection(): Promise<void> {
  const ok = await confirmDialog({
    title: "Ulanishni o'zgartirasizmi?",
    message: "Bu terminal asosiy kompyuterdan uziladi. Keyin boshqa kompyuterga (yangi kod bilan) ulanish yoki yangi biznes ochish mumkin.",
    confirmText: 'Ha, uzish',
    cancelText: "Yo'q",
    danger: true,
    icon: 'logout'
  })
  if (!ok) return
  try {
    await api.connection.disconnect()
    toast.success('Ulanish uzildi')
    if (apiKind() === 'mock') void useApp.getState().boot()
    else location.reload()
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

/** @deprecated eski nom */
export const useViewerLink = useTerminalLink
