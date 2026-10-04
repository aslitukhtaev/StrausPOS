import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PosService } from '../../electron/main/PosService'
import { Db } from '../../electron/main/db'
import { SCHEMA_VERSION } from '../../electron/main/db/schema'
import { FakeClock, productByName, setup } from './helpers'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delfin-test-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('fayl rejimi va atomik saqlash', () => {
  it('har mutatsiyadan keyin faylga yoziladi va qayta ochilganda tiklanadi', async () => {
    const file = path.join(dir, 'delfin.db')
    const ctx = await setup({ file })
    expect(fs.existsSync(file)).toBe(true)
    const v0 = await ctx.svc.sessions.open(ctx.rooms.s1, 2, 60)
    // Hech qanday "flush" chaqirmasdan — darhol diskda
    const reopened = await PosService.create({ file, clock: ctx.clock.now })
    expect(await reopened.auth.needsSetup()).toBe(false)
    await reopened.auth.login(ctx.staff.owner.id, '1234')
    const v = await reopened.sessions.get(v0.session.id)
    expect(v.guests).toHaveLength(2)
    expect(v.session.status).toBe('open')
    // temp fayllar qolmaydi
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([])
    reopened.db.close()
  })

  it('xatolik bilan tugagan tranzaksiya diskka yozilmaydi', async () => {
    const file = path.join(dir, 'delfin.db')
    const ctx = await setup({ file })
    const before = fs.readFileSync(file)
    await expect(ctx.svc.sessions.open(ctx.rooms.s1, 99, 60)).rejects.toThrow()
    expect(Buffer.compare(before, fs.readFileSync(file))).toBe(0)
  })

  it('sxema versiyasi user_version da', async () => {
    const db = await Db.open({ file: null })
    expect(db.version).toBe(SCHEMA_VERSION)
  })

  it('yangiroq versiyali baza ochilmaydi', async () => {
    const file = path.join(dir, 'delfin.db')
    const db = await Db.open({ file })
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`)
    db.close()
    await expect(Db.open({ file })).rejects.toThrow('yangiroq')
  })
})

describe('zaxira va tiklash', () => {
  it('eksport baytlari → tiklash: holat to‘liq qaytadi, foydalanuvchi chiqariladi', async () => {
    const { svc, rooms, clock, staff } = await setup()
    const v0 = await svc.sessions.open(rooms.s1, 1, 60)
    clock.advanceMin(60)
    await svc.checkout.pay(v0.session.id, [{ method: 'cash', amount: 50_000 }], null)
    const bytes = svc.exportBytes()
    expect(bytes.byteLength).toBeGreaterThan(1000)

    // Keyingi o'zgarishlar
    const chips = await productByName(svc, 'Chips')
    await svc.catalog.adjustStock(chips.id, -20, 'Yo‘qoldi')
    await svc.sessions.open(rooms.s2, 1, 60)

    await svc.restoreBytes(bytes)
    expect(await svc.auth.current()).toBeNull()
    await svc.auth.login(staff.owner.id, '1234')
    expect((await productByName(svc, 'Chips')).stock).toBe(20)
    const board = await svc.rooms.board()
    expect(board.every((c) => c.session === null)).toBe(true)
    expect((await svc.checkout.receipt(v0.session.id)).total).toBe(50_000)
    // Eksportdan keyin ham baza ishlaydi (FK pragma qayta o'rnatilgan)
    expect(svc.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
  })

  it('system.backup / system.restore host orqali', async () => {
    let saved: Uint8Array | null = null
    let savedName = ''
    const host = {
      saveBackup: async (b: Uint8Array, name: string) => {
        saved = b
        savedName = name
        return path.join(dir, name)
      },
      openBackup: async () => saved
    }
    const { svc, rooms, staff } = await setup({ host })
    const res = await svc.system.backup()
    expect(res?.path).toContain('delfin-zaxira-2026-01-15-1000.db')
    expect(savedName).toBe('delfin-zaxira-2026-01-15-1000.db')
    await svc.sessions.open(rooms.s1, 1, 60)
    expect(await svc.system.restore()).toBe(true)
    await svc.auth.login(staff.owner.id, '1234')
    expect((await svc.rooms.board()).every((c) => c.session === null)).toBe(true)
  })

  it('bekor qilingan dialog → null/false', async () => {
    const { svc } = await setup({ host: { saveBackup: async () => null, openBackup: async () => null } })
    expect(await svc.system.backup()).toBeNull()
    expect(await svc.system.restore()).toBe(false)
  })

  it('noto‘g‘ri fayl bilan tiklash rad etiladi va joriy baza buzilmaydi', async () => {
    const file = path.join(dir, 'delfin.db')
    const { svc, rooms } = await setup({ file })
    await svc.sessions.open(rooms.s1, 1, 60)
    await expect(svc.restoreBytes(new TextEncoder().encode('bu baza emas'))).rejects.toThrow('zaxira nusxasi emas')
    // bo'sh (begona) SQLite baza ham rad etiladi
    const empty = await Db.open({ file: null })
    empty.run('DROP TABLE staff')
    await expect(svc.restoreBytes(empty.export())).rejects.toThrow('zaxira nusxasi emas')
    expect((await svc.rooms.board()).find((c) => c.room.id === rooms.s1)!.session).not.toBeNull()
  })

  it('tiklangan baza faylga ham yoziladi', async () => {
    const file = path.join(dir, 'delfin.db')
    const a = await setup({ file })
    const snapshot = a.svc.exportBytes()
    await a.svc.sessions.open(a.rooms.s1, 1, 60)
    await a.svc.restoreBytes(snapshot)
    const re = await PosService.create({ file, clock: new FakeClock().now })
    await re.auth.login(a.staff.owner.id, '1234')
    expect((await re.rooms.board()).every((c) => c.session === null)).toBe(true)
  })
})
