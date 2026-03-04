/**
 * database.ts  SQLite-backed data layer powered by sql.js (WASM).
 *
 * Architecture
 *
 *  sql.js maintains an in-memory SQLite database (synchronous queries).
 *  Every mutation calls notify() which:
 *     1. fires all UI listeners immediately (React re-renders in sync), and
 *     2. schedules a debounced persistToDisk() that POSTs the binary .db
 *        file to the Python launcher's /api/save-db endpoint.
 *  loadDatabase() is the only async function; all other exports are sync.
 *  On first run the launcher provides a pre-seeded merbana.db next to the .exe.
 */

import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { SCHEMA_SQL } from './schema';

/**
 * sql.js init config.
 * In a browser we point the WASM loader to the static asset served by the
 * Python HTTP server.  In Node.js (vitest) we omit locateFile so sql.js
 * auto-resolves the WASM from its own package directory.
 */
const SQL_JS_CONFIG = typeof document !== 'undefined'
  ? { locateFile: (_f: string) => '/sql-wasm.wasm' }
  : {};
import type {
  Database,
  Product,
  Category,
  Order,
  OrderItem,
  CashTransaction,
  RegisterState,
  StoreUser,
  ActivityLog,
  StoreSettings,
  Debtor,
} from '../types/types';

//  Subscription 
type Listener = () => void;
let listeners: Listener[] = [];

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

//  In-memory SQLite instance 
let sqlDb: SqlDatabase | null = null;

function db(): SqlDatabase {
  if (!sqlDb) throw new Error('Database not initialised  call loadDatabase() first');
  return sqlDb;
}

//  Persist 
const SAVE_DEBOUNCE_MS = 100;
const BEACON_MAX_BYTES = 63_000;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function flushSave() {
  if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
  persistToDisk();
}

function persistToDisk() {
  if (!sqlDb) return;
  const data: Uint8Array = sqlDb.export();
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  if (buf.byteLength <= BEACON_MAX_BYTES) {
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    if (navigator.sendBeacon('/api/save-db', blob)) return;
  }

  fetch('/api/save-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf,
    keepalive: true,
  }).catch(() => { /* dev / no launcher  ignore */ });
}

function notify() {
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; persistToDisk(); }, SAVE_DEBOUNCE_MS);
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSave);
  // Exposed for the pywebview closing hook to call synchronously before
  // the renderer process is torn down.
  (window as Window & { __flushSave__?: () => void }).__flushSave__ = flushSave;
}

//  Helpers 

/** Run a SELECT and return all rows as plain objects. */
function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = db().prepare(sql);
  stmt.bind(params as Parameters<typeof stmt.bind>[0]);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

/** Run INSERT / UPDATE / DELETE (no result set). */
function run(sql: string, params: unknown[] = []): void {
  db().run(sql, params as (number | string | null | Uint8Array)[]);
}

/** Fetch one value from a scalar SELECT. */
function scalar<T>(sql: string, params: unknown[] = []): T | null {
  const rows = query<Record<string, unknown>>(sql, params);
  if (rows.length === 0) return null;
  return Object.values(rows[0])[0] as T;
}

//  Internal row types 

interface ProductRow {
  id: string; name: string; price: number; categoryId: string | null;
  createdAt: string; stock: number | null; trackStock: number;
}
interface SizeRow { productId: string; name: string; price: number; }
interface OrderRow {
  id: string; orderNumber: number; date: string; total: number;
  paymentMethod: string; orderType: string; note: string | null;
  userId: string | null; userName: string | null;
}
interface OrderItemRow {
  orderId: string; productId: string; name: string; price: number;
  quantity: number; size: string | null; subtotal: number;
}
interface TxRow {
  id: string; type: string; amount: number; note: string | null;
  date: string; orderId: string | null; userId: string | null;
}

//  Load 
let loaded = false;
let loadPromise: Promise<Database> | null = null;

