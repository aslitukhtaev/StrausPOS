/**
 * Ko'ruvchi rejimi: asosiy kompyuter bilan aloqani kuzatish. Har 5 soniyada `connection.info()`;
 * aloqa yo'q bo'lsa `system.now()` bilan qayta urinadi, tiklansa — panel va sozlamalar darhol yangilanadi.
 * (Xonalar paneli xatolari ham `setConnected(false)` qiladi — boardStore.)
 */
import { useEffect } from 'react'
import { api } from '../api'
import { useApp } from '../store/app'
import { syncClock } from '../store/clock'
import { useBoard } from '../screens/rooms/boardStore'

export const RETRY_MS = 5000

export function useViewerLink(): void {
  const readOnly = useApp((s) => s.readOnly)
  useEffect(() => {
    if (!readOnly) return
    let alive = true
    const tick = async () => {
      const st = useApp.getState()
      let ok = false
      try {
        const info = await api.connection.info()
        ok = info.connected
        if (ok && !st.connected) {
          // Haqiqatan javob beryaptimi — bitta yengil o'qish
          await api.system.now()
        }
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
      }
    }
    const id = setInterval(() => void tick(), RETRY_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [readOnly])
}
