'use client';
// Cadastro de alunos da equipe — usa a marca da própria equipe (GET /teams/public/:slug: nome, logo, cor)
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PRIVACY_VERSION, TERMS_VERSION, LEGAL_ROUTES } from '@/lib/legal';
import { ConsentCheckboxes, EMPTY_CONSENT, isConsentComplete, type ConsentState } from '@/components/legal/ConsentCheckboxes';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { CookieNotice } from '@/components/legal/CookieNotice';

interface Question {
  id: string;
  order: number;
  question: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  placeholder?: string | null;
}

interface NicheInfo {
  key: string;
  label: string;
  icon: string;
  color: string;
}

interface FormData {
  coachId: string;
  coachName: string;
  brandName: string;
  primaryColor: string;
  logoUrl?: string | null;
  niche?: NicheInfo | null;
  form: {
    id: string;
    title: string;
    description?: string | null;
    questions: Question[];
  };
}

type Answers = Record<string, string | string[] | number | boolean>;

/** Resposta vazia: undefined, texto em branco ou lista sem itens (0 e false contam como resposta). */
function isBlankAnswer(v: Answers[string] | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Resposta do POST /onboarding/public/:slug/submit (tolerante a versões antigas e novas da API). */
interface SubmitResponse {
  ok?: boolean;
  existingAccount?: boolean;
  onboardingToken?: string;
  requiresPayment?: boolean;
  /** legado — versões antigas da API retornavam o id do atleta */
  athleteId?: string;
}

/** Plano de mensalidade da equipe (GET /teams/public/:slug). */
interface TeamPlanOption {
  id: string;
  name: string;
  description?: string | null;
  interval: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | string;
  priceInCents: number;
  benefits: string[];
}

const PLAN_INTERVAL_LABEL: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };

/** Referência usada no checkout público: token opaco (atual) ou athleteId (API legada). */
type CheckoutRef = { onboardingToken: string } | { athleteId: string };

const DEFAULT_ACCENT = '#DC3125';
const PAGE  = '#F4F4F5';   // cinza claríssimo — fundo geral
const WHITE = '#FFFFFF';
const DARK  = '#18181B';   // texto primário
const GRAY  = '#71717A';   // texto secundário
const LIGHT = '#E4E4E7';   // bordas / divisores

