import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PosService } from '../../electron/main/PosService'
import { Db } from '../../electron/main/db'
import { MIGRATIONS, SCHEMA_VERSION } from '../../electron/main/db/schema'
import { loadSqlJs } from '../../electron/main/db/sqljs'
import { hashPin } from '../../electron/main/pin'
import { FakeClock, HOUR, MIN, T0 } from './helpers'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delfin-mig-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** v1 sxemali (StrausPOS davri) baza: ega + kassir, 2 xona, 1 yopilgan va 1 ochiq sessiya, eski sozlamalar. */
async function buildV1(): Promise<Uint8Array> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.exec(MIGRATIONS[0])
  db.run('PRAGMA user_version = 1')
  const oldSettings = { receipt: { businessName: 'Eski Sauna', paperWidth: 58 }, roundTo: 500, lockEnabled: true, autoLockMinutes: 0, language: 'uz' }
  db.run("INSERT INTO kv(key, value) VALUES('settings', ?)", [JSON.stringify(oldSettings)])
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, created_at) VALUES(1, 'Ega', 'owner', ?, 1, 0, 0)", [hashPin('1234')])
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, created_at) VALUES(2, 'Kassir', 'cashier', ?, 1, 1, 0)", [hashPin('3333')])
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(1, 'Sauna 1', 60000, 6, 1, 1)")
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(2, 'Sauna 2', 30000, 4, 1, 2)")
  db.run("INSERT INTO categories(id, name, sort_order) VALUES(1, 'Ichimliklar', 1)")
  db.run("INSERT INTO products(id, category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(1, 1, 'Pivo', 20000, 10, 1, 2, 1)")
  // Yopilgan sessiya (to'lov paytida muzlatilgan summalar bilan)
  const opened = T0 - 3 * HOUR
  const closed = T0 - 2 * HOUR + 30 * MIN
  db.run(
    `INSERT INTO sessions(id, room_id, status, opened_at, closed_at, opened_by, closed_by, discount, note, cancelled, receipt_no,
       time_total, lines_total, discount_applied, total) VALUES(1, 1, 'closed', ?, ?, 2, 2, 0, '', 0, 1, 90000, 40000, 0, 130000)`,
    [opened, closed]
  )
  db.run("INSERT INTO guests(id, session_id, label, state) VALUES(1, 1, 'Mehmon 1', 'finished')")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(1, 1, 60000, ?, ?)', [opened, closed])
  db.run(
    "INSERT INTO order_lines(session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by) VALUES(1, NULL, 'product', 1, 'Pivo', 20000, 2, 0, NULL, ?, 2)",
    [opened]
  )
  db.run("INSERT INTO payments(session_id, method, amount, at, by) VALUES(1, 'cash', 130000, ?, 2)", [closed])
  // Ochiq sessiya (yangilanish paytida xonada mehmon bor edi)
  db.run("INSERT INTO sessions(id, room_id, status, opened_at, opened_by) VALUES(2, 2, 'open', ?, 1)", [T0 - 30 * MIN])
  db.run("INSERT INTO guests(id, session_id, label, state) VALUES(2, 2, 'Mehmon 1', 'running')")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(2, 2, 30000, ?, NULL)', [T0 - 30 * MIN])
  const bytes = db.export()
  db.close()
  return bytes
}

