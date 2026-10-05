import { describe, expect, it } from 'vitest'
import { MIGRATION_DATA, migrationDb } from '../../electron/main/db/schema'
import { loadSqlJs } from '../../electron/main/db/sqljs'
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../../src/shared/permissions'
import type { Permission, Role } from '../../src/shared/types'
import { HOUR, T0, setup } from './helpers'
import type { Ctx, Who } from './helpers'

const DENIED = "Bu amal uchun ruxsatingiz yo'q"
const RANGE = { from: T0 - 24 * HOUR, to: T0 + 24 * HOUR }
const MONTH = '2026-01'
type RP = Record<'admin' | 'cashier' | 'waiter', Permission[]>

async function setPerms(c: Ctx, patch: Partial<RP>): Promise<void> {
  await c.loginAs('owner')
  const s = await c.svc.settings.get()
  await c.svc.settings.save({ ...s, rolePermissions: { ...s.rolePermissions, ...patch } })
}

const READS: Record<string, [Permission, (c: Ctx) => Promise<unknown>]> = {
  'reports.sessions': ['history.view', (c) => c.svc.reports.sessions(RANGE)],
  'sessions.detail': ['history.view', async (c) => c.svc.sessions.detail(-1).catch((e) => { if (e.message === DENIED) throw e })],
  'sessions.soldItems': ['history.view', (c) => c.svc.sessions.soldItems(RANGE, null)],
  'profit.report': ['profit.view', (c) => c.svc.profit.report(RANGE)],
  'kitchen.daily': ['kitchen.view', (c) => c.svc.kitchen.daily(MONTH)],
  'kitchen.payouts': ['kitchen.view', (c) => c.svc.kitchen.payouts(MONTH)],
  'waiters.monthly': ['waiters.view', (c) => c.svc.waiters.monthly(MONTH)],
  'waiters.sessions': ['waiters.view', (c) => c.svc.waiters.sessions(c.staff.waiter.id, MONTH)],
  'waiters.payouts': ['waiters.view', (c) => c.svc.waiters.payouts(c.staff.waiter.id, MONTH)],
  'expenses.list': ['expense.view', (c) => c.svc.expenses.list(RANGE)],
  'expenses.categories': ['expense.view', (c) => c.svc.expenses.categories()],
  'reports.sales': ['reports.view', (c) => c.svc.reports.sales(RANGE)],
  'reports.returns': ['reports.view', (c) => c.svc.reports.returns(RANGE)]
}

