/**
 * Sxema va migratsiyalar. Versiya `PRAGMA user_version` da saqlanadi.
 * Yangi o'zgarish = MIGRATIONS ga yangi element qo'shish (eskilarini o'zgartirmang).
 * SQL bilan ifodalab bo'lmaydigan ma'lumot o'zgarishlari — MIGRATION_DATA[versiya] (o'sha SQL dan keyin,
 * o'sha tranzaksiya ichida bajariladi).
 */
import type { Database, SqlValue } from 'sql.js'
import { normalizePhone } from './phone'

export const MIGRATIONS: string[] = [
  // v1 — boshlang'ich sxema
  `
  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','admin','cashier')),
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    is_provider INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_per_hour INTEGER NOT NULL,
    capacity INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    track_stock INTEGER NOT NULL DEFAULT 1,
    low_stock_at INTEGER NOT NULL DEFAULT 5,
    active INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    duration_min INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    status TEXT NOT NULL CHECK (status IN ('open','closed')),
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    opened_by INTEGER NOT NULL REFERENCES staff(id),
    closed_by INTEGER REFERENCES staff(id),
    discount INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    cancelled INTEGER NOT NULL DEFAULT 0,
    receipt_no INTEGER,
    -- to'lov paytidagi muzlatilgan summalar (hisobotlar uchun)
    time_total INTEGER,
    lines_total INTEGER,
    discount_applied INTEGER,
    total INTEGER
  );
  CREATE INDEX idx_sessions_status ON sessions(status);
  CREATE INDEX idx_sessions_closed ON sessions(closed_at);
  CREATE UNIQUE INDEX idx_sessions_receipt ON sessions(receipt_no) WHERE receipt_no IS NOT NULL;

  CREATE TABLE guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    label TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('running','paused','finished'))
  );
  CREATE INDEX idx_guests_session ON guests(session_id);

  CREATE TABLE intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    room_id INTEGER NOT NULL,
    rate INTEGER NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER
  );
  CREATE INDEX idx_intervals_guest ON intervals(guest_id);

  CREATE TABLE order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    guest_id INTEGER REFERENCES guests(id),
    kind TEXT NOT NULL CHECK (kind IN ('product','service')),
    ref_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    returned_qty INTEGER NOT NULL DEFAULT 0,
    provider_id INTEGER REFERENCES staff(id),
    created_at INTEGER NOT NULL,
    created_by INTEGER NOT NULL REFERENCES staff(id)
  );
  CREATE INDEX idx_lines_session ON order_lines(session_id);

  CREATE TABLE returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id INTEGER NOT NULL REFERENCES order_lines(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    qty INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  CREATE INDEX idx_returns_at ON returns(at);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    method TEXT NOT NULL CHECK (method IN ('cash','card','debt')),
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  CREATE INDEX idx_payments_session ON payments(session_id);

  CREATE TABLE debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );

  CREATE TABLE debt_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL REFERENCES debts(id),
    method TEXT NOT NULL CHECK (method IN ('cash','card')),
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );

  CREATE TABLE stock_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    line_id INTEGER,
    at INTEGER NOT NULL,
    by INTEGER
  );
  `,
  // v2 — Delfin Sauna: ofitsiantlar (rol + foiz), oldindan olinadigan vaqt, to'lovda muzlatiladigan ofitsiant haqi.
  // staff jadvali qayta quriladi (role CHECK ga 'waiter'). Db.migrate() buni foreign_keys=OFF holatda bajaradi
  // va oxirida foreign_key_check qiladi. Eski guests.paid_minutes = 0 (blok qoidasi bilan hisoblanadi).
  `
  CREATE TABLE staff_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','admin','cashier','waiter')),
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    is_provider INTEGER NOT NULL DEFAULT 0,
    is_waiter INTEGER NOT NULL DEFAULT 0,
    commission_pct REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  INSERT INTO staff_v2(id, name, role, pin_hash, active, is_provider, is_waiter, commission_pct, created_at)
    SELECT id, name, role, pin_hash, active, is_provider, 0, 0, created_at FROM staff;
  DROP TABLE staff;
  ALTER TABLE staff_v2 RENAME TO staff;

  ALTER TABLE sessions ADD COLUMN waiter_id INTEGER REFERENCES staff(id);
  ALTER TABLE sessions ADD COLUMN waiter_pct REAL NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN product_sales INTEGER;
  ALTER TABLE sessions ADD COLUMN waiter_commission INTEGER;
  CREATE INDEX idx_sessions_waiter ON sessions(waiter_id, closed_at);

  ALTER TABLE guests ADD COLUMN paid_minutes INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE waiter_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  CREATE INDEX idx_waiter_payouts ON waiter_payouts(staff_id, month);
  `,
  // v3 — xonasiz bar savdosi: sessions.kind ('room'|'bar'); bar savdosida room_id = NULL.
  // room_id NOT NULL ni olib tashlash uchun sessions jadvali qayta quriladi (id lar, FK va AUTOINCREMENT hisoblagichi
  // saqlanadi; Db.migrate() foreign_keys=OFF holatda bajaradi va oxirida foreign_key_check qiladi).
  `
  CREATE TABLE sessions_v3 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'room' CHECK (kind IN ('room','bar')),
    room_id INTEGER REFERENCES rooms(id),
    status TEXT NOT NULL CHECK (status IN ('open','closed')),
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    opened_by INTEGER NOT NULL REFERENCES staff(id),
    closed_by INTEGER REFERENCES staff(id),
    discount INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    cancelled INTEGER NOT NULL DEFAULT 0,
    receipt_no INTEGER,
    time_total INTEGER,
    lines_total INTEGER,
    discount_applied INTEGER,
    total INTEGER,
    waiter_id INTEGER REFERENCES staff(id),
    waiter_pct REAL NOT NULL DEFAULT 0,
    product_sales INTEGER,
    waiter_commission INTEGER,
    CHECK ((kind = 'room' AND room_id IS NOT NULL) OR (kind = 'bar' AND room_id IS NULL AND waiter_id IS NULL))
  );
  INSERT INTO sessions_v3(id, kind, room_id, status, opened_at, closed_at, opened_by, closed_by, discount, note, cancelled,
      receipt_no, time_total, lines_total, discount_applied, total, waiter_id, waiter_pct, product_sales, waiter_commission)
    SELECT id, 'room', room_id, status, opened_at, closed_at, opened_by, closed_by, discount, note, cancelled,
      receipt_no, time_total, lines_total, discount_applied, total, waiter_id, waiter_pct, product_sales, waiter_commission
    FROM sessions;
  DELETE FROM sqlite_sequence WHERE name = 'sessions_v3';
  INSERT INTO sqlite_sequence(name, seq) SELECT 'sessions_v3', seq FROM sqlite_sequence WHERE name = 'sessions';
  DROP TABLE sessions;
  ALTER TABLE sessions_v3 RENAME TO sessions;
  CREATE INDEX idx_sessions_status ON sessions(status);
  CREATE INDEX idx_sessions_closed ON sessions(closed_at);
  CREATE UNIQUE INDEX idx_sessions_receipt ON sessions(receipt_no) WHERE receipt_no IS NOT NULL;
  CREATE INDEX idx_sessions_waiter ON sessions(waiter_id, closed_at);
  CREATE INDEX idx_sessions_kind ON sessions(kind, status);
  `,
  // v4 — 2026-10: terminal to'lov usuli (payments/debt_payments CHECK — jadvallar qayta quriladi), qarzdorlar (bitta odam —
  // bitta yozuv), oshxona bo'limi (kategoriya department, oshxona cheklari, kunlik hisob), ofitsiant qatorda
  // (order_lines.waiter_id/waiter_pct). Ma'lumot qismi (qarzdorlarni guruhlash, blockMinutes 60 → 1) — MIGRATION_DATA[4].
  `
  CREATE TABLE payments_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    method TEXT NOT NULL CHECK (method IN ('cash','card','terminal','debt')),
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  INSERT INTO payments_v4(id, session_id, method, amount, at, by) SELECT id, session_id, method, amount, at, by FROM payments;
  DELETE FROM sqlite_sequence WHERE name = 'payments_v4';
  INSERT INTO sqlite_sequence(name, seq) SELECT 'payments_v4', seq FROM sqlite_sequence WHERE name = 'payments';
  DROP TABLE payments;
  ALTER TABLE payments_v4 RENAME TO payments;
  CREATE INDEX idx_payments_session ON payments(session_id);

  CREATE TABLE debtors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    -- normallashtirilgan telefon (faqat raqamlar); NULL — raqamsiz eski yozuv
    phone_key TEXT UNIQUE,
    created_at INTEGER NOT NULL
  );

  ALTER TABLE debts ADD COLUMN debtor_id INTEGER REFERENCES debtors(id);
  CREATE INDEX idx_debts_debtor ON debts(debtor_id, created_at);

  CREATE TABLE debt_payments_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL REFERENCES debts(id),
    method TEXT NOT NULL CHECK (method IN ('cash','card','terminal')),
    amount INTEGER NOT NULL,
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  INSERT INTO debt_payments_v4(id, debt_id, method, amount, at, by) SELECT id, debt_id, method, amount, at, by FROM debt_payments;
  DELETE FROM sqlite_sequence WHERE name = 'debt_payments_v4';
  INSERT INTO sqlite_sequence(name, seq) SELECT 'debt_payments_v4', seq FROM sqlite_sequence WHERE name = 'debt_payments';
  DROP TABLE debt_payments;
  ALTER TABLE debt_payments_v4 RENAME TO debt_payments;
  CREATE INDEX idx_debt_payments_debt ON debt_payments(debt_id);
  CREATE INDEX idx_debt_payments_at ON debt_payments(at);

  ALTER TABLE categories ADD COLUMN department TEXT NOT NULL DEFAULT 'bar' CHECK (department IN ('bar','kitchen'));

  ALTER TABLE order_lines ADD COLUMN department TEXT CHECK (department IS NULL OR department IN ('bar','kitchen'));
  ALTER TABLE order_lines ADD COLUMN waiter_id INTEGER REFERENCES staff(id);
  ALTER TABLE order_lines ADD COLUMN waiter_pct REAL NOT NULL DEFAULT 0;
  UPDATE order_lines SET department = 'bar' WHERE kind = 'product';
  CREATE INDEX idx_lines_waiter ON order_lines(waiter_id);
  -- Yangilanish paytida OCHIQ bo'lgan, ofitsiant biriktirilgan xona sessiyalari: ofitsiant mavjud mahsulot qatorlariga
  -- o'tkaziladi (yangi qoida). Yopilgan sessiyalardagi waiter_id/waiter_commission tarix sifatida qoladi.
  UPDATE order_lines SET
      waiter_id = (SELECT s.waiter_id FROM sessions s WHERE s.id = order_lines.session_id),
      waiter_pct = (SELECT s.waiter_pct FROM sessions s WHERE s.id = order_lines.session_id)
    WHERE kind = 'product' AND waiter_id IS NULL
      AND session_id IN (SELECT id FROM sessions WHERE status = 'open' AND kind = 'room' AND waiter_id IS NOT NULL);
  UPDATE sessions SET waiter_id = NULL, waiter_pct = 0 WHERE status = 'open' AND waiter_id IS NOT NULL;

  ALTER TABLE sessions ADD COLUMN kitchen_sales INTEGER;
  ALTER TABLE sessions ADD COLUMN kitchen_share_pct REAL;

  CREATE TABLE kitchen_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id)
  );
  CREATE INDEX idx_kitchen_payouts_day ON kitchen_payouts(day);

  -- Oshxona cheklari jurnali: id = buyurtma №; chop etish xatosi shu yerda qoladi (keyin kitchen.reprint)
  CREATE TABLE kitchen_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    kind TEXT NOT NULL CHECK (kind IN ('order','cancel','reprint')),
    items TEXT NOT NULL,
    at INTEGER NOT NULL,
    by INTEGER NOT NULL REFERENCES staff(id),
    printed INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  CREATE INDEX idx_kitchen_tickets_session ON kitchen_tickets(session_id);
  `,
  // v5 — obsluga (xizmat haqi): sessiya yopilganda foiz va summa muzlatiladi. Eski yopilgan sessiyalar uchun 0.
  // Sozlamaga serviceChargePct = 10 qo'shiladi — MIGRATION_DATA[5].
  `
  ALTER TABLE sessions ADD COLUMN service_charge_pct REAL NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN service_charge INTEGER NOT NULL DEFAULT 0;
  `
]

