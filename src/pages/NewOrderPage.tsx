import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import { useAuth } from '../hooks/useAuth';
import { addOrder } from '../services/database';
import { formatCurrency } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { PaymentMethodToggle, OrderTypeToggle, OrderNoteInput } from '../components/OrderControls';
import type { OrderItem, PaymentMethod, Product } from '../types/types';

export default function NewOrderPage() {
  const { products, categories, loading } = useDatabase();
  const { activeUser } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [successMsg, setSuccessMsg] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [orderNote, setOrderNote] = useState('');

  // Size selection state
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.categoryId === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  function handleProductClick(product: Product) {
    if (product.sizes && product.sizes.length > 0) {
      setSelectedProduct(product);
      setSizeModalOpen(true);
    } else {
      addToCart(product.id, product.name, product.price);
    }
  }

  function addToCart(productId: string, name: string, price: number, size?: string) {
    setCart((prev) => {
      // Find item with same product ID AND same size (if applicable)
      const existing = prev.find((i) => i.productId === productId && i.size === size);
      
      if (existing) {
        return prev.map((i) =>
          (i.productId === productId && i.size === size)
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
            : i
        );
      }
      return [...prev, { productId, name, price, quantity: 1, subtotal: price, size }];
    });
    setSizeModalOpen(false);
    setSelectedProduct(null);
  }

  function updateQuantity(productId: string, qty: number, size?: string) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => !(i.productId === productId && i.size === size)));
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        (i.productId === productId && i.size === size)
          ? { ...i, quantity: qty, subtotal: qty * i.price }
          : i
      )
    );
  }

  function removeItem(productId: string, size?: string) {
    setCart((prev) => prev.filter((i) => !(i.productId === productId && i.size === size)));
  }

  function handleRemoveOne(e: React.MouseEvent, productId: string) {
    e.preventDefault();
    setCart((prev) => {
      // Strategy: Remove from the last item in the cart array that matches this product ID.
      const index = prev.map(item => item.productId).lastIndexOf(productId);
      
      if (index === -1) return prev; // Not found
      
      const item = prev[index];
      
      if (item.quantity > 1) {
        // Decrement quantity
        const newCart = [...prev];
        newCart[index] = { 
          ...item, 
          quantity: item.quantity - 1, 
          subtotal: (item.quantity - 1) * item.price 
        };
        return newCart;
      } else {
        // Remove item entirely
        return prev.filter((_, i) => i !== index);
      }
    });
  }

  function placeOrder() {
    if (cart.length === 0) return;
    const order = addOrder(cart, paymentMethod, orderType, orderNote.trim() || undefined, activeUser?.id, activeUser?.name);
    setOrderNote('');
    setCart([]);
    setCartOpen(false);
    setSuccessMsg('تم تأكيد الطلب بنجاح!');
    setTimeout(() => {
      navigate(`/receipt/${order.id}`);
    }, 800);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-0">
      <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-6">طلب جديد</h1>

      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* Product Grid */}
        <div className="lg:col-span-3">
          {/* Search Bar */}
          <div className="relative mb-4">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="بحث عن المنتجات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
            />
          </div>

          {/* Category Carousel */}
          <div className="mb-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <div className="flex gap-2 min-w-max p-2">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  filterCategory === 'all'
                    ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200 scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                الكل
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    filterCategory === cat.id
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200 scale-105'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState icon="📦" title="لا توجد منتجات" description="أضف منتجات أولاً لإنشاء الطلبات" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {filteredProducts.map((product) => {
                const inCartCount = cart
                  .filter((i) => i.productId === product.id)
                  .reduce((sum, i) => sum + i.quantity, 0);
                  
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (product.trackStock && (product.stock || 0) <= 0) return;
                      handleProductClick(product);
                    }}
                    onContextMenu={(e) => handleRemoveOne(e, product.id)}
                    className={`relative p-3 sm:p-4 rounded-2xl border-2 text-right transition-all duration-200 hover:shadow-md active:scale-[0.97] ${
                      product.trackStock && (product.stock || 0) <= 0
                        ? 'border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed'
                        : inCartCount > 0
                          ? 'border-violet-400 bg-violet-50 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-violet-200'
                    }`}
                  >
                    {inCartCount > 0 && (
                      <span className="absolute -top-2 -left-2 w-6 h-6 bg-violet-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                        {inCartCount}
                      </span>
                    )}
                    {product.trackStock && (
                      <span className={`absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm ${
                        (product.stock || 0) <= 0
                          ? 'bg-red-500 text-white'
                          : (product.stock || 0) <= 5
                            ? 'bg-amber-400 text-amber-900'
                            : 'bg-emerald-400 text-emerald-900'
                      }`}>
                        {product.stock || 0}
                      </span>
                    )}
                    <p className="font-semibold text-gray-900 text-sm mb-1 truncate">{product.name}</p>
                    <p className="text-violet-600 font-bold text-xs sm:text-sm">
                      {product.sizes && product.sizes.length > 0 
                        ? 'متعدد الأحجام' 
                        : formatCurrency(product.price)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart - Desktop */}
        <div className="lg:col-span-2 hidden lg:block">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm sticky top-8">
            {/* Payment Method Toggle */}
            <PaymentMethodToggle value={paymentMethod} onChange={setPaymentMethod} className="px-5 py-3" />
            <OrderTypeToggle value={orderType} onChange={setOrderType} className="px-5 py-3" />
            <OrderNoteInput value={orderNote} onChange={setOrderNote} className="px-5 py-3" />

            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                🛒 السلة
                {cart.length > 0 && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                    {cartCount} عنصر
                  </span>
                )}
              </h2>
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <p className="text-3xl mb-2">🛒</p>
                <p>السلة فارغة</p>
                <p className="text-xs mt-1">اضغط على منتج لإضافته</p>
              </div>
            ) : (
              <div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {cart.map((item, idx) => (
                    <CartItem 
                      key={`${item.productId}-${item.size || 'std'}-${idx}`} 
                      item={item} 
                      updateQuantity={updateQuantity} 
                      removeItem={removeItem} 
                    />
                  ))}
                </div>
                <CartFooter total={total} onPlaceOrder={placeOrder} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden z-30">
          <div className="bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-4 py-3 safe-area-pb">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-between bg-linear-to-r from-violet-600 to-violet-700 text-white py-3 px-5 rounded-xl active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="bg-white/20 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold">
                  {cartCount}
                </span>
                <span className="font-semibold text-sm">عرض السلة</span>
              </div>
              <span className="font-bold">{formatCurrency(total)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-center pt-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* Payment Method Toggle - Mobile */}
            <PaymentMethodToggle value={paymentMethod} onChange={setPaymentMethod} className="px-4 py-3" />
            {/* Order Type - Mobile */}
            <OrderTypeToggle value={orderType} onChange={setOrderType} className="px-4 py-3" />
            {/* Note - Mobile */}
            <OrderNoteInput value={orderNote} onChange={setOrderNote} className="px-4 py-3" />
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                🛒 السلة
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                  {cartCount} عنصر
                </span>
              </h2>
              <button onClick={() => setCartOpen(false)} className="p-1 text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {cart.map((item, idx) => (
                <CartItem 
                  key={`${item.productId}-${item.size || 'std'}-${idx}`} 
                  item={item} 
                  updateQuantity={updateQuantity} 
                  removeItem={removeItem} 
                />
              ))}
            </div>
            <CartFooter total={total} onPlaceOrder={placeOrder} />
          </div>
        </div>
      )}
      
      {/* Size Selection Modal */}
      <Modal 
        open={sizeModalOpen && !!selectedProduct} 
        onClose={() => {
          setSizeModalOpen(false);
          setSelectedProduct(null);
        }}
        title={`اختر الحجم - ${selectedProduct?.name}`}
      >
        <div className="grid grid-cols-1 gap-2">
          {selectedProduct?.sizes?.map((size, idx) => (
            <button
              key={idx}
              onClick={() => selectedProduct && addToCart(selectedProduct.id, selectedProduct.name, size.price, size.name)}
              className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50 transition-all group"
            >
              <span className="font-medium text-gray-900 group-hover:text-violet-700">{size.name}</span>
              <span className="font-bold text-violet-600">{formatCurrency(size.price)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ── Shared sub-components ────────────────────────────── */

function CartItem({ item, updateQuantity, removeItem }: {
  item: OrderItem;
  updateQuantity: (id: string, qty: number, size?: string) => void;
  removeItem: (id: string, size?: string) => void;
}) {
  return (
    <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {item.name}
          {item.size && <span className="mr-1 text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md">{item.size}</span>}
        </p>
        <p className="text-xs text-gray-500">{formatCurrency(item.price)} للواحدة</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => updateQuantity(item.productId, item.quantity - 1, item.size)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm font-bold"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.productId, item.quantity + 1, item.size)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm font-bold"
        >
          +
        </button>
      </div>
      <p className="text-sm font-semibold text-gray-900 w-20 text-left">{formatCurrency(item.subtotal)}</p>
      <button
        onClick={() => removeItem(item.productId, item.size)}
        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function CartFooter({ total, onPlaceOrder }: { total: number; onPlaceOrder: () => void }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-t border-gray-100 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600">المجموع</span>
        <span className="text-xl font-bold text-gray-900">{formatCurrency(total)}</span>
      </div>
      <button
        onClick={onPlaceOrder}
        className="w-full py-3 bg-linear-to-r from-violet-600 to-violet-700 text-white font-semibold rounded-xl hover:from-violet-700 hover:to-violet-800 active:scale-[0.98] transition-all shadow-lg shadow-violet-200"
      >
        تأكيد الطلب
      </button>
    </div>
  );
}
