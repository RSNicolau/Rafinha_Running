'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

const RED   = '#CC1F1A';
const PAGE  = '#F4F4F5';
const WHITE = '#FFFFFF';
const DARK  = '#18181B';
const GRAY  = '#71717A';
const LIGHT = '#E4E4E7';

// ID público do coach Rafinha (slug / coachId)
const COACH_ID = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID ?? 'rafinha';

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
  featured: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  CAMISA: 'Camiseta',
  VISEIRA: 'Viseira',
  BONE: 'Boné',
  CASACO: 'Casaco',
  CORTA_VENTO: 'Corta-vento',
  MEIA: 'Meia',
  CALCA: 'Calça',
  SHORTS: 'Shorts',
  ACESSORIO: 'Acessório',
  OUTRO: 'Outro',
};

function fmtPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

type OrderForm = {
  productId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  size: string;
  color: string;
  quantity: number;
  shippingAddress: string;
  notes: string;
};

export default function LojaPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<OrderForm>>({ quantity: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

  useEffect(() => {
    fetch(`${API}/store/public/${COACH_ID}/products`)
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [API]);

  const available = (p: Product) => p.totalStock - p.reserved;

  function openModal(p: Product) {
    setSelected(p);
    setForm({ productId: p.id, quantity: 1 });
    setOrderId(null);
    setError('');
  }

  async function submitOrder() {
    if (!form.customerName || !form.customerEmail) {
      setError('Preencha nome e email.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/store/public/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erro ao criar pedido');
      setOrderId(data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE }}>

      {/* Hero */}
      <div className="py-10 text-center" style={{ background: RED }}>
        <div className="inline-block" style={{ isolation: 'isolate', background: RED }}>
          <Image
            src="/logo.png"
            alt="RR Rafinha Running"
            width={270}
            height={194}
            style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }}
          />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-red-100 mt-2 mb-1">
          Loja Oficial
        </p>
        <p className="text-sm text-red-100 mt-0.5">
          Edição limitada · Exclusivo para atletas
        </p>
      </div>

      <div className="px-4 py-8 max-w-2xl mx-auto">
        {/* Aviso de exclusividade */}
        <div className="rounded-2xl border p-4 mb-6 text-center" style={{ background: WHITE, borderColor: LIGHT }}>
          <p className="text-sm font-semibold" style={{ color: DARK }}>
            🏅 Produção limitada · Alta demanda
          </p>
          <p className="text-xs mt-1" style={{ color: GRAY }}>
            Reserve o seu agora e garanta exclusividade. Confirmação de pagamento por email.
          </p>
        </div>

        {/* Produtos */}
        {loading && (
          <div className="text-center py-12" style={{ color: GRAY }}>
            <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Carregando produtos...</p>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-16 rounded-2xl border" style={{ background: WHITE, borderColor: LIGHT }}>
            <p className="text-4xl mb-3">🏃</p>
            <p className="font-semibold" style={{ color: DARK }}>Em breve</p>
            <p className="text-sm mt-1" style={{ color: GRAY }}>Novos produtos serão lançados em breve!</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map(p => {
            const qty = available(p);
            return (
              <div
                key={p.id}
                className="rounded-2xl border overflow-hidden shadow-sm flex flex-col"
                style={{ background: WHITE, borderColor: LIGHT }}
              >
                {/* Imagem */}
                <div className="w-full h-48 flex items-center justify-center shrink-0" style={{ background: '#F4F4F5' }}>
                  {p.images[0] ? (
                    <img
                      src={p.images[0].startsWith('/') ? p.images[0] : p.images[0]}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center" style={{ color: GRAY }}>
                      <div className="text-4xl mb-1">👕</div>
                      <p className="text-xs">Sem imagem</p>
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                  {p.featured && (
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 inline-block"
                      style={{ background: RED, color: WHITE }}>
                      Destaque
                    </span>
                  )}
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: GRAY }}>
                    {CATEGORY_LABEL[p.category] ?? p.category}
                  </p>
                  <p className="font-black text-base leading-tight mb-1" style={{ color: DARK }}>{p.name}</p>
                  {p.description && (
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: GRAY }}>{p.description}</p>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <p className="font-black text-lg" style={{ color: RED }}>{fmtPrice(p.priceInCents)}</p>
                    <p className="text-xs" style={{ color: qty > 0 ? '#16A34A' : '#DC2626' }}>
                      {qty > 0 ? `${qty} disponíveis` : 'Esgotado'}
                    </p>
                  </div>

                  {p.sizes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.sizes.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded border font-medium"
                          style={{ borderColor: LIGHT, color: DARK }}>{s}</span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => openModal(p)}
                    disabled={qty === 0}
                    className="mt-auto pt-4 w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition"
                    style={{
                      background: qty > 0 ? `linear-gradient(135deg, ${RED}, #8B0000)` : LIGHT,
                      color: qty > 0 ? WHITE : GRAY,
                      cursor: qty > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {qty > 0 ? 'Reservar Agora' : 'Esgotado'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs mt-8" style={{ color: GRAY }}>
          🔒 Dados protegidos · Pagamento seguro
        </p>
      </div>

      {/* Modal de pedido */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="w-full max-w-md rounded-2xl overflow-y-auto max-h-[90vh]"
            style={{ background: WHITE }}>
            <div className="p-5">
              {orderId ? (
                /* Sucesso */
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="text-xl font-black mb-2" style={{ color: DARK }}>Pedido realizado!</h2>
                  <p className="text-sm mb-1" style={{ color: GRAY }}>
                    Seu pedido foi registrado com sucesso.
                  </p>
                  <p className="text-xs mb-4" style={{ color: GRAY }}>
                    Pedido #{orderId.slice(0, 8).toUpperCase()} · Verifique seu email para instruções de pagamento.
                  </p>
                  <button
                    onClick={() => setSelected(null)}
                    className="w-full py-3 rounded-xl text-white font-black uppercase tracking-widest text-sm"
                    style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                /* Formulário */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-black text-base" style={{ color: DARK }}>{selected.name}</p>
                      <p className="text-sm font-bold" style={{ color: RED }}>{fmtPrice(selected.priceInCents)}</p>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-2xl leading-none" style={{ color: GRAY }}>×</button>
                  </div>

                  {error && (
                    <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                      {error}
                    </div>
                  )}

                  <div className="space-y-3">
                    <input
                      className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="Seu nome completo *"
                      value={form.customerName ?? ''}
                      onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    />
                    <input
                      className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="Email *"
                      type="email"
                      value={form.customerEmail ?? ''}
                      onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                    />
                    <input
                      className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="WhatsApp (ex: 11 9 9999-9999)"
                      value={form.customerPhone ?? ''}
                      onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                    />

                    {selected.sizes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: GRAY }}>Tamanho *</p>
                        <div className="flex flex-wrap gap-2">
                          {selected.sizes.map(s => (
                            <button
                              key={s}
                              onClick={() => setForm(f => ({ ...f, size: s }))}
                              className="px-3 py-1.5 rounded-lg border text-sm font-bold transition"
                              style={{
                                borderColor: form.size === s ? RED : LIGHT,
                                color: form.size === s ? RED : DARK,
                                background: form.size === s ? '#FEF2F2' : WHITE,
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selected.colors.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: GRAY }}>Cor *</p>
                        <div className="flex flex-wrap gap-2">
                          {selected.colors.map(c => (
                            <button
                              key={c}
                              onClick={() => setForm(f => ({ ...f, color: c }))}
                              className="px-3 py-1.5 rounded-lg border text-sm font-bold transition"
                              style={{
                                borderColor: form.color === c ? RED : LIGHT,
                                color: form.color === c ? RED : DARK,
                                background: form.color === c ? '#FEF2F2' : WHITE,
                              }}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: GRAY }}>Quantidade</p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setForm(f => ({ ...f, quantity: Math.max(1, (f.quantity ?? 1) - 1) }))}
                          className="w-8 h-8 rounded-full border font-black flex items-center justify-center"
                          style={{ borderColor: LIGHT }}>−</button>
                        <span className="font-black" style={{ color: DARK }}>{form.quantity ?? 1}</span>
                        <button
                          onClick={() => setForm(f => ({ ...f, quantity: Math.min(available(selected), (f.quantity ?? 1) + 1) }))}
                          className="w-8 h-8 rounded-full border font-black flex items-center justify-center"
                          style={{ borderColor: LIGHT }}>+</button>
                      </div>
                    </div>

                    <textarea
                      className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                      style={{ borderColor: LIGHT, color: DARK }}
                      placeholder="Endereço de entrega (rua, número, bairro, cidade, CEP)"
                      rows={2}
                      value={form.shippingAddress ?? ''}
                      onChange={e => setForm(f => ({ ...f, shippingAddress: e.target.value }))}
                    />

                    <div className="rounded-xl p-3 text-xs" style={{ background: '#F4F4F5', color: GRAY }}>
                      <p className="font-bold mb-0.5" style={{ color: DARK }}>
                        Total: {fmtPrice(selected.priceInCents * (form.quantity ?? 1))}
                      </p>
                      <p>Você receberá um email com link de pagamento após a reserva.</p>
                    </div>
                  </div>

                  <button
                    onClick={submitOrder}
                    disabled={submitting}
                    className="mt-4 w-full py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest transition"
                    style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)`, opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? 'Aguarde...' : 'Confirmar Reserva →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