export function loadDatabase(): Promise<Database> {
  if (loaded && sqlDb) return Promise.resolve(getSnapshot());
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const SQL = await initSqlJs(SQL_JS_CONFIG);

    let dbBytes: ArrayBuffer | null = null;
    try {
      const res = await fetch('/data/merbana.db', { cache: 'no-store' });
      if (res.ok) dbBytes = await res.arrayBuffer();
    } catch { /* not found */ }

    if (dbBytes && dbBytes.byteLength > 0) {
      sqlDb = new SQL.Database(new Uint8Array(dbBytes));
      // Apply any new migrations to existing database
      sqlDb.run(SCHEMA_SQL);
    } else {
      // Fresh install — build empty database from schema
      sqlDb = new SQL.Database();
      sqlDb.run(SCHEMA_SQL);
      persistToDisk();
    }

    checkDailyReset();
    loaded = true;
    loadPromise = null;
    return getSnapshot();
  })();

  return loadPromise;
}

//  Users 
export function getUsers(): StoreUser[] {
  return query<StoreUser>('SELECT id,name,password,createdAt FROM users ORDER BY createdAt');
}

export function addUser(name: string, password?: string): StoreUser {
  const user: StoreUser = { id: uuidv4(), name, ...(password ? { password } : {}), createdAt: new Date().toISOString() };
  run('INSERT INTO users(id,name,password,createdAt) VALUES(?,?,?,?)', [user.id, user.name, user.password ?? null, user.createdAt]);
  notify();
  return user;
}

export function updateUser(id: string, data: Partial<Omit<StoreUser, 'id' | 'createdAt'>>): StoreUser | null {
  const current = query<StoreUser>('SELECT * FROM users WHERE id=?', [id]);
  if (current.length === 0) return null;
  const updated = { ...current[0], ...data };
  run('UPDATE users SET name=?,password=? WHERE id=?', [updated.name, updated.password ?? null, id]);
  notify();
  return updated;
}

export function deleteUser(id: string): boolean {
  const before = scalar<number>('SELECT COUNT(*) FROM users WHERE id=?', [id]);
  if (!before) return false;
  run('DELETE FROM users WHERE id=?', [id]);
  notify();
  return true;
}

//  Activity Log 
export function logActivity(userId: string, userName: string, action: string): ActivityLog {
  const log: ActivityLog = { id: uuidv4(), userId, userName, action, timestamp: new Date().toISOString() };
  run('INSERT INTO activity_log(id,userId,userName,action,timestamp) VALUES(?,?,?,?,?)',
    [log.id, log.userId, log.userName, log.action, log.timestamp]);
  notify();
  return log;
}

export function getActivityLog(): ActivityLog[] {
  return query<ActivityLog>('SELECT id,userId,userName,action,timestamp FROM activity_log ORDER BY timestamp');
}

//  Categories 
export function getCategories(): Category[] {
  return query<Category>('SELECT id,name FROM categories');
}

export function addCategory(name: string): Category {
  const category: Category = { id: uuidv4(), name };
  run('INSERT INTO categories(id,name) VALUES(?,?)', [category.id, category.name]);
  notify();
  return category;
}

export function deleteCategory(id: string): boolean {
  const inUse = scalar<number>('SELECT COUNT(*) FROM products WHERE categoryId=?', [id]);
  if (inUse && inUse > 0) return false;
  const before = scalar<number>('SELECT COUNT(*) FROM categories WHERE id=?', [id]);
  if (!before) return false;
  run('DELETE FROM categories WHERE id=?', [id]);
  notify();
  return true;
}

//  Products 

function rowsToProducts(rows: ProductRow[], sizeRows: SizeRow[]): Product[] {
  const sizeMap = new Map<string, { name: string; price: number }[]>();
  for (const s of sizeRows) {
    if (!sizeMap.has(s.productId)) sizeMap.set(s.productId, []);
    sizeMap.get(s.productId)!.push({ name: s.name, price: s.price });
  }
  return rows.map((r) => {
    const sizes = sizeMap.get(r.id);
    const p: Product = {
      id: r.id, name: r.name, price: r.price, createdAt: r.createdAt,
      trackStock: r.trackStock === 1, stock: r.stock ?? undefined,
    };
    if (r.categoryId) p.categoryId = r.categoryId;
    if (sizes && sizes.length > 0) p.sizes = sizes;
    return p;
  });
}

export function getProducts(): Product[] {
  const rows = query<ProductRow>('SELECT id,name,price,categoryId,createdAt,stock,trackStock FROM products ORDER BY rowid');
  const sizeRows = query<SizeRow>('SELECT productId,name,price FROM product_sizes');
  return rowsToProducts(rows, sizeRows);
}

