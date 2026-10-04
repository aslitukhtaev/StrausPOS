/**
 * Avtomatik qulf: `autoLockMinutes` davomida hech narsa bosilmasa (sichqoncha, sensor, klaviatura) — lock().
 * lockEnabled=false yoki autoLockMinutes=0 bo'lsa o'chiq.
 */
import { useEffect } from 'react'
import { useApp } from '../store/app'

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

export function useAutoLock(): void {
  const minutes = useApp((s) => (s.settings && s.settings.lockEnabled ? s.settings.autoLockMinutes : 0))
  const lock = useApp((s) => s.lock)

  useEffect(() => {
    if (!minutes || minutes <= 0) return
    let last = Date.now()
    const mark = () => {
      last = Date.now()
    }
    EVENTS.forEach((ev) => window.addEventListener(ev, mark, { passive: true, capture: true }))
    const iv = setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) void lock()
    }, 5000)
    return () => {
      clearInterval(iv)
      EVENTS.forEach((ev) => window.removeEventListener(ev, mark, { capture: true }))
    }
  }, [minutes, lock])
}
