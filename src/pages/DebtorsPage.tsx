import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { addDebtor, markDebtorPaid, deleteDebtor } from '../services/database';

function formatCurrency(n: number) {
  return n.toLocaleString('ar-SY', { minimumFractionDigits: 0 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-SY', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function DebtorsPage() {
  const { debtors } = useDatabase();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  const totalOwed = debtors
    .filter((d) => !d.paidAt)
    .reduce((sum, d) => sum + d.amount, 0);

  const visible = debtors
    .filter((d) => {
      if (filter === 'unpaid') return !d.paidAt;
      if (filter === 'paid') return !!d.paidAt;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedAmount = parseFloat(amount);
    if (!trimmedName) { setError('الاسم مطلوب'); return; }
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { setError('أدخل مبلغاً صحيحاً'); return; }
    addDebtor(trimmedName, parsedAmount, note.trim() || undefined);
    setName(''); setAmount(''); setNote(''); setError('');
  }

  function handleDelete(id: string) {
    deleteDebtor(id);
    setConfirmDelete(null);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">الديون</h1>
          <p className="text-stone-500 text-sm mt-1">سجّل أسماء المدينين والمبالغ المستحقة</p>
        </div>
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

      {/* Summary Card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
        <div>
          <p className="text-stone-500 text-sm">إجمالي الديون غير المسددة</p>
          <p className="text-3xl font-bold text-stone-900 mt-1">
            {formatCurrency(totalOwed)} <span className="text-lg font-normal text-stone-400">ل.س</span>
          </p>
        </div>
        <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center text-3xl">
          💳
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={handleAdd} className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <h2 className="text-stone-800 font-semibold text-base">إضافة مدين جديد</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-xs text-stone-500 mb-1">الاسم *</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="اسم الشخص"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs text-stone-500 mb-1">المبلغ (ل.س) *</label>
            <input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder="0"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs text-stone-500 mb-1">ملاحظة (اختياري)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="سبب الدين، إلخ."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all"
            />
          </div>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-sm"
        >
          + إضافة
        </button>
      </form>

      {/* Filter + Table */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Filter Tabs */}
        <div className="flex border-b border-stone-100 px-4">
          {(['all', 'unpaid', 'paid'] as const).map((f) => {
            const labels = { all: 'الكل', unpaid: 'غير مسدد', paid: 'مسدد' };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  filter === f
                    ? 'border-violet-500 text-violet-600'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="py-16 text-center text-stone-400">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm">لا توجد سجلات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-stone-400 text-xs border-b border-stone-100 bg-stone-50/60">
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">ملاحظة</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">تاريخ التسجيل</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {visible.map((d) => (
                  <tr key={d.id} className={`group transition-colors hover:bg-stone-50/80 ${d.paidAt ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-800 font-medium">{d.name}</span>
                        <button
                          onClick={() => navigate(`/orders?search=${encodeURIComponent(d.name)}`)}
                          title="بحث عن طلباته"
                          className="opacity-0 group-hover:opacity-100 text-xs text-violet-500 hover:text-violet-700 hover:underline transition-all"
                        >
                          طلباته ←
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-violet-700 font-mono font-semibold whitespace-nowrap">
                      {formatCurrency(d.amount)} <span className="text-stone-400 text-xs font-sans">ل.س</span>
                    </td>
                    <td className="px-4 py-3 text-stone-500 hidden sm:table-cell">{d.note || '—'}</td>
                    <td className="px-4 py-3 text-stone-400 hidden md:table-cell">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-3">
                      {d.paidAt ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full ring-1 ring-emerald-100">
                          ✓ مسدد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full ring-1 ring-amber-100">
                          ● دين
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {!d.paidAt && (
                          <button
                            onClick={() => markDebtorPaid(d.id)}
                            title="تسديد"
                            className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors border border-emerald-100"
                          >
                            تسديد ✓
                          </button>
                        )}
                        {confirmDelete === d.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(d.id)}
                              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
                            >
                              تأكيد
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-stone-400 hover:text-stone-700 px-2 py-1.5 rounded-lg transition-colors"
                            >
                              إلغاء
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(d.id)}
                            title="حذف"
                            className="text-stone-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
