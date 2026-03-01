import { useParams, Link } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { orders, settings, loading } = useDatabase();

  const order = orders.find((o) => o.id === id);

  // Find adjacent orders for prev/next navigation
  const sorted = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const currentIdx = sorted.findIndex(o => o.id === id);
  const prevOrder = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;
  const nextOrder = currentIdx > 0 ? sorted[currentIdx - 1] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🔍</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">الطلب غير موجود</h2>
        <Link to="/orders" className="text-violet-600 hover:underline text-sm">
          → العودة إلى الطلبات
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center justify-center print:min-h-0 print:p-0 print:m-0 print:block">
      <div className="w-full max-w-md print:max-w-full print:p-0 print:m-0">
        {/* Action bar (hidden on print) */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/orders" className="text-sm text-gray-500 hover:text-violet-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            الطلبات
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z" />
            </svg>
            طباعة الفاتورة
          </button>
        </div>

        {/* Prev / Next order navigation */}
        <div className="flex items-center justify-between mb-3 print:hidden">
          <div>
            {nextOrder && (
              <Link
                to={`/receipt/${nextOrder.id}`}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                #{String(nextOrder.orderNumber).padStart(3, '0')} الأحدث
              </Link>
            )}
          </div>
          <div>
            {prevOrder && (
              <Link
                to={`/receipt/${prevOrder.id}`}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors"
              >
                الأقدم #{String(prevOrder.orderNumber).padStart(3, '0')}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Receipt */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md mx-auto print:shadow-none print:border-none print:max-w-full print:rounded-none print:mx-0">
          <div className="px-8 py-6 text-center border-b border-dashed border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900">{settings.companyName}</h1>
            <p className="text-xl font-semibold text-violet-600 mt-2">طلب #{String(order.orderNumber ?? '–').padStart(3, '0')}</p>
            <p className="text-xs text-gray-400 mt-1">{formatDateTime(order.date)}</p>
            {order.paymentMethod && (
              <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full ${
                order.paymentMethod === 'shamcash'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {order.paymentMethod === 'shamcash' ? '📱 ShamCash' : '💵 نقدي'}
              </span>
            )}
            {order.orderType && (
              <span className={`inline-block mt-2 mr-2 text-xs font-medium px-3 py-1 rounded-full ${
                order.orderType === 'dine_in'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-100 text-rose-700'
              }`}>
                {order.orderType === 'dine_in' ? '🍽️ صالة' : '🛍️ سفري'}
              </span>
            )}
          </div>

          <div className="px-8 py-4 border-b border-dashed border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-300">
                  <th className="text-right pb-2 font-medium">الصنف</th>
                  <th className="text-center pb-2 font-medium border-l border-gray-300">الكمية</th>
                  <th className="text-center pb-2 font-medium border-l border-gray-300">السعر</th>
                  <th className="text-center pb-2 font-medium border-l border-gray-300">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-900">{item.name}</td>
                    <td className="py-2 text-center text-gray-600 border-l border-gray-300">{item.quantity}</td>
                    <td className="py-2 text-center text-gray-600 border-l border-gray-300">{item.price}</td>
                    <td className="py-2 text-center font-medium text-gray-900 border-l border-gray-300">{item.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.note && (
              <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">ملاحظة</p>
                <p className="text-sm text-gray-700">{order.note}</p>
              </div>
            )}
          </div>

          <div className="px-8 py-4">
            <div className="flex justify-between items-center">
              <span className="text-base font-medium text-gray-900">الإجمالي</span>
              <span className="text-xl font-semibold text-gray-900">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="px-8 py-4 text-center border-t border-dashed border-gray-200">
            <p className="text-xs text-gray-400">شكراً لتعاملكم معنا!</p>
          </div>
        </div>

        {/* Post-receipt quick actions */}
        <div className="mt-4 flex items-center justify-center gap-3 print:hidden">
          <Link
            to="/new-order"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            طلب جديد
          </Link>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            كل الطلبات
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            🏠 الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
