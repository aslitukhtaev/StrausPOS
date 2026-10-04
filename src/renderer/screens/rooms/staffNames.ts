/**
 * Xodimlar ro'yxati keshi (staff.list — faqat login talab qiladi): hisob qatorlarida "kim olib bordi" (OrderLine.waiterId)
 * ismini ko'rsatish va qo'shish oynasidagi "Kim olib bordi" tanlovi uchun. Modul darajasida bir marta yuklanadi,
 * `refreshStaff()` bilan yangilanadi (masalan qo'shish oynasi ochilganda).
 */
import { useEffect, useState } from 'react'
import type { Id, Staff } from '@shared/types'
import { api } from '@/api'

let cache: Staff[] | null = null
let inflight: Promise<Staff[]> | null = null
const subs = new Set<(l: Staff[]) => void>()

export function refreshStaff(): Promise<Staff[]> {
  if (!inflight) {
    inflight = api.staff
      .list()
      .then((l) => {
        cache = l
        subs.forEach((f) => f(l))
        return l
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Barcha xodimlar (null = yuklanmoqda). Xato bo'lsa bo'sh ro'yxat (ismlar o'rniga "Ofitsiant" yoziladi). */
export function useStaffList(): Staff[] | null {
  const [list, setList] = useState<Staff[] | null>(cache)
  useEffect(() => {
    subs.add(setList)
    if (!cache) refreshStaff().catch(() => setList((l) => l || []))
    return () => {
      subs.delete(setList)
    }
  }, [])
  return list
}

export function staffName(list: Staff[] | null, id: Id | null): string | null {
  if (id == null) return null
  const s = list ? list.find((x) => x.id === id) : undefined
  return s ? s.name : 'Ofitsiant'
}

/** Joriy xodim ofitsiantmi (u qo'shgan qatorlar avtomatik uning nomiga yoziladi) */
export function isWaiterStaff(s: Staff | null): boolean {
  return !!s && (s.role === 'waiter' || s.isWaiter)
}
