/**
 * SQLite schema DDL for Merbana.
 *
 * Executed once on first run to create all tables.
 * Nested data (product sizes, order items) is normalised into child tables
 * so that it is queryable and transactionally consistent.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id         TEXT    PRIMARY KEY NOT NULL,
  name       TEXT    NOT NULL,
  price      REAL    NOT NULL DEFAULT 0,
  categoryId TEXT    REFERENCES categories(id),
  createdAt  TEXT    NOT NULL,
  stock      INTEGER,
  trackStock INTEGER NOT NULL DEFAULT 0  -- 0 = false, 1 = true
);

-- Normalised sizes for products (one-to-many).
CREATE TABLE IF NOT EXISTS product_sizes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  productId TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  price     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT  PRIMARY KEY NOT NULL,
  orderNumber   INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  total         REAL    NOT NULL DEFAULT 0,
  paymentMethod TEXT    NOT NULL DEFAULT 'cash',
  orderType     TEXT    NOT NULL DEFAULT 'dine_in',
  note          TEXT,
  userId        TEXT,
  userName      TEXT
);

-- Normalised line-items for orders (one-to-many).
CREATE TABLE IF NOT EXISTS order_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId   TEXT    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  productId TEXT    NOT NULL,
  name      TEXT    NOT NULL,
  price     REAL    NOT NULL DEFAULT 0,
  quantity  INTEGER NOT NULL DEFAULT 1,
  size      TEXT,
  subtotal  REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id      TEXT PRIMARY KEY NOT NULL,
  type    TEXT NOT NULL,  -- 'sale' | 'deposit' | 'withdrawal' | 'shift_close'
  amount  REAL NOT NULL DEFAULT 0,
  note    TEXT,
  date    TEXT NOT NULL,
  orderId TEXT,
  userId  TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  password  TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id        TEXT PRIMARY KEY NOT NULL,
  userId    TEXT NOT NULL,
  userName  TEXT NOT NULL,
  action    TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debtors (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  amount    REAL NOT NULL DEFAULT 0,
  note      TEXT,
  createdAt TEXT NOT NULL,
  paidAt    TEXT
);

-- Single-row key/value store for app-wide settings and metadata.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

-- Seed default settings so SELECT always returns a row.
INSERT OR IGNORE INTO settings(key, value) VALUES ('companyName', '');
INSERT OR IGNORE INTO settings(key, value) VALUES ('lastStockReset', '');
`;
