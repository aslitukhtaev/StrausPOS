/**
 * Db — sql.js ustidagi yupqa qatlam.
 *  - Ichki xotira rejimi (`file: null`) — testlar uchun.
 *  - Fayl rejimi — har bir muvaffaqiyatli tranzaksiyadan keyin butun baza ATOMIK yoziladi
 *    (temp fayl + fsync + rename). Debounce yo'q: chiroq o'chsa ham oxirgi yozilgan holat butun qoladi.
 */
import fs from 'fs'
import path from 'path'
import type { Database, SqlValue } from 'sql.js'
import { loadSqlJs } from './sqljs'
import { MIGRATIONS, SCHEMA_VERSION } from './schema'

export type Params = SqlValue[]
export type Row = Record<string, SqlValue>

export interface DbOptions {
  /** null/undefined = faqat xotirada (testlar) */
  file?: string | null
}

/** Faylni atomik yozish: temp → fsync → rename (Windows'da vaqtinchalik qulf bo'lsa bir necha urinish). */
export function writeFileAtomic(file: string, data: Uint8Array): void {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  const fd = fs.openSync(tmp, 'w')
  try {
    let off = 0
    while (off < data.length) off += fs.writeSync(fd, data, off, data.length - off)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  let lastErr: unknown = null
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (e) {
      lastErr = e
      // Windows: antivirus/indekslash faylni qisqa vaqt ushlab turishi mumkin
      const until = Date.now() + 50 * (i + 1)
      while (Date.now() < until) {
        /* qisqa kutish */
      }
    }
  }
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* e'tiborsiz */
  }
  throw new Error("Ma'lumotlarni saqlab bo'lmadi: " + (lastErr instanceof Error ? lastErr.message : String(lastErr)))
}

export class Db {
  private db: Database
  readonly file: string | null
  private depth = 0
  private dirty = false

  private constructor(db: Database, file: string | null) {
    this.db = db
    this.file = file
    this.applyPragmas()
  }

  static async open(opts: DbOptions = {}): Promise<Db> {
    const SQL = await loadSqlJs()
    const file = opts.file ?? null
    let data: Uint8Array | null = null
    if (file && fs.existsSync(file)) data = fs.readFileSync(file)
    const raw = data && data.length > 0 ? new SQL.Database(data) : new SQL.Database()
    const db = new Db(raw, file)
    const fresh = !data || data.length === 0
    const changed = db.migrate()
    if (file && (fresh || changed)) db.persist()
    return db
  }

  /** Baytlardan baza ochishga urinish (zaxira tekshiruvi uchun). Xato bo'lsa throw. */
  static async validateBytes(bytes: Uint8Array): Promise<void> {
    const SQL = await loadSqlJs()
    let tmp: Database | null = null
    let ver = 0
    let ok = false
    try {
      tmp = new SQL.Database(bytes)
      ver = Number(tmp.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
      const t = tmp.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('staff','sessions','rooms')")
      ok = ver >= 1 && (t[0]?.values.length ?? 0) === 3
    } catch {
      ok = false
    } finally {
      tmp?.close()
    }
    if (!ok) throw new Error('Fayl Delfin Sauna zaxira nusxasi emas yoki buzilgan')
    if (ver > SCHEMA_VERSION) throw new Error('Zaxira nusxa dasturning yangiroq versiyasida yaratilgan')
  }

  private applyPragmas(): void {
    this.db.run('PRAGMA foreign_keys = ON')
  }

  get version(): number {
    return Number(this.db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
  }

  /** Migratsiyalarni qo'llaydi. O'zgarish bo'lsa true. */
  private migrate(): boolean {
    const cur = this.version
    if (cur > SCHEMA_VERSION) throw new Error("Ma'lumotlar bazasi dasturning yangiroq versiyasiga tegishli")
    if (cur === SCHEMA_VERSION) return false
    // Jadvalni qayta qurish (masalan v2: staff) uchun tashqi kalitlar vaqtincha o'chiriladi —
    // PRAGMA foreign_keys tranzaksiya ichida ishlamaydi, shuning uchun BEGIN dan oldin.
    this.db.run('PRAGMA foreign_keys = OFF')
    try {
      this.db.run('BEGIN')
      try {
        for (let v = cur; v < SCHEMA_VERSION; v++) this.db.exec(MIGRATIONS[v])
        const bad = this.db.exec('PRAGMA foreign_key_check')
        if (bad.length > 0 && bad[0].values.length > 0) throw new Error("Ma'lumotlar bazasini yangilashda bog'lanish xatosi")
        this.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
        this.db.run('COMMIT')
      } catch (e) {
        this.db.run('ROLLBACK')
        throw e
      }
    } finally {
      this.applyPragmas()
    }
    return true
  }

  all<T = Row>(sql: string, params: Params = []): T[] {
    const st = this.db.prepare(sql)
    try {
      st.bind(params)
      const out: T[] = []
      while (st.step()) out.push(st.getAsObject() as unknown as T)
      return out
    } finally {
      st.free()
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  /** Yozuvchi so'rov. Tranzaksiyadan tashqarida chaqirilsa ham darhol saqlanadi. */
  run(sql: string, params: Params = []): { changes: number; lastId: number } {
    this.db.run(sql, params)
    const changes = this.db.getRowsModified()
    const lastId = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0)
    this.dirty = true
    if (this.depth === 0) this.flush()
    return { changes, lastId }
  }

  insert(sql: string, params: Params = []): number {
    return this.run(sql, params).lastId
  }

  /**
   * Atomik tranzaksiya. fn ichidagi xatoda hamma narsa bekor qilinadi (ROLLBACK).
   * Ichma-ich chaqiruvlar tashqi tranzaksiyaga qo'shiladi. Muvaffaqiyatdan keyin faylga yoziladi.
   */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++
      try {
        return fn()
      } finally {
        this.depth--
      }
    }
    this.db.run('BEGIN')
    this.depth = 1
    let result: T
    try {
      result = fn()
      this.db.run('COMMIT')
    } catch (e) {
      try {
        this.db.run('ROLLBACK')
      } catch {
        /* allaqachon bekor qilingan */
      }
      this.dirty = false
      throw e
    } finally {
      this.depth = 0
    }
    this.flush()
    return result
  }

  private flush(): void {
    if (!this.dirty) return
    this.dirty = false
    this.persist()
  }

  /** Butun bazani faylga atomik yozish (fayl rejimida). */
  persist(): void {
    if (!this.file) return
    writeFileAtomic(this.file, this.export())
  }

  /** Bazaning to'liq bayt nusxasi (zaxira uchun). */
  export(): Uint8Array {
    const bytes = this.db.export()
    // sql.js export() bazani qayta ochadi — PRAGMA'larni qayta o'rnatamiz
    this.applyPragmas()
    return bytes
  }

  /** Bazani berilgan baytlar bilan almashtirish (tiklash). Migratsiya qo'llanadi va saqlanadi. */
  async replace(bytes: Uint8Array): Promise<void> {
    if (this.depth > 0) throw new Error('Tranzaksiya davomida tiklab bo‘lmaydi')
    await Db.validateBytes(bytes)
    const SQL = await loadSqlJs()
    const next = new SQL.Database(bytes)
    const old = this.db
    this.db = next
    try {
      this.applyPragmas()
      this.migrate()
    } catch (e) {
      this.db = old
      next.close()
      throw e
    }
    old.close()
    this.persist()
  }

  close(): void {
    this.db.close()
  }
}
