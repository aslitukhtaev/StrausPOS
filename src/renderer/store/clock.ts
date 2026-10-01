/**
 * Jonli soat: `now` har soniyada yangilanadi (bitta global interval).
 * Server bilan sinxron: `syncClock()` api.system.now() dan farqni (offset) oladi.
 *
 *   const now = useNow()                     // komponent har soniya qayta chiziladi
 *   const ms = guestElapsedMs(g.intervals, now)
 *   getNow()                                 // React tashqarisida
 */
import { create } from 'zustand'

interface ClockState {
  now: number
  /** server − mahalliy (ms) */
  offset: number
}

export const useClockStore = create<ClockState>(() => ({ now: Date.now(), offset: 0 }))

let timer: ReturnType<typeof setTimeout> | null = null

function tick() {
  const { offset } = useClockStore.getState()
  useClockStore.setState({ now: Date.now() + offset })
  // Soniya chegarasiga tekislash — barcha taymerlar bir vaqtda o'zgaradi
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
}

export function startClock(): void {
  if (timer) return
  tick()
}

export function stopClock(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

/** Server vaqti bilan moslash (xato bo'lsa jim o'tadi). */
export async function syncClock(getServerNow: () => Promise<number>): Promise<void> {
  try {
    const t0 = Date.now()
    const server = await getServerNow()
    const t1 = Date.now()
    const offset = Math.round(server - (t0 + t1) / 2)
    // 2 soniyadan kichik farqni e'tiborsiz qoldiramiz (bir xil mashina)
    useClockStore.setState({ offset: Math.abs(offset) < 2000 ? 0 : offset, now: Date.now() + (Math.abs(offset) < 2000 ? 0 : offset) })
  } catch {
    /* offline: mahalliy soat */
  }
}

export function useNow(): number {
  return useClockStore((s) => s.now)
}

export function getNow(): number {
  return Date.now() + useClockStore.getState().offset
}
