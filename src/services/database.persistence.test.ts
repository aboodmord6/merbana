/**
 * Persistence & reload consistency tests for src/services/database.ts
 *
 * These tests answer one question:
 *   "If I mutate data, close the app, and reopen it, is the exact same
 *    data still there?"
 *
 * Strategy
 * ────────
 *  1. Run a mutation (add / update / delete).
 *  2. Intercept the JSON that notify() sends to the launcher via
 *     sendBeacon / fetch — this is what ends up in db.json on disk.
 *  3. Simulate "app closed + reopened" by:
 *       a. Resetting the module (vi.resetModules) so all state is gone.
 *       b. Mocking fetch('/data/db.json') to return the captured JSON.
 *       c. Calling loadDatabase() which re-reads that JSON.
 *  4. Assert the reloaded data matches what was written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Browser API stubs (must run before any import of database.ts)     */
/* ------------------------------------------------------------------ */

if (typeof globalThis.window === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.window.addEventListener !== 'function') {
  globalThis.window.addEventListener = vi.fn();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type DB = typeof import('./database');

/**
 * lastSavedJSON — the most-recent JSON body sent to /api/save-db.
 *
 * We always force sendBeacon to return `false` so the code falls through
 * to the `fetch` fallback, which sends a plain string body that is trivial
 * to capture without touching the Blob internals.
 */
let lastSavedJSON = '';
let fetchMockRef: ReturnType<typeof vi.fn>;
let beaconMockRef: ReturnType<typeof vi.fn>;

function setupMocks() {
  lastSavedJSON = '';

  // sendBeacon returns false → forces the fetch fallback path in persistToDisk()
  beaconMockRef = vi.fn(() => false);

  fetchMockRef = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/save-db' && init?.body) {
      lastSavedJSON = init.body as string;
      return { ok: true, json: async () => ({}) };
    }
    // Default db.json load: empty DB (tests override this per-case via reopen())
    return { ok: false, json: async () => ({}) };
  });

  vi.stubGlobal('navigator', { sendBeacon: beaconMockRef });
  vi.stubGlobal('fetch', fetchMockRef);
}

/** Fresh module import — always starts with empty in-memory state. */
async function freshDb(): Promise<DB> {
  vi.resetModules();
  return (await import('./database')) as DB;
}

/**
 * Simulate reopening the app:
 *   - Reset all modules (clears all in-memory state).
 *   - Make fetch('/data/db.json') return `savedJSON`.
 *   - Call loadDatabase() so the module re-hydrates from that JSON.
 */
async function reopen(savedJSON: string): Promise<DB> {
  vi.resetModules();

  beaconMockRef = vi.fn(() => false);
  fetchMockRef = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/save-db' && init?.body) {
      lastSavedJSON = init.body as string;
      return { ok: true, json: async () => ({}) };
    }
    if (url === '/data/db.json') {
      return { ok: true, json: async () => JSON.parse(savedJSON) };
    }
    return { ok: false, json: async () => ({}) };
  });

  vi.stubGlobal('fetch', fetchMockRef);
  vi.stubGlobal('navigator', { sendBeacon: beaconMockRef });

  const db = (await import('./database')) as DB;
  await db.loadDatabase();
  return db;
}

/* ================================================================== */
/*  1. Save is triggered on every mutation                            */
/* ================================================================== */