export default function OnboardingPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const searchParams = useSearchParams();
  const [formData, setFormData]   = useState<FormData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [answers, setAnswers]     = useState<Answers>({});
  const [step, setStep]           = useState<'intro' | 'form' | 'plan' | 'success' | 'existing'>('intro');
  const [submitting, setSubmitting]   = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [athlete, setAthlete]     = useState({ name: '', email: '', phone: '' });

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length <= 2) return d.length ? `+${d}` : '';
    if (d.length <= 4) return `+${d.slice(0,2)} (${d.slice(2)}`;
    if (d.length <= 9) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4)}`;
    if (d.length <= 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
    return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9,13)}`;
  };
  const [checkoutRef, setCheckoutRef] = useState<CheckoutRef | null>(null);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const consentOk = isConsentComplete(consent, true);
  // Checkout: planos REAIS da equipe (GET /teams/public/:slug) → mensalidade Asaas/FAKE → /pedido/<id>
  const [teamPlans, setTeamPlans] = useState<TeamPlanOption[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [buyerCpf, setBuyerCpf] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [referralInfo, setReferralInfo] = useState<{ valid: boolean; referrerName?: string; refereeRewardCents?: number } | null>(null);
  // Marca pública da equipe (nome, logo, cor) — nada de marca fixa de uma equipe específica
  const [team, setTeam] = useState<{ name?: string; logoUrl?: string | null; primaryColor?: string | null } | null>(null);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') setStep('success');
  }, [searchParams]);

  // Validate referral code from URL
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    api.get(`/v1/referrals/public/validate/${ref}`)
      .then(r => setReferralInfo(r.data))
      .catch(() => setReferralInfo({ valid: false }));
  }, [searchParams]);

  useEffect(() => {
    api.get(`/v1/onboarding/public/${slug}`)
      .then(r => setFormData(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    api.get(`/v1/teams/public/${slug}`)
      .then((r) => {
        setTeam({ name: r.data?.name, logoUrl: r.data?.logoUrl, primaryColor: r.data?.primaryColor });
        const list: TeamPlanOption[] = Array.isArray(r.data?.plans) ? r.data.plans : [];
        setTeamPlans(list);
        if (list[0]) setSelectedPlanId((cur) => cur || list[0].id);
      })
      .catch(() => setTeam({}));
  }, [slug]);

  const isHex = (c?: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);
  const RED = isHex(team?.primaryColor) ? team!.primaryColor! : isHex(formData?.primaryColor) ? formData!.primaryColor : DEFAULT_ACCENT;
  const brandName = team?.name || formData?.brandName || 'Assessoria';
  const logoUrl = team?.logoUrl || formData?.logoUrl || null;
  // Evita "da equipe Equipe Dois": não prefixa quando o nome já começa com Equipe/Assessoria/Time
  const hasTeamWord = /^(equipe|assessoria|time|team)\b/i.test(brandName.trim());
  const teamPhrase = hasTeamWord ? `de ${brandName}` : `da equipe ${brandName}`;
  const brandInitials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'A';
  /** Logo da equipe; sem logo, um selo neutro com as iniciais (claro = sobre fundo branco; escuro = sobre a cor da marca). */
  const BrandLogo = ({ size = 'md', onColor = false }: { size?: 'sm' | 'md' | 'lg'; onColor?: boolean }) => {
    const h = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-20' : 'h-16';
    const box = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl';
    if (logoUrl) return <img src={logoUrl} alt={brandName} className={`${h} w-auto object-contain ${size === 'sm' ? 'shrink-0 rounded-lg' : 'mx-auto'}`} />;
    return (
      <div className={`${box} rounded-2xl flex items-center justify-center font-black ${size === 'sm' ? 'shrink-0' : 'mx-auto'}`}
        style={onColor ? { background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' } : { background: `${RED}15`, color: RED }}
        aria-label={brandName} role="img">
        {brandInitials}
      </div>
    );
  };

  // Planos da equipe para o passo de pagamento (carrega quando chega no passo)
  useEffect(() => {
    if (step !== 'plan' || teamPlans !== null) return;
    api.get(`/v1/teams/public/${slug}`)
      .then((r) => {
        const list: TeamPlanOption[] = Array.isArray(r.data?.plans) ? r.data.plans : [];
        setTeamPlans(list);
        if (list[0]) setSelectedPlanId((cur) => cur || list[0].id);
      })
      .catch(() => setTeamPlans([]));
  }, [step, slug, teamPlans]);

  /* ─── Loading ─── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: PAGE }}>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
          style={{ borderColor: RED, borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: GRAY }}>Carregando...</p>
      </div>
    </div>
  );

  /* ─── Not found ─── */
  if (notFound || !formData) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: PAGE }}>
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-bold mb-2" style={{ color: DARK }}>Formulário não encontrado</h1>
        <p className="text-sm" style={{ color: GRAY }}>O link pode estar inválido. Fale com seu treinador.</p>
      </div>
    </div>
  );

  /* ─── Handlers ─── */
  const handleAnswer = (id: string, v: string | string[] | number | boolean) => {
    setAnswers(p => ({ ...p, [id]: v }));
    setMissingIds(ids => ids.filter(x => x !== id));
  };

  const handleMultiSelect = (id: string, opt: string) => {
    setAnswers(p => {
      const cur = (p[id] as string[]) || [];
      return { ...p, [id]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] };
    });
    setMissingIds(ids => ids.filter(x => x !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athlete.name.trim() || !athlete.email.trim()) { setSubmitError('Nome e e-mail são obrigatórios'); return; }
    if (!consentOk) { setSubmitError('Volte ao passo 1 e marque os consentimentos obrigatórios.'); return; }
    const missing = formData.form.questions.filter(q => q.required && isBlankAnswer(answers[q.id]));
    if (missing.length) {
      setMissingIds(missing.map(q => q.id));
      setSubmitError(missing.length === 1
        ? 'Responda a pergunta obrigatória marcada com *.'
        : `Responda as ${missing.length} perguntas obrigatórias marcadas com *.`);
      document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setMissingIds([]);
    setSubmitError(''); setSubmitting(true);
    try {
      const refCode = searchParams.get('ref') || undefined;
      const res = await api.post<SubmitResponse>(`/v1/onboarding/public/${slug}/submit`, {
        athleteName: athlete.name,
        athleteEmail: athlete.email,
        athletePhone: athlete.phone || undefined,
        answers,
        referralCode: refCode,
        // LGPD — aceite + consentimento específico para dados de saúde (anamnese)
        acceptTerms: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        healthDataConsent: true,
        marketingOptIn: consent.marketing,
      });
      const data = res.data ?? {};
      if (data.existingAccount) { setStep('existing'); return; }
      if (data.onboardingToken) setCheckoutRef({ onboardingToken: data.onboardingToken });
      else if (data.athleteId) setCheckoutRef({ athleteId: data.athleteId });
      else setCheckoutRef(null);
      setStep(data.requiresPayment === false ? 'success' : 'plan');
    } catch (err: any) {
      const raw = err?.response?.data?.message;
      setSubmitError((Array.isArray(raw) ? raw.join(' ') : raw) ?? 'Erro ao enviar. Tente novamente.');
    } finally { setSubmitting(false); }
  };

  const handleCheckout = async () => {
    setCheckoutError('');
    if (!checkoutRef || !('onboardingToken' in checkoutRef)) {
      setCheckoutError('Sua sessão de cadastro expirou. Faça login para concluir o pagamento.');
      return;
    }
    if (!selectedPlanId) { setCheckoutError('Escolha um plano.'); return; }
    const cpf = buyerCpf.replace(/\D/g, '');
    if (cpf.length !== 11) { setCheckoutError('Informe um CPF válido para emitir a cobrança.'); return; }
    setCheckingOut(true);
    try {
      const res = await api.post(`/v1/onboarding/public/${slug}/checkout`, {
        onboardingToken: checkoutRef.onboardingToken,
        planId: selectedPlanId,
        billingType: 'PIX',
        buyer: { name: athlete.name, email: athlete.email, cpf, phone: athlete.phone ? athlete.phone.replace(/\D/g, '') : undefined },
      });
      const d = res.data ?? {};
      if (d.paymentId && d.setPasswordPath) {
        try { sessionStorage.setItem(`rr_set_password:${d.paymentId}`, d.setPasswordPath); } catch { /* também vai por e-mail */ }
      }
      if (d.payPath) { window.location.href = d.payPath; return; }
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
      // assinatura criada, mas a 1ª cobrança ainda não chegou do gateway — NÃO é sucesso de pagamento
      setCheckoutError('Sua mensalidade foi criada e a cobrança chegará por e-mail em instantes. Você também pode pagar em "Minha mensalidade" após entrar no app.');
    } catch (err: any) {
      const raw = err?.response?.data?.message;
      setCheckoutError((Array.isArray(raw) ? raw.join(' · ') : raw) || 'Não foi possível gerar a cobrança. Tente novamente.');
    } finally { setCheckingOut(false); }
  };

  /* ─── Shared UI ─── */
  const RedBtn = ({ children, onClick, disabled, type = 'button' }: {
    children: React.ReactNode; onClick?: () => void;
    disabled?: boolean; type?: 'button' | 'submit';
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}
      className="w-full py-4 rounded-2xl text-white text-sm font-black uppercase tracking-widest shadow-md transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
      style={{ background: `linear-gradient(135deg, ${RED} 0%, ${RED}D9 100%)` }}>
      {children}
    </button>
  );

  const StepDots = ({ active }: { active: number }) => (
    <div className="flex items-center justify-center gap-2 mt-4">
      {['Dados', 'Questionário', 'Plano'].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
              style={{ background: i <= active ? RED : LIGHT, color: i <= active ? WHITE : GRAY }}>
              {i < active ? '✓' : i + 1}
            </div>
            <span className="text-xs font-medium hidden sm:block"
              style={{ color: i <= active ? DARK : GRAY }}>{s}</span>
          </div>
          {i < 2 && <div className="w-6 h-px" style={{ background: LIGHT }} />}
        </div>
      ))}
    </div>
  );

  /* ═══════════════ PLAN STEP ═══════════════ */
  if (step === 'plan') {
    const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const selected = teamPlans?.find((p) => p.id === selectedPlanId) ?? null;
    const cpfMask = (v: string) => v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');

    return (
      <div className="min-h-screen" style={{ background: PAGE }}>
        {/* Header */}
        <div className="px-4 pt-8 pb-6 text-center" style={{ background: RED }}>
          <BrandLogo onColor />
          <p className="text-sm font-bold text-white mt-2">{brandName}</p>
          <StepDots active={2} />
        </div>

        <div className="px-4 py-6 max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
              style={{ background: `${RED}12`, border: `1px solid ${RED}30` }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: RED }}>Questionário enviado!</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: DARK }}>Escolha seu plano</h1>
            <p className="text-sm mt-1" style={{ color: GRAY }}>A assessoria começa assim que o pagamento for confirmado.</p>
          </div>

          {teamPlans === null && <div className="h-28 rounded-2xl animate-pulse mb-5" style={{ background: LIGHT }} />}

          {teamPlans !== null && teamPlans.length === 0 && (
            <div className="rounded-2xl border p-5 mb-5 text-sm" style={{ background: WHITE, borderColor: LIGHT, color: DARK }}>
              A equipe ainda não publicou planos de mensalidade. Suas respostas foram recebidas e o treinador vai entrar em contato.
            </div>
          )}

          {teamPlans && teamPlans.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
                {teamPlans.map((plan) => {
                  const sel = selectedPlanId === plan.id;
                  return (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)}
                      className="relative rounded-2xl border-2 p-3 text-left transition-all cursor-pointer"
                      style={{ borderColor: sel ? RED : LIGHT, background: sel ? `${RED}08` : WHITE, boxShadow: sel ? `0 4px 16px ${RED}22` : 'none' }}>
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: GRAY }}>{plan.name}</p>
                      <p className="text-xl font-black mt-1 leading-none" style={{ color: DARK }}>{fmt(plan.priceInCents)}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: GRAY }}>{PLAN_INTERVAL_LABEL[plan.interval] ?? 'Recorrente'} · renovação automática</p>
                      {plan.description && <p className="text-[11px] mt-1" style={{ color: GRAY }}>{plan.description}</p>}
                    </button>
                  );
                })}
              </div>

              {selected && selected.benefits?.length > 0 && (
                <div className="rounded-2xl border p-5 mb-5 shadow-sm" style={{ background: WHITE, borderColor: LIGHT }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: GRAY }}>Incluído no plano:</p>
                  <ul className="space-y-2.5">
                    {selected.benefits.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: DARK }}>
                        <span style={{ color: RED }}>✓</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {referralInfo?.valid && (
                <p className="text-xs mb-3 rounded-xl px-3 py-2" style={{ background: `${RED}0D`, color: DARK }}>
                  Seu crédito de indicação fica guardado na sua conta — ele não é perdido se o pagamento não for concluído.
                </p>
              )}

              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GRAY }} htmlFor="onb-cpf">CPF do pagador</label>
              <input id="onb-cpf" value={buyerCpf} onChange={(e) => setBuyerCpf(cpfMask(e.target.value))} inputMode="numeric" placeholder="000.000.000-00"
                className="w-full px-4 py-3 rounded-xl border text-sm mb-1" style={{ borderColor: LIGHT, background: WHITE, color: DARK }} />
              <p className="text-[11px] mb-4" style={{ color: GRAY }}>Usado só para emitir a cobrança — não fica salvo.</p>

              {checkoutError && (
                <p role="alert" className="text-sm rounded-xl px-3 py-2 mb-3" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>{checkoutError}</p>
              )}

              <RedBtn onClick={handleCheckout} disabled={checkingOut || !selectedPlanId}>
                {checkingOut ? 'Gerando cobrança...' : `Assinar ${selected?.name ?? 'plano'} →`}
              </RedBtn>
              <p className="text-center text-xs mt-3 mb-4" style={{ color: GRAY }}>🔒 Pagamento seguro via Asaas (Pix, boleto ou cartão)</p>
            </>
          )}
          <p className="text-center text-xs" style={{ color: GRAY }}>
            Já tem acesso?{' '}
            <a href="/athlete-login" className="underline font-semibold" style={{ color: RED }}>Fazer login</a>
          </p>
        </div>
      </div>
    );
  }

  /* ═══════════════ EXISTING ACCOUNT ═══════════════ */
  if (step === 'existing') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: PAGE }}>
        <div className="text-center max-w-sm">
          <div className="mb-6"><BrandLogo size="lg" /></div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `${RED}12`, border: `2px solid ${RED}40` }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={RED} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: DARK }}>Você já tem conta</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: GRAY }}>
            Você já tem conta. Enviamos um link de acesso para seu e-mail — ou faça login para continuar.
          </p>
          <a href="/athlete-login" className="inline-block px-8 py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest shadow-md"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED}D9)` }}>
            Fazer login →
          </a>
        </div>
      </div>
    );
  }

  /* ═══════════════ SUCCESS STEP ═══════════════ */
  if (step === 'success') {
    const paid = searchParams.get('payment') === 'success';
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: PAGE }}>
        <div className="text-center max-w-sm">
          <div className="mb-6"><BrandLogo size="lg" /></div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `${RED}12`, border: `2px solid ${RED}40` }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={RED} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {paid ? (
            <>
              <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: DARK }}>Pagamento confirmado!</h1>
              <p className="text-sm leading-relaxed mb-2" style={{ color: GRAY }}>
                Bem-vindo(a), <strong style={{ color: DARK }}>{athlete.name || 'atleta'}</strong>!
              </p>
              <p className="text-sm leading-relaxed mb-6" style={{ color: GRAY }}>
                Verifique seu e-mail — enviamos suas credenciais de acesso.
              </p>
              <a href="/athlete-login" className="inline-block px-8 py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest shadow-md"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED}D9)` }}>
                Acessar o app →
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: DARK }}>Tudo certo!</h1>
              <p className="text-sm leading-relaxed" style={{ color: GRAY }}>
                Obrigado, <strong style={{ color: DARK }}>{athlete.name}</strong>! Suas respostas foram recebidas.
                <br /><br />
                {formData.coachName ? (
                  <>Seu treinador (<strong style={{ color: DARK }}>{formData.coachName}</strong>) vai analisar seu perfil e entrar em contato em breve.</>
                ) : (
                  <>{hasTeamWord ? '' : 'A equipe '}<strong style={{ color: DARK }}>{brandName}</strong> vai analisar seu perfil e entrar em contato em breve.</>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════ INTRO STEP ═══════════════ */
  if (step === 'intro') {
    return (
      <div className="min-h-screen" style={{ background: PAGE }}>
        {/* Referral banner */}
        {referralInfo?.valid && (
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-3 text-center text-sm font-semibold">
            🎁 <strong>{referralInfo.referrerName}</strong> te indicou! Você ganha{' '}
            <strong>R$ {((referralInfo.refereeRewardCents ?? 3000) / 100).toFixed(0)} de desconto</strong> na primeira mensalidade.
          </div>
        )}
        {/* Hero vermelho */}
        <div className="relative overflow-hidden py-12 text-center" style={{ background: RED }}>
          <div className="relative">
            <div className="mb-3"><BrandLogo size="lg" onColor /></div>
            <p className="text-sm font-black uppercase tracking-widest text-white mb-4">{brandName}</p>
            {/* Niche badge */}
            {formData.niche ? (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                <span className="text-lg">{formData.niche.icon}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-white">
                  {formData.niche.label}
                </span>
              </div>
            ) : (
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/80 mb-2">Assessoria esportiva</p>
            )}
            <h1 className="text-3xl font-black uppercase tracking-tight leading-tight text-white">
              Transforme seu<br />
              <span className="text-white/80">
                {formData.niche ? `treino de ${formData.niche.label.toLowerCase()}` : 'treino de corrida'}
              </span>
            </h1>
            <p className="text-sm text-white/80 mt-3 max-w-xs mx-auto">
              Planilhas personalizadas • Integração com Strava • Treinador dedicado
            </p>
          </div>
        </div>

        {/* Card form */}
        <div className="px-4 py-6 max-w-md mx-auto">
          <div className="rounded-2xl border shadow-sm p-6 mb-4" style={{ background: WHITE, borderColor: LIGHT }}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: RED }}>Passo 1 de 3</span>
            <h2 className="text-lg font-black uppercase tracking-tight mt-1 mb-1" style={{ color: DARK }}>
              {formData.form.title}
            </h2>
            <p className="text-xs mb-5" style={{ color: GRAY }}>
              Preencha seus dados para iniciar o questionário {teamPhrase}.
            </p>

            <div className="space-y-3 mb-5">
              {[
                { key: 'name',  label: 'Nome completo *', type: 'text',  ph: 'João da Silva' },
                { key: 'email', label: 'E-mail *',         type: 'email', ph: 'joao@email.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: GRAY }}>
                    {f.label}
                  </label>
                  <input
                    type={f.type}
                    value={athlete[f.key as keyof typeof athlete]}
                    onChange={e => setAthlete(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition"
                    style={{ background: PAGE, border: `1.5px solid ${LIGHT}`, color: DARK }}
                    onFocus={e => (e.target.style.borderColor = RED)}
                    onBlur={e => (e.target.style.borderColor = LIGHT)}
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: GRAY }}>
                  WhatsApp (opcional)
                </label>
                <input
                  type="tel"
                  value={athlete.phone}
                  onChange={e => setAthlete(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                  placeholder="+55 (21) 99698-0356"
                  maxLength={19}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition"
                  style={{ background: PAGE, border: `1.5px solid ${LIGHT}`, color: DARK }}
                  onFocus={e => (e.target.style.borderColor = RED)}
                  onBlur={e => (e.target.style.borderColor = LIGHT)}
                />
              </div>
            </div>

            <div className="mb-5">
              <ConsentCheckboxes value={consent} onChange={setConsent} showHealth accent={RED} idPrefix="onboarding" />
            </div>

            <RedBtn
              disabled={!consentOk}
              onClick={() => {
                if (!athlete.name.trim() || !athlete.email.trim()) { setSubmitError('Nome e e-mail são obrigatórios'); return; }
                if (!consentOk) { setSubmitError('Marque os consentimentos obrigatórios para continuar.'); return; }
                setSubmitError(''); setStep('form');
              }}
            >
              Iniciar Questionário ({formData.form.questions.length} perguntas) →
            </RedBtn>
            {submitError && <p className="text-xs text-center mt-2" style={{ color: RED }}>{submitError}</p>}
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '🏃', label: 'Plano\npersonalizado' },
              { icon: '⌚', label: 'Sincroniza\ncom Strava' },
              { icon: '🏆', label: 'Coach\ndedicado' },
            ].map(b => (
              <div key={b.label} className="rounded-xl p-3 text-center border shadow-sm"
                style={{ background: WHITE, borderColor: LIGHT }}>
                <div className="text-xl mb-1">{b.icon}</div>
                <p className="text-[10px] font-semibold whitespace-pre-line leading-tight" style={{ color: GRAY }}>{b.label}</p>
              </div>
            ))}
          </div>
          <LegalFooterLinks className="mt-6" />
        </div>
        <CookieNotice />
      </div>
    );
  }

  /* ═══════════════ FORM STEP ═══════════════ */
  const totalQ   = formData.form.questions.length;
  const answered = Object.keys(answers).length;
  const pct      = Math.round((answered / totalQ) * 100);

  const optBtn = (sel: boolean): React.CSSProperties => sel
    ? { background: RED, borderColor: RED, color: WHITE }
    : { background: WHITE, borderColor: LIGHT, color: DARK };

  const textInput: React.CSSProperties = {
    background: PAGE, border: `1.5px solid ${LIGHT}`, color: DARK,
  };

  return (
    <div className="min-h-screen" style={{ background: PAGE }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-3 shadow-sm" style={{ background: WHITE, borderBottom: `1px solid ${LIGHT}` }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => setStep('intro')} className="shrink-0 transition hover:opacity-70" style={{ color: GRAY }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <BrandLogo size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GRAY }}>
                Questionário de Anamnese
              </p>
              <span className="text-[10px] font-bold" style={{ color: RED }}>{answered}/{totalQ}</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: LIGHT }}>
              <div className="h-1.5 rounded-full transition-all duration-300"
                style={{ background: RED, width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="px-4 py-5 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-3">
          {formData.form.questions.map(q => (
            <div key={q.id} id={`q-${q.id}`} className="rounded-2xl border p-5 shadow-sm" style={{ background: WHITE, borderColor: missingIds.includes(q.id) ? RED : LIGHT }}>
              <label className="block text-sm font-semibold mb-3" style={{ color: DARK }}>
                <span className="inline-flex items-center justify-center font-black text-xs mr-2 px-2 py-0.5 rounded-lg text-white"
                  style={{ background: RED }}>{q.order}</span>
                {q.question}
                {q.required && <span className="ml-1" style={{ color: RED }}>*</span>}
              </label>

              {q.type === 'TEXT' && (
                <input type="text" value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)} placeholder={q.placeholder || ''}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition"
                  style={textInput}
                  onFocus={e => (e.target.style.borderColor = RED)}
                  onBlur={e => (e.target.style.borderColor = LIGHT)} />
              )}

              {q.type === 'TEXTAREA' && (
                <textarea value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)} placeholder={q.placeholder || ''} rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition resize-none"
                  style={textInput}
                  onFocus={e => (e.target.style.borderColor = RED)}
                  onBlur={e => (e.target.style.borderColor = LIGHT)} />
              )}

              {q.type === 'SELECT' && q.options && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map(opt => (
                    <button key={opt} type="button" onClick={() => handleAnswer(q.id, opt)}
                      className="px-4 py-2 rounded-xl text-sm font-medium border transition cursor-pointer"
                      style={optBtn(answers[q.id] === opt)}>{opt}</button>
                  ))}
                </div>
              )}

              {q.type === 'MULTISELECT' && q.options && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map(opt => {
                    const sel = ((answers[q.id] as string[]) || []).includes(opt);
                    return (
                      <button key={opt} type="button" onClick={() => handleMultiSelect(q.id, opt)}
                        className="px-4 py-2 rounded-xl text-sm font-medium border transition cursor-pointer"
                        style={optBtn(sel)}>{opt}</button>
                    );
                  })}
                </div>
              )}

              {(q.type === 'NUMBER' || q.type === 'TIME') && (
                <input type="text" value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder || (q.type === 'TIME' ? 'mm:ss' : '0')}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition"
                  style={textInput}
                  onFocus={e => (e.target.style.borderColor = RED)}
                  onBlur={e => (e.target.style.borderColor = LIGHT)} />
              )}

              {q.type === 'DATE' && (
                <input type="date" value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition"
                  style={textInput}
                  onFocus={e => (e.target.style.borderColor = RED)}
                  onBlur={e => (e.target.style.borderColor = LIGHT)} />
              )}

              {q.type === 'SCALE' && (
                <div>
                  <div className="flex gap-1.5 flex-wrap mb-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => handleAnswer(q.id, n)}
                        className="w-9 h-9 rounded-xl text-sm font-bold border transition cursor-pointer"
                        style={optBtn(answers[q.id] === n)}>{n}</button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: GRAY }}>
                    <span>Mínimo</span><span>Máximo</span>
                  </div>
                </div>
              )}

              {q.type === 'BOOLEAN' && (
                <div className="flex gap-3">
                  {['Sim', 'Não'].map(opt => (
                    <button key={opt} type="button" onClick={() => handleAnswer(q.id, opt)}
                      className="flex-1 py-3 rounded-xl text-sm font-bold border transition cursor-pointer"
                      style={optBtn(answers[q.id] === opt)}>{opt}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {submitError && (
            <div className="p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', border: `1px solid #FECACA`, color: '#DC2626' }}>
              {submitError}
            </div>
          )}

          <RedBtn type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar Questionário →'}
          </RedBtn>

          <p className="text-center text-xs pb-6" style={{ color: GRAY }}>
            Suas respostas serão analisadas com IA para criar seu plano ideal.{' '}
            <a href={`${LEGAL_ROUTES.privacy}#ia`} target="_blank" rel="noopener noreferrer" className="underline">Saiba como</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
