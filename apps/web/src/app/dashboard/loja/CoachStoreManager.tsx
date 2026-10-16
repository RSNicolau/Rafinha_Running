'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { centsToBRLInput, parseBRLToCents } from '../../checkout/_lib/money';

/** Treinador (COACH) cria produto inativo; só dono/gestor publica (regra do servidor). */
function useCanPublish() {
  const user = useAuthStore((st) => st.user);
  const r = user?.team?.role;
  return !r || r === 'OWNER' || r === 'ADMIN' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
}

/** Hoje (fuso de SP) no formato do input date — impede validade no passado. */
const todayInput = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  priceInCents: number;
  images: string[];
  sizes: string[];
  colors: string[];
  totalStock: number;
  reserved: number;
  active: boolean;
  featured: boolean;
  athleteDiscountPercent: number;
  isPreOrder: boolean;
  preOrderDeadline: string | null;
  estimatedDelivery: string | null;
  preOrderLimit: number | null;
  preOrderCommitted?: number;
  available: number;
  _count?: { orders: number };
};

type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  totalInCents: number;
  discountInCents: number;
  finalInCents: number | null;
  status: string;
  isPreOrder: boolean;
  deliveryMethod?: string | null;
  shippingAddress?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  coupon?: { code: string } | null;
  product: { name: string; category: string };
};

type Stats = { activeProducts: number; totalOrders: number; pendingPayment: number; paidPreOrders: number; revenueInCents: number };
type Coupon = { id: string; code: string; type: 'PERCENT' | 'FIXED' | 'COURTESY'; value: number; maxUses: number | null; usedCount: number; expiresAt: string | null; isActive: boolean };
type PreOrderRow = {
  id: string; name: string; preOrderLimit: number | null; preOrderDeadline: string | null; estimatedDelivery: string | null;
  paid: number; pending: number; variants: Array<{ size: string | null; color: string | null; paid: number; pending: number }>;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  ['CAMISA', 'Camiseta'], ['VISEIRA', 'Viseira'], ['BONE', 'Boné'], ['CASACO', 'Casaco'], ['CORTA_VENTO', 'Corta-vento'],
  ['MEIA', 'Meia'], ['CALCA', 'Calça'], ['SHORTS', 'Shorts'], ['ACESSORIO', 'Acessório'], ['OUTRO', 'Outro'],
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Aguardando pagamento', cls: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-700' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-blue-50 text-blue-700' },
  PROCESSING: { label: 'Em produção/separação', cls: 'bg-violet-50 text-violet-700' },
  SHIPPED: { label: 'Enviado', cls: 'bg-cyan-50 text-cyan-700' },
  READY_FOR_PICKUP: { label: 'Pronto p/ retirada', cls: 'bg-sky-50 text-sky-700' },
  DELIVERED: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-50 text-red-600' },
  REFUNDED: { label: 'Estornado', cls: 'bg-zinc-100 text-zinc-600' },
};

