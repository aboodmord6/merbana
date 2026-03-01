import type { Order, ReportStats, DailyBreakdown, ReportPeriod, ReportPreset } from '../types/types';

/* ── Period helpers ──────────────────────────────────── */

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function getPeriod(preset: ReportPreset, customStart?: string, customEnd?: string): ReportPeriod {
  const now = new Date();

  switch (preset) {
    case 'today': {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return {
        start,
        end,
        label: `اليوم – ${start.toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })}`,
      };
    }

    case 'week': {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      const start = startOfDay(monday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const end = endOfDay(sunday);
      return {
        start,
        end,
        label: `هذا الأسبوع – ${start.toLocaleDateString('ar-SY', { month: 'short', day: 'numeric' })} إلى ${end.toLocaleDateString('ar-SY', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    }

    case 'month': {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return {
        start,
        end,
        label: `هذا الشهر – ${start.toLocaleDateString('ar-SY', { year: 'numeric', month: 'long' })}`,
      };
    }

    case 'custom': {
      const start = customStart ? startOfDay(new Date(customStart)) : startOfDay(now);
      const end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
      return {
        start,
        end,
        label: `${start.toLocaleDateString('ar-SY', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('ar-SY', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      };
    }

    case 'all':
    default:
      return {
        start: new Date(0),
        end: endOfDay(now),
        label: 'جميع الطلبات',
      };
  }
}

/* ── Filter orders ──────────────────────────────────── */

export function filterOrders(orders: Order[], period: ReportPeriod): Order[] {
  return orders.filter((o) => {
    const d = new Date(o.date);
    return d >= period.start && d <= period.end;
  });
}

/* ── Calculate stats ────────────────────────────────── */

export function calculateStats(orders: Order[]): ReportStats {
  if (orders.length === 0) {
    return {
      totalRevenue: 0,
      totalOrders: 0,
      totalItemsSold: 0,
      avgOrderValue: 0,
      bestSellingProduct: null,
      paymentBreakdown: { cash: 0, shamcash: 0 },
      orderTypeBreakdown: { dineIn: 0, takeaway: 0 },
    };
  }

  let totalRevenue = 0;
  let totalItemsSold = 0;
  const productSales = new Map<string, { name: string; quantity: number }>();
  let cashCount = 0;
  let shamcashCount = 0;
  let dineInCount = 0;
  let takeawayCount = 0;

  for (const order of orders) {
    totalRevenue += order.total;

    if (order.paymentMethod === 'cash') cashCount++;
    else shamcashCount++;

    if (order.orderType === 'dine_in') dineInCount++;
    else takeawayCount++;

    for (const item of order.items) {
      totalItemsSold += item.quantity;
      const existing = productSales.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        productSales.set(item.productId, { name: item.name, quantity: item.quantity });
      }
    }
  }

  let bestSellingProduct: { name: string; quantity: number } | null = null;
  for (const product of productSales.values()) {
    if (!bestSellingProduct || product.quantity > bestSellingProduct.quantity) {
      bestSellingProduct = product;
    }
  }

  return {
    totalRevenue,
    totalOrders: orders.length,
    totalItemsSold,
    avgOrderValue: totalRevenue / orders.length,
    bestSellingProduct,
    paymentBreakdown: { cash: cashCount, shamcash: shamcashCount },
    orderTypeBreakdown: { dineIn: dineInCount, takeaway: takeawayCount },
  };
}

/* ── Daily breakdown ────────────────────────────────── */

export function getDailyBreakdown(orders: Order[], period: ReportPeriod): DailyBreakdown[] {
  const dayMap = new Map<string, DailyBreakdown>();

  // Don't go past today
  const now = new Date();
  const effectiveEnd = period.end > now ? endOfDay(now) : period.end;

  // Count total days to decide label format
  const totalDays = Math.round((effectiveEnd.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const cursor = new Date(period.start);
  while (cursor <= effectiveEnd) {
    const key = cursor.toISOString().split('T')[0];
    let label: string;

    if (totalDays <= 1) {
      // Single day — show full date
      label = cursor.toLocaleDateString('ar-SY', { weekday: 'short', day: 'numeric', month: 'short' });
    } else if (totalDays <= 7) {
      // Week — show weekday + day number
      label = cursor.toLocaleDateString('ar-SY', { weekday: 'short', day: 'numeric' });
    } else {
      // Month or longer — just day number
      label = String(cursor.getDate());
    }

    dayMap.set(key, { day: label, revenue: 0, orders: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const order of orders) {
    const key = new Date(order.date).toISOString().split('T')[0];
    const entry = dayMap.get(key);
    if (entry) {
      entry.revenue += order.total;
      entry.orders += 1;
    }
  }

  return [...dayMap.values()];
}

/* ── Top products ───────────────────────────────────── */

export function getTopProducts(orders: Order[], limit = 5): { name: string; quantity: number; revenue: number }[] {
  const map = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const existing = map.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
      } else {
        map.set(item.productId, { name: item.name, quantity: item.quantity, revenue: item.subtotal });
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}
