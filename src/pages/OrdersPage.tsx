import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { deleteOrder } from '../services/database';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Order } from '../types/types';

export default function OrdersPage() {
  const { orders, loading } = useDatabase();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  function updateSearch(val: string) {
    setSearch(val);
    setPage(1);
    const params = new URLSearchParams();
    if (val) params.set('search', val);
    setSearchParams(params, { replace: true });
  }

  // Today's summary
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const todayOrders = orders.filter(o => {
    const d = new Date(o.date);
    return d >= today && d <= todayEnd;
  });
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);

  const sorted = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const filtered = sorted.filter(
    (o) =>
      String(o.orderNumber).includes(search) ||
      o.items.some((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleDelete() {
    if (deleteTarget) {
      deleteOrder(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الطلبات</h1>
          <p className="text-sm text-gray-500 mt-1">{orders.length} طلب إجمالي</p>
        </div>
        {/* Quick action */}
        <Link
          to="/new-order"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          طلب جديد
        </Link>
      </div>

      {/* Today's mini-summary */}
      {todayOrders.length > 0 && (
        <div className="flex items-center gap-3 mb-5 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
          <span className="text-lg">📅</span>
          <div className="flex-1 text-sm">
            <span className="font-semibold text-violet-800">{todayOrders.length} طلب اليوم</span>
            <span className="text-violet-600 mx-2">•</span>
            <span className="text-violet-700">{formatCurrency(todayRevenue)} إجمالي</span>
          </div>
          <Link to="/" className="text-xs text-violet-600 hover:underline shrink-0">
            لوحة التحكم ←
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="بحث برقم الطلب أو اسم المنتج..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={search ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد'}
          description={search ? 'جرب مصطلح بحث آخر' : 'أنشئ أول طلب للبدء'}
          action={!search ? { label: '+ طلب جديد', onClick: () => {} } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {paginated.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:border-violet-100 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Link to={`/receipt/${order.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      #{String(order.orderNumber ?? '–').padStart(3, '0')}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(order.date)}</span>
                    {/* Payment method badge */}
                    {order.paymentMethod && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        order.paymentMethod === 'shamcash'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {order.paymentMethod === 'shamcash' ? '📱 ShamCash' : '💵 نقدي'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {order.items.map((i) => `${i.name} ×${i.quantity}`).join('، ')}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {order.items.reduce((s, i) => s + i.quantity, 0)} عنصر
                  </span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(order.total)}</span>
                  <Link
                    to={`/receipt/${order.id}`}
                    className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title="عرض الفاتورة"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(order)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف الطلب"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← السابق
          </button>
          <span className="text-sm text-gray-500">
            صفحة {currentPage} من {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            التالي →
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الطلب"
        message={`هل أنت متأكد من حذف الطلب #${String(deleteTarget?.orderNumber ?? '').padStart(3, '0')}؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}