/** Mesmo fluxo validado no servidor (ORDER_TRANSITIONS). */
const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  CONFIRMED: ['PROCESSING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  READY_FOR_PICKUP: ['DELIVERED', 'PROCESSING', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

const ACTION_LABEL: Record<string, string> = {
  PAID: 'Marcar como pago (manual)',
  PROCESSING: 'Em produção/separação',
  READY_FOR_PICKUP: 'Pronto p/ retirada',
  SHIPPED: 'Marcar enviado',
  DELIVERED: 'Marcar entregue',
  CANCELLED: 'Cancelar',
  REFUNDED: 'Marcar estornado',
};

const fmt = (c: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((c ?? 0) / 100);
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const errMsg = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
};

const input = 'w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20';
const label = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider';

type Tab = 'produtos' | 'pedidos' | 'encomendas' | 'cupons';

type ProductForm = {
  name: string; description: string; category: string; price: string; totalStock: string; sizes: string; colors: string;
  featured: boolean; active: boolean; athleteDiscountPercent: string; images: string[];
  isPreOrder: boolean; preOrderDeadline: string; estimatedDelivery: string; preOrderLimit: string;
};

const EMPTY_FORM: ProductForm = {
  name: '', description: '', category: 'CAMISA', price: '', totalStock: '0', sizes: 'P, M, G, GG', colors: '',
  featured: false, active: true, athleteDiscountPercent: '0', images: [],
  isPreOrder: false, preOrderDeadline: '', estimatedDelivery: '', preOrderLimit: '',
};

async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CoachStoreManager() {
  const [tab, setTab] = useState<Tab>('produtos');
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    const [p, s] = await Promise.all([api.get('/store/products'), api.get('/store/stats')]);
    setProducts(p.data || []);
    setStats(s.data);
  }, []);

  useEffect(() => {
    loadProducts().catch(() => undefined).finally(() => setLoading(false));
  }, [loadProducts]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Loja</h1>
          <p className="text-sm text-gray-400 mt-1">Produtos de pronta-entrega e encomendas · pedidos · cupons</p>
        </div>
        <PublicStoreLink />
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Produtos ativos', String(stats.activeProducts)],
            ['Pedidos', String(stats.totalOrders)],
            ['Aguardando pagamento', String(stats.pendingPayment ?? 0)],
            ['Faturamento pago', fmt(stats.revenueInCents)],
          ].map(([k, v]) => (
            <div key={k} className="glass-card p-4">
              <p className="text-xs text-gray-400">{k}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          ['produtos', 'Produtos'],
          ['pedidos', 'Pedidos'],
          ['encomendas', 'Encomendas (produção)'],
          ['cupons', 'Cupons'],
        ] as Array<[Tab, string]>).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === id ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <>
          {tab === 'produtos' && <ProductsTab products={products} reload={loadProducts} />}
          {tab === 'pedidos' && <OrdersTab products={products} onChanged={loadProducts} />}
          {tab === 'encomendas' && <PreOrdersTab />}
          {tab === 'cupons' && <CouponsTab />}
        </>
      )}
    </div>
  );
}

function PublicStoreLink() {
  const slug = useAuthStore((st) => st.user?.team?.slug);
  const href = slug ? `/loja/${encodeURIComponent(slug)}` : '/loja';
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline">Ver loja pública →</a>;
}

// ─── Produtos ────────────────────────────────────────────────────────────────