describe('migratsiya v1 → v2 (Delfin Sauna)', () => {
  it('eski fayl bazasi yangilanadi va ma’lumotlar saqlanadi', async () => {
    const file = path.join(dir, 'delfin.db')
    fs.writeFileSync(file, await buildV1())
    const svc = await PosService.create({ file, clock: new FakeClock().now })
    expect(svc.db.version).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBe(2)
    // FK yoqilgan va buzilmagan
    expect(svc.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    expect(svc.db.all('PRAGMA foreign_key_check')).toEqual([])

    // Eski PIN bilan kirish ishlaydi; yangi maydonlar standart
    const login = await svc.auth.login(2, '3333')
    expect(login.staff).toEqual({ id: 2, name: 'Kassir', role: 'cashier', active: true, isProvider: true, isWaiter: false, commissionPct: 0 })
    await svc.auth.login(1, '1234')

    // Sozlamalar: eski qiymatlar + yangi standartlar
    const s = await svc.settings.get()
    expect(s).toMatchObject({ roundTo: 500, blockMinutes: 60, graceMinutes: 0, defaultHours: 1, warnBeforeMinutes: 10, theme: 'auto' })
    expect(s.receipt).toMatchObject({ businessName: 'Eski Sauna', paperWidth: 58 })

    // Yopilgan sessiya: muzlatilgan hisobot summalari o'zgarmaydi; ofitsiant yo'q
    const rep = await svc.reports.sales({ from: 0, to: T0 + HOUR })
    expect(rep).toMatchObject({ sessionsCount: 1, total: 130_000, timeRevenue: 90_000, productRevenue: 40_000, byWaiter: [] })
    const closed = await svc.sessions.get(1)
    expect(closed.session).toMatchObject({ status: 'closed', waiterId: null, waiterPct: 0 })
    expect(closed.guests[0].paidMinutes).toBe(0)
    expect(closed.payments.map((p) => p.amount)).toEqual([130_000])

    // Ochiq sessiya: paidMinutes=0 → blok qoidasi (30 daq → 1 soat), ishni davom ettirish mumkin
    let open = await svc.sessions.get(2)
    expect(open.guests[0]).toMatchObject({ paidMinutes: 0, billedMinutes: 60, timeAmount: 30_000 })
    open = await svc.sessions.extendGuest(open.guests[0].id, 60)
    expect(open.guests[0].paidMinutes).toBe(60)

    // Yangi imkoniyatlar: ofitsiant roli, biriktirish; staff id lar davom etadi
    const w = await svc.staff.save({ name: 'Sardor', role: 'waiter', pin: '5555', isProvider: false, isWaiter: true, commissionPct: 10, active: true })
    expect(w.id).toBe(3)
    open = await svc.sessions.setWaiter(2, w.id)
    expect(open.waiterName).toBe('Sardor')
    const r = await svc.checkout.pay(2, [{ method: 'card', amount: open.total }], null)
    expect(r.receiptNo).toBe(2)
    svc.db.close()

    // Qayta ochish: migratsiya qayta ishlamaydi, ma'lumot joyida
    const again = await PosService.create({ file, clock: new FakeClock().now })
    expect(again.db.version).toBe(SCHEMA_VERSION)
    await again.auth.login(3, '5555')
    expect((await again.auth.current())?.staff).toMatchObject({ role: 'waiter', isWaiter: true, commissionPct: 10 })
    again.db.close()
  })

  it('eski staff jadvalidagi CHECK yangilangan (waiter roli bazada qabul qilinadi)', async () => {
    const db = await Db.open({ file: null })
    const sql = db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='staff'")!.sql
    expect(sql).toContain("'waiter'")
    expect(db.all("SELECT name FROM sqlite_master WHERE name='staff_v2'")).toEqual([])
    db.close()
  })

  it('v1 zaxira nusxasidan tiklash ham migratsiya qiladi', async () => {
    const file = path.join(dir, 'delfin.db')
    const svc = await PosService.create({ file, clock: new FakeClock().now })
    await svc.auth.setupOwner('Yangi', '9999', 'Delfin Sauna')
    await svc.restoreBytes(await buildV1())
    expect(svc.db.version).toBe(SCHEMA_VERSION)
    await svc.auth.login(1, '1234')
    expect((await svc.settings.get()).receipt.businessName).toBe('Eski Sauna')
    expect((await svc.sessions.get(2)).guests[0].paidMinutes).toBe(0)
    svc.db.close()
  })
})
