export interface Product {
  id: string;
  name: string;
  price: number;
  categoryId?: string;
  sizes?: { name: string; price: number }[];
  createdAt: string;
  stock?: number;
  trackStock?: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  subtotal: number;
}

export type PaymentMethod = 'cash' | 'shamcash';
export type OrderType = 'dine_in' | 'takeaway';

export interface Order {
  id: string;
  orderNumber: number;
  date: string;
  items: OrderItem[];
  total: number;
  paymentMethod: PaymentMethod;
  orderType: OrderType;
  note?: string;
  userId?: string;
  userName?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface StoreUser {
  id: string;
  name: string;
  password?: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

export type PrintBehavior = 'customer_only' | 'kitchen_only' | 'both_separate';

export interface PrinterSettings {
  defaultPrinter: string;
  kitchenPrinter?: string;
  defaultOptions: Record<string, string>;
  printBehavior: PrintBehavior;
  autoPrint: boolean;
  customerCopies: number;
  kitchenCopies: number;
}

export interface StoreSettings {
  companyName: string;
  printerSettings: PrinterSettings;
}

export interface Debtor {
  id: string;
  name: string;
  amount: number;
  note?: string;
  createdAt: string;
  paidAt?: string;
}

export interface Database {
  products: Product[];
  categories: Category[];
  orders: Order[];
  register: RegisterState;
  users: StoreUser[];
  activityLog: ActivityLog[];
  settings: StoreSettings;
  debtors: Debtor[];
  lastStockReset?: string;  // ISO date string — stored in db.json to track daily stock reset
}

export interface CashTransaction {
  id: string;
  type: 'sale' | 'deposit' | 'withdrawal' | 'shift_close';
  amount: number;
  note?: string;
  date: string;
  orderId?: string;
  userId?: string;
}

export interface RegisterState {
  currentBalance: number;
  transactions: CashTransaction[];
}

export interface ReportStats {
  totalRevenue: number;
  totalOrders: number;
  totalItemsSold: number;
  avgOrderValue: number;
  bestSellingProduct: { name: string; quantity: number } | null;
  paymentBreakdown: { cash: number; shamcash: number };
  orderTypeBreakdown: { dineIn: number; takeaway: number };
}

export interface DailyBreakdown {
  day: string;
  revenue: number;
  orders: number;
}

export type ReportPreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface ReportPeriod {
  start: Date;
  end: Date;
  label: string;
}