describe('Save fires on every mutation', () => {
  let db: DB;

  beforeEach(async () => {
    setupMocks();
    db = await freshDb();
    fetchMockRef.mockClear();
  });

  it('addUser triggers a save', () => {
    db.addUser('Zaid');
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('updateUser triggers a save', () => {
    const u = db.addUser('Old');
    fetchMockRef.mockClear();
    db.updateUser(u.id, { name: 'New' });
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('deleteUser triggers a save', () => {
    const u = db.addUser('ToDelete');
    fetchMockRef.mockClear();
    db.deleteUser(u.id);
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('addProduct triggers a save', () => {
    db.addProduct({ name: 'Tea', price: 2 });
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('updateProduct triggers a save', () => {
    const p = db.addProduct({ name: 'Tea', price: 2 });
    fetchMockRef.mockClear();
    db.updateProduct(p.id, { price: 5 });
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('deleteProduct triggers a save', () => {
    const p = db.addProduct({ name: 'Tea', price: 2 });
    fetchMockRef.mockClear();
    db.deleteProduct(p.id);
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('addOrder triggers a save', () => {
    fetchMockRef.mockClear();
    db.addOrder([{ productId: 'p1', name: 'Coffee', price: 3, quantity: 1, subtotal: 3 }]);
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('addDebtor triggers a save', () => {
    db.addDebtor('Hassan', 50);
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('updateSettings triggers a save', () => {
    db.updateSettings({ companyName: 'My Shop' });
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('depositCash triggers a save', () => {
    db.depositCash(100, 'opening');
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('deleteOrder for unknown id — no save fired', () => {
    fetchMockRef.mockClear();
    db.deleteOrder('nonexistent-id');
    const saveCalls = fetchMockRef.mock.calls.filter(c => c[0] === '/api/save-db');
    expect(saveCalls).toHaveLength(0);
  });
});

/* ================================================================== */
/*  2. Saved JSON contains the mutated data                           */
/* ================================================================== */

describe('Saved payload contains correct data', () => {
  let db: DB;

  beforeEach(async () => {
    setupMocks();
    db = await freshDb();
  });

  it('saved JSON includes the new user', () => {
    db.addUser('Nour', 'pass123');
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.users).toHaveLength(1);
    expect(saved.users[0].name).toBe('Nour');
    expect(saved.users[0].password).toBe('pass123');
  });

  it('saved JSON reflects user deletion', () => {
    const u = db.addUser('Ghost');
    db.deleteUser(u.id);
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.users).toHaveLength(0);
  });

  it('saved JSON reflects updated user name', () => {
    const u = db.addUser('Before');
    db.updateUser(u.id, { name: 'After' });
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.users[0].name).toBe('After');
  });

  it('saved JSON includes the new product', () => {
    db.addProduct({ name: 'Espresso', price: 4.5, trackStock: true, stock: 20 });
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.products).toHaveLength(1);
    expect(saved.products[0].name).toBe('Espresso');
    expect(saved.products[0].price).toBe(4.5);
    expect(saved.products[0].stock).toBe(20);
  });

  it('saved JSON reflects deleted product', () => {
    const p = db.addProduct({ name: 'Old Item', price: 1 });
    db.deleteProduct(p.id);
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.products).toHaveLength(0);
  });

  it('saved JSON includes order and register transaction', () => {
    db.addOrder([{ productId: 'p1', name: 'Latte', price: 5, quantity: 2, subtotal: 10 }]);
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.orders).toHaveLength(1);
    expect(saved.orders[0].total).toBe(10);
    expect(saved.register.transactions).toHaveLength(1);
    expect(saved.register.currentBalance).toBe(10);
  });

  it('saved JSON includes new debtor', () => {
    db.addDebtor('Omar', 75, 'furniture');
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.debtors).toHaveLength(1);
    expect(saved.debtors[0].name).toBe('Omar');
    expect(saved.debtors[0].amount).toBe(75);
  });

  it('saved JSON reflects debtor paid', () => {
    const d = db.addDebtor('Sami', 30);
    db.markDebtorPaid(d.id);
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.debtors[0].paidAt).toBeDefined();
  });

  it('saved JSON reflects company name update', () => {
    db.updateSettings({ companyName: 'Merbana Store' });
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.settings.companyName).toBe('Merbana Store');
  });

  it('saved JSON reflects cash deposit', () => {
    db.depositCash(200, 'morning opening');
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.register.currentBalance).toBe(200);
    expect(saved.register.transactions[0].type).toBe('deposit');
  });

  it('saved JSON reflects cash withdrawal', () => {
    db.depositCash(500, 'seed');
    db.withdrawCash(100, 'petty cash');
    const saved = JSON.parse(lastSavedJSON);
    expect(saved.register.currentBalance).toBe(400);
  });
});

/* ================================================================== */
/*  3. Reload consistency — simulating app close & reopen            */
/* ================================================================== */

describe('Reload consistency after app close & reopen', () => {
  beforeEach(() => {
    setupMocks();
  });

  it('users survive a close & reopen', async () => {
    const db1 = await freshDb();
    db1.addUser('Layla', 'secret');
    db1.addUser('Kareem');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const users = db2.getUsers();
    expect(users).toHaveLength(2);
    expect(users.find(u => u.name === 'Layla')?.password).toBe('secret');
    expect(users.find(u => u.name === 'Kareem')?.password).toBeUndefined();
  });

  it('user deletion is persisted across reopen', async () => {
    const db1 = await freshDb();
    const u1 = db1.addUser('Keep');
    const u2 = db1.addUser('Remove');
    db1.deleteUser(u2.id);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const users = db2.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(u1.id);
    expect(users[0].name).toBe('Keep');
  });

  it('user update is persisted across reopen', async () => {
    const db1 = await freshDb();
    const u = db1.addUser('Original');
    db1.updateUser(u.id, { name: 'Updated', password: 'newpass' });
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const loaded = db2.getUsers()[0];
    expect(loaded.name).toBe('Updated');
    expect(loaded.password).toBe('newpass');
  });

  it('products survive a close & reopen', async () => {
    const db1 = await freshDb();
    // Stamp lastStockReset to today BEFORE adding stock so reopen's
    // checkDailyReset sees today's date and does not zero the stock.
    db1.checkDailyReset();
    db1.addProduct({ name: 'Americano', price: 3.5, trackStock: true, stock: 50 });
    db1.addProduct({ name: 'Croissant', price: 2.0 });
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const products = db2.getProducts();
    expect(products).toHaveLength(2);
    const americano = products.find(p => p.name === 'Americano');
    expect(americano?.price).toBe(3.5);
    expect(americano?.stock).toBe(50);
    expect(americano?.trackStock).toBe(true);
  });

  it('product deletion is persisted across reopen', async () => {
    const db1 = await freshDb();
    const keep = db1.addProduct({ name: 'Stay', price: 1 });
    const gone = db1.addProduct({ name: 'Gone', price: 1 });
    db1.deleteProduct(gone.id);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const products = db2.getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(keep.id);
  });

  it('categories survive a close & reopen', async () => {
    const db1 = await freshDb();
    db1.addCategory('Hot Drinks');
    db1.addCategory('Cold Drinks');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const cats = db2.getCategories();
    expect(cats).toHaveLength(2);
    expect(cats.map(c => c.name)).toContain('Hot Drinks');
    expect(cats.map(c => c.name)).toContain('Cold Drinks');
  });

  it('orders survive a close & reopen', async () => {
    const db1 = await freshDb();
    const items = [{ productId: 'p1', name: 'Flat White', price: 4, quantity: 2, subtotal: 8 }];
    const order = db1.addOrder(items, 'cash', 'takeaway', 'no sugar', 'u1', 'Ali');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const orders = db2.getOrders();
    expect(orders).toHaveLength(1);
    const loaded = orders[0];
    expect(loaded.id).toBe(order.id);
    expect(loaded.total).toBe(8);
    expect(loaded.paymentMethod).toBe('cash');
    expect(loaded.orderType).toBe('takeaway');
    expect(loaded.note).toBe('no sugar');
    expect(loaded.orderNumber).toBe(1);
  });

  it('order deletion is persisted across reopen', async () => {
    const db1 = await freshDb();
    const items = [{ productId: 'p1', name: 'Mocha', price: 5, quantity: 1, subtotal: 5 }];
    const o1 = db1.addOrder(items);
    db1.addOrder(items);
    db1.deleteOrder(o1.id);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    expect(db2.getOrders()).toHaveLength(1);
    expect(db2.getOrderById(o1.id)).toBeUndefined();
  });

  it('register balance and transactions survive a close & reopen', async () => {
    const db1 = await freshDb();
    db1.depositCash(300, 'opening');
    db1.withdrawCash(50, 'supplies');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const reg = db2.getRegister();
    expect(reg.currentBalance).toBe(250);
    expect(reg.transactions).toHaveLength(2);
    expect(reg.transactions[0].type).toBe('deposit');
    expect(reg.transactions[1].type).toBe('withdrawal');
  });

  it('settings survive a close & reopen', async () => {
    const db1 = await freshDb();
    db1.updateSettings({ companyName: 'مربانة' });
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    expect(db2.getSettings().companyName).toBe('مربانة');
  });

  it('security password policy survives a close & reopen', async () => {
    const db1 = await freshDb();
    db1.updateSettings({
      security: {
        passwordRequiredFor: {
          withdraw_cash: false,
          close_shift: false,
        },
      },
    });
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const settings = db2.getSettings();
    expect(settings.security.passwordRequiredFor.withdraw_cash).toBe(false);
    expect(settings.security.passwordRequiredFor.close_shift).toBe(false);
    expect(settings.security.passwordRequiredFor.deposit_cash).toBe(true);
  });

  it('reopen fills default security policy for legacy settings schema', async () => {
    const legacySnapshot = JSON.stringify({
      products: [],
      categories: [],
      orders: [],
      register: { currentBalance: 0, transactions: [] },
      users: [],
      activityLog: [],
      settings: {
        companyName: 'Legacy',
      },
      debtors: [],
      lastStockReset: '',
    });

    const db2 = await reopen(legacySnapshot);
    const policy = db2.getSettings().security.passwordRequiredFor;
    expect(policy.create_order).toBe(true);
    expect(policy.import_database).toBe(true);
  });

  it('debtors survive a close & reopen', async () => {
    const db1 = await freshDb();
    db1.addDebtor('Tarek', 120, 'monthly tab');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const debtors = db2.getDebtors();
    expect(debtors).toHaveLength(1);
    expect(debtors[0].name).toBe('Tarek');
    expect(debtors[0].amount).toBe(120);
    expect(debtors[0].note).toBe('monthly tab');
  });

  it('paid debtor status survives a close & reopen', async () => {
    const db1 = await freshDb();
    const d = db1.addDebtor('Rami', 60);
    db1.markDebtorPaid(d.id);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const debtor = db2.getDebtors()[0];
    expect(debtor.paidAt).toBeDefined();
  });

  it('debtor deletion is persisted across reopen', async () => {
    const db1 = await freshDb();
    db1.addDebtor('Stay', 10);
    const gone = db1.addDebtor('Delete', 20);
    db1.deleteDebtor(gone.id);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const debtors = db2.getDebtors();
    expect(debtors).toHaveLength(1);
    expect(debtors[0].name).toBe('Stay');
  });

  it('activity log survives a close & reopen', async () => {
    const db1 = await freshDb();
    db1.logActivity('u1', 'Sara', 'login');
    db1.logActivity('u1', 'Sara', 'created order');
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const log = db2.getActivityLog();
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe('login');
    expect(log[1].action).toBe('created order');
  });

  it('complex mixed session survives a close & reopen', async () => {
    const db1 = await freshDb();

    // Stamp lastStockReset to today BEFORE adding stock so reopen's
    // checkDailyReset sees today's date and does not zero the stock.
    db1.checkDailyReset();

    // Add user
    const user = db1.addUser('Manager', 'mgr123');

    // Add category + product
    const cat = db1.addCategory('Beverages');
    const prod = db1.addProduct({ name: 'Cappuccino', price: 4, categoryId: cat.id, trackStock: true, stock: 30 });

    // Place order (consumes stock)
    const items = [{ productId: prod.id, name: 'Cappuccino', price: 4, quantity: 3, subtotal: 12 }];
    const order = db1.addOrder(items, 'shamcash', 'dine_in', undefined, user.id, user.name);

    // Log activity
    db1.logActivity(user.id, user.name, 'تسجيل دخول');

    // Update settings
    db1.updateSettings({ companyName: 'The Coffee Place' });

    // Add debtor
    db1.addDebtor('Waleed', 45);

    const snapshot = lastSavedJSON;

    // ── Reopen ──
    const db2 = await reopen(snapshot);

    // User intact
    const users = db2.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Manager');

    // Category intact
    expect(db2.getCategories()).toHaveLength(1);
    expect(db2.getCategories()[0].name).toBe('Beverages');

    // Product intact with reduced stock (30 - 3 = 27)
    const products = db2.getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].stock).toBe(27);

    // Order intact
    const orders = db2.getOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(order.id);
    expect(orders[0].paymentMethod).toBe('shamcash');

    // Register shows the sale
    const reg = db2.getRegister();
    expect(reg.currentBalance).toBe(12);

    // Settings intact
    expect(db2.getSettings().companyName).toBe('The Coffee Place');

    // Debtor intact
    const debtors = db2.getDebtors();
    expect(debtors).toHaveLength(1);
    expect(debtors[0].name).toBe('Waleed');

    // Activity log intact
    const log = db2.getActivityLog();
    expect(log.some(l => l.action === 'تسجيل دخول')).toBe(true);
  });
});

/* ================================================================== */
/*  4. Multiple reopens — data stays stable (no drift)               */
/* ================================================================== */

describe('Data stability across multiple reopens', () => {
  beforeEach(() => {
    setupMocks();
  });

  it('reopening twice without changes produces identical state', async () => {
    const db1 = await freshDb();
    db1.addUser('Stable');
    db1.addProduct({ name: 'Stable Product', price: 9 });
    db1.updateSettings({ companyName: 'Stable Shop' });
    const snapshot1 = lastSavedJSON;

    await reopen(snapshot1);
    const snapshot2 = lastSavedJSON; // snapshot2 is set by the checkDailyReset save in reopen

    // Core data must be identical
    const s1 = JSON.parse(snapshot1);
    const s2 = JSON.parse(snapshot2);
    expect(s2.users).toEqual(s1.users);
    expect(s2.products).toEqual(s1.products);
    expect(s2.settings).toEqual(s1.settings);
    expect(s2.orders).toEqual(s1.orders);

    // Third reopen — still identical
    const db3 = await reopen(snapshot2);
    const users = db3.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Stable');
  });

  it('order number sequence picks up correctly after reopen', async () => {
    const items = [{ productId: 'p1', name: 'X', price: 1, quantity: 1, subtotal: 1 }];

    const db1 = await freshDb();
    const o1 = db1.addOrder(items); // → #1
    const o2 = db1.addOrder(items); // → #2
    expect(o1.orderNumber).toBe(1);
    expect(o2.orderNumber).toBe(2);
    const snapshot = lastSavedJSON;

    const db2 = await reopen(snapshot);
    const o3 = db2.addOrder(items); // → #3, not #1
    expect(o3.orderNumber).toBe(3);
  });

  it('register balance accumulates correctly across reopens', async () => {
    const db1 = await freshDb();
    db1.depositCash(100, 'day 1');
    const snapshot1 = lastSavedJSON;

    const db2 = await reopen(snapshot1);
    db2.depositCash(50, 'day 2');
    const snapshot2 = lastSavedJSON;

    const db3 = await reopen(snapshot2);
    expect(db3.getRegister().currentBalance).toBe(150);
    expect(db3.getRegister().transactions).toHaveLength(2);
  });
});
