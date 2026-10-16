'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import BuyerFields from '../checkout/_components/BuyerFields';
import PaymentMethodPicker from '../checkout/_components/PaymentMethodPicker';
import {
  CheckoutBuyer, PaymentChoice, apiFetch, createCheckout, fmtBRL, isLoggedIn, paymentUrl, validateBuyer,
} from '../checkout/_lib/checkout';

const RED = '#CC1F1A';
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID ?? 'rafinha';

/** "1 unidade" / "3 unidades" */
export const unidades = (n: number) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`;

type TeamBrand = { name: string; slug: string; logoUrl: string | null; primaryColor: string | null };
/** Parceiro da equipe (GET /partners/public/:slug — público, só ativos). */
type PublicPartner = {
  id: string; name: string; category?: string | null; description?: string | null;
  logoUrl?: string | null; emoji?: string | null; color?: string | null; linkUrl?: string | null;
};

/** Só links http(s) viram âncoras (defesa extra além da validação da API). */
function safeHttpUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

type Product = {
  id: string;
  name: string;
  description?: string;
  category: string;
  priceInCents: number;
  images: string[];
  sizes: string[];
  colors: string[];
  featured: boolean;
  athleteDiscountPercent: number;
  isPreOrder: boolean;
  preOrderDeadline: string | null;
  estimatedDelivery: string | null;
  preOrderRemaining: number | null;
  available: number;
  purchasable: boolean;
  /** atleta logado da equipe: preço já com desconto de aluno (calculado no servidor) */
  finalPriceInCents?: number;
  hasAthleteDiscount?: boolean;
};

const unitPrice = (p: Product) => (p.hasAthleteDiscount && typeof p.finalPriceInCents === 'number' ? p.finalPriceInCents : p.priceInCents);

const CATEGORY_LABEL: Record<string, string> = {
  CAMISA: 'Camiseta', VISEIRA: 'Viseira', BONE: 'Boné', CASACO: 'Casaco', CORTA_VENTO: 'Corta-vento',
  MEIA: 'Meia', CALCA: 'Calça', SHORTS: 'Shorts', ACESSORIO: 'Acessório', OUTRO: 'Outro',
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

type Step = 'produto' | 'dados' | 'sucesso';

export default function Storefront({ coachSlug }: { coachSlug: string }) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [selected, setSelected] = useState<Product | null>(null);
  const [step, setStep] = useState<Step>('produto');
  const [imageIdx, setImageIdx] = useState(0);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState<'PICKUP' | 'SHIPPING'>('PICKUP');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [buyer, setBuyer] = useState<CheckoutBuyer>({ name: '', email: '', cpf: '', phone: '' });
  const [choice, setChoice] = useState<PaymentChoice>('PIX');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountInCents: number; finalInCents: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [freeOrderCode, setFreeOrderCode] = useState('');
  const [brand, setBrand] = useState<TeamBrand | null>(null);
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const bottomErrorRef = useRef<HTMLDivElement | null>(null);

  // Marca da equipe (logo/cor) — loja de cada equipe com a própria identidade
  useEffect(() => {
    apiFetch<TeamBrand>(`/teams/public/${encodeURIComponent(coachSlug)}`)
      .then((t) => setBrand(t && t.name ? t : null))
      .catch(() => setBrand(null));
  }, [coachSlug]);

  // Parceiros da equipe (vitrine pública)
  useEffect(() => {
    apiFetch<PublicPartner[]>(`/partners/public/${encodeURIComponent(coachSlug)}`)
      .then((d) => setPartners(Array.isArray(d) ? d : []))
      .catch(() => setPartners([]));
  }, [coachSlug]);

  // Erro sempre visível (no iPhone o botão fica no rodapé do modal)
  useEffect(() => {
    if (!error) return;
    const el = step === 'dados' ? bottomErrorRef.current : errorRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error, step]);

  useEffect(() => {
    apiFetch<Product[]>(`/store/public/${encodeURIComponent(coachSlug)}/products`)
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
    // pré-preenche com o usuário logado
    try {
      const u = JSON.parse(localStorage.getItem('rr_user') || 'null');
      if (u) setBuyer((b) => ({ ...b, name: u.name ?? '', email: u.email ?? '' }));
    } catch {
      /* sem sessão */
    }
  }, [coachSlug]);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const subtotal = selected ? unitPrice(selected) * quantity : 0;
  const color1 = brand?.primaryColor || RED;
  const gradient = `linear-gradient(135deg, ${color1}, ${brand?.primaryColor ? color1 : '#8B0000'})`;
  const useDefaultLogo = !brand || (!brand.logoUrl && (brand.slug === DEFAULT_SLUG || coachSlug === DEFAULT_SLUG));
  const maxQty = selected ? Math.max(1, Math.min(10, selected.isPreOrder ? selected.preOrderRemaining ?? 10 : selected.available)) : 1;

  function open(p: Product) {
    setSelected(p);
    setStep('produto');
    setImageIdx(0);
    setSize(p.sizes.length === 1 ? p.sizes[0] : '');
    setColor(p.colors.length === 1 ? p.colors[0] : '');
    setQuantity(1);
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
    setError('');
  }

  function goToDados() {
    if (!selected) return;
    if (selected.sizes.length && !size) return setError('Selecione o tamanho.');
    if (selected.colors.length && !color) return setError('Selecione a cor.');
    setError('');
    setStep('dados');
  }

  async function validateCoupon() {
    if (!couponCode.trim() || !selected) return;
    setCouponError('');
    try {
      const data = await apiFetch('/store/public/validate-coupon', {
        method: 'POST',
        body: JSON.stringify({ coachId: coachSlug, code: couponCode.trim(), productId: selected.id, quantity }),
      });
      setCoupon(data);
    } catch (e: any) {
      setCoupon(null);
      setCouponError(e.message || 'Cupom inválido');
    }
  }

  async function submit() {
    if (!selected) return;
    const problem = validateBuyer(buyer);
    if (problem) return setError(problem);
    if (delivery === 'SHIPPING' && address.trim().length < 10) return setError('Informe o endereço completo de entrega.');
    setSubmitting(true);
    setError('');
    try {
      const order = await apiFetch<any>('/store/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          productId: selected.id,
          customerName: buyer.name.trim(),
          customerEmail: buyer.email.trim(),
          customerPhone: buyer.phone || undefined,
          size: size || undefined,
          color: color || undefined,
          quantity,
          deliveryMethod: delivery,
          shippingAddress: delivery === 'SHIPPING' ? address.trim() : undefined,
          notes: notes.trim() || undefined,
          couponCode: coupon?.code || undefined,
        }),
      });
      if (!order.requiresPayment) {
        setFreeOrderCode(order.code);
        setStep('sucesso');
        return;
      }
      const checkout = await createCheckout({
        purpose: 'STORE_ORDER',
        refId: order.id,
        refToken: order.accessToken,
        buyer,
        choice,
      });
      router.push(paymentUrl(checkout));
    } catch (e: any) {
      setError(e.message || 'Não foi possível concluir o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Hero */}
      <div className="py-10 px-4 text-center" style={{ background: color1 }}>
        {brand?.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} className="mx-auto max-h-40 max-w-[270px] object-contain" />
        ) : useDefaultLogo ? (
          <div className="inline-block" style={{ isolation: 'isolate', background: RED }}>
            <Image src="/logo.png" alt="RR Rafinha Running" width={270} height={194}
              style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }} />
          </div>
        ) : (
          <p className="text-3xl font-black uppercase tracking-tight text-white">{brand?.name}</p>
        )}
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/80 mt-2 mb-1">Loja Oficial{brand?.name && !useDefaultLogo ? ` · ${brand.name}` : ''}</p>
        <p className="text-sm text-white/80">Pronta-entrega e encomendas · Pagamento por Pix, cartão ou boleto</p>
      </div>

      <div className="px-4 py-8 max-w-3xl mx-auto">
        {loading && (
          <div className="text-center py-12 text-zinc-500">
            <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Carregando produtos…</p>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-zinc-200 bg-white">
            <p className="text-4xl mb-3">🏃</p>
            <p className="font-semibold text-zinc-900">Em breve</p>
            <p className="text-sm mt-1 text-zinc-500">Novos produtos serão lançados em breve!</p>
          </div>
        )}

        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {['', ...categories].map((cat) => (
              <button key={cat || 'all'} onClick={() => setCategoryFilter(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${categoryFilter === cat ? 'border-red-600 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-500'}`}>
                {cat ? CATEGORY_LABEL[cat] ?? cat : 'Todos'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.filter((p) => !categoryFilter || p.category === categoryFilter).map((p) => (
            <div key={p.id} className="rounded-2xl border border-zinc-200 overflow-hidden shadow-sm flex flex-col bg-white">
              <button onClick={() => open(p)} className="w-full h-52 bg-zinc-100 flex items-center justify-center shrink-0">
                {p.images[0] ? (
                  <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">👕</span>
                )}
              </button>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex gap-1.5 mb-2">
                  {p.featured && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white">Destaque</span>}
                  {p.isPreOrder && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-900 text-white">Encomenda</span>}
                </div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mb-1">{CATEGORY_LABEL[p.category] ?? p.category}</p>
                <p className="font-black text-base leading-tight text-zinc-900">{p.name}</p>
                {p.description && <p className="text-xs mt-1 line-clamp-2 text-zinc-500">{p.description}</p>}
                <div className="flex items-end justify-between mt-3">
                  <div>
                    {p.hasAthleteDiscount ? (
                      <>
                        <p className="text-xs text-zinc-400 line-through">{fmtBRL(p.priceInCents)}</p>
                        <p className="font-black text-lg text-emerald-700">{fmtBRL(unitPrice(p))}</p>
                        <p className="text-[10px] text-emerald-700 font-semibold">Seu preço de aluno (−{p.athleteDiscountPercent}%)</p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-lg" style={{ color: color1 }}>{fmtBRL(p.priceInCents)}</p>
                        {p.athleteDiscountPercent > 0 && (
                          <p className="text-[10px] text-emerald-700 font-semibold">Aluno da equipe: −{p.athleteDiscountPercent}% (entre na sua conta)</p>
                        )}
                      </>
                    )}
                  </div>
                  <p className={`text-xs ${p.purchasable ? 'text-emerald-700' : 'text-red-600'}`}>
                    {p.isPreOrder
                      ? p.purchasable
                        ? p.preOrderDeadline ? `Encomende até ${fmtDate(p.preOrderDeadline)}` : 'Encomenda aberta'
                        : p.preOrderRemaining !== null && p.preOrderRemaining <= 0 && (!p.preOrderDeadline || new Date(p.preOrderDeadline).getTime() >= Date.now())
                          ? 'Esgotado (limite de encomendas atingido)'
                          : 'Encomendas encerradas'
                      : p.purchasable ? `${p.available} disponíveis` : 'Esgotado'}
                  </p>
                </div>
                <button
                  onClick={() => open(p)}
                  disabled={!p.purchasable}
                  className="mt-auto pt-3 w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition disabled:cursor-not-allowed"
                  style={{ background: p.purchasable ? gradient : '#E4E4E7', color: p.purchasable ? '#fff' : '#71717A' }}
                >
                  {p.purchasable ? (p.isPreOrder ? 'Encomendar' : 'Comprar') : 'Indisponível'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {partners.length > 0 && (
          <section className="mt-10" aria-labelledby="partners-title">
            <h2 id="partners-title" className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Parceiros da equipe</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {partners.map((pt) => {
                const href = safeHttpUrl(pt.linkUrl);
                const logo = safeHttpUrl(pt.logoUrl);
                const body = (
                  <>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                      style={{ background: pt.color && /^#[0-9a-fA-F]{6}$/.test(pt.color) ? `${pt.color}1A` : '#F4F4F5' }}>
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt={pt.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-2xl" aria-hidden>{pt.emoji || '🤝'}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-zinc-900 truncate">{pt.name}</p>
                      {pt.category && <p className="text-[10px] uppercase tracking-widest text-zinc-500">{pt.category}</p>}
                      {pt.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{pt.description}</p>}
                    </div>
                  </>
                );
                return href ? (
                  <a key={pt.id} href={href} target="_blank" rel="noopener noreferrer nofollow"
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 hover:border-zinc-300 transition">
                    {body}
                  </a>
                ) : (
                  <div key={pt.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3">{body}</div>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-center text-xs mt-8 text-zinc-500">🔒 Pagamento processado por gateway certificado · Dados protegidos (LGPD)</p>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setSelected(null); }}>
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-y-auto max-h-[92vh] bg-white">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black text-base text-zinc-900">{selected.name}</p>
                  <p className="text-sm font-bold" style={{ color: selected.hasAthleteDiscount ? '#047857' : color1 }}>
                    {fmtBRL(unitPrice(selected))}
                    {selected.hasAthleteDiscount && <span className="ml-2 text-xs text-zinc-400 line-through font-normal">{fmtBRL(selected.priceInCents)}</span>}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-2xl leading-none text-zinc-400" aria-label="Fechar">×</button>
              </div>

              {error && step !== 'dados' && <div ref={errorRef} role="alert" className="rounded-xl p-3 mb-3 text-sm bg-red-50 text-red-700">{error}</div>}

              {step === 'produto' && (
                <div className="space-y-4">
                  {selected.images.length > 0 && (
                    <div>
                      <img src={selected.images[imageIdx]} alt={selected.name} className="w-full h-64 object-cover rounded-xl bg-zinc-100" />
                      {selected.images.length > 1 && (
                        <div className="flex gap-2 mt-2 overflow-x-auto">
                          {selected.images.map((src, i) => (
                            <button key={src + i} onClick={() => setImageIdx(i)}
                              className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 ${i === imageIdx ? 'border-red-600' : 'border-transparent'}`}>
                              <img src={src} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selected.description && <p className="text-sm text-zinc-600 whitespace-pre-line">{selected.description}</p>}

                  {selected.isPreOrder && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                      <p className="font-bold text-zinc-900 mb-0.5">📦 Produto sob encomenda</p>
                      {selected.preOrderDeadline && <p>Encomendas até {fmtDate(selected.preOrderDeadline)}.</p>}
                      {selected.estimatedDelivery && <p>Previsão de entrega: {fmtDate(selected.estimatedDelivery)}.</p>}
                      {selected.preOrderRemaining !== null && <p>{selected.preOrderRemaining === 1 ? 'Resta' : 'Restam'} {unidades(selected.preOrderRemaining)}.</p>}
                    </div>
                  )}

                  {selected.sizes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5 text-zinc-500">Tamanho *</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.sizes.map((s) => (
                          <button key={s} onClick={() => setSize(s)}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-bold ${size === s ? 'border-red-600 text-red-700 bg-red-50' : 'border-zinc-200 text-zinc-900'}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.colors.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5 text-zinc-500">Cor *</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.colors.map((c) => (
                          <button key={c} onClick={() => setColor(c)}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-bold ${color === c ? 'border-red-600 text-red-700 bg-red-50' : 'border-zinc-200 text-zinc-900'}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold mb-1.5 text-zinc-500">Quantidade</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full border border-zinc-200 font-black">−</button>
                      <span className="font-black text-zinc-900">{quantity}</span>
                      <button onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} className="w-8 h-8 rounded-full border border-zinc-200 font-black">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-zinc-100 p-3">
                    <span className="text-sm text-zinc-600">Subtotal</span>
                    <span className="font-black text-zinc-900">{fmtBRL(subtotal)}</span>
                  </div>
                  <button onClick={goToDados}
                    className="w-full py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest"
                    style={{ background: gradient }}>
                    Continuar →
                  </button>
                </div>
              )}

              {step === 'dados' && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">
                    {quantity}× {selected.name}{size ? ` · ${size}` : ''}{color ? ` · ${color}` : ''}
                    <button onClick={() => setStep('produto')} className="ml-2 underline">alterar</button>
                  </p>
                  <BuyerFields value={buyer} onChange={setBuyer} />

                  <div>
                    <p className="text-xs font-semibold mb-1.5 text-zinc-500">Entrega</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['PICKUP', 'SHIPPING'] as const).map((d) => (
                        <button key={d} onClick={() => setDelivery(d)}
                          className={`py-2 rounded-xl border text-sm font-bold ${delivery === d ? 'border-red-600 bg-red-50 text-red-700' : 'border-zinc-200 text-zinc-700'}`}>
                          {d === 'PICKUP' ? 'Retirar com a assessoria' : 'Receber em casa'}
                        </button>
                      ))}
                    </div>
                    {delivery === 'SHIPPING' && (
                      <>
                        <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)}
                          placeholder="Rua, número, complemento, bairro, cidade/UF, CEP *"
                          className="mt-2 w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
                        <p className="text-[11px] text-zinc-500 mt-1">O frete, se houver, é combinado com a assessoria.</p>
                      </>
                    )}
                  </div>

                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)"
                    className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />

                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-xs font-bold mb-2 text-zinc-500">🎟️ Cupom de desconto</p>
                    {coupon ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-emerald-700">✓ {coupon.code} (−{fmtBRL(coupon.discountInCents)})</p>
                        <button onClick={() => { setCoupon(null); setCouponCode(''); }} className="text-xs px-2 py-1 rounded border border-red-600 text-red-700">Remover</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input value={couponCode} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && validateCoupon()} placeholder="Código"
                          className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm outline-none uppercase" />
                        <button onClick={validateCoupon} disabled={!couponCode.trim()}
                          className="px-3 py-1.5 rounded-lg text-sm font-bold bg-zinc-900 text-white disabled:bg-zinc-200 disabled:text-zinc-500">Aplicar</button>
                      </div>
                    )}
                    {couponError && <p className="text-xs mt-1 text-red-600">{couponError}</p>}
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-1.5 text-zinc-500">Forma de pagamento</p>
                    <PaymentMethodPicker value={choice} onChange={setChoice} />
                  </div>

                  <div className="rounded-xl bg-zinc-100 p-3 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-600">Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
                    {coupon && <div className="flex justify-between text-emerald-700"><span>Cupom</span><span>−{fmtBRL(coupon.discountInCents)}</span></div>}
                    <div className="flex justify-between font-black text-zinc-900 mt-1"><span>Total</span><span>{fmtBRL(coupon ? coupon.finalInCents : subtotal)}</span></div>
                    {selected.hasAthleteDiscount && (
                      <p className="text-[11px] text-emerald-700 mt-1">Desconto de aluno de {selected.athleteDiscountPercent}% já incluído no total.</p>
                    )}
                    {!selected.hasAthleteDiscount && !isLoggedIn() && selected.athleteDiscountPercent > 0 && (
                      <p className="text-[11px] text-emerald-700 mt-1">Aluno da equipe? Entre na sua conta para ver o preço com {selected.athleteDiscountPercent}% de desconto.</p>
                    )}
                    <p className="text-[11px] text-zinc-500 mt-1">O valor final é calculado com segurança no servidor. Reserva válida por 30 minutos.</p>
                  </div>

                  {error && <div ref={bottomErrorRef} role="alert" className="rounded-xl p-3 text-sm bg-red-50 text-red-700">{error}</div>}

                  <button onClick={submit} disabled={submitting}
                    className="w-full py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest disabled:opacity-70"
                    style={{ background: gradient }}>
                    {submitting ? 'Gerando pagamento…' : 'Ir para o pagamento →'}
                  </button>
                </div>
              )}

              {step === 'sucesso' && (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="text-xl font-black mb-2 text-zinc-900">Pedido confirmado!</h2>
                  <p className="text-sm text-zinc-500">Pedido #{freeOrderCode} — cortesia aplicada, nada a pagar. Enviamos os detalhes por e-mail.</p>
                  <button onClick={() => setSelected(null)} className="mt-5 w-full py-3 rounded-xl text-white font-black uppercase tracking-widest text-sm"
                    style={{ background: gradient }}>Fechar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