describe('rollar ruxsatlari', () => {
  it('standart ruxsatlar eskisiga teng', async () => {
    const c = await setup()
    const s = await c.svc.settings.get()
    expect(s.rolePermissions).toEqual({
      admin: DEFAULT_ROLE_PERMISSIONS.admin,
      cashier: DEFAULT_ROLE_PERMISSIONS.cashier,
      waiter: DEFAULT_ROLE_PERMISSIONS.waiter
    })
    for (const [who, role] of [['owner', 'owner'], ['admin', 'admin'], ['cashier', 'cashier'], ['waiter', 'waiter']] as [Who, Role][]) {
      await c.loginAs(who)
      expect((await c.svc.auth.current())!.permissions).toEqual(DEFAULT_ROLE_PERMISSIONS[role])
    }
    await c.loginAs('owner')
    expect((await c.svc.auth.current())!.permissions).toEqual(ALL_PERMISSIONS)
  })

  it('ega o‘zgartirsa darhol amal qiladi (kirgan xodim ham)', async () => {
    const c = await setup()
    await c.loginAs('cashier')
    await expect(c.svc.reports.sales(RANGE)).rejects.toThrow(DENIED)
    await setPerms(c, { cashier: [...DEFAULT_ROLE_PERMISSIONS.cashier, 'reports.view'] })
    await c.loginAs('cashier')
    await expect(c.svc.reports.sales(RANGE)).resolves.toBeTruthy()
    expect((await c.svc.auth.current())!.permissions).toContain('reports.view')

    // ofitsiantdan line.return olish
    await c.loginAs('owner')
    const v = await c.svc.sessions.open(c.rooms.s1, 1, 60)
    const prod = (await c.svc.catalog.products()).find((p) => p.stock > 5)!
    const line = await c.svc.lines.addProduct(v.session.id, prod.id, 1, null)
    const lineId = (line as { lines: { id: number }[] }).lines.at(-1)!.id
    await c.loginAs('waiter')
    await setPerms(c, { waiter: ['session.open', 'session.manage'] })
    await c.loginAs('waiter')
    await expect(c.svc.lines.returnLine(lineId, 1, 'xato')).rejects.toThrow(DENIED)
    expect((await c.svc.auth.current())!.permissions).not.toContain('line.return')

    // adminga staff.manage
    await c.loginAs('admin')
    await expect(c.svc.waiters.payout(c.staff.waiter.id, MONTH, 1000, '')).rejects.toThrow(DENIED)
    await setPerms(c, { admin: [...DEFAULT_ROLE_PERMISSIONS.admin, 'staff.manage'] })
    await c.loginAs('admin')
    await expect(c.svc.waiters.payout(c.staff.waiter.id, MONTH, 1000, '')).resolves.toMatchObject({ amount: 1000 })
  })

  it('terminal kontekstida ham amal qiladi (alohida login, umumiy sozlama)', async () => {
    const c = await setup()
    const t = c.svc.forTerminal()
    await t.auth.login(c.staff.cashier.id, c.pins.cashier)
    await expect(t.reports.sales(RANGE)).rejects.toThrow(DENIED)
    await setPerms(c, { cashier: [...DEFAULT_ROLE_PERMISSIONS.cashier, 'reports.view'] })
    await expect(t.reports.sales(RANGE)).resolves.toBeTruthy()
    expect((await t.auth.current())!.permissions).toContain('reports.view')
    await setPerms(c, { cashier: ['session.open'] })
    await expect(t.reports.sales(RANGE)).rejects.toThrow(DENIED)
    await expect(t.sessions.open(c.rooms.s1, 1, 60)).resolves.toBeTruthy()
  })

  describe.each(Object.entries(READS))('%s', (_name, [perm, call]) => {
    it('ruxsatsiz — DENIED, ruxsat bilan — o‘qiydi', async () => {
      const c = await setup()
      await setPerms(c, { cashier: ['session.open'] })
      await c.loginAs('cashier')
      await expect(call(c)).rejects.toThrow(DENIED)
      await setPerms(c, { cashier: ['session.open', perm] })
      await c.loginAs('cashier')
      await expect(call(c)).resolves.not.toThrow()
      // ega va standart admin — eskicha
      await c.loginAs('owner')
      await expect(call(c)).resolves.not.toThrow()
      await c.loginAs('admin')
      await setPerms(c, {})
      await c.loginAs('admin')
      await expect(call(c)).resolves.not.toThrow()
    })
  })

  it('waiters.list: session.open yoki waiters.view bilan', async () => {
    const c = await setup()
    await setPerms(c, { cashier: ['debt.manage'] })
    await c.loginAs('cashier')
    await expect(c.svc.waiters.list()).rejects.toThrow(DENIED)
    await setPerms(c, { cashier: ['waiters.view'] })
    await c.loginAs('cashier')
    expect((await c.svc.waiters.list()).length).toBeGreaterThan(0)
    await c.loginAs('waiter')
    expect((await c.svc.waiters.list()).length).toBeGreaterThan(0)
  })

  it('expense.manage berilsa expense.view avtomatik qo‘shiladi', async () => {
    const c = await setup()
    await setPerms(c, { cashier: ['expense.manage'] })
    const s = await c.svc.settings.get()
    expect(s.rolePermissions.cashier).toEqual(['expense.view', 'expense.manage'])
  })

  it('validatsiya xatolari', async () => {
    const c = await setup()
    await c.loginAs('owner')
    const s = await c.svc.settings.get()
    const save = (rp: unknown) => c.svc.settings.save({ ...s, rolePermissions: rp as RP })
    await expect(save({ cashier: ['uchar.tarelka'] })).rejects.toThrow("Noma'lum ruxsat")
    await expect(save({ cashier: 'hamma' })).rejects.toThrow("ro'yxat")
    await expect(save({ owner: [] })).rejects.toThrow('Ega')
    await expect(save({ manager: [] })).rejects.toThrow("Noma'lum rol")
    await expect(save([])).rejects.toThrow("noto'g'ri")
    // hech narsa saqlanmadi; ega o'zgarmas
    expect((await c.svc.settings.get()).rolePermissions.cashier).toEqual(DEFAULT_ROLE_PERMISSIONS.cashier)
    expect((await c.svc.auth.current())!.permissions).toEqual(ALL_PERMISSIONS)
    // yo'q bo'lsa — joriy qiymat saqlanadi
    await c.svc.settings.save({ ...s, rolePermissions: undefined as unknown as RP })
    expect((await c.svc.settings.get()).rolePermissions.waiter).toEqual(DEFAULT_ROLE_PERMISSIONS.waiter)
    // bo'sh ro'yxat — ruxsat
    await save({ waiter: [] })
    expect((await c.svc.settings.get()).rolePermissions.waiter).toEqual([])
  })

  it('admin settings.manage ni o‘ziga/boshqaga bera olmaydi, ega bera oladi', async () => {
    const c = await setup()
    await setPerms(c, { admin: [...DEFAULT_ROLE_PERMISSIONS.admin, 'settings.manage'] })
    await c.loginAs('admin')
    const s = await c.svc.settings.get()
    await expect(
      c.svc.settings.save({ ...s, rolePermissions: { ...s.rolePermissions, cashier: [...s.rolePermissions.cashier, 'settings.manage'] } })
    ).rejects.toThrow('faqat ega')
    // settings.manage bor admin boshqa ruxsatlarni o'zgartira oladi
    await c.svc.settings.save({ ...s, rolePermissions: { ...s.rolePermissions, waiter: ['session.open'] } })
    expect((await c.svc.settings.get()).rolePermissions.waiter).toEqual(['session.open'])
  })

  it('migratsiya: mavjud sozlamaga standart yoziladi, boricha saqlanadi', async () => {
    const SQL = await loadSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.run("INSERT INTO kv VALUES('settings', ?)", [JSON.stringify({ roundTo: 500 })])
    MIGRATION_DATA[7](migrationDb(db))
    const v = JSON.parse(String(db.exec("SELECT value FROM kv WHERE key='settings'")[0].values[0][0]))
    expect(v.roundTo).toBe(500)
    expect(v.rolePermissions).toEqual({
      admin: DEFAULT_ROLE_PERMISSIONS.admin,
      cashier: DEFAULT_ROLE_PERMISSIONS.cashier,
      waiter: DEFAULT_ROLE_PERMISSIONS.waiter
    })
    db.run("UPDATE kv SET value=? WHERE key='settings'", [JSON.stringify({ rolePermissions: { waiter: [] } })])
    MIGRATION_DATA[7](migrationDb(db))
    expect(JSON.parse(String(db.exec("SELECT value FROM kv")[0].values[0][0])).rolePermissions).toEqual({ waiter: [] })
  })

  it('zaxiradan tiklashda saqlanadi', async () => {
    const c = await setup()
    await setPerms(c, { cashier: ['session.open', 'history.view'] })
    const bytes = c.svc.exportBytes()
    await setPerms(c, { cashier: DEFAULT_ROLE_PERMISSIONS.cashier })
    await c.svc.restoreBytes(bytes)
    await c.svc.auth.login(c.staff.cashier.id, c.pins.cashier)
    expect((await c.svc.auth.current())!.permissions).toEqual(['session.open', 'history.view'])
    await expect(c.svc.reports.sessions(RANGE)).resolves.toBeTruthy()
    await expect(c.svc.sessions.cancel(1)).rejects.toThrow(DENIED)
  })
})
