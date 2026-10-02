/**
 * Sxema va migratsiyalar. Versiya `PRAGMA user_version` da saqlanadi.
 * Yangi o'zgarish = MIGRATIONS ga yangi element qo'shish (eskilarini o'zgartirmang).
 */
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
  `
]

export const SCHEMA_VERSION = MIGRATIONS.length