/** Ma'lumot migratsiyasi uchun minimal interfeys (sql.js Database ustida). */
export interface MigrationDb {
  all(sql: string, params?: SqlValue[]): Record<string, SqlValue>[]
  run(sql: string, params?: SqlValue[]): void
}

export function migrationDb(db: Database): MigrationDb {
  return {
    all(sql, params = []) {
      const st = db.prepare(sql)
      try {
        st.bind(params)
        const out: Record<string, SqlValue>[] = []
        while (st.step()) out.push(st.getAsObject())
        return out
      } finally {
        st.free()
      }
    },
    run(sql, params = []) {
      db.run(sql, params)
    }
  }
}

/**
 * v4 ma'lumot qismi:
 *  1) mavjud qarzlar normallashtirilgan telefon (raqam bo'lmasa — ism) bo'yicha guruhlanib, har bir guruhga bitta qarzdor
 *     yaratiladi (eng birinchi qarzdagi ism/telefon saqlanadi) va debts.debtor_id to'ldiriladi;
 *  2) sozlamalardagi blockMinutes = 60 (eski standart) → 1 (mijoz talabi: aynan o'tirilgan daqiqa uchun).
 */
function migrateV4Data(db: MigrationDb): void {
  const debts = db.all('SELECT id, customer_name, phone, created_at FROM debts ORDER BY created_at, id')
  const groups = new Map<string, number>()
  for (const d of debts) {
    const name = String(d.customer_name ?? '').trim() || 'Nomaʼlum'
    const phone = String(d.phone ?? '').trim()
    const key = normalizePhone(phone)
    const gk = key ? 'p:' + key : 'n:' + name.toLowerCase()
    let debtorId = groups.get(gk)
    if (debtorId === undefined) {
      db.run('INSERT INTO debtors(name, phone, phone_key, created_at) VALUES(?,?,?,?)', [name, phone, key, Number(d.created_at ?? 0)])
      debtorId = Number(db.all('SELECT last_insert_rowid() AS id')[0].id)
      groups.set(gk, debtorId)
    }
    db.run('UPDATE debts SET debtor_id=? WHERE id=?', [debtorId, Number(d.id)])
  }

  const row = db.all("SELECT value FROM kv WHERE key='settings'")[0]
  if (row) {
    try {
      const s = JSON.parse(String(row.value)) as Record<string, unknown>
      if (s && typeof s === 'object' && s.blockMinutes === 60) {
        s.blockMinutes = 1
        db.run("UPDATE kv SET value=? WHERE key='settings'", [JSON.stringify(s)])
      }
    } catch {
      /* buzilgan sozlama — PosService standartga qaytaradi */
    }
  }
}

/** v5 ma'lumot qismi: mavjud sozlamaga serviceChargePct = 10 (yo'q bo'lsa). */
function migrateV5Data(db: MigrationDb): void {
  const row = db.all("SELECT value FROM kv WHERE key='settings'")[0]
  if (!row) return
  try {
    const s = JSON.parse(String(row.value)) as Record<string, unknown>
    if (s && typeof s === 'object' && s.serviceChargePct === undefined) {
      s.serviceChargePct = 10
      db.run("UPDATE kv SET value=? WHERE key='settings'", [JSON.stringify(s)])
    }
  } catch {
    /* buzilgan sozlama — PosService standartga qaytaradi */
  }
}

/** Versiya → ma'lumot migratsiyasi (shu versiyaning SQL qismidan keyin bajariladi). */
export const MIGRATION_DATA: Record<number, (db: MigrationDb) => void> = {
  4: migrateV4Data,
  5: migrateV5Data
}

export const SCHEMA_VERSION = MIGRATIONS.length
