import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { activeUser, logout } = useAuth();
  const { settings, products, debtors } = useDatabase();

  // Badge counts
  const lowStockCount = products.filter(p => p.trackStock && (p.stock || 0) <= 5).length;
  const unpaidDebtorCount = debtors.filter(d => !d.paidAt).length;

  const NAV_ITEMS = [
    { to: '/', label: 'الرئيسية', icon: '🏠', badge: 0 },
    { to: '/products', label: 'المنتجات', icon: '📦', badge: lowStockCount },
    { to: '/new-order', label: 'طلب جديد', icon: '🛒', badge: 0 },
    { to: '/orders', label: 'الطلبات', icon: '📋', badge: 0 },
    { to: '/register', label: 'الصندوق', icon: '💵', badge: 0 },
    { to: '/debtors', label: 'الديون', icon: '💳', badge: unpaidDebtorCount },
    { to: '/reports', label: 'التقارير', icon: '📊', badge: 0 },
    { to: '/settings', label: 'الإعدادات', icon: '⚙️', badge: 0 },
  ];

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 right-3 z-50 lg:hidden bg-white/90 backdrop-blur-sm text-stone-700 p-2.5 rounded-xl shadow-md border border-stone-200 active:scale-95 transition-transform"
        onClick={() => setOpen(!open)}
        aria-label="القائمة"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 right-0 z-40 w-64 bg-white border-l border-stone-200 text-stone-800 flex flex-col shadow-xl
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:shadow-none print:hidden
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="px-6 py-5 border-b border-stone-100">
          <h1 className="text-xl font-bold tracking-tight bg-linear-to-r from-violet-600 to-amber-500 bg-clip-text text-transparent">
            {settings.companyName}
          </h1>
          <p className="text-xs text-stone-400 mt-1">نظام إدارة المتجر</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100'
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + Footer */}
        <div className="px-4 py-4 border-t border-stone-100">
          {activeUser && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-violet-100 text-violet-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                {activeUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{activeUser.name}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="تبديل المستخدم"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-xs text-stone-300">© 2026 {settings.companyName}</p>
        </div>
      </aside>
    </>
  );
}
