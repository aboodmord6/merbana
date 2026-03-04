import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { addUser, deleteUser, updateUser, updateSettings } from '../services/database';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import type { StoreUser } from '../types/types';

const ADMIN_NAME = 'admin';
const ADMIN_PASS = '0780071840';

export default function AdminPage() {
  const { users, activityLog, settings, loading } = useDatabase();
  const [authed, setAuthed] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Add user state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [addError, setAddError] = useState('');

  // Edit user state
  const [editUser, setEditUser] = useState<StoreUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPass, setEditPass] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<StoreUser | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<'users' | 'log' | 'settings'>('users');

  // Settings state
  const [companyName, setCompanyName] = useState(settings?.companyName ?? '');
  const [saveMessage, setSaveMessage] = useState('');

  // Re-sync companyName when DB finishes loading
  useEffect(() => {
    setCompanyName(settings?.companyName ?? '');
  }, [settings]);

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    updateSettings({ companyName: companyName.trim() });
    setSaveMessage('تم حفظ الإعدادات بنجاح');
    setTimeout(() => setSaveMessage(''), 3000);
  }

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginName === ADMIN_NAME && loginPass === ADMIN_PASS) {
      setAuthed(true);
      setLoginError('');
    } else {
      setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
  }

  function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setAddError('الاسم مطلوب');
      return;
    }
    addUser(newName.trim(), newPass.trim() || undefined);
    setNewName('');
    setNewPass('');
    setAddError('');
    setShowAdd(false);
  }

  function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    const updates: Partial<{ name: string; password: string }> = {};
    if (editName.trim() && editName.trim() !== editUser.name) {
      updates.name = editName.trim();
    }
    if (editPass.trim()) {
      updates.password = editPass.trim();
    }
    if (Object.keys(updates).length > 0) {
      updateUser(editUser.id, updates);
    }
    setEditUser(null);
    setEditName('');
    setEditPass('');
  }

  function handleDelete() {
    if (deleteTarget) {
      deleteUser(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  const COLORS = [
    'bg-violet-600', 'bg-cyan-600', 'bg-emerald-600', 'bg-amber-600',
    'bg-rose-600', 'bg-indigo-600', 'bg-teal-600', 'bg-pink-600'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Admin login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-stone-900 mb-1">لوحة الإدارة</h1>
            <p className="text-stone-400 text-sm">أدخل بيانات المسؤول للمتابعة</p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-lg p-6">
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {loginError && (
                <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm text-center">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">اسم المستخدم</label>
                <input
                  type="text"
                  value={loginName}
                  onChange={e => setLoginName(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder-stone-400"
                  placeholder="admin"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder-stone-400"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm"
              >
                دخول
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-stone-900">لوحة الإدارة</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              activeTab === 'users' ? 'bg-violet-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            👥 المستخدمين
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              activeTab === 'log' ? 'bg-violet-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            📋 السجل
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              activeTab === 'settings' ? 'bg-violet-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            ⚙️ الإعدادات
          </button>
          <Link
            to="/"
            className="px-4 py-2 text-sm font-medium text-stone-500 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors"
          >
            ← العودة للتطبيق
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {activeTab === 'log' ? (
          /* Activity Log */
          <div>
            <h2 className="text-xl font-bold text-stone-900 mb-4">سجل النشاط</h2>
            {activityLog.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <p className="text-3xl mb-2">📋</p>
                <p>لا يوجد نشاط مسجّل بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...activityLog].reverse().slice(0, 50).map(log => (
                  <div key={log.id} className="flex items-center justify-between bg-white rounded-xl border border-stone-100 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center text-xs font-bold">
                        {log.userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-800">{log.userName}</p>
                        <p className="text-xs text-stone-400">{log.action}</p>
                      </div>
                    </div>
                    <span className="text-xs text-stone-400">{formatDateTime(log.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'settings' ? (
          /* Settings */
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-stone-900 mb-6">⚙️ إعدادات النظام</h2>
            <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">اسم المتجر / الشركة</label>
                  <p className="text-xs text-stone-400 mb-3">سيظهر هذا الاسم في الفواتير والتقارير وشاشة الدخول.</p>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                    placeholder="اسم المتجر"
                  />
                </div>
                
                <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
                  {saveMessage ? (
                    <span className="text-emerald-600 text-sm font-medium animate-fade-in">
                      ✅ {saveMessage}
                    </span>
                  ) : <span></span>}
                  
                  <button
                    type="submit"
                    disabled={!companyName.trim()}
                    className="px-6 py-2.5 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    حفظ التغييرات
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* User Management */
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-stone-900">إدارة المستخدمين</h2>
                <p className="text-sm text-stone-400 mt-1">{users.length} مستخدم مسجّل</p>
              </div>
              <button
                onClick={() => { setShowAdd(true); setAddError(''); setNewName(''); setNewPass(''); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors active:scale-95 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                إضافة مستخدم
              </button>
            </div>

            {users.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <p className="text-4xl mb-3">👥</p>
                <p className="text-lg">لا يوجد مستخدمون بعد</p>
                <p className="text-sm mt-1">أضف أول مستخدم للبدء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user, i) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between bg-white hover:bg-stone-50 rounded-2xl border border-stone-100 px-5 py-4 transition-colors group shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 ${COLORS[i % COLORS.length]} rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-md`}>
                        {user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-base font-semibold text-stone-900">{user.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-stone-400">
                            {user.password ? '🔒 محمي بكلمة مرور' : '🔓 بدون كلمة مرور'}
                          </span>
                          <span className="text-xs text-stone-300">•</span>
                          <span className="text-xs text-stone-400">{formatDateTime(user.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditUser(user);
                          setEditName(user.name);
                          setEditPass('');
                        }}
                        className="p-2.5 text-stone-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="p-2.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مستخدم جديد">
        <form onSubmit={handleAddUser} className="space-y-4">
          {addError && (
            <div className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm">{addError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم *</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="اسم المستخدم"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور (اختياري)</label>
            <input
              type="text"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="اتركه فارغاً للدخول بدون كلمة مرور"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 transition-colors"
            >
              إضافة
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="تعديل المستخدم">
        <form onSubmit={handleEditUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
            <input
              type="text"
              value={editPass}
              onChange={e => setEditPass(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="اتركه فارغاً للإبقاء على القديمة"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 transition-colors"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المستخدم"
        message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}