export function addProduct(data: Omit<Product, 'id' | 'createdAt'>): Product {
  const product: Product = { id: uuidv4(), createdAt: new Date().toISOString(), ...data };
  db().run('BEGIN');
  try {
    run('INSERT INTO products(id,name,price,categoryId,createdAt,stock,trackStock) VALUES(?,?,?,?,?,?,?)',
      [product.id, product.name, product.price, product.categoryId ?? null, product.createdAt, product.stock !== undefined ? product.stock : null, product.trackStock ? 1 : 0]);
    for (const s of (product.sizes ?? [])) run('INSERT INTO product_sizes(productId,name,price) VALUES(?,?,?)', [product.id, s.name, s.price]);
    db().run('COMMIT');
  } catch (err) { db().run('ROLLBACK'); throw err; }
  notify();
  return product;
}

export function updateProduct(id: string, data: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | null {
  const rows = query<ProductRow>('SELECT * FROM products WHERE id=?', [id]);
  if (rows.length === 0) return null;
  const sizeRows = query<SizeRow>('SELECT productId,name,price FROM product_sizes WHERE productId=?', [id]);
  const [existing] = rowsToProducts(rows, sizeRows);
  const updated: Product = { ...existing, ...data };

  db().run('BEGIN');
  try {
    run('UPDATE products SET name=?,price=?,categoryId=?,stock=?,trackStock=? WHERE id=?',
      [updated.name, updated.price, updated.categoryId ?? null, updated.stock !== undefined ? updated.stock : null, updated.trackStock ? 1 : 0, id]);
    if (data.sizes !== undefined) {
      run('DELETE FROM product_sizes WHERE productId=?', [id]);
      for (const s of (updated.sizes ?? [])) run('INSERT INTO product_sizes(productId,name,price) VALUES(?,?,?)', [id, s.name, s.price]);
    }
    db().run('COMMIT');
  } catch (err) { db().run('ROLLBACK'); throw err; }
  notify();
  return updated;
}

export function deleteProduct(id: string): boolean {
  const before = scalar<number>('SELECT COUNT(*) FROM products WHERE id=?', [id]);
  if (!before) return false;
  run('DELETE FROM product_sizes WHERE productId=?', [id]);
  run('DELETE FROM products WHERE id=?', [id]);
  notify();
  return true;
}

//  Stock Management 
export function adjustStock(productId: string, adjustment: number): Product | null {
  const rows = query<ProductRow>('SELECT * FROM products WHERE id=?', [productId]);
  if (rows.length === 0) return null;
  const sizeRows = query<SizeRow>('SELECT productId,name,price FROM product_sizes WHERE productId=?', [productId]);
  if (!rows[0].trackStock) return rowsToProducts(rows, sizeRows)[0];
  const newStock = Math.max(0, (rows[0].stock ?? 0) + adjustment);
  run('UPDATE products SET stock=? WHERE id=?', [newStock, productId]);
  notify();
  const updated = query<ProductRow>('SELECT * FROM products WHERE id=?', [productId]);
  return rowsToProducts(updated, sizeRows)[0];
}

export function bulkSetStock(productIds: string[], quantity: number) {
  if (productIds.length === 0) return;
  const placeholders = productIds.map(() => '?').join(',');
  const tracked = query<{ id: string }>(`SELECT id FROM products WHERE id IN (${placeholders}) AND trackStock=1`, productIds);
  if (tracked.length === 0) return;
  for (const { id } of tracked) run('UPDATE products SET stock=? WHERE id=?', [Math.max(0, quantity), id]);
  notify();
}

export function resetAllStock() {
  const count = scalar<number>('SELECT COUNT(*) FROM products WHERE trackStock=1');
  if (!count || count === 0) return;
  run('UPDATE products SET stock=0 WHERE trackStock=1');
  notify();
}

export function checkDailyReset() {
  const today = new Date().toDateString();
  const lastReset = scalar<string>("SELECT value FROM settings WHERE key='lastStockReset'") ?? '';
  if (lastReset !== today) {
    resetAllStock();
    run("INSERT OR REPLACE INTO settings(key,value) VALUES('lastStockReset',?)", [today]);
    notify();
  }
}

//  Settings 
export function getSettings(): StoreSettings {
  const rows = query<{ key: string; value: string }>('SELECT key,value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { companyName: map['companyName'] ?? '' };
}

export function updateSettings(settings: Partial<StoreSettings>) {
  for (const [key, value] of Object.entries(settings)) {
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, String(value)]);
  }
  notify();
}

