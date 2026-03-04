/**
 * Unit tests for src/services/database.ts (sql.js / SQLite backend).
 *
 * Each describe block resets the module so every test starts with a clean,
 * empty in-memory SQLite database.  Browser globals (navigator.sendBeacon,
 * fetch, Blob) are stubbed so the tests run in plain Node without a browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Browser API stubs                                                  */
/* ------------------------------------------------------------------ */

// window  stub before module import (database.ts assigns window.injectDatabase
// and window.addEventListener at load)
if (typeof globalThis.window === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.window.addEventListener !== 'function') {
  globalThis.window.addEventListener = vi.fn();
}

// sendBeacon  always returns true so notify() never falls back to fetch
const sendBeaconMock = vi.fn(() => true);
vi.stubGlobal('navigator', { sendBeacon: sendBeaconMock });

// Blob  minimal stub
vi.stubGlobal(
  'Blob',
  class Blob {
    parts: unknown[]; options: unknown;
    constructor(parts: unknown[], options?: unknown) {
      this.parts = parts; this.options = options;
    }
  },
);

// fetch  return 404 for /data/ paths so loadDatabase() starts with an empty DB.
// Persist calls go to /api/save-db (via fetch fallback since SQLite DB > 64 KB).
const fetchMock = vi.fn(async (url: string) => {
  if (typeof url === 'string' && url.includes('/data/')) {
    return { ok: false, status: 404 };
  }
  return { ok: true };
});
vi.stubGlobal('fetch', fetchMock);

/* ------------------------------------------------------------------ */
/*  Module-level helper                                                */
/* ------------------------------------------------------------------ */

type DB = typeof import('./database');

/**
 * Create a fresh database module instance with an empty in-memory SQLite DB.
 * loadDatabase() is called so sqlDb is initialised before any test function.
 */
async function freshDb(): Promise<DB> {
  vi.resetModules();
  const m = (await import('./database')) as DB;
  await m.loadDatabase();
  return m;
}

/* ================================================================== */
/*  Users                                                              */
/* ================================================================== */

describe('Users', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with no users', () => {
    expect(db.getUsers()).toEqual([]);
  });

  it('addUser creates a user with id and createdAt', () => {
    const user = db.addUser('Ali');
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Ali');
    expect(user.createdAt).toBeDefined();
    expect(user.password).toBeUndefined();
    expect(db.getUsers()).toHaveLength(1);
  });

  it('addUser stores password when provided', () => {
    const user = db.addUser('Sara', '1234');
    expect(user.password).toBe('1234');
  });

  it('updateUser modifies name', () => {
    const user = db.addUser('Old Name');
    const updated = db.updateUser(user.id, { name: 'New Name' });
    expect(updated?.name).toBe('New Name');
    expect(db.getUsers()[0].name).toBe('New Name');
  });

  it('updateUser returns null for unknown id', () => {
    expect(db.updateUser('nonexistent', { name: 'X' })).toBeNull();
  });

  it('deleteUser removes the user', () => {
    const user = db.addUser('ToDelete');
    expect(db.deleteUser(user.id)).toBe(true);
    expect(db.getUsers()).toHaveLength(0);
  });

  it('deleteUser returns false for unknown id', () => {
    expect(db.deleteUser('nonexistent')).toBe(false);
  });

  it('getUsers returns a copy (not a reference)', () => {
    db.addUser('Test');
    const list = db.getUsers();
    list.pop();
    expect(db.getUsers()).toHaveLength(1);
  });
});

/* ================================================================== */
/*  Categories                                                         */
/* ================================================================== */

describe('Categories', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with no categories', () => {
    expect(db.getCategories()).toEqual([]);
  });

  it('addCategory creates a category', () => {
    const cat = db.addCategory('Drinks');
    expect(cat.id).toBeDefined();
    expect(cat.name).toBe('Drinks');
    expect(db.getCategories()).toHaveLength(1);
  });

  it('deleteCategory removes the category', () => {
    const cat = db.addCategory('Food');
    expect(db.deleteCategory(cat.id)).toBe(true);
    expect(db.getCategories()).toHaveLength(0);
  });

  it('deleteCategory fails if products reference it', () => {
    const cat = db.addCategory('Food');
    db.addProduct({ name: 'Burger', price: 5, categoryId: cat.id });
    expect(db.deleteCategory(cat.id)).toBe(false);
    expect(db.getCategories()).toHaveLength(1);
  });

  it('deleteCategory returns false for unknown id', () => {
    expect(db.deleteCategory('nonexistent')).toBe(false);
  });
});

/* ================================================================== */
/*  Products                                                           */
/* ================================================================== */

