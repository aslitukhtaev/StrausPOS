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

describe('migratsiya v1 → oxirgi (Delfin Sauna)', () => {
  it('eski fayl bazasi yangilanadi va ma’lumotlar saqlanadi', async () => {
    const file = path.join(dir, 'delfin.db')
    fs.writeFileSync(file, await buildV1())
    const svc = await PosService.create({ file, clock: new FakeClock().now })
    expect(svc.db.version).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBe(4)
    // FK yoqilgan va buzilmagan
    expect(svc.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    expect(svc.db.all('PRAGMA foreign_key_check')).toEqual([])

    // Eski PIN bilan kirish ishlaydi; yangi maydonlar standart
    const login = await svc.auth.login(2, '3333')
    expect(login.staff).toEqual({ id: 2, name: 'Kassir', role: 'cashier', active: true, isProvider: true, isWaiter: false, commissionPct: 0 })
    await svc.auth.login(1, '1234')

    // Sozlamalar: eski qiymatlar + yangi standartlar
    const s = await svc.settings.get()
    // blockMinutes yo'q edi → yangi standart 1 (daqiqalik)
    expect(s).toMatchObject({ roundTo: 500, blockMinutes: 1, graceMinutes: 0, defaultHours: 1, warnBeforeMinutes: 10, theme: 'auto' })
    expect(s.receipt).toMatchObject({ businessName: 'Eski Sauna', paperWidth: 58 })

    // Yopilgan sessiya: muzlatilgan hisobot summalari o'zgarmaydi; ofitsiant yo'q
    const rep = await svc.reports.sales({ from: 0, to: T0 + HOUR })
    expect(rep).toMatchObject({ sessionsCount: 1, total: 130_000, timeRevenue: 90_000, productRevenue: 40_000, byWaiter: [] })
    const closed = await svc.sessions.get(1)
    expect(closed.session).toMatchObject({ status: 'closed', waiterId: null, waiterPct: 0 })
    expect(closed.guests[0].paidMinutes).toBe(0)
    expect(closed.payments.map((p) => p.amount)).toEqual([130_000])

    // Ochiq sessiya: paidMinutes=0 → aynan o'tirilgan daqiqa (30 daq × 30 000/60 = 15 000), ishni davom ettirish mumkin
    let open = await svc.sessions.get(2)
    expect(open.guests[0]).toMatchObject({ paidMinutes: 0, billedMinutes: 30, timeAmount: 15_000 })
    open = await svc.sessions.extendGuest(open.guests[0].id, 60)
    expect(open.guests[0].paidMinutes).toBe(60)

    // Yangi imkoniyatlar: ofitsiant roli, biriktirish; staff id lar davom etadi
    const w = await svc.staff.save({ name: 'Sardor', role: 'waiter', pin: '5555', isProvider: false, isWaiter: true, commissionPct: 10, active: true })
    expect(w.id).toBe(3)
    open = await svc.lines.addProduct(2, 1, 1, null, w.id)
    expect(open.lines[0]).toMatchObject({ waiterId: w.id, waiterPct: 10, department: 'bar' })
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

/** v2 sxemali baza: ofitsiantli yopilgan sessiya (muzlatilgan haq), qarz, qaytarish, ochiq sessiya; bekor qilingan sessiya. */
async function buildV2(): Promise<Uint8Array> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = OFF')
  db.exec(MIGRATIONS[0])
  db.exec(MIGRATIONS[1])
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA user_version = 2')
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(1, 'Ega', 'owner', ?, 1, 0, 0, 0, 0)", [hashPin('1234')])
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(2, 'Sardor', 'waiter', ?, 1, 0, 1, 10, 0)", [hashPin('5555')])
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(1, 'Sauna 1', 50000, 6, 1, 1)")
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(2, 'Sauna 2', 60000, 4, 1, 2)")
  db.run("INSERT INTO categories(id, name, sort_order) VALUES(1, 'Ichimliklar', 1)")
  db.run("INSERT INTO products(id, category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(1, 1, 'Pivo', 20000, 10, 1, 2, 1)")
  const opened = T0 - 3 * HOUR
  const closed = T0 - 2 * HOUR
  // 1: yopilgan, ofitsiant bilan (60 000 vaqt + Pivo 3−1 = 40 000), qarz 100 000
  db.run(
    `INSERT INTO sessions(id, room_id, status, opened_at, closed_at, opened_by, closed_by, discount, note, cancelled, receipt_no,
       time_total, lines_total, discount_applied, total, waiter_id, waiter_pct, product_sales, waiter_commission)
     VALUES(1, 1, 'closed', ?, ?, 1, 1, 0, 'izoh', 0, 7, 50000, 40000, 0, 90000, 2, 10, 40000, 4000)`,
    [opened, closed]
  )
  db.run("INSERT INTO guests(id, session_id, label, state, paid_minutes) VALUES(1, 1, 'Mehmon 1', 'finished', 60)")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(1, 1, 50000, ?, ?)', [opened, closed])
  db.run(
    "INSERT INTO order_lines(id, session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by) VALUES(1, 1, 1, 'product', 1, 'Pivo', 20000, 3, 1, NULL, ?, 1)",
    [opened]
  )
  db.run("INSERT INTO returns(line_id, session_id, qty, reason, at, by) VALUES(1, 1, 1, 'iliq', ?, 1)", [opened + 10 * MIN])
  db.run("INSERT INTO payments(session_id, method, amount, at, by) VALUES(1, 'debt', 90000, ?, 1)", [closed])
  db.run("INSERT INTO debts(id, session_id, customer_name, phone, amount, paid, created_at) VALUES(1, 1, 'Ali', '+998901112233', 90000, 0, ?)", [closed])
  // 2: bekor qilingan; 3: ochiq (Sauna 2)
  db.run("INSERT INTO sessions(id, room_id, status, opened_at, closed_at, opened_by, closed_by, cancelled) VALUES(2, 2, 'closed', ?, ?, 1, 1, 1)", [opened, opened])
  db.run("INSERT INTO sessions(id, room_id, status, opened_at, opened_by, waiter_id, waiter_pct) VALUES(3, 2, 'open', ?, 1, 2, 10)", [T0 - 30 * MIN])
  db.run("INSERT INTO guests(id, session_id, label, state, paid_minutes) VALUES(2, 3, 'Mehmon 1', 'running', 60)")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(2, 2, 60000, ?, NULL)', [T0 - 30 * MIN])
  // AUTOINCREMENT hisoblagichi o'chirilgan qatorlar tufayli max(id) dan katta bo'lishi mumkin
  db.run("UPDATE sqlite_sequence SET seq=10 WHERE name='sessions'")
  const bytes = db.export()
  db.close()
  return bytes
}

describe('migratsiya v2 → v3 (xonasiz bar savdosi)', () => {
  it('sessions qayta quriladi: ma’lumot, id, FK, indekslar va hisoblagich saqlanadi; kind=room', async () => {
    const file = path.join(dir, 'delfin.db')
    fs.writeFileSync(file, await buildV2())
    const clock = new FakeClock()
    const svc = await PosService.create({ file, clock: clock.now })
    expect(svc.db.version).toBe(SCHEMA_VERSION)
    expect(svc.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    expect(svc.db.all('PRAGMA foreign_key_check')).toEqual([])
    expect(svc.db.all("SELECT name FROM sqlite_master WHERE name='sessions_v3'")).toEqual([])
    const idx = svc.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions' ORDER BY name").map((r) => r.name)
    expect(idx).toEqual(['idx_sessions_closed', 'idx_sessions_kind', 'idx_sessions_receipt', 'idx_sessions_status', 'idx_sessions_waiter'])
    const tableSql = svc.db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'")!.sql
    expect(tableSql).toContain('kind')
    expect(svc.db.all<{ kind: string }>('SELECT DISTINCT kind FROM sessions')).toEqual([{ kind: 'room' }])
    // Boshqa jadvallarning FK lari yangi sessions jadvaliga ishora qiladi
    for (const t of ['guests', 'order_lines', 'returns', 'payments', 'debts']) {
      const fks = svc.db.all<{ table: string }>(`PRAGMA foreign_key_list(${t})`).map((f) => f.table)
      expect(fks, t).toContain('sessions')
    }
    expect(() => svc.db.run("INSERT INTO payments(session_id, method, amount, at, by) VALUES(999, 'cash', 1, 0, 1)")).toThrow()

    await svc.auth.login(1, '1234')
    const s1 = await svc.sessions.get(1)
    expect(s1.session).toEqual({
      id: 1, kind: 'room', roomId: 1, status: 'closed', openedAt: T0 - 3 * HOUR, closedAt: T0 - 2 * HOUR, openedBy: 1,
      discount: 0, note: 'izoh', waiterId: 2, waiterPct: 10
    })
    expect(s1.room.name).toBe('Sauna 1')
    expect((await svc.checkout.receipt(1)).receiptNo).toBe(7)
    expect((await svc.debts.list(true))[0]).toMatchObject({ sessionId: 1, amount: 90_000 })
    await expect(svc.checkout.receipt(2)).rejects.toThrow('Sessiya bekor qilingan')

    // Hisobot va ofitsiant hisobi (muzlatilgan qiymatlar) o'zgarmaydi
    const rep = await svc.reports.sales({ from: 0, to: T0 + HOUR })
    expect(rep).toMatchObject({ sessionsCount: 1, total: 90_000, byMethod: { cash: 0, card: 0, terminal: 0, debt: 90_000 }, returnsAmount: 20_000, barSales: { count: 0, total: 0 } })
    expect(rep.byRoom).toEqual([{ roomId: 1, roomName: 'Sauna 1', sessions: 1, total: 90_000 }])
    expect((await svc.waiters.monthly('2026-01')).find((w) => w.staffId === 2)).toMatchObject({ sessions: 1, productSales: 40_000, commission: 4_000 })
    expect((await svc.reports.returns({ from: 0, to: T0 + HOUR }))[0]).toMatchObject({ roomName: 'Sauna 1', qty: 1 })

    // Ochiq sessiya panelda va davom etadi
    const board = await svc.rooms.board()
    expect(board.find((c) => c.room.id === 2)!.session!.session.id).toBe(3)
    await expect(svc.sessions.open(2, 1, 60)).rejects.toThrow('Xona band')

    // Yangi sessiyalar AUTOINCREMENT hisoblagichidan davom etadi (id qayta ishlatilmaydi)
    const bar = await svc.barSales.open()
    expect(bar.session.id).toBe(11)
    expect(bar.session).toMatchObject({ kind: 'bar', roomId: 0 })
    await svc.lines.addProduct(bar.session.id, 1, 2, null)
    const r = await svc.checkout.pay(bar.session.id, [{ method: 'cash', amount: 40_000 }], null)
    expect(r.receiptNo).toBe(8)
    const v3 = await svc.checkout.pay(3, [{ method: 'card', amount: (await svc.sessions.get(3)).total }], null)
    expect(v3.receiptNo).toBe(9)
    svc.db.close()

    // Qayta ochish: migratsiya qayta ishlamaydi, bar savdosi joyida
    const again = await PosService.create({ file, clock: clock.now })
    expect(again.db.version).toBe(SCHEMA_VERSION)
    await again.auth.login(1, '1234')
    expect((await again.sessions.get(11)).room.name).toBe('Bar')
    expect((await again.barSales.history({ from: 0, to: T0 + HOUR })).map((h) => h.sessionId)).toEqual([11])
    again.db.close()
  })

  it('v2 zaxira nusxasidan tiklash ham v3 ga migratsiya qiladi', async () => {
    const svc = await PosService.create({ file: path.join(dir, 'delfin.db'), clock: new FakeClock().now })
    await svc.auth.setupOwner('Yangi', '9999', 'Delfin Sauna')
    await svc.restoreBytes(await buildV2())
    expect(svc.db.version).toBe(SCHEMA_VERSION)
    await svc.auth.login(1, '1234')
    expect((await svc.sessions.get(3)).session.kind).toBe('room')
    expect((await svc.barSales.open()).session.kind).toBe('bar')
    svc.db.close()
  })
})

/**
 * v3 sxemali baza (2026-10 gacha): blockMinutes=60 sozlamasi, qarzlar (bir odam turli yozuvlarda, telefonsiz ham),
 * qarz to'lovi, eski (sessiyaga biriktirilgan) ofitsiantli yopilgan sessiya va ochiq sessiya.
 */
async function buildV3(settings: Record<string, unknown> = { receipt: { businessName: 'V3 Sauna' }, roundTo: 1000, blockMinutes: 60, graceMinutes: 5 }): Promise<Uint8Array> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = OFF')
  db.exec(MIGRATIONS[0])
  db.exec(MIGRATIONS[1])
  db.exec(MIGRATIONS[2])
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA user_version = 3')
  db.run("INSERT INTO kv(key, value) VALUES('settings', ?)", [JSON.stringify(settings)])
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(1, 'Ega', 'owner', ?, 1, 0, 0, 0, 0)", [hashPin('1234')])
  db.run("INSERT INTO staff(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at) VALUES(2, 'Sardor', 'waiter', ?, 1, 0, 1, 10, 0)", [hashPin('5555')])
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(1, 'Sauna 1', 50000, 6, 1, 1)")
  db.run("INSERT INTO rooms(id, name, price_per_hour, capacity, active, sort_order) VALUES(2, 'Sauna 2', 60000, 4, 1, 2)")
  db.run("INSERT INTO categories(id, name, sort_order) VALUES(1, 'Ichimliklar', 1)")
  db.run("INSERT INTO products(id, category_id, name, price, stock, track_stock, low_stock_at, active) VALUES(1, 1, 'Pivo', 20000, 10, 1, 2, 1)")
  const opened = T0 - 3 * HOUR
  const closed = T0 - 2 * HOUR
  // 1: yopilgan, eski ofitsiant (Sardor 10%): 50 000 vaqt + Pivo 2 = 90 000 → karta 50 000 + qarz 40 000 (Ali)
  db.run(
    `INSERT INTO sessions(id, kind, room_id, status, opened_at, closed_at, opened_by, closed_by, discount, note, cancelled, receipt_no,
       time_total, lines_total, discount_applied, total, waiter_id, waiter_pct, product_sales, waiter_commission)
     VALUES(1, 'room', 1, 'closed', ?, ?, 1, 1, 0, '', 0, 1, 50000, 40000, 0, 90000, 2, 10, 40000, 4000)`,
    [opened, closed]
  )
  db.run("INSERT INTO guests(id, session_id, label, state, paid_minutes) VALUES(1, 1, 'Mehmon 1', 'finished', 60)")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(1, 1, 50000, ?, ?)', [opened, closed])
  db.run(
    "INSERT INTO order_lines(id, session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by) VALUES(1, 1, NULL, 'product', 1, 'Pivo', 20000, 2, 0, NULL, ?, 1)",
    [opened]
  )
  db.run("INSERT INTO payments(id, session_id, method, amount, at, by) VALUES(1, 1, 'card', 50000, ?, 1)", [closed])
  db.run("INSERT INTO payments(id, session_id, method, amount, at, by) VALUES(2, 1, 'debt', 40000, ?, 1)", [closed])
  db.run("UPDATE sqlite_sequence SET seq=20 WHERE name='payments'")
  db.run("INSERT INTO debts(id, session_id, customer_name, phone, amount, paid, created_at) VALUES(1, 1, 'Ali', '+998 90 111 22 33', 40000, 10000, ?)", [closed])
  db.run("INSERT INTO debt_payments(id, debt_id, method, amount, at, by) VALUES(1, 1, 'cash', 10000, ?, 1)", [closed + 10 * MIN])
  // Bir odam boshqa ism/formatda; telefonsiz eski yozuvlar ism bo'yicha
  db.run("INSERT INTO debts(id, session_id, customer_name, phone, amount, paid, created_at) VALUES(2, NULL, 'Ali aka', '90-111-22-33', 30000, 0, ?)", [closed + 20 * MIN])
  db.run("INSERT INTO debts(id, session_id, customer_name, phone, amount, paid, created_at) VALUES(3, NULL, 'Vali', '', 15000, 0, ?)", [closed + 30 * MIN])
  db.run("INSERT INTO debts(id, session_id, customer_name, phone, amount, paid, created_at, closed_at) VALUES(4, NULL, ' vali ', '-', 5000, 5000, ?, ?)", [closed + 40 * MIN, closed + 50 * MIN])
  // 3: ochiq (Sauna 2), sessiyaga biriktirilgan Sardor, Pivo 2
  db.run("INSERT INTO sessions(id, kind, room_id, status, opened_at, opened_by, waiter_id, waiter_pct) VALUES(3, 'room', 2, 'open', ?, 1, 2, 10)", [T0 - 30 * MIN])
  db.run("INSERT INTO guests(id, session_id, label, state, paid_minutes) VALUES(2, 3, 'Mehmon 1', 'running', 60)")
  db.run('INSERT INTO intervals(guest_id, room_id, rate, start, end) VALUES(2, 2, 60000, ?, NULL)', [T0 - 30 * MIN])
  db.run(
    "INSERT INTO order_lines(id, session_id, guest_id, kind, ref_id, name, unit_price, qty, returned_qty, provider_id, created_at, created_by) VALUES(2, 3, NULL, 'product', 1, 'Pivo', 20000, 2, 0, NULL, ?, 1)",
    [T0 - 20 * MIN]
  )
  const bytes = db.export()
  db.close()
  return bytes
}

describe('migratsiya v3 → v4 (terminal, qarzdorlar, oshxona, qatorga ofitsiant, daqiqalik vaqt)', () => {
  it('jadvallar qayta quriladi, ma’lumot saqlanadi, qarzdorlar guruhlanadi, blockMinutes 60 → 1', async () => {
    const file = path.join(dir, 'delfin.db')
    fs.writeFileSync(file, await buildV3())
    const clock = new FakeClock()
    const svc = await PosService.create({ file, clock: clock.now })
    expect(svc.db.version).toBe(4)
    expect(svc.db.all('PRAGMA foreign_key_check')).toEqual([])
    expect(svc.db.all("SELECT name FROM sqlite_master WHERE name LIKE '%_v4'")).toEqual([])
    for (const t of ['payments', 'debt_payments'])
      expect(svc.db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`)!.sql).toContain("'terminal'")
    expect(svc.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='payments'").map((r) => r.name)).toEqual(['idx_payments_session'])
    for (const t of ['payments', 'debts', 'order_lines']) {
      const fks = svc.db.all<{ table: string }>(`PRAGMA foreign_key_list(${t})`).map((f) => f.table)
      expect(fks, t).toContain('sessions')
    }
    // CHECK hali ham ishlaydi
    expect(() => svc.db.run("INSERT INTO payments(session_id, method, amount, at, by) VALUES(1, 'bitcoin', 1, 0, 1)")).toThrow()
    expect(() => svc.db.run("UPDATE categories SET department='sklad'")).toThrow()

    await svc.auth.login(1, '1234')
    // Sozlamalar: blockMinutes 60 → 1, qolganlari saqlanadi, oshxona standartlari
    const s = await svc.settings.get()
    expect(s).toMatchObject({ blockMinutes: 1, graceMinutes: 5, roundTo: 1000 })
    expect(s.receipt.businessName).toBe('V3 Sauna')
    expect(s.kitchen).toEqual({ sharePct: 100, printerName: '', paperWidth: 80, autoPrint: true })

    // Qarzdorlar: Ali (2 qarz — telefon bo'yicha, birinchi ism saqlanadi), Vali (telefonsiz — ism bo'yicha)
    const all = await svc.debtors.list(false)
    expect(all.map((d) => [d.name, d.phone, d.total, d.paid, d.balance, d.debtsCount])).toEqual([
      ['Vali', '', 20_000, 5_000, 15_000, 2],
      ['Ali', '+998 90 111 22 33', 70_000, 10_000, 60_000, 2]
    ])
    expect((await svc.debtors.list(true)).map((d) => d.name)).toEqual(['Vali', 'Ali'])
    const ali = all[1]
    expect((await svc.debts.list(false)).every((d) => d.debtorId > 0)).toBe(true)
    expect((await svc.checkout.receipt(1)).debtor).toEqual({ debtorId: ali.id, name: 'Ali', phone: '+998 90 111 22 33' })
    expect(await svc.debts.payments(1)).toEqual([expect.objectContaining({ id: 1, method: 'cash', amount: 10_000 })])

    // Bo'limlar va qatorlar
    expect((await svc.catalog.categories()).map((c) => c.department)).toEqual(['bar'])
    const closedV = await svc.sessions.get(1)
    expect(closedV.session).toMatchObject({ waiterId: 2, waiterPct: 10 }) // tarix
    expect(closedV.waiterName).toBe('Sardor')
    expect(closedV.lines[0]).toMatchObject({ department: 'bar', waiterId: null, waiterPct: 0 })
    // Ochiq sessiya: ofitsiant qatorga o'tkazildi
    const openV = await svc.sessions.get(3)
    expect(openV.session).toMatchObject({ waiterId: null, waiterPct: 0 })
    expect(openV.lines[0]).toMatchObject({ department: 'bar', waiterId: 2, waiterPct: 10 })
    expect(openV.total).toBe(60_000 + 40_000)

    // Terminal bilan to'lov; payments hisoblagichi saqlangan (21 dan davom)
    const r = await svc.checkout.pay(3, [{ method: 'terminal', amount: 100_000 }], null)
    expect(r.receiptNo).toBe(2)
    expect((await svc.sessions.get(3)).payments[0]).toMatchObject({ id: 21, method: 'terminal' })
    // Ofitsiant: eski sessiya (muzlatilgan 4 000) + yangi qatorlar (40 000 × 10% = 4 000)
    expect((await svc.waiters.monthly('2026-01')).find((w) => w.staffId === 2)).toMatchObject({ sessions: 2, productSales: 80_000, commission: 8_000 })
    const rep = await svc.reports.sales({ from: 0, to: T0 + HOUR })
    expect(rep.byMethod).toEqual({ cash: 0, card: 50_000, terminal: 100_000, debt: 40_000 })
    expect(rep.debtPayments).toEqual({ cash: 10_000, card: 0, terminal: 0 })
    expect(rep.byWaiter).toEqual([{ staffId: 2, name: 'Sardor', sessions: 2, productSales: 80_000, commission: 8_000 }])

    // Yangi qarz o'sha telefon bilan (boshqa ism) → Ali ga qo'shiladi, ism o'zgarmaydi
    const n = await svc.sessions.open(1, 1, 60)
    const rn = await svc.checkout.pay(n.session.id, [{ method: 'debt', amount: 50_000 }], { name: 'Alisher', phone: '901112233' })
    expect(rn.debtor).toEqual({ debtorId: ali.id, name: 'Ali', phone: '+998 90 111 22 33' })
    // FIFO: eng eski (30 000 qoldiqli 1-qarz) dan
    const after = await svc.debtors.pay(ali.id, 'terminal', 40_000)
    expect(after).toMatchObject({ total: 120_000, paid: 50_000, balance: 70_000, debtsCount: 3 })
    expect((await svc.debtors.debts(ali.id)).map((d) => [d.id, d.paid, d.closedAt !== null])).toEqual([
      [5, 0, false],
      [2, 10_000, false],
      [1, 40_000, true]
    ])
    svc.db.close()

    // Qayta ochish: migratsiya qayta ishlamaydi
    const again = await PosService.create({ file, clock: clock.now })
    expect(again.db.version).toBe(4)
    await again.auth.login(1, '1234')
    expect((await again.debtors.list(false))).toHaveLength(2)
    expect((await again.settings.get()).blockMinutes).toBe(1)
    again.db.close()
  })

  it('blockMinutes 60 dan boshqa bo‘lsa (ega o‘zi tanlagan) saqlanadi; v3 zaxiradan tiklash ham migratsiya qiladi', async () => {
    const svc = await PosService.create({ file: path.join(dir, 'delfin.db'), clock: new FakeClock().now })
    await svc.auth.setupOwner('Yangi', '9999', 'Delfin Sauna')
    await svc.restoreBytes(await buildV3({ receipt: {}, blockMinutes: 30 }))
    expect(svc.db.version).toBe(4)
    await svc.auth.login(1, '1234')
    expect((await svc.settings.get()).blockMinutes).toBe(30)
    expect(await svc.debtors.list(false)).toHaveLength(2)
    svc.db.close()
  })

  it('qarzsiz va sozlamasiz v3 baza ham muammosiz yangilanadi', async () => {
    const SQL = await loadSqlJs()
    const db = new SQL.Database()
    db.run('PRAGMA foreign_keys = OFF')
    for (let i = 0; i < 3; i++) db.exec(MIGRATIONS[i])
    db.run('PRAGMA user_version = 3')
    const bytes = db.export()
    db.close()
    const file = path.join(dir, 'empty.db')
    fs.writeFileSync(file, bytes)
    const svc = await PosService.create({ file, clock: new FakeClock().now })
    expect(svc.db.version).toBe(4)
    expect(svc.db.all('SELECT * FROM debtors')).toEqual([])
    expect(await svc.auth.needsSetup()).toBe(true)
    svc.db.close()
  })
})
