'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import AthleteStorefront from './AthleteStorefront';

const RED   = '#CC1F1A';
const WHITE = '#FFFFFF';
const DARK  = '#18181B';
const GRAY  = '#71717A';
const LIGHT = '#E4E4E7';
const PAGE  = '#F4F4F5';

type Product = {
  id: string;
  name: string;
  description?: string;
  category: string;
  priceInCents: number;
  images: string[];
  sizes: string[];
  colors: string[];
  totalStock: number;
  reserved: number;
  active: boolean;
  featured: boolean;
  _count?: { orders: number };
};

type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  size?: string;
  color?: string;
  quantity: number;
  totalInCents: number;
  status: string;
  shippingAddress?: string;
  notes?: string;
  createdAt: string;
  product: { name: string; category: string; priceInCents: number };
};

type Stats = { activeProducts: number; totalOrders: number; revenueInCents: number };

const CATEGORY_OPTIONS = [
  { value: 'CAMISA', label: 'Camiseta' },
  { value: 'VISEIRA', label: 'Viseira' },
  { value: 'BONE', label: 'Boné' },
  { value: 'CASACO', label: 'Casaco' },
  { value: 'CORTA_VENTO', label: 'Corta-vento' },
  { value: 'MEIA', label: 'Meia' },
  { value: 'CALCA', label: 'Calça' },
  { value: 'SHORTS', label: 'Shorts' },
  { value: 'ACESSORIO', label: 'Acessório' },
  { value: 'OUTRO', label: 'Outro' },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING_PAYMENT: { label: 'Aguard. Pagto.', color: '#D97706' },
  PAID:            { label: 'Pago', color: '#16A34A' },
  CONFIRMED:       { label: 'Confirmado', color: '#2563EB' },
  PROCESSING:      { label: 'Processando', color: '#7C3AED' },
  SHIPPED:         { label: 'Enviado', color: '#0891B2' },
  DELIVERED:       { label: 'Entregue', color: '#16A34A' },
  CANCELLED:       { label: 'Cancelado', color: '#DC2626' },
  REFUNDED:        { label: 'Estornado', color: '#6B7280' },
};

const NEXT_STATUS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID:            ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:       ['PROCESSING', 'CANCELLED'],
  PROCESSING:      ['SHIPPED', 'CANCELLED'],
  SHIPPED:         ['DELIVERED', 'CANCELLED'],
  DELIVERED:       [],
  CANCELLED:       [],
  REFUNDED:        [],
};

function fmtPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

type Tab = 'produtos' | 'pedidos' | 'cupons';

type StoreCoupon = {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED' | 'COURTESY';
  value: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
};
type FormData = Partial<{
  name: string; description: string; category: string; priceInCents: number;
  totalStock: number; sizes: string; colors: string; featured: boolean;
}>;

export default function DashboardLojaPage() {
  const { user } = useAuthStore();
  const isCoachOrAdmin = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Athletes see the storefront (vitrine) view
  if (user && !isCoachOrAdmin) {
    return <AthleteStorefront />;
  }

  return <CoachLojaManagement />;
}