//  Orders 

function rowsToOrders(orderRows: OrderRow[], itemRows: OrderItemRow[]): Order[] {
  const itemMap = new Map<string, OrderItem[]>();
  for (const r of itemRows) {
    if (!itemMap.has(r.orderId)) itemMap.set(r.orderId, []);
    const item: OrderItem = { productId: r.productId, name: r.name, price: r.price, quantity: r.quantity, subtotal: r.subtotal };
    if (r.size) item.size = r.size;
    itemMap.get(r.orderId)!.push(item);
  }
  return orderRows.map((r) => {
    const order: Order = {
      id: r.id, orderNumber: r.orderNumber, date: r.date, items: itemMap.get(r.id) ?? [],
      total: r.total, paymentMethod: r.paymentMethod as Order['paymentMethod'],
      orderType: r.orderType as Order['orderType'],
    };
    if (r.note) order.note = r.note;
    if (r.userId) { order.userId = r.userId; order.userName = r.userName ?? undefined; }
    return order;
  });
}

export function getOrders(): Order[] {
  const orderRows = query<OrderRow>('SELECT * FROM orders ORDER BY date');
  const itemRows = query<OrderItemRow>('SELECT * FROM order_items');
  return rowsToOrders(orderRows, itemRows);
}

export function addOrder(
  items: Order['items'],
  paymentMethod: Order['paymentMethod'] = 'cash',
  orderType: Order['orderType'] = 'dine_in',
  note?: string,
  userId?: string,
  userName?: string,
): Order {
  const maxNum = scalar<number>('SELECT MAX(orderNumber) FROM orders') ?? 0;
  const nextNumber = maxNum >= 100 ? 1 : maxNum + 1;
  const order: Order = {
    id: uuidv4(), orderNumber: nextNumber, date: new Date().toISOString(),
    items, total: items.reduce((s, i) => s + i.subtotal, 0), paymentMethod, orderType,
    ...(note ? { note } : {}), ...(userId ? { userId, userName } : {}),
  };

  db().run('BEGIN');
  try {
    run('INSERT INTO orders(id,orderNumber,date,total,paymentMethod,orderType,note,userId,userName) VALUES(?,?,?,?,?,?,?,?,?)',
      [order.id, order.orderNumber, order.date, order.total, order.paymentMethod, order.orderType, order.note ?? null, order.userId ?? null, order.userName ?? null]);
    for (const item of items) {
      run('INSERT INTO order_items(orderId,productId,name,price,quantity,size,subtotal) VALUES(?,?,?,?,?,?,?)',
        [order.id, item.productId, item.name, item.price, item.quantity, item.size ?? null, item.subtotal]);
      const pRows = query<ProductRow>('SELECT stock,trackStock FROM products WHERE id=?', [item.productId]);
      if (pRows.length > 0 && pRows[0].trackStock) run('UPDATE products SET stock=? WHERE id=?', [Math.max(0, (pRows[0].stock ?? 0) - item.quantity), item.productId]);
    }
    const methodLabel = paymentMethod === 'shamcash' ? 'ShamCash' : 'نقدي';
    run('INSERT INTO cash_transactions(id,type,amount,note,date,orderId,userId) VALUES(?,?,?,?,?,?,?)',
      [uuidv4(), 'sale', Math.abs(order.total), `طلب #${String(nextNumber).padStart(3, '0')}  ${methodLabel}`, order.date, order.id, userId ?? null]);
    db().run('COMMIT');
  } catch (err) { db().run('ROLLBACK'); throw err; }
  notify();
  return order;
}

export function getOrderById(id: string): Order | undefined {
  const orderRows = query<OrderRow>('SELECT * FROM orders WHERE id=?', [id]);
  if (orderRows.length === 0) return undefined;
  const itemRows = query<OrderItemRow>('SELECT * FROM order_items WHERE orderId=?', [id]);
  return rowsToOrders(orderRows, itemRows)[0];
}

