import { v4 as uuidv4 } from 'uuid';
import type { Database, Product, Category, Order, CashTransaction, RegisterState, StoreUser, ActivityLog, StoreSettings, Debtor } from '../types/types';

type Listener = () => void;

const defaultRegister: RegisterState = { currentBalance: 0, transactions: [] };
const defaultSettings: StoreSettings = { companyName: 'Merbana POS' };
let db: Database = { products: [], categories: [], orders: [], register: { ...defaultRegister }, users: [], activityLog: [], settings: { ...defaultSettings }, debtors: [] };
let listeners: Listener[] = [];

const STORAGE_KEY = 'merbana_db';

function notify() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
  listeners.forEach((fn) => fn());
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// ── Load ───────────────────────────────────────────────
let loaded = false;
let loadPromise: Promise<Database> | null = null;

export function loadDatabase(): Promise<Database> {
  if (loaded) return Promise.resolve(db);
  if (loadPromise) return loadPromise;

  // 1. Try to load from LocalStorage first
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      db = {
        products: Array.isArray(data.products) ? data.products : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
        register: data.register || { currentBalance: 0, transactions: [] },
        users: Array.isArray(data.users) ? data.users : [],
        activityLog: Array.isArray(data.activityLog) ? data.activityLog : [],
        settings: data.settings || { ...defaultSettings },
        debtors: Array.isArray(data.debtors) ? data.debtors : [],
      };
      loaded = true;
      checkDailyReset();
      notify();
      return Promise.resolve(db);
    } catch (err) {
      console.warn('Corrupt localStorage data, falling back to db.json', err);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // 2. Fallback to db.json
  loadPromise = fetch('/data/db.json')
    .then((res) => (res.ok ? res.json() : { products: [], orders: [] }))
    .then((data) => {
      db = {
        products: data.products || [],
        categories: data.categories || [],
        orders: data.orders || [],
        register: data.register || { currentBalance: 0, transactions: [] },
        users: data.users || [],
        activityLog: data.activityLog || [],
        settings: data.settings || { ...defaultSettings },
        debtors: data.debtors || [],
      };
      loaded = true;
      loadPromise = null;
      checkDailyReset();
      notify();
      return db;
    });

  return loadPromise;
}

// ── Users ──────────────────────────────────────────────
export function getUsers(): StoreUser[] {
  return [...db.users];
}

export function addUser(name: string, password?: string): StoreUser {
  const user: StoreUser = {
    id: uuidv4(),
    name,
    ...(password ? { password } : {}),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  notify();
  return user;
}

export function updateUser(id: string, data: Partial<Omit<StoreUser, 'id' | 'createdAt'>>): StoreUser | null {
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...data };
  notify();
  return db.users[idx];
}

export function deleteUser(id: string): boolean {
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  if (db.users.length !== before) {
    notify();
    return true;
  }
  return false;
}

// ── Activity Log ───────────────────────────────────────
export function logActivity(userId: string, userName: string, action: string): ActivityLog {
  const log: ActivityLog = {
    id: uuidv4(),
    userId,
    userName,
    action,
    timestamp: new Date().toISOString(),
  };
  db.activityLog.push(log);
  notify();
  return log;
}

export function getActivityLog(): ActivityLog[] {
  return [...db.activityLog];
}

// ── Categories ─────────────────────────────────────────
export function getCategories(): Category[] {
  return [...db.categories];
}

export function addCategory(name: string): Category {
  const category: Category = {
    id: uuidv4(),
    name,
  };
  db.categories.push(category);
  notify();
  return category;
}

export function deleteCategory(id: string): boolean {
  // Check for associated products
  const hasProducts = db.products.some(p => p.categoryId === id);
  if (hasProducts) {
    return false;
  }

  const before = db.categories.length;
  db.categories = db.categories.filter((c) => c.id !== id);
  if (db.categories.length !== before) {
    notify();
    return true;
  }
  return false;
}

// ── Products ───────────────────────────────────────────
export function getProducts(): Product[] {
  return [...db.products];
}

export function addProduct(data: Omit<Product, 'id' | 'createdAt'>): Product {
  const product: Product = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...data,
  };
  db.products.push(product);
  notify();
  return product;
}