function CoachLojaManagement() {
  const [tab, setTab] = useState<Tab>('produtos');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [saving, setSaving] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [coupons, setCoupons] = useState<StoreCoupon[]>([]);
  const [couponForm, setCouponForm] = useState({ code: '', type: 'PERCENT' as StoreCoupon['type'], value: '', maxUses: '', expiresAt: '' });
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [pRes, oRes, sRes, cRes] = await Promise.allSettled([
        api.get('/v1/store/products'),
        api.get('/v1/store/orders'),
        api.get('/v1/store/stats'),
        api.get('/v1/store/coupons'),
      ]);
      if (pRes.status === 'fulfilled') setProducts(pRes.value.data);
      if (oRes.status === 'fulfilled') setOrders(oRes.value.data);
      if (sRes.status === 'fulfilled') setStats(sRes.value.data);
      if (cRes.status === 'fulfilled') setCoupons(cRes.value.data);
    } catch {
      // handled individually above
    } finally {
      setLoading(false);
    }
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    setSavingCoupon(true);
    try {
      await api.post('/v1/store/coupons', {
        code: couponForm.code,
        type: couponForm.type,
        value: couponForm.type !== 'COURTESY' ? parseFloat(couponForm.value) : 0,
        maxUses: couponForm.maxUses ? parseInt(couponForm.maxUses) : undefined,
        expiresAt: couponForm.expiresAt || undefined,
      });
      setCouponForm({ code: '', type: 'PERCENT', value: '', maxUses: '', expiresAt: '' });
      setShowCouponForm(false);
      const { data } = await api.get('/v1/store/coupons');
      setCoupons(data);
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Erro ao criar cupom');
    } finally {
      setSavingCoupon(false);
    }
  }

  function formatCouponDiscount(c: StoreCoupon) {
    if (c.type === 'COURTESY') return '100% (cortesia)';
    if (c.type === 'PERCENT') return `${c.value}%`;
    return `R$ ${(c.value / 100).toFixed(2)}`;
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditProduct(null);
    setFormData({ category: 'CAMISA', totalStock: 10, featured: false });
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setFormData({
      name: p.name,
      description: p.description,
      category: p.category,
      priceInCents: p.priceInCents,
      totalStock: p.totalStock,
      sizes: p.sizes.join(', '),
      colors: p.colors.join(', '),
      featured: p.featured,
    });
    setShowForm(true);
  }

  async function saveProduct() {
    if (!formData.name || !formData.priceInCents) return;
    setSaving(true);
    const body = {
      name: formData.name,
      description: formData.description,
      category: formData.category,
      priceInCents: Number(formData.priceInCents),
      totalStock: Number(formData.totalStock ?? 0),
      sizes: (formData.sizes ?? '').split(',').map(s => s.trim()).filter(Boolean),
      colors: (formData.colors ?? '').split(',').map(s => s.trim()).filter(Boolean),
      featured: formData.featured ?? false,
    };
    try {
      if (editProduct) {
        await api.put(`/v1/store/products/${editProduct.id}`, body);
      } else {
        await api.post('/v1/store/products', body);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Erro ao salvar produto');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    await api.put(`/v1/store/products/${p.id}`, { active: !p.active }).catch(() => null);
    load();
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`Deletar "${p.name}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/v1/store/products/${p.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Erro ao deletar produto');
    }
  }

  async function updateOrder(orderId: string, status: string) {
    await api.put(`/v1/store/orders/${orderId}/status`, { status }).catch(() => null);
    load();
  }

  const filteredOrders = orders.filter(o =>
    !orderFilter || o.status === orderFilter,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" style={{ color: GRAY }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
          <p>Carregando loja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto" style={{ background: PAGE, minHeight: '100vh' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black" style={{ color: DARK }}>Loja Virtual</h1>
        <p className="text-sm" style={{ color: GRAY }}>Gerencie produtos e pedidos</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Produtos ativos', value: stats.activeProducts },
            { label: 'Total de pedidos', value: stats.totalOrders },
            { label: 'Receita', value: fmtPrice(stats.revenueInCents) },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border p-4 text-center"
              style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="font-black text-lg" style={{ color: RED }}>{s.value}</p>
              <p className="text-xs" style={{ color: GRAY }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: LIGHT }}>
        {(['produtos', 'pedidos', 'cupons'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-xl text-sm font-black uppercase tracking-widest capitalize transition"
            style={{
              background: tab === t ? WHITE : 'transparent',
              color: tab === t ? RED : GRAY,
            }}>
            {t === 'cupons' ? '🎟️' : ''}{t}
          </button>
        ))}
      </div>

      {/* Produtos tab */}
      {tab === 'produtos' && (
        <>
          <button onClick={openNew}
            className="mb-4 w-full py-3 rounded-2xl text-white text-sm font-black uppercase tracking-widest"
            style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
            + Novo Produto
          </button>

          {products.length === 0 && (
            <div className="text-center py-12 rounded-2xl border"
              style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="text-4xl mb-2">🛍️</p>
              <p className="font-semibold" style={{ color: DARK }}>Nenhum produto cadastrado</p>
              <p className="text-sm" style={{ color: GRAY }}>Clique em "Novo Produto" para começar</p>
            </div>
          )}

          <div className="space-y-3">
            {products.map(p => (
              <div key={p.id} className="rounded-2xl border overflow-hidden"
                style={{ background: WHITE, borderColor: LIGHT, opacity: p.active ? 1 : 0.65 }}>
                <div className="flex gap-3 p-4">
                  {/* Product image */}
                  {p.images && p.images.length > 0 ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-20 h-20 rounded-xl object-cover shrink-0"
                      style={{ border: `1px solid ${LIGHT}` }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl shrink-0 flex items-center justify-center text-3xl"
                      style={{ background: PAGE, border: `1px solid ${LIGHT}` }}>
                      🛍️
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black" style={{ color: DARK }}>{p.name}</p>
                      {p.featured && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-black uppercase"
                          style={{ background: RED, color: WHITE }}>Destaque</span>
                      )}
                      {!p.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-black uppercase"
                          style={{ background: LIGHT, color: GRAY }}>Inativo</span>
                      )}
                    </div>
                    <p className="text-sm font-bold mt-0.5" style={{ color: RED }}>{fmtPrice(p.priceInCents)}</p>
                    <div className="flex gap-3 mt-1 text-xs" style={{ color: GRAY }}>
                      <span>Estoque: {p.totalStock - p.reserved}/{p.totalStock}</span>
                      {p._count && <span>Pedidos: {p._count.orders}</span>}
                    </div>
                    {p.sizes.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: GRAY }}>
                        {p.sizes.join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                {/* Actions bar */}
                <div className="flex gap-2 px-4 pb-3">
                  <button onClick={() => openEdit(p)}
                    className="flex-1 py-1.5 rounded-xl border text-xs font-bold"
                    style={{ borderColor: LIGHT, color: DARK }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => toggleActive(p)}
                    className="flex-1 py-1.5 rounded-xl border text-xs font-bold"
                    style={{ borderColor: LIGHT, color: p.active ? '#D97706' : '#16A34A' }}>
                    {p.active ? '⏸ Desativar' : '▶ Ativar'}
                  </button>
                  <button onClick={() => deleteProduct(p)}
                    className="py-1.5 px-3 rounded-xl border text-xs font-bold"
                    style={{ borderColor: '#FCA5A5', color: '#DC2626', background: '#FEF2F2' }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pedidos tab */}
      {tab === 'pedidos' && (
        <>
          {/* Filtro por status */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {['', 'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => (
              <button key={s}
                onClick={() => setOrderFilter(s)}
                className="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold transition"
                style={{
                  borderColor: orderFilter === s ? RED : LIGHT,
                  color: orderFilter === s ? RED : GRAY,
                  background: orderFilter === s ? '#FEF2F2' : WHITE,
                }}>
                {s ? (STATUS_LABEL[s]?.label ?? s) : 'Todos'}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 rounded-2xl border"
              style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="text-4xl mb-2">📦</p>
              <p className="font-semibold" style={{ color: DARK }}>Nenhum pedido</p>
            </div>
          )}

          <div className="space-y-3">
            {filteredOrders.map(o => {
              const st = STATUS_LABEL[o.status];
              const next = NEXT_STATUS[o.status] ?? [];
              return (
                <div key={o.id} className="rounded-2xl border p-4"
                  style={{ background: WHITE, borderColor: LIGHT }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-black text-sm" style={{ color: DARK }}>{o.customerName}</p>
                      <p className="text-xs" style={{ color: GRAY }}>{o.customerEmail}</p>
                      {o.customerPhone && <p className="text-xs" style={{ color: GRAY }}>{o.customerPhone}</p>}
                    </div>
                    <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0"
                      style={{ background: st?.color + '1A', color: st?.color }}>
                      {st?.label ?? o.status}
                    </span>
                  </div>
                  <div className="text-xs mb-2" style={{ color: GRAY }}>
                    <span className="font-semibold" style={{ color: DARK }}>{o.product.name}</span>
                    {o.size && <span> · {o.size}</span>}
                    {o.color && <span> · {o.color}</span>}
                    <span> · {o.quantity}x · </span>
                    <span className="font-bold" style={{ color: DARK }}>{fmtPrice(o.totalInCents)}</span>
                  </div>
                  {o.shippingAddress && (
                    <p className="text-xs mb-2" style={{ color: GRAY }}>📍 {o.shippingAddress}</p>
                  )}
                  <p className="text-[10px] mb-2" style={{ color: GRAY }}>
                    Pedido #{o.id.slice(0, 8).toUpperCase()} · {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                  {next.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {next.map(ns => (
                        <button key={ns}
                          onClick={() => updateOrder(o.id, ns)}
                          className="px-3 py-1.5 rounded-xl border text-xs font-bold"
                          style={{
                            borderColor: ns === 'CANCELLED' ? '#DC2626' : LIGHT,
                            color: ns === 'CANCELLED' ? '#DC2626' : DARK,
                          }}>
                          {STATUS_LABEL[ns]?.label ?? ns}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Cupons tab */}
      {tab === 'cupons' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-black" style={{ color: DARK }}>Cupons de Desconto da Loja</p>
            <button onClick={() => setShowCouponForm(!showCouponForm)}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-bold"
              style={{ background: RED }}>
              + Novo Cupom
            </button>
          </div>

          {showCouponForm && (
            <form onSubmit={createCoupon} className="rounded-2xl border p-4 mb-4 space-y-3"
              style={{ background: WHITE, borderColor: LIGHT }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: GRAY }}>Código *</label>
                  <input type="text" required value={couponForm.code}
                    onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="EX: DESCONTO10"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: LIGHT }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: GRAY }}>Tipo *</label>
                  <select value={couponForm.type}
                    onChange={e => setCouponForm(f => ({ ...f, type: e.target.value as StoreCoupon['type'] }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: LIGHT }}>
                    <option value="PERCENT">Percentual (%)</option>
                    <option value="FIXED">Fixo (centavos)</option>
                    <option value="COURTESY">Cortesia (100%)</option>
                  </select>
                </div>
              </div>
              {couponForm.type !== 'COURTESY' && (
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: GRAY }}>
                    {couponForm.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (centavos, ex: 1000 = R$10)'} *
                  </label>
                  <input type="number" required min={0} value={couponForm.value}
                    onChange={e => setCouponForm(f => ({ ...f, value: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: LIGHT }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: GRAY }}>Limite de usos</label>
                  <input type="number" min={1} value={couponForm.maxUses}
                    onChange={e => setCouponForm(f => ({ ...f, maxUses: e.target.value }))}
                    placeholder="Ilimitado"
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: LIGHT }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: GRAY }}>Expira em</label>
                  <input type="datetime-local" value={couponForm.expiresAt}
                    onChange={e => setCouponForm(f => ({ ...f, expiresAt: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: LIGHT }} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingCoupon}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-bold"
                  style={{ background: RED, opacity: savingCoupon ? 0.7 : 1 }}>
                  {savingCoupon ? 'Criando...' : 'Criar Cupom'}
                </button>
                <button type="button" onClick={() => setShowCouponForm(false)}
                  className="px-4 py-2 rounded-xl border text-sm font-bold"
                  style={{ borderColor: LIGHT, color: GRAY }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {coupons.length === 0 && !showCouponForm && (
            <div className="text-center py-12 rounded-2xl border" style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="text-4xl mb-2">🎟️</p>
              <p className="font-semibold" style={{ color: DARK }}>Nenhum cupom criado</p>
              <p className="text-sm" style={{ color: GRAY }}>Crie cupons de desconto para os seus produtos</p>
            </div>
          )}

          <div className="space-y-2">
            {coupons.map(c => (
              <div key={c.id} className="rounded-xl border p-4 flex items-center justify-between"
                style={{ background: WHITE, borderColor: LIGHT }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm" style={{ color: RED }}>{c.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold`}
                      style={{
                        background: c.type === 'COURTESY' ? '#F3E8FF' : c.type === 'PERCENT' ? '#DBEAFE' : '#DCFCE7',
                        color: c.type === 'COURTESY' ? '#7C3AED' : c.type === 'PERCENT' ? '#1D4ED8' : '#166534',
                      }}>
                      {formatCouponDiscount(c)}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: GRAY }}>
                    {c.usedCount} uso{c.usedCount !== 1 ? 's' : ''}
                    {c.maxUses ? ` / ${c.maxUses} limite` : ' (ilimitado)'}
                    {c.expiresAt ? ` · expira ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                <button onClick={() => navigator.clipboard.writeText(c.code)}
                  className="text-sm px-2 py-1 rounded" style={{ color: GRAY }}
                  title="Copiar código">📋</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal criar/editar produto */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="w-full max-w-lg rounded-2xl overflow-y-auto max-h-[90vh]"
            style={{ background: WHITE }}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-lg" style={{ color: DARK }}>
                  {editProduct ? 'Editar Produto' : 'Novo Produto'}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-2xl leading-none" style={{ color: GRAY }}>×</button>
              </div>

              <div className="space-y-3">
                <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ borderColor: LIGHT, color: DARK }}
                  placeholder="Nome do produto *"
                  value={formData.name ?? ''}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} />

                <textarea className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                  style={{ borderColor: LIGHT, color: DARK }}
                  placeholder="Descrição"
                  rows={2}
                  value={formData.description ?? ''}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />

                <select className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ borderColor: LIGHT, color: DARK }}
                  value={formData.category ?? 'CAMISA'}
                  onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: GRAY }}>Preço (R$) *</p>
                    <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="Ex: 89.90"
                      type="number"
                      step="0.01"
                      value={formData.priceInCents ? (formData.priceInCents / 100).toFixed(2) : ''}
                      onChange={e => setFormData(f => ({ ...f, priceInCents: Math.round(parseFloat(e.target.value) * 100) }))} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: GRAY }}>Quantidade em estoque</p>
                    <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="Ex: 10"
                      type="number"
                      value={formData.totalStock ?? ''}
                      onChange={e => setFormData(f => ({ ...f, totalStock: parseInt(e.target.value) }))} />
                  </div>
                </div>

                <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ borderColor: LIGHT, color: DARK }}
                  placeholder="Tamanhos separados por vírgula (P, M, G, GG)"
                  value={formData.sizes ?? ''}
                  onChange={e => setFormData(f => ({ ...f, sizes: e.target.value }))} />

                <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ borderColor: LIGHT, color: DARK }}
                  placeholder="Cores separadas por vírgula (Preto, Branco, Vermelho)"
                  value={formData.colors ?? ''}
                  onChange={e => setFormData(f => ({ ...f, colors: e.target.value }))} />

                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setFormData(f => ({ ...f, featured: !f.featured }))}
                    className="w-10 h-6 rounded-full transition relative"
                    style={{ background: formData.featured ? RED : LIGHT }}>
                    <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                      style={{ background: WHITE, left: formData.featured ? '18px' : '2px' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: DARK }}>Produto em destaque</span>
                </label>
              </div>

              <button onClick={saveProduct} disabled={saving}
                className="mt-5 w-full py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest transition"
                style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)`, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando...' : editProduct ? 'Salvar Alterações' : 'Criar Produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
