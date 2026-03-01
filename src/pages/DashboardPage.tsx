import { useDatabase } from '../hooks/useDatabase';
import { useAuth } from '../hooks/useAuth';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { Link, useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';

export default function DashboardPage() {
  const { orders, products, register, loading } = useDatabase();
  const { activeUser } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Today's data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const todayOrders = orders.filter(o => {
    const d = new Date(o.date);
    return d >= today && d <= todayEnd;
  });

  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const todayItems = todayOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);

  // Top products today
  const productCounts: Record<string, { name: string; qty: number; productId: string }> = {};
  todayOrders.forEach(o => o.items.forEach(i => {
    if (!productCounts[i.productId]) productCounts[i.productId] = { name: i.name, qty: 0, productId: i.productId };
    productCounts[i.productId].qty += i.quantity;
  }));
  const topProducts = Object.values(productCounts).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Recent orders
  const recentOrders = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  // Low stock products
  const lowStock = products.filter(p => p.trackStock && (p.stock || 0) <= 5);

  return (
    <div>
      {/* Welcome */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            أهلاً{activeUser ? ` ${activeUser.name}` : ''} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">لوحة التحكم — ملخص اليوم</p>
        </div>
        {/* Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/new-order"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            طلب جديد
          </Link>
          <Link
            to="/reports"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            📊 التقارير
          </Link>
        </div>
      </div>

      {/* Stats Grid — each card links to the relevant page */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="إيرادات اليوم" value={formatCurrency(todayRevenue)} icon="💰" to="/register" />
        <StatCard label="طلبات اليوم" value={String(todayOrders.length)} icon="📋" to="/orders" />
        <StatCard label="عناصر مباعة" value={String(todayItems)} icon="📦" to="/orders" />
        <StatCard label="رصيد الصندوق" value={formatCurrency(register.currentBalance)} icon="💵" to="/register" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products Today */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span>🔥</span> الأكثر مبيعاً اليوم
            </h2>
            <Link to="/products" className="text-xs text-violet-600 hover:text-violet-700 font-medium hover:underline">
              كل المنتجات ←
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400">لا توجد مبيعات اليوم</p>
              <Link to="/new-order" className="mt-2 inline-block text-xs text-violet-600 hover:underline">
                ابدأ بإضافة طلب →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/products`)}
                  className="flex items-center justify-between w-full hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors group text-right"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 group-hover:text-violet-700 transition-colors">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{p.qty}×</span>
                    <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span>🕐</span> آخر الطلبات
            </h2>
            <Link to="/orders" className="text-xs text-violet-600 hover:text-violet-700 font-medium hover:underline">
              كل الطلبات ←
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400">لا توجد طلبات بعد</p>
              <Link to="/new-order" className="mt-2 inline-block text-xs text-violet-600 hover:underline">
                أنشئ أول طلب →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map(order => (
                <Link
                  key={order.id}
                  to={`/receipt/${order.id}`}
                  className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors group"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        #{String(order.orderNumber).padStart(3, '0')}
                      </span>
                      <span className="text-xs text-gray-400">{formatDateTime(order.date)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.items.map(i => i.name).join('، ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
                    <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {recentOrders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <Link to="/orders" className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-violet-600 transition-colors">
                عرض كل الطلبات
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <span>⚠️</span> منتجات منخفضة المخزون
            </h2>
            <Link
              to="/products"
              className="text-xs text-amber-700 hover:text-amber-900 font-medium hover:underline"
            >
              إدارة المخزون ←
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <Link
                key={p.id}
                to="/products"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-medium transition-colors"
              >
                {p.name}
                <span className="bg-amber-200 px-1.5 py-0.5 rounded text-amber-900 font-bold">{p.stock ?? 0}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
