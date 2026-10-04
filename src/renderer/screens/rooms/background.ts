/**
 * Xonalar fon xizmati — ilova qobig'ida (AppShell) ishlaydi, shuning uchun vaqt ogohlantirishlari
 * (tugayapti / tugadi: toast + ovoz) qaysi ekran ochiq bo'lishidan qat'i nazar chalinadi.
 * Xonalar paneli ma'lumotini har REFRESH_MS da yangilaydi (modal ochiq bo'lsa kutadi).
 */
import { useEffect } from 'react'
import { isAnyModalOpen } from '@/ui'
import { REFRESH_MS, VIEWER_REFRESH_MS, useBoard } from './boardStore'
import { useApp } from '@/store/app'
import { useTimeAlerts } from './useTimeAlerts'

export function useRoomsBackground(): void {
  const fast = useApp((s) => s.readOnly || s.mode !== 'main')
  useEffect(() => {
    void useBoard.getState().load()
    const id = setInterval(() => {
      if (!isAnyModalOpen() || useBoard.getState().cards == null) void useBoard.getState().load()
    }, fast ? VIEWER_REFRESH_MS : REFRESH_MS)
    return () => clearInterval(id)
  }, [fast])
  useTimeAlerts()
}