export function updateProduct(id: string, data: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | null {
  const idx = db.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.products[idx] = { ...db.products[idx], ...data };
  notify();
  return db.products[idx];
}

export function deleteProduct(id: string): boolean {
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== id);
  if (db.products.length !== before) {
    notify();
    return true;
  }
  return false;
}

// ── Stock Management ───────────────────────────────────
export function adjustStock(productId: string, adjustment: number): Product | null {
  const idx = db.products.findIndex((p) => p.id === productId);
  if (idx === -1) return null;
  const product = db.products[idx];
  if (product.trackStock) {
    db.products[idx] = { ...product, stock: Math.max(0, (product.stock || 0) + adjustment) };
    notify();
    return db.products[idx];
  }
  return product;
}

export function bulkSetStock(productIds: string[], quantity: number) {
  let changed = false;
  for (const id of productIds) {
    const idx = db.products.findIndex((p) => p.id === id);
    if (idx !== -1 && db.products[idx].trackStock) {
      db.products[idx] = { ...db.products[idx], stock: Math.max(0, quantity) };
      changed = true;
    }
  }
  if (changed) notify();
}

export function resetAllStock() {
  let changed = false;
  for (let i = 0; i < db.products.length; i++) {
    if (db.products[i].trackStock) {
      db.products[i] = { ...db.products[i], stock: 0 };
      changed = true;
    }
  }
  if (changed) notify();
}

const RESET_KEY = 'merbana_stock_last_reset';
export function checkDailyReset() {
  const today = new Date().toDateString();
  const lastReset = localStorage.getItem(RESET_KEY);
  if (lastReset !== today) {
    resetAllStock();
    localStorage.setItem(RESET_KEY, today);
  }
}

// ── Settings ───────────────────────────────────────────
export function getSettings(): StoreSettings {
  return { ...db.settings };
}

export function updateSettings(settings: Partial<StoreSettings>) {
  db.settings = { ...db.settings, ...settings };
  notify();
}

// ── Orders ─────────────────────────────────────────────
export function getOrders(): Order[] {
  return [...db.orders];
}

export function addOrder(
  items: Order['items'],
  paymentMethod: Order['paymentMethod'] = 'cash',
  orderType: Order['orderType'] = 'dine_in',
  note?: string,
  userId?: string,
  userName?: string
): Order {
  // Calculate next order number (1–100, resets after 100)
  const maxNum = db.orders.reduce((max, o) => Math.max(max, o.orderNumber || 0), 0);
  const nextNumber = maxNum >= 100 ? 1 : maxNum + 1;

  const order: Order = {
    id: uuidv4(),
    orderNumber: nextNumber,
    date: new Date().toISOString(),
    items,
    total: items.reduce((sum, i) => sum + i.subtotal, 0),
    paymentMethod,
    orderType,
    ...(note ? { note } : {}),
    ...(userId ? { userId, userName } : {}),
  };
  db.orders.push(order);

  // Auto-decrement stock for tracked products
  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (product && product.trackStock) {
      adjustStock(item.productId, -item.quantity);
    }
  }

  // Auto-track sale in register
  const methodLabel = paymentMethod === 'shamcash' ? 'ShamCash' : 'نقدي';
  addCashTransaction('sale', order.total, `طلب #${String(nextNumber).padStart(3, '0')} — ${methodLabel}`, order.id, userId);

  return order;
}

export function getOrderById(id: string): Order | undefined {
  return db.orders.find((o) => o.id === id);
}

export function deleteOrder(id: string): boolean {
  const order = db.orders.find((o) => o.id === id);
  if (!order) return false;

  // Reverse stock deductions for tracked products
  for (const item of order.items) {
    const product = db.products.find(p => p.id === item.productId);
    if (product && product.trackStock) {
      adjustStock(item.productId, item.quantity);
    }
  }

  // Remove associated cash register transaction
  const txIdx = db.register.transactions.findIndex(t => t.orderId === id);
  if (txIdx !== -1) {
    const tx = db.register.transactions[txIdx];
    db.register.currentBalance -= tx.amount;
    db.register.transactions.splice(txIdx, 1);
  }

  db.orders = db.orders.filter((o) => o.id !== id);
  notify();
  return true;
}

