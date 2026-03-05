import { useEffect, useRef, useState } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { exportDatabase, importDatabase, updateSettings } from '../services/database';
import type { PrintBehavior, PrinterSettings } from '../types/types';

const defaultPrinterSettings: PrinterSettings = {
  defaultPrinter: '',
  kitchenPrinter: '',
  defaultOptions: {},
  printBehavior: 'customer_only',
  autoPrint: false,
  customerCopies: 1,
  kitchenCopies: 1,
};

type PrinterInfo = {
  name: string;
  info?: string;
  location?: string;
  state?: number;
  isDefault?: boolean;
};

type CUPSOptionChoice = {
  value: string;
  label: string;
};

type CUPSOption = {
  name: string;
  label: string;
  group: string;
  default: string;
  choices: CUPSOptionChoice[];
  source: 'ppd' | 'attributes';
};

export default function SettingsPage() {
  const { settings } = useDatabase();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [cupsAvailable, setCupsAvailable] = useState(true);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [availableOptions, setAvailableOptions] = useState<CUPSOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [printerError, setPrinterError] = useState('');
  const [printerForm, setPrinterForm] = useState<PrinterSettings>(defaultPrinterSettings);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPrinterForm(settings.printerSettings || defaultPrinterSettings);
  }, [settings.printerSettings]);

  async function loadPrinters() {
    setLoadingPrinters(true);
    setPrinterError('');
    try {
      const response = await fetch('/api/printers', { cache: 'no-store' });
      const data = await response.json();
      const list = Array.isArray(data.printers) ? data.printers : [];

      setPrinters(list);
      setCupsAvailable(Boolean(data.ok));

      if (!data.ok && data.error) {
        setPrinterError(String(data.error));
      }

      if (data.ok && list.length > 0) {
        const selected =
          printerForm.defaultPrinter ||
          list.find((p: PrinterInfo) => p.isDefault)?.name ||
          list[0].name;
        if (selected && selected !== printerForm.defaultPrinter) {
          setPrinterForm((prev) => ({ ...prev, defaultPrinter: selected }));
        }
      }
    } catch (error) {
      setCupsAvailable(false);
      setPrinters([]);
      setPrinterError(error instanceof Error ? error.message : 'تعذر تحميل الطابعات');
    } finally {
      setLoadingPrinters(false);
    }
  }

  useEffect(() => {
    loadPrinters();
  }, []);

  async function loadPrinterOptions(printerName: string) {
    if (!printerName) {
      setAvailableOptions([]);
      return;
    }

    setLoadingOptions(true);
    try {
      const response = await fetch(`/api/printer-options?printer=${encodeURIComponent(printerName)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      const options = Array.isArray(data.options) ? data.options : [];
      setAvailableOptions(options);

      if (data.ok) {
        // Merge CUPS defaults without overwriting already saved user choices.
        setPrinterForm((prev) => {
          const merged = { ...prev.defaultOptions };
          for (const option of options) {
            if (!merged[option.name] && option.default) {
              merged[option.name] = option.default;
            }
          }
          return { ...prev, defaultOptions: merged };
        });
      }
    } catch {
      setAvailableOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  }

  useEffect(() => {
    void loadPrinterOptions(printerForm.defaultPrinter);
  }, [printerForm.defaultPrinter]);

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

  function setPrintBehavior(value: string) {
    setPrinterForm((prev) => ({
      ...prev,
      printBehavior: value as PrintBehavior,
    }));
  }

  async function handleSavePrinterSettings() {
    setSavingPrinter(true);

    try {
      const cleaned: PrinterSettings = {
        ...printerForm,
        customerCopies: Math.max(1, Number(printerForm.customerCopies) || 1),
        kitchenCopies: Math.max(1, Number(printerForm.kitchenCopies) || 1),
        defaultPrinter: printerForm.defaultPrinter.trim(),
        kitchenPrinter: printerForm.kitchenPrinter?.trim() || '',
        defaultOptions: Object.fromEntries(
          Object.entries(printerForm.defaultOptions || {}).filter(([, value]) => String(value).trim() !== ''),
        ),
      };

      updateSettings({ printerSettings: cleaned });
      setMessage({ type: 'success', text: 'تم حفظ إعدادات الطباعة بنجاح.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'فشل حفظ إعدادات الطباعة.',
      });
    } finally {
      setSavingPrinter(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">الإعدادات</h1>
      <p className="text-sm text-gray-500 mb-8">إدارة قاعدة البيانات والطباعة المباشرة عبر CUPS.</p>

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
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {message.text}
        </div>
      )}

      <div className="grid gap-6 max-w-xl">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-lg">🖨️</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900 mb-1">إعدادات الطابعة</h2>
                <button
                  onClick={loadPrinters}
                  disabled={loadingPrinters}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {loadingPrinters ? 'جاري التحديث...' : 'تحديث الطابعات'}
                </button>
              </div>

              {!cupsAvailable && (
                <div className="mb-4 mt-2 p-3 text-xs rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                  CUPS غير متاح حالياً. تأكد من تثبيت pycups وتشغيل CUPS على Linux.
                  {printerError ? <div className="mt-1">{printerError}</div> : null}
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">الطابعة الافتراضية</label>
                  <select
                    value={printerForm.defaultPrinter}
                    onChange={(e) => setPrinterForm((prev) => ({ ...prev, defaultPrinter: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="">اختر طابعة...</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name}{printer.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">طابعة المطبخ (اختياري)</label>
                  <select
                    value={printerForm.kitchenPrinter || ''}
                    onChange={(e) => setPrinterForm((prev) => ({ ...prev, kitchenPrinter: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="">نفس الطابعة الافتراضية</option>
                    {printers.map((printer) => (
                      <option key={`k-${printer.name}`} value={printer.name}>
                        {printer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">خيارات الطباعة من CUPS</label>
                  {loadingOptions ? (
                    <div className="text-xs text-gray-500">جاري تحميل الخيارات من CUPS...</div>
                  ) : availableOptions.length === 0 ? (
                    <div className="text-xs text-gray-500">لا توجد خيارات متاحة لهذه الطابعة.</div>
                  ) : (
                    <div className="grid gap-2 max-h-64 overflow-auto p-3 border border-gray-100 rounded-xl bg-gray-50/50">
                      {availableOptions.map((option) => (
                        <div key={option.name} className="grid grid-cols-2 gap-2 items-center">
                          <label className="text-xs text-gray-700" title={option.group}>
                            {option.label}
                          </label>
                          <select
                            value={printerForm.defaultOptions[option.name] || option.default || ''}
                            onChange={(e) => setPrinterForm((prev) => ({
                              ...prev,
                              defaultOptions: {
                                ...prev.defaultOptions,
                                [option.name]: e.target.value,
                              },
                            }))}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                          >
                            <option value="">(CUPS default)</option>
                            {option.choices.map((choice) => (
                              <option key={`${option.name}:${choice.value}`} value={choice.value}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">نسخ العميل</label>
                    <input
                      type="number"
                      min={1}
                      value={printerForm.customerCopies}
                      onChange={(e) => setPrinterForm((prev) => ({ ...prev, customerCopies: Number(e.target.value) || 1 }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">نسخ المطبخ</label>
                    <input
                      type="number"
                      min={1}
                      value={printerForm.kitchenCopies}
                      onChange={(e) => setPrinterForm((prev) => ({ ...prev, kitchenCopies: Number(e.target.value) || 1 }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">سلوك الطباعة</label>
                  <select
                    value={printerForm.printBehavior}
                    onChange={(e) => setPrintBehavior(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="customer_only">فاتورة العميل فقط</option>
                    <option value="kitchen_only">نسخة المطبخ فقط</option>
                    <option value="both_separate">نسختان منفصلتان (عميل + مطبخ)</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={printerForm.autoPrint}
                    onChange={(e) => setPrinterForm((prev) => ({ ...prev, autoPrint: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  طباعة تلقائية بعد إنشاء الطلب
                </label>

                <button
                  onClick={handleSavePrinterSettings}
                  disabled={savingPrinter}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {savingPrinter ? 'جاري الحفظ...' : 'حفظ إعدادات الطباعة'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
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
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
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
