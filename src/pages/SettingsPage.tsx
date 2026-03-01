import { useState, useRef } from 'react';
import { exportDatabase, importDatabase } from '../services/database';

export default function SettingsPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    const result = await importDatabase(file);

    if (result.success) {
      setMessage({ type: 'success', text: 'تم استيراد قاعدة البيانات بنجاح!' });
    } else {
      setMessage({ type: 'error', text: result.error || 'فشل الاستيراد.' });
    }

    setImporting(false);
    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleExport() {
    exportDatabase();
    setMessage({ type: 'success', text: 'تم تصدير قاعدة البيانات! تحقق من التنزيلات.' });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">الإعدادات</h1>
      <p className="text-sm text-gray-500 mb-8">إدارة قاعدة البيانات — تصدير للنسخ الاحتياطي أو استيراد للاستعادة.</p>

      {/* Toast */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {message.text}
        </div>
      )}

      <div className="grid gap-6 max-w-xl">
        {/* Export */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-lg">📥</span>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 mb-1">تصدير قاعدة البيانات</h2>
              <p className="text-sm text-gray-500 mb-4">
                تنزيل قاعدة البيانات الحالية كملف JSON. استخدمها كنسخة احتياطية أو لنقل البيانات.
              </p>
              <button
                onClick={handleExport}
                className="px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors"
              >
                تنزيل db.json
              </button>
            </div>
          </div>
        </div>

        {/* Import */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-lg">📤</span>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 mb-1">استيراد قاعدة البيانات</h2>
              <p className="text-sm text-gray-500 mb-4">
                رفع ملف JSON لاستبدال قاعدة البيانات الحالية. يجب أن يحتوي الملف على <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">products</code> و <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">orders</code>.
              </p>
              <label className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl cursor-pointer transition-colors ${
                importing
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    جاري الاستيراد...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    اختر ملف
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  disabled={importing}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
