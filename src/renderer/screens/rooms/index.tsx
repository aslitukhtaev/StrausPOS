/**
 * Xonalar — bosh ekran (dasturning yuragi).
 *  - Xonalar paneli: barcha faol xonalar, holat rangi, jonli taymer va summa.
 *  - Bo'sh xona → "Xonani ochish"; band xona → Sessiya ish oynasi (to'liq ekran, ortga tugmasi / Esc).
 *  - Vaqt ogohlantirishlari (tugayapti / tugadi) — toast + ovoz, shu ekran ochiq ekan (useTimeAlerts).
 * Boshqa ekranlardan sessiyani to'g'ridan-to'g'ri ochish: `useNav.getState().go('rooms', { sessionId })`.
 */
import { useEffect, useState } from 'react'
import { useNav } from '@/store/nav'
import { isAnyModalOpen } from '@/ui'
import { RoomBoard } from './RoomBoard'
import { SessionWorkspace } from './SessionWorkspace'
import { REFRESH_MS, useBoard } from './boardStore'
import { useTimeAlerts } from './useTimeAlerts'
import './rooms.css'

export default function RoomsScreen() {
  const params = useNav((s) => s.params)
  const [sessionId, setSessionId] = useState<number | null>(typeof params.sessionId === 'number' ? params.sessionId : null)

  useEffect(() => {
    if (typeof params.sessionId === 'number') setSessionId(params.sessionId)
  }, [params])

  // Xonalar paneli ma'lumoti (va vaqt ogohlantirishlari) — sessiya oynasi ochiq bo'lsa ham yangilanib turadi
  useEffect(() => {
    void useBoard.getState().load()
    const id = setInterval(() => {
      if (!isAnyModalOpen() || useBoard.getState().cards == null) void useBoard.getState().load()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  // Sessiya oynasidan qaytganda darhol yangilash
  useEffect(() => {
    if (sessionId == null) void useBoard.getState().load()
  }, [sessionId])
  useTimeAlerts()

  if (sessionId != null) return <SessionWorkspace key={sessionId} sessionId={sessionId} onBack={() => setSessionId(null)} />
  return <RoomBoard onOpenSession={setSessionId} />
}
