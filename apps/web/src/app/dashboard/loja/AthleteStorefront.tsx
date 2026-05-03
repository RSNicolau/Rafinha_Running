'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  description?: string;
  category: string;
  priceInCents: number;
  originalPriceInCents: number;
  finalPriceInCents: number;
  athleteDiscountPercent: number;
  hasAthleteDiscount: boolean;
  images: string[];
  sizes: string[];
  colors: string[];
  totalStock: number;
  reserved: number;
  featured: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  CAMISA: 'Camiseta', VISEIRA: 'Viseira', BONE: 'Boné', CASACO: 'Casaco',
  CORTA_VENTO: 'Corta-vento', MEIA: 'Meia', CALCA: 'Calça', SHORTS: 'Shorts',
  ACESSORIO: 'Acessório', OUTRO: 'Outro',
};

function formatPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function AthleteStorefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [selected, setSelected] = useState<Product | null>(null);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.get('/store/athlete/products')
      .then(({ data }) => setProducts(data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p =>
    (category === 'ALL' || p.category === category) &&
    ((p.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
     (p.description ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category)))];

  const placeOrder = async () => {
    if (!selected) return;
    setOrdering(true);
    try {
      const { data } = await api.post('/store/public/orders', {
        productId: selected.id,
        customerName: 'Aluno',
        customerEmail: 'aluno@app.com',
        size: size || undefined,
        color: color || undefined,
        quantity,
      });
      setOrderSuccess(data.id);
      setSelected(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao criar pedido');
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Loja</h1>
        <p className="text-sm text-gray-500 mt-1">Produtos exclusivos com desconto de aluno</p>
      </div>

      {orderSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900">Pedido criado com sucesso!</p>
            <p className="text-xs text-emerald-700 mt-0.5">Acompanhe o status em "Meus Pedidos". ID: {orderSuccess.slice(0, 8)}</p>
          </div>
          <button onClick={() => setOrderSuccess(null)} className="text-emerald-600 text-xl">×</button>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar produto..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:border-red-400"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:border-red-400"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'ALL' ? 'Todas categorias' : CATEGORY_LABEL[c] ?? c}</option>
          ))}
        </select>
      </div>

      {/* Products grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-3">🛍️</div>
          <p className="text-gray-500 font-medium">Nenhum produto disponível no momento</p>
          <p className="text-xs text-gray-400 mt-1">Volte em breve para conferir as novidades!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const stockLeft = p.totalStock - p.reserved;
            const soldOut = stockLeft <= 0;
            return (
              <div
                key={p.id}
                onClick={() => !soldOut && setSelected(p)}
                className={`bg-white rounded-2xl overflow-hidden border border-gray-100 transition-all ${soldOut ? 'opacity-60' : 'hover:shadow-lg hover:border-red-200 cursor-pointer'}`}
              >
                {/* Image */}
                <div className="aspect-square bg-gray-50 relative overflow-hidden">
                  {p.images && p.images[0] ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl">🛍️</div>
                  )}
                  {p.featured && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold uppercase tracking-wider">
                      ⭐ Destaque
                    </div>
                  )}
                  {p.hasAthleteDiscount && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                      -{p.athleteDiscountPercent}% ALUNO
                    </div>
                  )}
                  {soldOut && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="px-3 py-1 rounded-full bg-white text-gray-900 text-sm font-bold">Esgotado</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{CATEGORY_LABEL[p.category] ?? p.category}</p>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{p.name}</h3>
                  {p.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{p.description}</p>}

                  <div className="flex items-baseline gap-2">
                    {p.hasAthleteDiscount ? (
                      <>
                        <span className="text-lg font-bold text-emerald-600">{formatPrice(p.finalPriceInCents)}</span>
                        <span className="text-xs text-gray-400 line-through">{formatPrice(p.originalPriceInCents)}</span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-gray-900">{formatPrice(p.finalPriceInCents)}</span>
                    )}
                  </div>
                  {!soldOut && stockLeft <= 5 && (
                    <p className="text-[11px] text-orange-500 mt-1.5 font-medium">Apenas {stockLeft} restantes</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/2 aspect-square bg-gray-50">
                {selected.images && selected.images[0] ? (
                  <img src={selected.images[0]} alt={selected.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl">🛍️</div>
                )}
              </div>
              <div className="md:w-1/2 p-6 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{CATEGORY_LABEL[selected.category] ?? selected.category}</p>
                    <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                </div>

                {selected.description && <p className="text-sm text-gray-600 mb-4">{selected.description}</p>}

                <div className="mb-4 p-3 rounded-xl bg-gray-50">
                  <div className="flex items-baseline gap-2">
                    {selected.hasAthleteDiscount ? (
                      <>
                        <span className="text-2xl font-bold text-emerald-600">{formatPrice(selected.finalPriceInCents)}</span>
                        <span className="text-sm text-gray-400 line-through">{formatPrice(selected.originalPriceInCents)}</span>
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">-{selected.athleteDiscountPercent}% aluno</span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold text-gray-900">{formatPrice(selected.finalPriceInCents)}</span>
                    )}
                  </div>
                </div>

                {selected.sizes.length > 0 && (
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tamanho</label>
                    <div className="flex flex-wrap gap-2">
                      {selected.sizes.map(s => (
                        <button
                          key={s}
                          onClick={() => setSize(s)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition ${size === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                )}

                {selected.colors.length > 0 && (
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Cor</label>
                    <div className="flex flex-wrap gap-2">
                      {selected.colors.map(c => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition ${color === c ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >{c}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Quantidade</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50">−</button>
                    <span className="w-12 text-center font-semibold">{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50">+</button>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-3">Total: <span className="font-bold text-gray-900 text-base">{formatPrice(selected.finalPriceInCents * quantity)}</span></p>
                  <button
                    onClick={placeOrder}
                    disabled={ordering || (selected.sizes.length > 0 && !size)}
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {ordering && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {selected.sizes.length > 0 && !size ? 'Selecione um tamanho' : 'Confirmar pedido'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