describe('Products', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with no products', () => {
    expect(db.getProducts()).toEqual([]);
  });

  it('addProduct creates a product', () => {
    const p = db.addProduct({ name: 'Tea', price: 2 });
    expect(p.id).toBeDefined();
    expect(p.name).toBe('Tea');
    expect(p.price).toBe(2);
    expect(p.createdAt).toBeDefined();
    expect(db.getProducts()).toHaveLength(1);
  });

  it('updateProduct modifies fields', () => {
    const p = db.addProduct({ name: 'Coffee', price: 3 });
    const updated = db.updateProduct(p.id, { price: 4 });
    expect(updated?.price).toBe(4);
    expect(updated?.name).toBe('Coffee'); // unchanged
  });

  it('updateProduct returns null for unknown id', () => {
    expect(db.updateProduct('nonexistent', { price: 1 })).toBeNull();
  });

  it('deleteProduct removes the product', () => {
    const p = db.addProduct({ name: 'Juice', price: 5 });
    expect(db.deleteProduct(p.id)).toBe(true);
    expect(db.getProducts()).toHaveLength(0);
  });

  it('deleteProduct returns false for unknown id', () => {
    expect(db.deleteProduct('nonexistent')).toBe(false);
  });
});

/* ================================================================== */
/*  Stock Management                                                   */
/* ================================================================== */

describe('Stock Management', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('adjustStock increments stock for tracked product', () => {
    const p = db.addProduct({ name: 'Water', price: 1, trackStock: true, stock: 10 });
    const updated = db.adjustStock(p.id, 5);
    expect(updated?.stock).toBe(15);
  });

  it('adjustStock decrements but never below 0', () => {
    const p = db.addProduct({ name: 'Water', price: 1, trackStock: true, stock: 3 });
    const updated = db.adjustStock(p.id, -10);
    expect(updated?.stock).toBe(0);
  });

  it('adjustStock returns original product if trackStock is false', () => {
    const p = db.addProduct({ name: 'Service', price: 50, trackStock: false });
    const result = db.adjustStock(p.id, 5);
    expect(result?.stock).toBeUndefined();
  });

  it('adjustStock returns null for unknown id', () => {
    expect(db.adjustStock('nonexistent', 1)).toBeNull();
  });

  it('bulkSetStock sets stock for multiple products', () => {
    const p1 = db.addProduct({ name: 'A', price: 1, trackStock: true, stock: 0 });
    const p2 = db.addProduct({ name: 'B', price: 2, trackStock: true, stock: 0 });
    db.bulkSetStock([p1.id, p2.id], 20);
    const products = db.getProducts();
    expect(products.find(p => p.id === p1.id)?.stock).toBe(20);
    expect(products.find(p => p.id === p2.id)?.stock).toBe(20);
  });

  it('bulkSetStock ignores non-trackStock products', () => {
    const p = db.addProduct({ name: 'C', price: 3, trackStock: false });
    db.bulkSetStock([p.id], 10);
    expect(db.getProducts()[0].stock).toBeUndefined();
  });

  it('resetAllStock zeroes all tracked products', () => {
    db.addProduct({ name: 'X', price: 1, trackStock: true, stock: 50 });
    db.addProduct({ name: 'Y', price: 2, trackStock: true, stock: 30 });
    db.addProduct({ name: 'Z', price: 3, trackStock: false, stock: 10 });
    db.resetAllStock();
    const products = db.getProducts();
    expect(products[0].stock).toBe(0);
    expect(products[1].stock).toBe(0);
    expect(products[2].stock).toBe(10); // untracked  unchanged
  });
});

/* ================================================================== */
/*  Settings                                                           */
/* ================================================================== */

describe('Settings', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with empty companyName', () => {
    expect(db.getSettings().companyName).toBe('');
  });

  it('updateSettings merges partial updates', () => {
    db.updateSettings({ companyName: 'My Store' });
    expect(db.getSettings().companyName).toBe('My Store');
  });

  it('getSettings returns a copy', () => {
    const s = db.getSettings();
    s.companyName = 'mutated';
    expect(db.getSettings().companyName).toBe('');
  });
});

/* ================================================================== */
/*  Activity Log                                                       */
/* ================================================================== */

describe('Activity Log', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with no logs', () => {
    expect(db.getActivityLog()).toEqual([]);
  });

  it('logActivity creates a log entry', () => {
    const log = db.logActivity('u1', 'Ali', 'login');
    expect(log.id).toBeDefined();
    expect(log.userId).toBe('u1');
    expect(log.userName).toBe('Ali');
    expect(log.action).toBe('login');
    expect(log.timestamp).toBeDefined();
    expect(db.getActivityLog()).toHaveLength(1);
  });
});

/* ================================================================== */
/*  Orders                                                             */
/* ================================================================== */

