import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import {
  getPeriod,
  filterOrders,
  calculateStats,
  getTopProducts,
  getDailyBreakdown,
} from '../utils/reportUtils';
import type { ReportPreset } from '../types/types';
import BarChart from '../components/BarChart';

/* ─── Period presets ─────────────────────────────────── */
const PRESETS: { key: ReportPreset; label: string; icon: string }[] = [
  { key: 'today', label: 'اليوم', icon: '📅' },
  { key: 'week', label: 'الأسبوع', icon: '📆' },
  { key: 'month', label: 'الشهر', icon: '🗓️' },
  { key: 'all', label: 'الكل', icon: '📊' },
  { key: 'custom', label: 'مخصص', icon: '🔧' },
];

/* ─── Tiny helpers ───────────────────────────────────── */
function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function ProgressBar({ value, max, color = 'violet' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  const colors: Record<string, string> = {
    violet: 'from-violet-500 to-violet-400',
    emerald: 'from-emerald-500 to-emerald-400',
    amber: 'from-amber-500 to-amber-400',
    blue: 'from-blue-500 to-blue-400',
    rose: 'from-rose-500 to-rose-400',
    red: 'from-red-500 to-red-400',
  };
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full bg-linear-to-r ${colors[color] || colors.violet} transition-all duration-700`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

/* ─── Section card shell ─────────────────────────────── */
function Section({ title, icon, children, action }: {
  title: string; icon: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span>{icon}</span> {title}
        </h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────── */
export default function ReportsPage() {
  const { orders, products, debtors, settings, loading } = useDatabase();
  const [preset, setPreset] = useState<ReportPreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showAllOrders, setShowAllOrders] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  /* ── Derived data for current period ── */
  const period = useMemo(() => getPeriod(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const filtered = useMemo(() => filterOrders(orders, period), [orders, period]);
  const stats = useMemo(() => calculateStats(filtered), [filtered]);
  const topProducts = useMemo(() => getTopProducts(filtered, 10), [filtered]);
  const dailyData = useMemo(() => getDailyBreakdown(filtered, period), [filtered, period]);

  /* ── Comparison: previous equal-length period ── */
  const prevPeriod = useMemo(() => {
    const len = period.end.getTime() - period.start.getTime();
    const prevEnd = new Date(period.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - len);
    return { start: prevStart, end: prevEnd, label: 'الفترة السابقة' };
  }, [period]);
  const prevFiltered = useMemo(() => filterOrders(orders, prevPeriod), [orders, prevPeriod]);
  const prevStats = useMemo(() => calculateStats(prevFiltered), [prevFiltered]);

  /* ── Hourly activity heatmap ── */
  const hourlyMap = useMemo(() => {
    const map = new Array(24).fill(0);
    filtered.forEach(o => {
      const h = new Date(o.date).getHours();
      map[h]++;
    });
    return map;
  }, [filtered]);
  const maxHourlyCount = Math.max(...hourlyMap, 1);

  /* ── Product catalog health ── */
  const totalProducts = products.length;
  const trackedProducts = products.filter(p => p.trackStock).length;
  const lowStockProducts = products.filter(p => p.trackStock && (p.stock || 0) <= 5);
  const outOfStockProducts = products.filter(p => p.trackStock && (p.stock || 0) === 0);
  const estimatedStockValue = products.reduce((s, p) => s + (p.trackStock ? (p.stock || 0) * p.price : 0), 0);

  /* ── Debtors ── */
  const unpaidDebtors = debtors.filter(d => !d.paidAt);
  const totalUnpaid = unpaidDebtors.reduce((s, d) => s + d.amount, 0);
  const paidDebtors = debtors.filter(d => !!d.paidAt);
  const totalPaid = paidDebtors.reduce((s, d) => s + d.amount, 0);

  /* ── Delta helper ── */
  function delta(curr: number, prev: number) {
    if (!prev) return null;
    const d = ((curr - prev) / prev) * 100;
    return { value: Math.abs(d).toFixed(1), up: d >= 0 };
  }

  /* ── Print ── */
  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>تقرير - ${settings.companyName}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:24px;color:#111;background:#fff;font-size:12px}
    h1{font-size:18px;font-weight:bold;text-align:center;margin-bottom:4px}.subtitle{font-size:12px;color:#666;text-align:center;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:11px}th{background:#f5f5f5;font-weight:bold}
    .section-title{font-size:13px;font-weight:bold;margin-bottom:8px;margin-top:16px}.footer{text-align:center;margin-top:20px;padding-top:8px;border-top:1px solid #ccc;font-size:10px;color:#999}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); win.onafterprint = () => win.close(); };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const recentOrders = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const displayedOrders = showAllOrders ? recentOrders : recentOrders.slice(0, 20);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التقارير</h1>
          <p className="text-sm text-gray-500 mt-1">{period.label}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z" />
            </svg>
            طباعة
          </button>
        </div>
      </div>

      {/* ── Period Tabs ── */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
              preset === key
                ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300 hover:text-violet-600'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Custom date range ── */}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
          <label className="text-sm text-gray-600 font-medium">من:</label>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <label className="text-sm text-gray-600 font-medium">إلى:</label>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">لا توجد بيانات بعد</h2>
          <p className="text-sm text-gray-400 mb-4">ستظهر التقارير عند إنشاء الطلبات الأولى</p>
          <Link to="/new-order" className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors">
            + طلب جديد
          </Link>
        </div>
      ) : (
        <>
          {/* ── 6 KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Revenue */}
            {(() => {
              const d = delta(stats.totalRevenue, prevStats.totalRevenue);
              return (
                <div className="bg-linear-to-br from-violet-600 to-indigo-700 rounded-2xl p-5 text-white col-span-2 lg:col-span-1 shadow-lg shadow-violet-300/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-violet-200 uppercase tracking-wider">الإيرادات</span>
                    <span className="text-xl">💰</span>
                  </div>
                  <p className="text-3xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
                  {d && (
                    <p className={`text-xs mt-2 ${d.up ? 'text-emerald-300' : 'text-red-300'}`}>
                      {d.up ? '↑' : '↓'} {d.value}% مقارنة بالفترة السابقة
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Orders count */}
            {(() => {
              const d = delta(stats.totalOrders, prevStats.totalOrders);
              return (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">الطلبات</span>
                    <span className="text-xl">📋</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalOrders}</p>
                  {d && (
                    <p className={`text-xs mt-2 font-medium ${d.up ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.up ? '↑' : '↓'} {d.value}%
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Avg order */}
            {(() => {
              const d = delta(stats.avgOrderValue, prevStats.avgOrderValue);
              return (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">متوسط الطلب</span>
                    <span className="text-xl">📈</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.avgOrderValue)}</p>
                  {d && (
                    <p className={`text-xs mt-2 font-medium ${d.up ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.up ? '↑' : '↓'} {d.value}%
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Items sold */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">أصناف مباعة</span>
                <span className="text-xl">📦</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.totalItemsSold}</p>
              <p className="text-xs text-gray-400 mt-2">
                {stats.totalOrders > 0 ? (stats.totalItemsSold / stats.totalOrders).toFixed(1) : '0'} صنف/طلب
              </p>
            </div>

            {/* Best seller */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">الأكثر مبيعاً</span>
                <span className="text-xl">🔥</span>
              </div>
              {stats.bestSellingProduct ? (
                <>
                  <p className="text-base font-bold text-gray-900 leading-tight">{stats.bestSellingProduct.name}</p>
                  <p className="text-xs text-violet-600 mt-1 font-medium">{stats.bestSellingProduct.quantity} وحدة مباعة</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">لا يوجد</p>
              )}
            </div>

            {/* Product diversity */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">تنوع المنتجات</span>
                <span className="text-xl">🎯</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{topProducts.length}</p>
              <p className="text-xs text-gray-400 mt-2">من {totalProducts} منتج في الكتالوج</p>
            </div>
          </div>

          {/* ── Revenue & Orders Chart ── */}
          {dailyData.length > 1 && (
            <Section title="الإيرادات اليومية" icon="📈">
              <div className="mb-8">
                <p className="text-xs text-gray-500 mb-4">الإيرادات (ل.س)</p>
                <BarChart
                  data={dailyData.map(d => ({ label: d.day, value: d.revenue }))}
                  height={180}
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-4">عدد الطلبات</p>
                <BarChart
                  data={dailyData.map(d => ({ label: d.day, value: d.orders }))}
                  height={120}
                />
              </div>
            </Section>
          )}

          {/* ── Hourly Heatmap ── */}
          {filtered.length > 0 && (
            <Section title="نشاط الساعات" icon="🕐"
              action={<span className="text-xs text-gray-400">أوقات الذروة</span>}
            >
              <div className="grid grid-cols-12 gap-1">
                {hourlyMap.map((count, h) => {
                  const intensity = maxHourlyCount > 0 ? count / maxHourlyCount : 0;
                  const bg = intensity === 0
                    ? 'bg-gray-100 text-gray-300'
                    : intensity < 0.3
                    ? 'bg-violet-100 text-violet-500'
                    : intensity < 0.6
                    ? 'bg-violet-300 text-violet-700'
                    : intensity < 0.85
                    ? 'bg-violet-500 text-white'
                    : 'bg-violet-700 text-white';
                  return (
                    <div key={h} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all hover:scale-110 cursor-default ${bg}`}
                        title={`${h}:00 — ${count} طلب`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                      <span className="text-xs text-gray-400 leading-none">{h}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-4 justify-end">
                <span className="text-xs text-gray-400">أقل</span>
                {['bg-gray-100', 'bg-violet-100', 'bg-violet-300', 'bg-violet-500', 'bg-violet-700'].map((c, i) => (
                  <div key={i} className={`w-4 h-4 rounded ${c}`} />
                ))}
                <span className="text-xs text-gray-400">أكثر</span>
              </div>
            </Section>
          )}

          {/* ── Payment & Order Type ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="طريقة الدفع" icon="💳">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">💵 نقدي</span>
                    <span className="text-sm font-bold text-gray-900">
                      {stats.paymentBreakdown.cash} طلب
                      <span className="text-xs text-gray-400 font-normal mr-1">
                        ({pct(stats.paymentBreakdown.cash, stats.totalOrders)}%)
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={stats.paymentBreakdown.cash} max={stats.totalOrders} color="emerald" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">📱 ShamCash</span>
                    <span className="text-sm font-bold text-gray-900">
                      {stats.paymentBreakdown.shamcash} طلب
                      <span className="text-xs text-gray-400 font-normal mr-1">
                        ({pct(stats.paymentBreakdown.shamcash, stats.totalOrders)}%)
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={stats.paymentBreakdown.shamcash} max={stats.totalOrders} color="blue" />
                </div>
              </div>
            </Section>

            <Section title="نوع الطلب" icon="🍽️">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">🍽️ صالة</span>
                    <span className="text-sm font-bold text-gray-900">
                      {stats.orderTypeBreakdown.dineIn} طلب
                      <span className="text-xs text-gray-400 font-normal mr-1">
                        ({pct(stats.orderTypeBreakdown.dineIn, stats.totalOrders)}%)
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={stats.orderTypeBreakdown.dineIn} max={stats.totalOrders} color="amber" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">🛍️ سفري</span>
                    <span className="text-sm font-bold text-gray-900">
                      {stats.orderTypeBreakdown.takeaway} طلب
                      <span className="text-xs text-gray-400 font-normal mr-1">
                        ({pct(stats.orderTypeBreakdown.takeaway, stats.totalOrders)}%)
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={stats.orderTypeBreakdown.takeaway} max={stats.totalOrders} color="rose" />
                </div>
              </div>
            </Section>
          </div>

          {/* ── Top Products ── */}
          {topProducts.length > 0 && (
            <Section title={`أفضل المنتجات أداءً (${topProducts.length})`} icon="🏆">
              <div className="space-y-4">
                {topProducts.map((p, i) => {
                  const maxQ = topProducts[0].quantity || 1;
                  const pctRevOfTotal = pct(p.revenue, stats.totalRevenue);
                  return (
                    <div key={i} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className={`w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold rounded-full ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-600' :
                            i === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-violet-50 text-violet-500'
                          }`}>{i + 1}</span>
                          <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-xs text-gray-500">{pctRevOfTotal}% من الإيرادات</span>
                          <span className="text-xs text-gray-500 hidden sm:inline">{formatCurrency(p.revenue)}</span>
                          <span className="text-sm font-bold text-gray-900 min-w-[40px] text-left">{p.quantity}×</span>
                        </div>
                      </div>
                      <ProgressBar value={p.quantity} max={maxQ} color="violet" />
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Product Catalog Health + Debtors ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Catalog health */}
            <Section title="صحة المخزون" icon="📦"
              action={
                <Link to="/products" className="text-xs text-violet-600 hover:underline">إدارة المخزون ←</Link>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
                    <p className="text-xs text-gray-500 mt-0.5">منتج في الكتالوج</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-violet-700">{trackedProducts}</p>
                    <p className="text-xs text-violet-500 mt-0.5">منتج مع تتبع المخزون</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${lowStockProducts.length > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                    <p className={`text-2xl font-bold ${lowStockProducts.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {lowStockProducts.length}
                    </p>
                    <p className={`text-xs mt-0.5 ${lowStockProducts.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      منخفض المخزون (≤5)
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${outOfStockProducts.length > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className={`text-2xl font-bold ${outOfStockProducts.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {outOfStockProducts.length}
                    </p>
                    <p className={`text-xs mt-0.5 ${outOfStockProducts.length > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      نفد المخزون
                    </p>
                  </div>
                </div>
                {trackedProducts > 0 && (
                  <div className="pt-2 border-t border-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">قيمة المخزون المتبقي</span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(estimatedStockValue)}</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Debtors */}
            <Section title="ملخص الديون" icon="💳"
              action={
                <Link to="/debtors" className="text-xs text-violet-600 hover:underline">إدارة الديون ←</Link>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{unpaidDebtors.length}</p>
                    <p className="text-xs text-amber-500 mt-0.5">دين غير مسدد</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{paidDebtors.length}</p>
                    <p className="text-xs text-emerald-500 mt-0.5">ديون مسددة</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">إجمالي غير مسدد</span>
                    <span className="text-sm font-bold text-amber-700">{formatCurrency(totalUnpaid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">إجمالي ما تم تحصيله</span>
                    <span className="text-sm font-bold text-emerald-700">{formatCurrency(totalPaid)}</span>
                  </div>
                  {(totalUnpaid + totalPaid) > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">نسبة التحصيل</span>
                        <span className="text-xs font-medium text-gray-700">{pct(totalPaid, totalUnpaid + totalPaid)}%</span>
                      </div>
                      <ProgressBar value={totalPaid} max={totalUnpaid + totalPaid} color="emerald" />
                    </div>
                  )}
                </div>
                {unpaidDebtors.length > 0 && (
                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-500 mb-2">المدينون الأكبر</p>
                    <div className="space-y-1.5">
                      {unpaidDebtors.sort((a, b) => b.amount - a.amount).slice(0, 3).map(d => (
                        <div key={d.id} className="flex items-center justify-between">
                          <span className="text-xs text-gray-700 font-medium">{d.name}</span>
                          <span className="text-xs font-bold text-amber-700">{formatCurrency(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </div>

          {/* ── Orders Table ── */}
          <Section
            title={`الطلبات (${filtered.length})`}
            icon="📋"
            action={
              <Link to="/orders" className="text-xs text-violet-600 hover:underline">كل الطلبات ←</Link>
            }
          >
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">لا توجد طلبات في هذه الفترة</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="text-right pb-3 text-xs font-medium text-gray-500">الطلب</th>
                        <th className="text-right pb-3 text-xs font-medium text-gray-500">التاريخ</th>
                        <th className="text-right pb-3 text-xs font-medium text-gray-500 hidden md:table-cell">الأصناف</th>
                        <th className="text-center pb-3 text-xs font-medium text-gray-500">الدفع</th>
                        <th className="text-center pb-3 text-xs font-medium text-gray-500">النوع</th>
                        <th className="text-left pb-3 text-xs font-medium text-gray-500">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {displayedOrders.map(order => (
                        <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="py-3">
                            <Link
                              to={`/receipt/${order.id}`}
                              className="font-mono text-xs text-violet-600 hover:underline"
                            >
                              #{String(order.orderNumber ?? '–').padStart(3, '0')}
                            </Link>
                          </td>
                          <td className="py-3 text-xs text-gray-500">{formatDateTime(order.date)}</td>
                          <td className="py-3 text-xs text-gray-600 hidden md:table-cell max-w-[200px] truncate">
                            {order.items.map(i => i.name).join('، ')}
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                              order.paymentMethod === 'cash'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              {order.paymentMethod === 'cash' ? '💵 نقدي' : '📱 ShamCash'}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                              order.orderType === 'dine_in'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {order.orderType === 'dine_in' ? '🍽️ صالة' : '🛍️ سفري'}
                            </span>
                          </td>
                          <td className="py-3 text-left">
                            <span className="font-bold text-gray-900">{formatCurrency(order.total)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {recentOrders.length > 20 && (
                  <div className="mt-4 pt-4 border-t border-gray-50 text-center">
                    <button
                      onClick={() => setShowAllOrders(v => !v)}
                      className="text-sm text-violet-600 hover:text-violet-700 font-medium hover:underline"
                    >
                      {showAllOrders
                        ? '▲ عرض أقل'
                        : `▼ عرض كل الطلبات (${recentOrders.length - 20} إضافي)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </Section>
        </>
      )}

      {/* ── Hidden Print Content ── */}
      <div ref={printRef} style={{ display: 'none' }}>
        <h1>{settings.companyName} – تقرير</h1>
        <p className="subtitle">{period.label}</p>
        <table>
          <tbody>
            <tr><td><strong>الإيرادات</strong></td><td>{formatCurrency(stats.totalRevenue)}</td>
                <td><strong>عدد الطلبات</strong></td><td>{stats.totalOrders}</td></tr>
            <tr><td><strong>الأصناف المباعة</strong></td><td>{stats.totalItemsSold}</td>
                <td><strong>متوسط الطلب</strong></td><td>{formatCurrency(stats.avgOrderValue)}</td></tr>
            <tr><td><strong>نقدي</strong></td><td>{stats.paymentBreakdown.cash} طلب</td>
                <td><strong>ShamCash</strong></td><td>{stats.paymentBreakdown.shamcash} طلب</td></tr>
            <tr><td><strong>صالة</strong></td><td>{stats.orderTypeBreakdown.dineIn} طلب</td>
                <td><strong>سفري</strong></td><td>{stats.orderTypeBreakdown.takeaway} طلب</td></tr>
          </tbody>
        </table>
        {topProducts.length > 0 && (
          <>
            <p className="section-title">الأكثر مبيعاً</p>
            <table>
              <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{p.name}</td><td>{p.quantity}</td><td>{formatCurrency(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="section-title">تفاصيل الطلبات ({filtered.length})</p>
        <table>
          <thead><tr><th>الطلب</th><th>التاريخ</th><th>الأصناف</th><th>الدفع</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {filtered.map(order => (
              <tr key={order.id}>
                <td>#{String(order.orderNumber ?? '–').padStart(3, '0')}</td>
                <td>{formatDate(order.date)}</td>
                <td>{order.items.map(i => i.name).join('، ')}</td>
                <td>{order.paymentMethod === 'cash' ? 'نقدي' : 'ShamCash'}</td>
                <td><strong>{formatCurrency(order.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="footer">
          تم إنشاء التقرير: {new Date().toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
