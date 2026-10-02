/**
 * Xonalar — bosh ekran (dasturning yuragi).
 *  - Xonalar paneli: barcha faol xonalar, holat rangi, jonli taymer va summa.
 *  - Bo'sh xona → "Xonani ochish"; band xona → Sessiya ish oynasi (to'liq ekran, ortga tugmasi / Esc).
 *  - Vaqt ogohlantirishlari va panel yangilanishi ilova qobig'ida ishlaydi (background.ts → AppShell).
 * Boshqa ekranlardan sessiyani to'g'ridan-to'g'ri ochish: `useNav.getState().go('rooms', { sessionId })`.
 */
import { useEffect, useState } from 'react'
import { useNav } from '@/store/nav'
import { RoomBoard } from './RoomBoard'
import { SessionWorkspace } from './SessionWorkspace'
import { useBoard } from './boardStore'
import './rooms.css'

export default function RoomsScreen() {
  const params = useNav((s) => s.params)
  const [sessionId, setSessionId] = useState<number | null>(typeof params.sessionId === 'number' ? params.sessionId : null)

  useEffect(() => {
    if (typeof params.sessionId === 'number') setSessionId(params.sessionId)
  }, [params])

  // Sessiya oynasidan qaytganda darhol yangilash
  useEffect(() => {
    if (sessionId == null) void useBoard.getState().load()
  }, [sessionId])

  if (sessionId != null) return <SessionWorkspace key={sessionId} sessionId={sessionId} onBack={() => setSessionId(null)} />
  return <RoomBoard onOpenSession={setSessionId} />
}