describe('Orders', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  const sampleItems = [
    { productId: 'p1', name: 'Coffee', price: 3, quantity: 2, subtotal: 6 },
  ];

  it('starts with no orders', () => {
    expect(db.getOrders()).toEqual([]);
  });

  it('addOrder creates order with sequential number', () => {
    const o = db.addOrder(sampleItems);
    expect(o.orderNumber).toBe(1);
    expect(o.total).toBe(6);
    expect(o.paymentMethod).toBe('cash');
    expect(o.orderType).toBe('dine_in');
    expect(db.getOrders()).toHaveLength(1);
  });

  it('addOrder increments order numbers', () => {
    db.addOrder(sampleItems);
    const o2 = db.addOrder(sampleItems);
    expect(o2.orderNumber).toBe(2);
  });

  it('addOrder wraps order number after 100', () => {
    for (let i = 0; i < 100; i++) db.addOrder(sampleItems);
    const o101 = db.addOrder(sampleItems);
    expect(o101.orderNumber).toBe(1); // wrapped
  });

  it('addOrder records sale in register', () => {
    db.addOrder(sampleItems);
    const reg = db.getRegister();
    expect(reg.currentBalance).toBe(6);
    expect(reg.transactions).toHaveLength(1);
    expect(reg.transactions[0].type).toBe('sale');
  });

  it('addOrder decrements stock for tracked products', () => {
    const p = db.addProduct({ name: 'Coffee', price: 3, trackStock: true, stock: 10 });
    const items = [{ productId: p.id, name: 'Coffee', price: 3, quantity: 2, subtotal: 6 }];
    db.addOrder(items);
    expect(db.getProducts()[0].stock).toBe(8);
  });

  it('getOrderById returns the order', () => {
    const o = db.addOrder(sampleItems);
    expect(db.getOrderById(o.id)?.id).toBe(o.id);
  });

  it('getOrderById returns undefined for unknown id', () => {
    expect(db.getOrderById('nonexistent')).toBeUndefined();
  });

  it('deleteOrder removes order and reverses register entry', () => {
    const o = db.addOrder(sampleItems);
    const balanceBefore = db.getRegister().currentBalance;
    expect(db.deleteOrder(o.id)).toBe(true);
    expect(db.getOrders()).toHaveLength(0);
    expect(db.getRegister().currentBalance).toBe(balanceBefore - 6);
  });

  it('deleteOrder restores stock for tracked products', () => {
    const p = db.addProduct({ name: 'Coffee', price: 3, trackStock: true, stock: 10 });
    const items = [{ productId: p.id, name: 'Coffee', price: 3, quantity: 2, subtotal: 6 }];
    const o = db.addOrder(items);
    expect(db.getProducts()[0].stock).toBe(8);
    db.deleteOrder(o.id);
    expect(db.getProducts()[0].stock).toBe(10);
  });

  it('deleteOrder returns false for unknown id', () => {
    expect(db.deleteOrder('nonexistent')).toBe(false);
  });

  it('addOrder attaches note when provided', () => {
    const o = db.addOrder(sampleItems, 'cash', 'takeaway', 'Extra sugar');
    expect(o.note).toBe('Extra sugar');
  });

  it('addOrder records shamcash payment method', () => {
    const o = db.addOrder(sampleItems, 'shamcash');
    expect(o.paymentMethod).toBe('shamcash');
  });
});

/* ================================================================== */
/*  Cash Register                                                      */
/* ================================================================== */

describe('Cash Register', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts at 0 balance', () => {
    const reg = db.getRegister();
    expect(reg.currentBalance).toBe(0);
    expect(reg.transactions).toEqual([]);
  });

  it('depositCash increases balance', () => {
    db.depositCash(100, 'Opening');
    const reg = db.getRegister();
    expect(reg.currentBalance).toBe(100);
    expect(reg.transactions[0].type).toBe('deposit');
    expect(reg.transactions[0].amount).toBe(100);
  });

  it('withdrawCash decreases balance', () => {
    db.depositCash(200, 'Opening');
    db.withdrawCash(50, 'Supplies');
    expect(db.getRegister().currentBalance).toBe(150);
  });

  it('withdrawal amount stored as negative', () => {
    db.withdrawCash(30, 'Test');
    expect(db.getRegister().transactions[0].amount).toBe(-30);
  });

  it('closeShift zeroes the balance', () => {
    db.depositCash(500, 'Sales');
    db.closeShift(500);
    expect(db.getRegister().currentBalance).toBe(0);
  });

  it('closeShift records shift_close transaction', () => {
    db.depositCash(200, 'Sales');
    db.closeShift(200, 'End of day');
    const reg = db.getRegister();
    const shiftTx = reg.transactions.find(t => t.type === 'shift_close');
    expect(shiftTx).toBeDefined();
    expect(shiftTx!.amount).toBe(-200);
    expect(shiftTx!.note).toBe('End of day');
  });

  it('getRegister returns a copy', () => {
    db.depositCash(10, 'Test');
    const reg = db.getRegister();
    reg.transactions.pop();
    expect(db.getRegister().transactions).toHaveLength(1);
  });
});