export function deleteOrder(id: string): boolean {
  const orderRows = query<OrderRow>('SELECT * FROM orders WHERE id=?', [id]);
  if (orderRows.length === 0) return false;
  const itemRows = query<OrderItemRow>('SELECT * FROM order_items WHERE orderId=?', [id]);

  db().run('BEGIN');
  try {
    for (const item of itemRows) {
      const pRows = query<ProductRow>('SELECT stock,trackStock FROM products WHERE id=?', [item.productId]);
      if (pRows.length > 0 && pRows[0].trackStock) run('UPDATE products SET stock=? WHERE id=?', [(pRows[0].stock ?? 0) + item.quantity, item.productId]);
    }
    run('DELETE FROM cash_transactions WHERE orderId=?', [id]);
    run('DELETE FROM order_items WHERE orderId=?', [id]);
    run('DELETE FROM orders WHERE id=?', [id]);
    db().run('COMMIT');
  } catch (err) { db().run('ROLLBACK'); throw err; }
  notify();
  return true;
}

export function getOrdersByWeek(weekStart: string): Order[] {
  const start = new Date(weekStart); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  const orderRows = query<OrderRow>('SELECT * FROM orders WHERE date >= ? AND date <= ? ORDER BY date', [start.toISOString(), end.toISOString()]);
  if (orderRows.length === 0) return [];
  const ids = orderRows.map((o) => o.id);
  const itemRows = query<OrderItemRow>(`SELECT * FROM order_items WHERE orderId IN (${ids.map(() => '?').join(',')})`, ids);
  return rowsToOrders(orderRows, itemRows);
}

//  Cash Register 
export function getRegister(): RegisterState {
  const txRows = query<TxRow>('SELECT id,type,amount,note,date,orderId,userId FROM cash_transactions ORDER BY date');
  const currentBalance = scalar<number>('SELECT COALESCE(SUM(amount),0) FROM cash_transactions') ?? 0;
  return {
    currentBalance,
    transactions: txRows.map((r) => ({
      id: r.id, type: r.type as CashTransaction['type'], amount: r.amount,
      note: r.note ?? undefined, date: r.date,
      orderId: r.orderId ?? undefined, userId: r.userId ?? undefined,
    })),
  };
}

export function addCashTransaction(type: CashTransaction['type'], amount: number, note?: string, orderId?: string, userId?: string): CashTransaction {
  const tx: CashTransaction = {
    id: uuidv4(), type,
    amount: (type === 'sale' || type === 'deposit') ? Math.abs(amount) : -Math.abs(amount),
    note, date: new Date().toISOString(), orderId, userId,
  };
  run('INSERT INTO cash_transactions(id,type,amount,note,date,orderId,userId) VALUES(?,?,?,?,?,?,?)',
    [tx.id, tx.type, tx.amount, tx.note ?? null, tx.date, tx.orderId ?? null, tx.userId ?? null]);
  notify();
  return tx;
}

export function depositCash(amount: number, note: string): CashTransaction {
  return addCashTransaction('deposit', amount, note);
}

export function withdrawCash(amount: number, note: string): CashTransaction {
  return addCashTransaction('withdrawal', amount, note);
}

export function closeShift(amountTaken: number, note?: string): CashTransaction {
  const currentBalance = scalar<number>('SELECT COALESCE(SUM(amount),0) FROM cash_transactions') ?? 0;
  const tx: CashTransaction = {
    id: uuidv4(), type: 'shift_close',
    amount: -Math.abs(amountTaken),
    note: note ?? `Shift closed  took ${amountTaken.toFixed(2)}`,
    date: new Date().toISOString(),
  };
  run('INSERT INTO cash_transactions(id,type,amount,note,date,orderId,userId) VALUES(?,?,?,?,?,?,?)',
    [tx.id, tx.type, tx.amount, tx.note ?? null, tx.date, null, null]);
  const remainder = currentBalance + tx.amount;
  if (Math.abs(remainder) > 0.001) {
    run('INSERT INTO cash_transactions(id,type,amount,note,date,orderId,userId) VALUES(?,?,?,?,?,?,?)',
      [uuidv4(), 'shift_close', -remainder, 'Balance correction', tx.date, null, null]);
  }
  notify();
  return tx;
}

//  Debtors 
export function getDebtors(): Debtor[] {
  return query<Debtor>('SELECT id,name,amount,note,createdAt,paidAt FROM debtors ORDER BY createdAt');
}

export function addDebtor(name: string, amount: number, note?: string): Debtor {
  const debtor: Debtor = { id: uuidv4(), name, amount, ...(note ? { note } : {}), createdAt: new Date().toISOString() };
  run('INSERT INTO debtors(id,name,amount,note,createdAt,paidAt) VALUES(?,?,?,?,?,?)',
    [debtor.id, debtor.name, debtor.amount, debtor.note ?? null, debtor.createdAt, null]);
  notify();
  return debtor;
}

