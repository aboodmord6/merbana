import type { PaymentMethod, OrderType } from '../types/types';

interface PaymentMethodToggleProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  className?: string;
}

export function PaymentMethodToggle({ value, onChange, className = '' }: PaymentMethodToggleProps) {
  return (
    <div className={`border-b border-gray-100 ${className}`}>
      <p className="text-xs font-medium text-gray-500 mb-2">طريقة الدفع</p>
      <div className="flex gap-2">
        <button
          onClick={() => onChange('cash')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
            value === 'cash'
              ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          💵 نقدي
        </button>
        <button
          onClick={() => onChange('shamcash')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
            value === 'shamcash'
              ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          📱 ShamCash
        </button>
      </div>
    </div>
  );
}

interface OrderTypeToggleProps {
  value: OrderType;
  onChange: (type: OrderType) => void;
  className?: string;
}

export function OrderTypeToggle({ value, onChange, className = '' }: OrderTypeToggleProps) {
  return (
    <div className={`border-b border-gray-100 ${className}`}>
      <p className="text-xs font-medium text-gray-500 mb-2">نوع الطلب</p>
      <div className="flex gap-2">
        <button
          onClick={() => onChange('dine_in')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
            value === 'dine_in'
              ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          🍽️ صالة
        </button>
        <button
          onClick={() => onChange('takeaway')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
            value === 'takeaway'
              ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-400'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          🛍️ سفري
        </button>
      </div>
    </div>
  );
}

interface OrderNoteInputProps {
  value: string;
  onChange: (note: string) => void;
  className?: string;
}

export function OrderNoteInput({ value, onChange, className = '' }: OrderNoteInputProps) {
  return (
    <div className={`border-b border-gray-100 ${className}`}>
      <p className="text-xs font-medium text-gray-500 mb-2">ملاحظة</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        placeholder="مثلاً: بدون سكر، توصيل..."
      />
    </div>
  );
}
