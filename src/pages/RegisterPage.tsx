import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { depositCash, withdrawCash, closeShift } from '../services/database';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

type ModalType = null | 'deposit' | 'withdraw' | 'close_shift';

export default function RegisterPage() {
  const { register, orders, loading } = useDatabase();
  const [modal, setModal] = useState<ModalType>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function handleDeposit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    depositCash(val, note.trim() || 'إيداع نقدي');
    showToast(`تم إضافة ${formatCurrency(val)} للصندوق`);
    resetModal();
  }

  function handleWithdraw() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    withdrawCash(val, note.trim() || 'سحب نقدي');
    showToast(`تم سحب ${formatCurrency(val)}`);
    resetModal();
  }

  function handleCloseShift() {
    const taken = register.currentBalance;
    closeShift(taken, note.trim() || undefined);
    showToast(`تم إغلاق الوردية — ${formatCurrency(taken)} تم تحصيلها`);
    resetModal();
  }

  function resetModal() {
    setModal(null);
    setAmount('');
    setNote('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Today's sales summary
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const todayOrders = orders.filter(o => {
    const d = new Date(o.date);
    return d >= today && d <= todayEnd;
  });
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);

  const sortedTx = [...register.transactions].reverse();

  const txLabels: Record<string, string> = {
    sale: 'بيع',
    deposit: 'إيداع',
    withdrawal: 'سحب',
    shift_close: 'إغلاق وردية',
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-[scaleIn_0.2s_ease-out]">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الصندوق</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع التدفق النقدي وإدارة الورديات</p>
        </div>
        {/* Quick shortcut */}
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

      {/* Balance Card */}
      <div className="bg-linear-to-br from-violet-600 to-indigo-700 rounded-2xl p-8 mb-4 text-white shadow-xl shadow-violet-500/20">
        <p className="text-sm font-medium text-violet-200 mb-1">الرصيد الحالي</p>
        <p className="text-5xl font-bold tracking-tight">{formatCurrency(register.currentBalance)}</p>
        <p className="text-sm text-violet-300 mt-2">
          {register.transactions.length} معاملة مسجلة
        </p>
      </div>

      {/* Today's sales summary */}
      <div className="flex items-center gap-3 mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
        <span className="text-lg">📅</span>
        <div className="flex-1 text-sm">
          <span className="font-semibold text-emerald-800">{todayOrders.length} بيعة اليوم</span>
          <span className="text-emerald-600 mx-2">•</span>
          <span className="text-emerald-700">{formatCurrency(todayRevenue)} إيرادات</span>
        </div>
        <Link to="/orders" className="text-xs text-emerald-700 hover:underline shrink-0">
          عرض الطلبات ←
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => setModal('deposit')}
          className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:border-emerald-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            💰
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">إضافة نقد</p>
            <p className="text-xs text-gray-500">إيداع نقد في الصندوق</p>
          </div>
        </button>

        <button
          onClick={() => setModal('withdraw')}
          className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:border-amber-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            💸
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">سحب نقد</p>
            <p className="text-xs text-gray-500">أخذ نقد من الصندوق</p>
          </div>
        </button>

        <button
          onClick={() => setModal('close_shift')}
          className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:border-red-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            🔒
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900">إغلاق الوردية</p>
            <p className="text-xs text-gray-500">تحصيل النقد وإعادة تعيين الصندوق</p>
          </div>
        </button>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">سجل المعاملات</h2>
          <Link to="/reports" className="text-xs text-violet-600 hover:underline">
            التقارير الكاملة ←
          </Link>
        </div>

        {sortedTx.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm">لا توجد معاملات بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
            {sortedTx.map((tx) => {
              const inner = (
                <div className="flex items-center gap-3">
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center text-sm
                    ${tx.type === 'sale' ? 'bg-emerald-100 text-emerald-600' : ''}
                    ${tx.type === 'deposit' ? 'bg-blue-100 text-blue-600' : ''}
                    ${tx.type === 'withdrawal' ? 'bg-amber-100 text-amber-600' : ''}
                    ${tx.type === 'shift_close' ? 'bg-red-100 text-red-600' : ''}
                  `}>
                    {tx.type === 'sale' && '💰'}
                    {tx.type === 'deposit' && '🏦'}
                    {tx.type === 'withdrawal' && '💸'}
                    {tx.type === 'shift_close' && '🔒'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {txLabels[tx.type] || tx.type}
                    </p>
                    {tx.note && <p className="text-xs text-gray-500">{tx.note}</p>}
                    <p className="text-xs text-gray-400">{formatDateTime(tx.date)}</p>
                  </div>
                </div>
              );

              // Sale transactions with an orderId get a clickable receipt link
              if (tx.type === 'sale' && tx.orderId) {
                return (
                  <Link
                    key={tx.id}
                    to={`/receipt/${tx.orderId}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-violet-50/50 transition-colors group"
                    title="عرض الفاتورة"
                  >
                    {inner}
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold tabular-nums ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </span>
                      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </div>
                  </Link>
                );
              }

              return (
                <div key={tx.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  {inner}
                  <span className={`text-sm font-bold tabular-nums ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Cash Modal */}
      <Modal open={modal === 'deposit'} onClose={resetModal} title="إضافة نقد">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ل.س)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظة</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="مثلاً: رصيد افتتاحي، إيداع نقدي..."
            />
          </div>
          <div className="flex gap-3 justify-start pt-2">
            <button onClick={resetModal} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              إلغاء
            </button>
            <button
              onClick={handleDeposit}
              disabled={!amount}
              className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              إضافة نقد
            </button>
          </div>
        </div>
      </Modal>

      {/* Withdraw Modal */}
      <Modal open={modal === 'withdraw'} onClose={resetModal} title="سحب نقد">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ل.س)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السبب</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="مثلاً: فكة لزبون، مصروف نثري..."
            />
          </div>
          <div className="flex gap-3 justify-start pt-2">
            <button onClick={resetModal} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              إلغاء
            </button>
            <button
              onClick={handleWithdraw}
              disabled={!amount}
              className="px-6 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              سحب
            </button>
          </div>
        </div>
      </Modal>

      {/* Close Shift Confirmation */}
      <ConfirmDialog
        open={modal === 'close_shift'}
        onClose={resetModal}
        onConfirm={handleCloseShift}
        title="إغلاق الوردية"
        message={`سيتم تحصيل ${formatCurrency(register.currentBalance)} من الصندوق وإعادة تعيين الرصيد إلى 0.00 ل.س. هل تريد المتابعة؟`}
        confirmLabel="إغلاق الوردية"
        danger
      />
    </div>
  );
}