export function markDebtorPaid(id: string): boolean {
  if (!scalar<number>('SELECT COUNT(*) FROM debtors WHERE id=?', [id])) return false;
  run('UPDATE debtors SET paidAt=? WHERE id=?', [new Date().toISOString(), id]);
  notify();
  return true;
}

export function deleteDebtor(id: string): boolean {
  if (!scalar<number>('SELECT COUNT(*) FROM debtors WHERE id=?', [id])) return false;
  run('DELETE FROM debtors WHERE id=?', [id]);
  notify();
  return true;
}

//  Import / Export 

export function exportDatabase(): void {
  if (!sqlDb) return;
  const data: Uint8Array = sqlDb.export();
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'merbana.db';
  a.click();
  URL.revokeObjectURL(url);
}

export function importDatabase(file: File): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const SQL = await initSqlJs(SQL_JS_CONFIG);
        const newDb = new SQL.Database(new Uint8Array(reader.result as ArrayBuffer));
        try {
          newDb.run('SELECT 1 FROM products LIMIT 1');
          newDb.run('SELECT 1 FROM orders LIMIT 1');
        } catch {
          newDb.close();
          return resolve({ success: false, error: 'Invalid database file  core tables missing.' });
        }
        if (sqlDb) sqlDb.close();
        sqlDb = newDb;
        loaded = true; loadPromise = null;
        checkDailyReset();
        notify();
        resolve({ success: true });
      } catch (err) {
        resolve({ success: false, error: `Failed to open database file: ${err}` });
      }
    };
    reader.onerror = () => resolve({ success: false, error: 'Failed to read file.' });
    reader.readAsArrayBuffer(file);
  });
}

//  Snapshot 
export function getSnapshot(): Database {
  const orderRows = query<OrderRow>('SELECT * FROM orders ORDER BY date');
  const itemRows = query<OrderItemRow>('SELECT * FROM order_items');
  const productRows = query<ProductRow>('SELECT * FROM products');
  const sizeRows = query<SizeRow>('SELECT productId,name,price FROM product_sizes');
  const txRows = query<TxRow>('SELECT * FROM cash_transactions ORDER BY date');
  const settingsRows = query<{ key: string; value: string }>('SELECT key,value FROM settings');
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  return {
    products: rowsToProducts(productRows, sizeRows),
    categories: query<Category>('SELECT id,name FROM categories'),
    orders: rowsToOrders(orderRows, itemRows),
    register: {
      currentBalance: txRows.reduce((s, r) => s + r.amount, 0),
      transactions: txRows.map((r) => ({
        id: r.id, type: r.type as CashTransaction['type'], amount: r.amount,
        note: r.note ?? undefined, date: r.date,
        orderId: r.orderId ?? undefined, userId: r.userId ?? undefined,
      })),
    },
    users: query<StoreUser>('SELECT id,name,password,createdAt FROM users'),
    activityLog: query<ActivityLog>('SELECT id,userId,userName,action,timestamp FROM activity_log ORDER BY timestamp'),
    settings: { companyName: settingsMap['companyName'] ?? '' },
    debtors: query<Debtor>('SELECT id,name,amount,note,createdAt,paidAt FROM debtors ORDER BY createdAt'),
    lastStockReset: settingsMap['lastStockReset'] ?? '',
  };
}

//  Global Injection (desktop wrapper) 
declare global {
  interface Window {
    injectDatabase: (data: string) => Promise<{ success: boolean; error?: string }>;
  }
}

/**
 * Called by the desktop wrapper to replace the in-memory database.
 * Accepts a base64-encoded SQLite binary (.db file).
 */
window.injectDatabase = async (data: string) => {
  try {
    const SQL = await initSqlJs(SQL_JS_CONFIG);
    const binary = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    if (sqlDb) sqlDb.close();
    sqlDb = new SQL.Database(binary);
    sqlDb.run(SCHEMA_SQL);
    loaded = true; loadPromise = null;
    checkDailyReset();
    notify();
    return { success: true };
  } catch (err) {
    console.error('[merbana] injectDatabase failed:', err);
    return { success: false, error: `Injection failed: ${err}` };
  }
};
