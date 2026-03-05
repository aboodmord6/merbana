import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { orders, settings, loading } = useDatabase();
  const receiptRef = useRef<HTMLDivElement>(null);
  const autoPrintedRef = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [printMessage, setPrintMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const order = orders.find((o) => o.id === id);

  // Find adjacent orders for prev/next navigation
  const sorted = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const currentIdx = sorted.findIndex(o => o.id === id);
  const prevOrder = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;
  const nextOrder = currentIdx > 0 ? sorted[currentIdx - 1] : null;

  function wrapPrintableHtml(content: string, title: string) {
    return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; color: #000; }
      .receipt { width: 72mm; margin: 0 auto; padding: 8px; }
      .heading { text-align: center; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { font-size: 12px; padding: 3px 0; text-align: right; }
      .total { margin-top: 8px; font-size: 14px; font-weight: 700; }
      .muted { font-size: 11px; color: #333; }
    </style>
  </head>
  <body>
    <div class="receipt">${content}</div>
  </body>
</html>`;
  }

  function buildKitchenHtml() {
    if (!order) return '';
    const rows = order.items
      .map((item) => `<tr><td>${item.name}${item.size ? ` (${item.size})` : ''}</td><td style="text-align:center">x${item.quantity}</td></tr>`)
      .join('');

    return wrapPrintableHtml(
      `
      <div class="heading">نسخة المطبخ</div>
      <div class="muted">طلب #${String(order.orderNumber ?? '').padStart(3, '0')}</div>
      <div class="muted">${formatDateTime(order.date)}</div>
      <table>
        <thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${order.note ? `<div class="muted" style="margin-top:8px"><strong>ملاحظة:</strong> ${order.note}</div>` : ''}
      `,
      `Kitchen Receipt #${order.orderNumber}`,
    );
  }

  function buildCustomerHtml() {
    const receiptEl = receiptRef.current;
    if (!receiptEl) return '';
    return wrapPrintableHtml(receiptEl.innerHTML, `Customer Receipt #${order?.orderNumber ?? ''}`);
  }

  async function sendPrintJob(params: {
    printer: string;
    copies: number;
    htmlDocs: string[];
    title: string;
  }) {
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printer: params.printer,
        copies: params.copies,
        htmlDocs: params.htmlDocs,
        options: settings.printerSettings.defaultOptions,
        title: params.title,
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || 'فشل إرسال الطباعة');
    }
  }

  async function handleDirectPrint() {
    if (!order) return;

    const printerSettings = settings.printerSettings;
    if (!printerSettings.defaultPrinter) {
      setPrintMessage({ type: 'error', text: 'لم يتم اختيار طابعة افتراضية من صفحة الإعدادات.' });
      return;
    }

    setPrinting(true);
    setPrintMessage(null);

    try {
      const customerHtml = buildCustomerHtml();
      const kitchenHtml = buildKitchenHtml();
      const kitchenPrinter = printerSettings.kitchenPrinter || printerSettings.defaultPrinter;

      if (printerSettings.printBehavior === 'customer_only') {
        await sendPrintJob({
          printer: printerSettings.defaultPrinter,
          copies: printerSettings.customerCopies,
          htmlDocs: [customerHtml],
          title: `Customer Receipt #${order.orderNumber}`,
        });
      } else if (printerSettings.printBehavior === 'kitchen_only') {
        await sendPrintJob({
          printer: kitchenPrinter,
          copies: printerSettings.kitchenCopies,
          htmlDocs: [kitchenHtml],
          title: `Kitchen Receipt #${order.orderNumber}`,
        });
      } else {
        await sendPrintJob({
          printer: printerSettings.defaultPrinter,
          copies: printerSettings.customerCopies,
          htmlDocs: [customerHtml],
          title: `Customer Receipt #${order.orderNumber}`,
        });
        await sendPrintJob({
          printer: kitchenPrinter,
          copies: printerSettings.kitchenCopies,
          htmlDocs: [kitchenHtml],
          title: `Kitchen Receipt #${order.orderNumber}`,
        });
      }

      setPrintMessage({ type: 'success', text: 'تم إرسال مهمة الطباعة إلى CUPS بنجاح.' });
    } catch (error) {
      setPrintMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'فشل الطباعة المباشرة. يمكنك استخدام طباعة المتصفح.',
      });
    } finally {
      setPrinting(false);
    }
  }

  useEffect(() => {
    if (!order || autoPrintedRef.current) return;
    if (settings.printerSettings.autoPrint) {
      autoPrintedRef.current = true;
      void handleDirectPrint();
    }
  }, [order, settings.printerSettings.autoPrint]);

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
    <div className="receipt-print-root min-h-screen bg-gray-50 p-6 flex flex-col items-center justify-center print:min-h-0 print:p-0 print:m-0 print:block">
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
            onClick={handleDirectPrint}
            disabled={printing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z" />
            </svg>
            {printing ? 'جاري الإرسال...' : 'طباعة مباشرة'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            طباعة المتصفح
          </button>
        </div>

        {printMessage && (
          <div className={`mb-3 text-xs px-3 py-2 rounded-lg print:hidden ${
            printMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {printMessage.text}
          </div>
        )}

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
        <div ref={receiptRef} className="bg-white rounded-2xl shadow-sm border border-black max-w-md mx-auto print:shadow-none print:border-none print:max-w-full print:rounded-none print:mx-0">
          <div className="px-8 py-6 text-center border-b border-dashed border-black">
            <h1 className="text-lg font-bold text-black">{settings.companyName}</h1>
            <p className="text-xl font-bold text-black mt-2">طلب #{String(order.orderNumber ?? '–').padStart(3, '0')}</p>
            <p className="text-xs font-bold text-black mt-1">{formatDateTime(order.date)}</p>
            {order.paymentMethod && (
              <span className="inline-block mt-2 text-xs font-bold px-3 py-1 border border-black text-black bg-white">
                {order.paymentMethod === 'shamcash' ? 'ShamCash' : 'نقدي'}
              </span>
            )}
            {order.orderType && (
              <span className="inline-block mt-2 mr-2 text-xs font-bold px-3 py-1 border border-black text-black bg-white">
                {order.orderType === 'dine_in' ? 'صالة' : 'سفري'}
              </span>
            )}
          </div>

          <div className="px-8 py-4 border-b border-dashed border-black">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-black text-xs border-b border-black">
                  <th className="text-right pb-2 font-bold">الصنف</th>
                  <th className="text-center pb-2 font-bold border-l border-black">الكمية</th>
                  <th className="text-center pb-2 font-bold border-l border-black">السعر</th>
                  <th className="text-center pb-2 font-bold">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {order.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 font-bold text-black">{item.name}{item.size && <span className="text-xs font-bold mr-1">({item.size})</span>}</td>
                    <td className="py-2 text-center font-bold text-black border-l border-black">{item.quantity}</td>
                    <td className="py-2 text-center font-bold text-black border-l border-black">{item.price}</td>
                    <td className="py-2 text-center font-bold text-black">{item.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.note && (
              <div className="mt-4 pt-4 border-t border-dashed border-black">
                <p className="text-xs font-bold text-black mb-1">ملاحظة</p>
                <p className="text-sm font-bold text-black">{order.note}</p>
              </div>
            )}
          </div>

          <div className="px-8 py-4">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-black">الإجمالي</span>
              <span className="text-xl font-bold text-black">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="px-8 py-4 text-center border-t border-dashed border-black">
            <p className="text-xs font-bold text-black">شكراً لتعاملكم معنا!</p>
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