/* ================================================================== */
/*  Debtors                                                            */
/* ================================================================== */

describe('Debtors', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('starts with no debtors', () => {
    expect(db.getDebtors()).toEqual([]);
  });

  it('addDebtor creates a debtor', () => {
    const d = db.addDebtor('Ahmad', 50, 'Coffee tab');
    expect(d.id).toBeDefined();
    expect(d.name).toBe('Ahmad');
    expect(d.amount).toBe(50);
    expect(d.note).toBe('Coffee tab');
    expect(d.paidAt).toBeUndefined();
    expect(db.getDebtors()).toHaveLength(1);
  });

  it('addDebtor without note', () => {
    const d = db.addDebtor('Lina', 20);
    expect(d.note).toBeUndefined();
  });

  it('markDebtorPaid sets paidAt', () => {
    const d = db.addDebtor('Ahmad', 50);
    expect(db.markDebtorPaid(d.id)).toBe(true);
    const updated = db.getDebtors().find(x => x.id === d.id);
    expect(updated?.paidAt).toBeDefined();
  });

  it('markDebtorPaid returns false for unknown id', () => {
    expect(db.markDebtorPaid('nonexistent')).toBe(false);
  });

  it('deleteDebtor removes the debtor', () => {
    const d = db.addDebtor('Test', 10);
    expect(db.deleteDebtor(d.id)).toBe(true);
    expect(db.getDebtors()).toHaveLength(0);
  });

  it('deleteDebtor returns false for unknown id', () => {
    expect(db.deleteDebtor('nonexistent')).toBe(false);
  });
});

/* ================================================================== */
/*  Subscription / debounced persist                                   */
/* ================================================================== */

describe('subscribe / notify', () => {
  let db: DB;

  /** Count only the save-db fetch calls (ignore /data/ fetches from loadDatabase). */
  function saveFetchCount() {
    return fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/api/save-db')).length;
  }

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    fetchMock.mockClear();
    db = await freshDb();
    // Flush the save triggered by loadDatabase() init so mock starts clean.
    db.flushSave();
    fetchMock.mockClear();
    sendBeaconMock.mockClear();
  });

  it('listener is called on mutations', () => {
    const listener = vi.fn();
    db.subscribe(listener);
    db.addUser('Test');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further calls', () => {
    const listener = vi.fn();
    const unsub = db.subscribe(listener);
    db.addUser('A');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    db.addUser('B');
    expect(listener).toHaveBeenCalledTimes(1); // no extra call
  });

  it('flushSave persists to /api/save-db', () => {
    db.addUser('Persist Test');
    // Persistence is debounced — no immediate save
    expect(saveFetchCount()).toBe(0);
    // Flush synchronously
    db.flushSave();
    expect(saveFetchCount()).toBe(1);
  });

  it('flushSave batches rapid mutations into one save', () => {
    db.addUser('A');
    db.addUser('B');
    db.addUser('C');
    db.flushSave();
    // Only one save despite three mutations
    expect(saveFetchCount()).toBe(1);
  });
});

/* ================================================================== */
/*  Snapshot                                                           */
/* ================================================================== */

describe('getSnapshot', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('returns a deep copy of the full database', () => {
    db.addUser('User1');
    db.addCategory('Cat1');
    db.addProduct({ name: 'P1', price: 10 });

    const snap = db.getSnapshot();
    expect(snap.users).toHaveLength(1);
    expect(snap.categories).toHaveLength(1);
    expect(snap.products).toHaveLength(1);

    // Mutating snapshot must not affect original
    snap.users.pop();
    expect(db.getUsers()).toHaveLength(1);
  });
});

/* ================================================================== */
/*  injectDatabase (global)                                            */
/* ================================================================== */

describe('window.injectDatabase', () => {
  let db: DB;

  beforeEach(async () => {
    sendBeaconMock.mockClear();
    db = await freshDb();
  });

  it('replaces db from a JSON string', async () => {
    const payload = JSON.stringify({
      products: [{ id: 'x1', name: 'Injected', price: 99, createdAt: '2025-01-01' }],
      orders: [],
    });
    const result = await window.injectDatabase(payload);
    expect(result.success).toBe(true);
    expect(db.getProducts()).toHaveLength(1);
    expect(db.getProducts()[0].name).toBe('Injected');
  });

  it('rejects invalid schema', async () => {
    const result = await window.injectDatabase(JSON.stringify({ foo: 'bar' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('products');
  });

  it('rejects invalid JSON', async () => {
    const result = await window.injectDatabase('not json');
    expect(result.success).toBe(false);
  });
});
