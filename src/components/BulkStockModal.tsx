import { useState } from 'react';
import type { Product, Category } from '../types/types';
import Modal from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  products: Product[];
  categories: Category[];
  onApply: (productIds: string[], quantity: number) => void;
}

export default function BulkStockModal({ open, onClose, products, categories, onApply }: Props) {
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState('');

  // Only products that have trackStock enabled
  const trackableProducts = products.filter(p => p.trackStock);

  // Products in selected category
  const categoryProducts = selectedCatId
    ? trackableProducts.filter(p => p.categoryId === selectedCatId)
    : trackableProducts;

  // Categories that have at least one trackable product
  const availableCategories = categories.filter(cat =>
    trackableProducts.some(p => p.categoryId === cat.id)
  );

  function selectCategory(catId: string) {
    setSelectedCatId(catId);
    setExcluded(new Set());
  }

  function toggleExclude(productId: string) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function handleApply() {
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) return;
    const ids = categoryProducts
      .filter(p => !excluded.has(p.id))
      .map(p => p.id);
    if (ids.length === 0) return;
    onApply(ids, qty);
    handleClose();
  }

  function handleClose() {
    setSelectedCatId('');
    setExcluded(new Set());
    setQuantity('');
    onClose();
  }

  const selectedCount = categoryProducts.filter(p => !excluded.has(p.id)).length;

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="تحديث المخزون الجماعي">
      <div className="space-y-5">

        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">اختر الفئة</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => selectCategory('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCatId === ''
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              الكل ({trackableProducts.length})
            </button>
            {availableCategories.map(cat => {
              const count = trackableProducts.filter(p => p.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedCatId === cat.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product List with Checkboxes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              المنتجات ({selectedCount} محدد)
            </label>
            {categoryProducts.length > 0 && (
              <button
                onClick={() => {
                  if (excluded.size === 0) {
                    setExcluded(new Set(categoryProducts.map(p => p.id)));
                  } else {
                    setExcluded(new Set());
                  }
                }}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium"
              >
                {excluded.size === 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
            {categoryProducts.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                لا توجد منتجات متتبعة للمخزون
              </div>
            ) : (
              categoryProducts.map(product => {
                const isExcluded = excluded.has(product.id);
                return (
                  <label
                    key={product.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isExcluded ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => toggleExclude(product.id)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="flex-1 text-sm text-gray-800">{product.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      (product.stock || 0) <= 0
                        ? 'bg-red-100 text-red-700'
                        : (product.stock || 0) <= 5
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {product.stock || 0}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Quantity Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">الكمية الجديدة</label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="مثال: 20"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleApply}
            disabled={selectedCount === 0 || !quantity}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            تطبيق على {selectedCount} منتج
          </button>
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}
