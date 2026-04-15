'use client';
// RR Rafinha Running — brand light theme: vermelho + branco + cinza claro
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import Image from 'next/image';

interface Question {
  id: string;
  order: number;
  question: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  placeholder?: string | null;
}

interface FormData {
  coachId: string;
  coachName: string;
  brandName: string;
  primaryColor: string;
  logoUrl?: string | null;
  form: {
    id: string;
    title: string;
    description?: string | null;
    questions: Question[];
  };
}

type Answers = Record<string, string | string[] | number | boolean>;

const RED   = '#DC3125';
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
  const [step, setStep]           = useState<'intro' | 'form' | 'plan' | 'success'>('intro');
  const [submitting, setSubmitting]   = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [athlete, setAthlete]     = useState({ name: '', email: '', phone: '' });
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'mensal' | 'trimestral' | 'semestral'>('mensal');

  useEffect(() => {
    if (searchParams.get('payment') === 'success') setStep('success');
  }, [searchParams]);

  useEffect(() => {
    api.get(`/v1/onboarding/public/${slug}`)
      .then(r => setFormData(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

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
        <Image src="/logo.png" alt="RR" width={120} height={86} className="mx-auto mb-5 rounded-2xl" />
        <h1 className="text-lg font-bold mb-2" style={{ color: DARK }}>Formulário não encontrado</h1>
        <p className="text-sm" style={{ color: GRAY }}>O link pode estar inválido. Fale com seu treinador.</p>
      </div>
    </div>
  );

  /* ─── Handlers ─── */
  const handleAnswer = (id: string, v: string | string[] | number | boolean) =>
    setAnswers(p => ({ ...p, [id]: v }));

  const handleMultiSelect = (id: string, opt: string) =>
    setAnswers(p => {
      const cur = (p[id] as string[]) || [];
      return { ...p, [id]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] };
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athlete.name.trim() || !athlete.email.trim()) { setSubmitError('Nome e e-mail são obrigatórios'); return; }
    setSubmitError(''); setSubmitting(true);
    try {
      const res = await api.post(`/v1/onboarding/public/${slug}/submit`, {
        coachId: formData!.coachId,
        athleteName: athlete.name,
        athleteEmail: athlete.email,
        athletePhone: athlete.phone || undefined,
        answers,
      });
      setAthleteId(res.data.athleteId);
      setStep('plan');
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'Erro ao enviar. Tente novamente.');
    } finally { setSubmitting(false); }
  };

  const handleCheckout = async () => {
    if (!athleteId) return;
    setCheckingOut(true);
    try {
      const res = await api.post(`/v1/onboarding/public/${slug}/checkout`, { athleteId, planType: selectedPlan });
      const url = res.data?.init_point || res.data?.checkoutUrl || res.data?.url;
      if (url) window.location.href = url; else setStep('success');
    } catch { setStep('success'); }
    finally { setCheckingOut(false); }
  };

  /* ─── Shared UI ─── */
  const RedBtn = ({ children, onClick, disabled, type = 'button' }: {
    children: React.ReactNode; onClick?: () => void;
    disabled?: boolean; type?: 'button' | 'submit';
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}
      className="w-full py-4 rounded-2xl text-white text-sm font-black uppercase tracking-widest shadow-md transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
      style={{ background: `linear-gradient(135deg, ${RED} 0%, #B91C1C 100%)` }}>
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
    const plans = [
      { id: 'mensal'     as const, label: 'Mensal',     price: '174', period: '/mês',   badge: null,          saving: null },
      { id: 'trimestral' as const, label: 'Trimestral', price: '495', period: 'único',  badge: 'MAIS POPULAR', saving: 'Economia R$27' },
      { id: 'semestral'  as const, label: 'Semestral',  price: '960', period: 'único',  badge: 'MELHOR VALOR', saving: 'Economia R$84' },
    ];
    const features = [
      'Planilhas de treino personalizadas',
      'Treinos no Parque Poliesportivo (terças de manhã)',
      'Treinos alternados aos sábados',
      'Assessoria em provas',
      'App da equipe com prescrição de treinos',
      'Chat direto com o coach',
      'Análise de performance com IA',
      'Integração Garmin / Strava',
    ];

    return (
      <div className="min-h-screen" style={{ background: PAGE }}>
        {/* Header */}
        <div className="px-4 pt-8 pb-6 text-center" style={{ background: '#CC1F1A' }}>
          <div className="inline-block" style={{ isolation: 'isolate', background: '#CC1F1A' }}>
            <Image src="/logo.png" alt="RR Rafinha Running" width={110} height={79}
              style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }} />
          </div>
          <StepDots active={2} />
        </div>

        <div className="px-4 py-6 max-w-lg mx-auto">
          {/* Sucesso badge */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
              style={{ background: `${RED}12`, border: `1px solid ${RED}30` }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke={RED} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: RED }}>Questionário enviado!</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: DARK }}>Escolha seu Plano</h1>
            <p className="text-sm mt-1" style={{ color: GRAY }}>Comece sua assessoria personalizada hoje</p>
          </div>

          {/* Planos */}
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            {plans.map(plan => {
              const sel = selectedPlan === plan.id;
              return (
                <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                  className="relative rounded-2xl border-2 p-3 text-center transition-all cursor-pointer"
                  style={{ borderColor: sel ? RED : LIGHT, background: sel ? `${RED}08` : WHITE, boxShadow: sel ? `0 4px 16px ${RED}22` : 'none' }}>
                  {plan.badge && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: RED, color: WHITE }}>{plan.badge}</span>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: GRAY }}>{plan.label}</p>
                  <p className="text-xl font-black mt-1 leading-none" style={{ color: DARK }}>
                    R${plan.price}<span className="text-xs font-normal" style={{ color: GRAY }}>,00</span>
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: GRAY }}>{plan.period}</p>
                  {plan.saving && <p className="text-[9px] font-bold mt-1" style={{ color: RED }}>{plan.saving}</p>}
                </button>
              );
            })}
          </div>

          {/* Features */}
          <div className="rounded-2xl border p-5 mb-5 shadow-sm" style={{ background: WHITE, borderColor: LIGHT }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: GRAY }}>Tudo incluído na assessoria:</p>
            <ul className="space-y-2.5">
              {features.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: DARK }}>
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke={RED} strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <RedBtn onClick={handleCheckout} disabled={checkingOut}>
            {checkingOut ? 'Redirecionando...' : `Assinar Plano ${plans.find(p => p.id === selectedPlan)?.label} →`}
          </RedBtn>
          <p className="text-center text-xs mt-3 mb-4" style={{ color: GRAY }}>🔒 Pagamento seguro via Mercado Pago</p>
          <p className="text-center text-xs" style={{ color: GRAY }}>
            Já tem acesso?{' '}
            <a href="/login" className="underline font-semibold" style={{ color: RED }}>Fazer login</a>
          </p>
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
          <Image src="/logo.png" alt="RR" width={110} height={79} className="mx-auto mb-6 rounded-2xl shadow-md" />
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
              <a href="/login" className="inline-block px-8 py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest shadow-md"
                style={{ background: `linear-gradient(135deg, ${RED}, #B91C1C)` }}>
                Acessar o app →
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: DARK }}>Tudo certo!</h1>
              <p className="text-sm leading-relaxed" style={{ color: GRAY }}>
                Obrigado, <strong style={{ color: DARK }}>{athlete.name}</strong>! Suas respostas foram recebidas.
                <br /><br />
                O coach <strong style={{ color: DARK }}>Rafinha</strong> vai analisar seu perfil e entrar em contato em breve.
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
        {/* Hero vermelho */}
        <div className="relative overflow-hidden py-12 text-center" style={{ background: '#CC1F1A' }}>
          <div className="relative">
            <div className="inline-block mx-auto mb-5" style={{ isolation: 'isolate', background: '#CC1F1A' }}>
              <Image
                src="/logo.png"
                alt="RR Rafinha Running"
                width={200}
                height={144}
                style={{
                  display: 'block',
                  filter: 'saturate(0) brightness(0.6) contrast(100)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-100 mb-2">Assessoria de Corrida</p>
            <h1 className="text-3xl font-black uppercase tracking-tight leading-tight text-white">
              Transforme seu<br /><span className="text-red-200">treino de corrida</span>
            </h1>
            <p className="text-sm text-red-100 mt-3 max-w-xs mx-auto">
              Planilhas personalizadas • IA + Garmin • Coach dedicado
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
              Preencha seus dados para iniciar o questionário com o coach Rafinha.
            </p>

            <div className="space-y-3 mb-5">
              {[
                { key: 'name',  label: 'Nome completo *',      type: 'text',  ph: 'João da Silva' },
                { key: 'email', label: 'E-mail *',             type: 'email', ph: 'joao@email.com' },
                { key: 'phone', label: 'WhatsApp (opcional)',   type: 'tel',   ph: '(11) 99999-9999' },
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
            </div>

            <RedBtn onClick={() => {
              if (!athlete.name.trim() || !athlete.email.trim()) { setSubmitError('Nome e e-mail são obrigatórios'); return; }
              setSubmitError(''); setStep('form');
            }}>
              Iniciar Questionário ({formData.form.questions.length} perguntas) →
            </RedBtn>
            {submitError && <p className="text-xs text-center mt-2" style={{ color: RED }}>{submitError}</p>}
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '🏃', label: 'Plano\npersonalizado' },
              { icon: '🤖', label: 'IA +\nGarmin' },
              { icon: '🏆', label: 'Coach\ndedicado' },
            ].map(b => (
              <div key={b.label} className="rounded-xl p-3 text-center border shadow-sm"
                style={{ background: WHITE, borderColor: LIGHT }}>
                <div className="text-xl mb-1">{b.icon}</div>
                <p className="text-[10px] font-semibold whitespace-pre-line leading-tight" style={{ color: GRAY }}>{b.label}</p>
              </div>
            ))}
          </div>
        </div>
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
          <Image src="/logo.png" alt="RR" width={32} height={23} className="rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GRAY }}>
                Questionário de Anamnese
              </p>
              <span className="text-[10px] font-bold" style={{ color: RED }}>{answered}/{totalQ}</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: LIGHT }}>
              <div className="h-1.5 rounded-full transition-all duration-300"
                style={{ background: `linear-gradient(90deg, ${RED}, #EF4444)`, width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="px-4 py-5 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-3">
          {formData.form.questions.map(q => (
            <div key={q.id} className="rounded-2xl border p-5 shadow-sm" style={{ background: WHITE, borderColor: LIGHT }}>
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
            Suas respostas serão analisadas com IA para criar seu plano ideal.
          </p>
        </form>
      </div>
    </div>
  );
}