function ProductsTab({ products, reload }: { products: Product[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const canPublish = useCanPublish();

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, active: canPublish });
    setError('');
    setShowForm(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', category: p.category, price: centsToBRLInput(p.priceInCents),
      totalStock: String(p.totalStock), sizes: p.sizes.join(', '), colors: p.colors.join(', '), featured: p.featured, active: p.active,
      athleteDiscountPercent: String(p.athleteDiscountPercent ?? 0), images: p.images ?? [],
      isPreOrder: p.isPreOrder, preOrderDeadline: toDateInput(p.preOrderDeadline), estimatedDelivery: toDateInput(p.estimatedDelivery),
      preOrderLimit: p.preOrderLimit ? String(p.preOrderLimit) : '',
    });
    setError('');
    setShowForm(true);
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/store/uploads/product-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((f) => ({ ...f, images: [...f.images, data.url] }));
    } catch (e) {
      setError(errMsg(e, 'Falha no upload da imagem'));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const price = parseBRLToCents(form.price);
    if (!form.name.trim()) return setError('Informe o nome do produto.');
    if (price === null || price < 0) return setError('Preço inválido. Use o formato 1.299,90.');
    const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      priceInCents: price,
      totalStock: form.isPreOrder ? 0 : Math.max(0, Number(form.totalStock) || 0),
      sizes: list(form.sizes),
      colors: list(form.colors),
      featured: form.featured,
      ...(canPublish || !form.active ? { active: form.active } : {}),
      athleteDiscountPercent: Math.min(100, Math.max(0, Number(form.athleteDiscountPercent) || 0)),
      images: form.images,
      isPreOrder: form.isPreOrder,
      preOrderDeadline: form.isPreOrder && form.preOrderDeadline ? new Date(`${form.preOrderDeadline}T23:59:59-03:00`).toISOString() : null,
      estimatedDelivery: form.isPreOrder && form.estimatedDelivery ? new Date(`${form.estimatedDelivery}T12:00:00-03:00`).toISOString() : null,
      preOrderLimit: form.isPreOrder && form.preOrderLimit ? Number(form.preOrderLimit) : null,
    };
    if (editing && editing.isPreOrder === false && form.isPreOrder === false) delete body.isPreOrder;
    setSaving(true);
    setError('');
    try {
      if (editing) await api.put(`/store/products/${editing.id}`, body);
      else await api.post('/store/products', body);
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(errMsg(e, 'Erro ao salvar produto'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await api.put(`/store/products/${p.id}`, { active: !p.active });
    } catch (e) {
      alert(errMsg(e, 'Não foi possível alterar o produto'));
    }
    await reload();
  };

  return (
    <div className="space-y-4">
      {!canPublish && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Produtos criados por treinadores ficam inativos até o dono ou um gestor da equipe publicar na loja.
        </p>
      )}
      <div className="flex justify-end">
        <button onClick={openNew} className="px-4 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold">+ Novo produto</button>
      </div>

      {products.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-gray-400">Nenhum produto cadastrado.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {products.map((p) => (
            <div key={p.id} className={`glass-card p-4 flex gap-3 ${p.active ? '' : 'opacity-60'}`}>
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                {p.images[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">👕</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                  {p.isPreOrder && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white">ENCOMENDA</span>}
                  {!p.active && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">INATIVO</span>}
                </div>
                <p className="text-sm font-semibold text-primary">{fmt(p.priceInCents)}{p.athleteDiscountPercent > 0 && <span className="text-xs text-emerald-600 font-normal"> · aluno −{p.athleteDiscountPercent}%</span>}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.isPreOrder
                    ? `Encomendadas: ${p.preOrderCommitted ?? 0}${p.preOrderLimit ? ` / ${p.preOrderLimit}` : ''}${p.preOrderDeadline ? ` · até ${fmtDate(p.preOrderDeadline)}` : ''}`
                    : `Estoque ${p.totalStock} · reservado ${p.reserved} · disponível ${p.available}`}
                </p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => openEdit(p)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700">Editar</button>
                  {(p.active || canPublish) && (
                    <button onClick={() => toggleActive(p)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700">{p.active ? 'Desativar' : 'Publicar'}</button>
                  )}
                  {!p.active && !canPublish && <span className="text-[11px] text-gray-500 self-center">aguardando publicação</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editing ? 'Editar produto' : 'Novo produto'}</h3>
            {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm p-3 mb-3">{error}</div>}
            <div className="space-y-3">
              <div><label className={label}>Nome *</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={label}>Descrição</label><textarea rows={3} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Categoria</label>
                  <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div><label className={label}>Preço (R$) *</label><input className={input} inputMode="decimal" placeholder="1.299,90" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Tamanhos (vírgula)</label><input className={input} value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} /></div>
                <div><label className={label}>Cores (vírgula)</label><input className={input} value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} /></div>
              </div>

              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input type="checkbox" checked={form.isPreOrder} onChange={(e) => setForm({ ...form, isPreOrder: e.target.checked })} />
                  Venda sob encomenda (sem estoque físico)
                </label>
                {form.isPreOrder ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className={label}>Encomendas até</label><input type="date" className={input} value={form.preOrderDeadline} onChange={(e) => setForm({ ...form, preOrderDeadline: e.target.value })} /></div>
                    <div><label className={label}>Previsão entrega</label><input type="date" className={input} value={form.estimatedDelivery} onChange={(e) => setForm({ ...form, estimatedDelivery: e.target.value })} /></div>
                    <div><label className={label}>Limite (un.)</label><input className={input} inputMode="numeric" placeholder="sem limite" value={form.preOrderLimit} onChange={(e) => setForm({ ...form, preOrderLimit: e.target.value.replace(/\D/g, '') })} /></div>
                  </div>
                ) : (
                  <div><label className={label}>Estoque (unidades)</label><input className={input} inputMode="numeric" value={form.totalStock} onChange={(e) => setForm({ ...form, totalStock: e.target.value.replace(/\D/g, '') })} />
                    {editing && editing.reserved > 0 && <p className="text-[11px] text-amber-700 mt-1">{editing.reserved} unidade(s) reservada(s) em pedidos aguardando pagamento.</p>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Desconto aluno (%)</label><input className={input} inputMode="numeric" value={form.athleteDiscountPercent} onChange={(e) => setForm({ ...form, athleteDiscountPercent: e.target.value.replace(/\D/g, '') })} /></div>
                <div className="flex flex-col justify-end gap-1.5 text-sm text-gray-700">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Destaque</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} disabled={!canPublish && !form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo na loja{!canPublish && !form.active ? ' (o dono/gestor publica)' : ''}</label>
                </div>
              </div>

              <div>
                <label className={label}>Imagens</label>
                <div className="flex gap-2 flex-wrap">
                  {form.images.map((src, i) => (
                    <div key={src + i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })}
                        className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white text-xs">×</button>
                    </div>
                  ))}
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 cursor-pointer text-xs">
                    {uploading ? '…' : '+ foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancelar</button>
              <button onClick={save} disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

function OrdersTab({ products, onChanged }: { products: Product[]; onChanged: () => Promise<void> }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', preOrder: '', productId: '', search: '' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/store/orders${query ? `?${query}` : ''}`);
      setOrders(data || []);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const change = async (o: Order, status: string) => {
    let trackingCode: string | undefined;
    if (status === 'SHIPPED') trackingCode = window.prompt('Código de rastreio (opcional):', o.trackingCode ?? '') ?? undefined;
    if (['CANCELLED', 'REFUNDED'].includes(status) && !window.confirm(
      status === 'REFUNDED'
        ? `Marcar como estornado? Faça o estorno do valor no painel do gateway (Asaas/Stripe). ${
            o.isPreOrder
              ? 'Encomendas não mexem no estoque.'
              : ['SHIPPED', 'DELIVERED'].includes(o.status)
                ? 'Como o produto já foi enviado/entregue, ele NÃO volta ao estoque — se receber a peça de volta, ajuste o estoque no produto.'
                : 'O produto volta ao estoque.'
          }`
        : 'Cancelar este pedido? A reserva é liberada e o cliente é avisado por e-mail.',
    )) return;
    if (status === 'PAID' && !window.confirm('Confirmar pagamento recebido fora do sistema (dinheiro/maquininha)?')) return;
    setBusy(o.id);
    try {
      await api.put(`/store/orders/${o.id}/status`, { status, ...(trackingCode !== undefined ? { trackingCode } : {}) });
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      alert(errMsg(e, 'Não foi possível atualizar o pedido'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <input className={`${input} col-span-2`} placeholder="Buscar nome, e-mail ou nº do pedido" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={input} value={filters.preOrder} onChange={(e) => setFilters({ ...filters, preOrder: e.target.value })}>
          <option value="">Pronta-entrega + encomenda</option>
          <option value="false">Pronta-entrega</option>
          <option value="true">Encomenda</option>
        </select>
        <select className={input} value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}>
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end">
        <button onClick={() => downloadCsv(`/store/orders/export.csv${query ? `?${query}` : ''}`, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`)}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold">⬇ Exportar CSV</button>
      </div>

      {loading ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-gray-400">Nenhum pedido encontrado.</div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };
            const total = o.finalInCents ?? o.totalInCents - o.discountInCents;
            return (
              <div key={o.id} className="glass-card p-4">
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      #{o.id.slice(0, 8).toUpperCase()} · {o.product.name} × {o.quantity}{o.size ? ` · ${o.size}` : ''}{o.color ? ` · ${o.color}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{o.customerName} · {new Date(o.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  {o.isPreOrder && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white">ENC</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                  <span className="text-sm font-bold text-gray-900 w-24 text-right">{fmt(total)}</span>
                </button>
                {expanded === o.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid md:grid-cols-2 gap-3 text-xs text-gray-600">
                    <div className="space-y-1">
                      <p><strong>Cliente:</strong> {o.customerName}</p>
                      <p><strong>E-mail:</strong> {o.customerEmail}</p>
                      {o.customerPhone && <p><strong>WhatsApp:</strong> <a className="underline" href={`https://wa.me/55${o.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{o.customerPhone}</a></p>}
                      <p><strong>Entrega:</strong> {o.deliveryMethod === 'SHIPPING' ? 'Envio' : 'Retirada'}</p>
                      {o.shippingAddress && <p><strong>Endereço:</strong> {o.shippingAddress}</p>}
                      {o.trackingCode && <p><strong>Rastreio:</strong> {o.trackingCode}</p>}
                      {o.notes && <p><strong>Obs.:</strong> {o.notes}</p>}
                    </div>
                    <div className="space-y-1">
                      <p><strong>Subtotal:</strong> {fmt(o.totalInCents)}{o.discountInCents > 0 && <> · <strong>Desconto:</strong> {fmt(o.discountInCents)}{o.coupon ? ` (${o.coupon.code})` : ''}</>}</p>
                      {o.paidAt && <p><strong>Pago em:</strong> {new Date(o.paidAt).toLocaleString('pt-BR')}</p>}
                      {o.status === 'PENDING_PAYMENT' && o.expiresAt && <p><strong>Reserva expira:</strong> {new Date(o.expiresAt).toLocaleString('pt-BR')}</p>}
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {(NEXT[o.status] ?? []).map((s) => (
                          <button key={s} disabled={busy === o.id} onClick={() => change(o, s)}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold disabled:opacity-50 ${['CANCELLED', 'REFUNDED'].includes(s) ? 'border-red-200 text-red-600' : 'border-gray-200 text-gray-700'}`}>
                            {ACTION_LABEL[s] ?? s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Encomendas (lista de produção) ───────────────────────────────────────────

function PreOrdersTab() {
  const [rows, setRows] = useState<PreOrderRow[] | null>(null);
  useEffect(() => {
    api.get('/store/preorders/summary').then((r) => setRows(r.data || [])).catch(() => setRows([]));
  }, []);
  if (!rows) return <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />;
  if (!rows.length) return <div className="glass-card p-10 text-center text-sm text-gray-400">Nenhuma encomenda ainda.</div>;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => downloadCsv('/store/orders/export.csv?preOrder=true', `encomendas-${new Date().toISOString().slice(0, 10)}.csv`)}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold">⬇ Exportar encomendas (CSV)</button>
      </div>
      {rows.map((p) => (
        <div key={p.id} className="glass-card p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-bold text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500">
                {p.preOrderDeadline ? `Encomendas até ${fmtDate(p.preOrderDeadline)}` : 'Sem prazo'} · {p.estimatedDelivery ? `entrega prevista ${fmtDate(p.estimatedDelivery)}` : 'sem previsão'}
                {p.preOrderLimit ? ` · limite ${p.preOrderLimit}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-700">{p.paid} pagas</p>
              <p className="text-xs text-amber-600">{p.pending} aguardando pagamento</p>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-gray-400 text-left"><th className="py-1">Tamanho</th><th>Cor</th><th className="text-right">Produzir (pagas)</th><th className="text-right">Pendentes</th></tr></thead>
            <tbody>
              {p.variants.map((v, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 font-semibold text-gray-800">{v.size ?? '—'}</td>
                  <td className="text-gray-700">{v.color ?? '—'}</td>
                  <td className="text-right font-bold text-gray-900">{v.paid}</td>
                  <td className="text-right text-amber-600">{v.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Cupons ──────────────────────────────────────────────────────────────────

function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: '', type: 'PERCENT' as Coupon['type'], value: '', maxUses: '', expiresAt: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get('/store/coupons').then((r) => setCoupons(r.data || [])).catch(() => undefined), []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.code.trim()) return;
    if (form.expiresAt && form.expiresAt < todayInput()) return alert('A validade precisa ser hoje ou uma data futura.');
    setSaving(true);
    try {
      await api.post('/store/coupons', {
        code: form.code.trim(),
        type: form.type,
        value: form.type === 'COURTESY' ? 0 : form.type === 'FIXED' ? parseBRLToCents(form.value) ?? 0 : Number(form.value.replace(',', '.')),
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59-03:00`).toISOString() : undefined,
      });
      setForm({ code: '', type: 'PERCENT', value: '', maxUses: '', expiresAt: '' });
      await load();
    } catch (e) {
      alert(errMsg(e, 'Erro ao criar cupom'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: Coupon) => {
    await api.put(`/store/coupons/${c.id}`, { isActive: !c.isActive }).catch(() => null);
    await load();
  };

  // B11: editar valor do cupom
  const editValue = async (c: Coupon) => {
    if (c.type === 'COURTESY') return;
    const current = c.type === 'FIXED' ? centsToBRLInput(c.value) : String(c.value);
    const raw = window.prompt(c.type === 'FIXED' ? 'Novo desconto (R$):' : 'Novo percentual (1 a 100):', current);
    if (raw === null) return;
    const value = c.type === 'FIXED' ? parseBRLToCents(raw) : Number(raw.replace(',', '.'));
    if (value === null || !Number.isFinite(value) || value <= 0) return alert('Valor inválido.');
    try {
      await api.put(`/store/coupons/${c.id}`, { value });
      await load();
    } catch (e) {
      alert(errMsg(e, 'Não foi possível alterar o cupom'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <div className="col-span-2 md:col-span-1"><label className={label}>Código</label><input className={`${input} uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div><label className={label}>Tipo</label>
          <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Coupon['type'] })}>
            <option value="PERCENT">%</option><option value="FIXED">R$</option><option value="COURTESY">Cortesia</option>
          </select>
        </div>
        <div><label className={label}>{form.type === 'FIXED' ? 'Valor (R$)' : 'Percentual'}</label><input className={input} disabled={form.type === 'COURTESY'} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div><label className={label}>Máx. usos</label><input className={input} inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label className={label}>Validade</label><input type="date" min={todayInput()} className={input} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
        <button onClick={create} disabled={saving} className="py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">Criar</button>
      </div>
      {coupons.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-gray-400">Nenhum cupom.</div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            return (
              <div key={c.id} className="glass-card p-3 flex items-center gap-3">
                <span className="font-mono font-bold text-gray-900">{c.code}</span>
                <span className="text-xs text-gray-500">
                  {c.type === 'COURTESY' ? 'Cortesia' : c.type === 'PERCENT' ? `${c.value}%` : fmt(c.value)} · usos {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}
                  {c.expiresAt ? ` · até ${fmtDate(c.expiresAt)}` : ''}
                </span>
                {expired && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">expirado</span>}
                {c.type !== 'COURTESY' && (
                  <button onClick={() => editValue(c)} className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700">Editar valor</button>
                )}
                <button onClick={() => toggle(c)} className={`${c.type === 'COURTESY' ? 'ml-auto ' : ''}text-xs px-2.5 py-1 rounded-lg border ${c.isActive ? 'border-gray-200 text-gray-700' : 'border-emerald-200 text-emerald-700'}`}>
                  {c.isActive ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