export function getOrdersByWeek(weekStart: string): Order[] {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return db.orders.filter((o) => {
    const d = new Date(o.date);
    return d >= start && d <= end;
  });
}

// ── Cash Register ──────────────────────────────────────
export function getRegister(): RegisterState {
  return { ...db.register, transactions: [...db.register.transactions] };
}

export function addCashTransaction(
  type: CashTransaction['type'],
  amount: number,
  note?: string,
  orderId?: string,
  userId?: string
): CashTransaction {
  const tx: CashTransaction = {
    id: uuidv4(),
    type,
    amount: (type === 'sale' || type === 'deposit') ? Math.abs(amount) : -Math.abs(amount),
    note,
    date: new Date().toISOString(),
    orderId,
    userId,
  };
  db.register.transactions.push(tx);
  db.register.currentBalance += tx.amount;
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
  const tx = addCashTransaction(
    'shift_close',
    amountTaken,
    note || `Shift closed — took ${amountTaken.toFixed(2)}`
  );
  db.register.currentBalance = 0;
  notify();
  return tx;
}


// ── Debtors ───────────────────────────────────────────
export function getDebtors(): Debtor[] {
  return [...db.debtors];
}

export function addDebtor(name: string, amount: number, note?: string): Debtor {
  const debtor: Debtor = {
    id: uuidv4(),
    name,
    amount,
    ...(note ? { note } : {}),
    createdAt: new Date().toISOString(),
  };
  db.debtors.push(debtor);
  notify();
  return debtor;
}

export function markDebtorPaid(id: string): boolean {
  const idx = db.debtors.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  db.debtors[idx] = { ...db.debtors[idx], paidAt: new Date().toISOString() };
  notify();
  return true;
}

export function deleteDebtor(id: string): boolean {
  const before = db.debtors.length;
  db.debtors = db.debtors.filter((d) => d.id !== id);
  if (db.debtors.length !== before) { notify(); return true; }
  return false;
}

// ── Import / Export ────────────────────────────────────
export function exportDatabase(): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'db.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importDatabase(file: File): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);

        if (!Array.isArray(data.products)) {
          resolve({ success: false, error: 'Invalid schema: "products" must be an array.' });
          return;
        }
        if (!Array.isArray(data.orders)) {
          resolve({ success: false, error: 'Invalid schema: "orders" must be an array.' });
          return;
        }

        db = {
          products: data.products,
          categories: data.categories || [],
          orders: data.orders,
          register: data.register || { currentBalance: 0, transactions: [] },
          users: data.users || [],
          activityLog: data.activityLog || [],
          settings: data.settings || { ...defaultSettings },
          debtors: data.debtors || [],
        };
        notify();
        resolve({ success: true });
      } catch {
        resolve({ success: false, error: 'Failed to parse JSON file.' });
      }
    };
    reader.onerror = () => resolve({ success: false, error: 'Failed to read file.' });
    reader.readAsText(file);
  });
}

export function getSnapshot(): Database {
  return { ...db, products: [...db.products], categories: [...db.categories], orders: [...db.orders], users: [...db.users], activityLog: [...db.activityLog], register: { ...db.register, transactions: [...db.register.transactions] }, settings: { ...db.settings }, debtors: [...db.debtors] };
}



// ── Global Injection ───────────────────────────────────
// This allows the desktop wrapper to inject a database JSON string
declare global {
  interface Window {
    injectDatabase: (jsonString: string) => Promise<{ success: boolean; error?: string }>;
  }
}

window.injectDatabase = async (jsonString: string) => {
  try {
    const data = JSON.parse(jsonString);

    // Basic schema validation
    if (!Array.isArray(data.products) || !Array.isArray(data.orders)) {
      return { success: false, error: 'Invalid schema: products/orders missing' };
    }

    // Direct DB replacement
    db = {
      products: data.products,
      categories: data.categories || [],
      orders: data.orders,
      register: data.register || { currentBalance: 0, transactions: [] },
      users: data.users || [],
      activityLog: data.activityLog || [],
      settings: data.settings || { ...defaultSettings },
      debtors: data.debtors || [],
    };

    loaded = true;
    notify(); // Trigger UI updates
    return { success: true };
  } catch (err) {
    console.error('Injection failed:', err);
    return { success: false, error: 'JSON parse failed' };
  }
};
