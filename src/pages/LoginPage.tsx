import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { StoreUser } from '../types/types';

const COLORS = [
  'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500',
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function LoginPage() {
  const { login } = useAuth();
  const { users, settings, loading } = useDatabase();
  const navigate = useNavigate();

  const [selectedUser, setSelectedUser] = useState<StoreUser | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صباح الخير ☀️';
    if (hour < 18) return 'مساء الخير 🌤️';
    return 'مساء النور 🌙';
  })();

  function handleUserClick(user: StoreUser) {
    if (user.password) {
      setSelectedUser(user);
      setPassword('');
      setError('');
    } else {
      login(user);
      navigate('/', { replace: true });
    }
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    if (password === selectedUser.password) {
      login(selectedUser);
      navigate('/', { replace: true });
    } else {
      setError('كلمة المرور غير صحيحة');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6">
      {/* Subtle background texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#ede9fe_0%,transparent_60%)] pointer-events-none" />

      {/* Header */}
      <div className="relative text-center mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-violet-600 to-amber-500 bg-clip-text text-transparent mb-2">
          {settings.companyName}
        </h1>
        <p className="text-stone-500 text-lg">{greeting}</p>
      </div>

      {/* Password prompt for selected user */}
      {selectedUser ? (
        <div className="relative w-full max-w-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-lg p-6">
            <div className="text-center mb-6">
              <div className={`w-20 h-20 ${COLORS[users.indexOf(selectedUser) % COLORS.length]} rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md mx-auto mb-3`}>
                {getInitials(selectedUser.name)}
              </div>
              <p className="text-stone-800 text-lg font-semibold">{selectedUser.name}</p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {error && (
                <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm text-center">
                  {error}
                </div>
              )}
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder-stone-400 text-center"
                placeholder="كلمة المرور"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm"
                >
                  دخول
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedUser(null); setError(''); }}
                  className="py-3 px-4 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors"
                >
                  رجوع
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* User selection grid */
        <div className="relative w-full max-w-lg">
          {users.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-lg text-stone-600">لا يوجد مستخدمون</p>
              <p className="text-sm mt-2 text-stone-400">اطلب من المسؤول إضافة المستخدمين</p>
              <a
                href="/admin"
                className="inline-block mt-4 px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
              >
                فتح لوحة الإدارة
              </a>
            </div>
          ) : (
            <>
              <p className="text-stone-400 text-center text-sm mb-6">اختر حسابك للمتابعة</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 justify-items-center">
                {users.map((user, i) => (
                  <button
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    className="group flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-white hover:shadow-md border border-transparent hover:border-stone-100 transition-all duration-200 w-full relative"
                  >
                    <div className={`w-16 h-16 ${COLORS[i % COLORS.length]} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      {getInitials(user.name)}
                    </div>
                    <span className="text-stone-700 text-sm font-medium text-center leading-tight">
                      {user.name}
                    </span>
                    {user.password && (
                      <span className="absolute top-2 right-2 text-stone-300 text-[10px]">🔒</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Admin link */}
      <div className="relative mt-10">
        <a
          href="/admin"
          className="text-xs text-stone-300 hover:text-stone-500 transition-colors"
        >
          لوحة الإدارة
        </a>
      </div>
    </div>
  );
}
