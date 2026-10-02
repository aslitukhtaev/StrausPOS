import { PosService } from '../../electron/main/PosService'
import type { PosHost } from '../../electron/main/PosService'
import type { Role, Staff } from '../../src/shared/types'

export const MIN = 60_000
export const HOUR = 3_600_000
/** 2026-01-15 10:00 (mahalliy vaqt) */
export const T0 = new Date(2026, 0, 15, 10, 0, 0, 0).getTime()

export class FakeClock {
  t: number
  constructor(t = T0) {
    this.t = t
  }
  now = (): number => this.t
  advance(ms: number): void {
    this.t += ms
  }
  advanceMin(m: number): void {
    this.t += m * MIN
  }
}

export type Who = 'owner' | 'admin' | 'cashier' | 'provider' | 'waiter' | 'waiter2'

export interface Ctx {
  svc: PosService
  clock: FakeClock
  staff: Record<Who, Staff>
  pins: Record<Who, string>
  loginAs(who: Who): Promise<void>
  /** Standart xonalar: Sauna 1 (50k, 6), Sauna 2 (60k, 8), VIP xona (100k, 10) */
  rooms: { s1: number; s2: number; vip: number }
}

/**
 * Xotiradagi baza + sozlangan ega + admin/kassir/massajchi + ofitsiantlar
 * (Sardor: 'waiter' roli, 10%; Bekzod: kassir + isWaiter, 12%). Ega sifatida kirilgan holatda qaytadi.
 */
export async function setup(opts: { file?: string | null; host?: PosHost } = {}): Promise<Ctx> {
  const clock = new FakeClock()
  const svc = await PosService.create({ file: opts.file ?? null, clock: clock.now, host: opts.host })
  await svc.auth.setupOwner('Ega', '1234', 'Delfin Sauna')
  const owner = (await svc.auth.current())!.staff
  const mk = (name: string, role: Role, pin: string, isProvider = false, isWaiter = false, commissionPct = 0) =>
    svc.staff.save({ name, role, pin, isProvider, isWaiter, commissionPct, active: true })
  const admin = await mk('Admin', 'admin', '2222')
  const cashier = await mk('Kassir', 'cashier', '3333')
  const provider = await mk('Massajchi', 'cashier', '4444', true)
  const waiter = await mk('Sardor', 'waiter', '5555', false, false, 10)
  const waiter2 = await mk('Bekzod', 'cashier', '6666', false, true, 12)
  const staff = { owner, admin, cashier, provider, waiter, waiter2 }
  const pins = { owner: '1234', admin: '2222', cashier: '3333', provider: '4444', waiter: '5555', waiter2: '6666' }
  const list = await svc.rooms.list()
  const byName = (n: string) => list.find((r) => r.name === n)!.id
  return {
    svc,
    clock,
    staff,
    pins,
    rooms: { s1: byName('Sauna 1'), s2: byName('Sauna 2'), vip: byName('VIP xona') },
    async loginAs(who) {
      await svc.auth.login(staff[who].id, pins[who])
    }
  }
}

export async function productByName(svc: PosService, name: string) {
  const p = (await svc.catalog.products(true)).find((x) => x.name === name)
  if (!p) throw new Error('Mahsulot yo‘q: ' + name)
  return p
}

export async function serviceByName(svc: PosService, name: string) {
  const s = (await svc.catalog.services(true)).find((x) => x.name === name)
  if (!s) throw new Error('Xizmat yo‘q: ' + name)
  return s
}
