'use client';
// v1-api-fix
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

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

export default function OnboardingPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<'intro' | 'form' | 'plan' | 'success'>('intro');
  const [submitting, setSubmitting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [athlete, setAthlete] = useState({ name: '', email: '', phone: '' });
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'mensal' | 'trimestral' | 'semestral'>('mensal');

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setStep('success');
    }
  }, [searchParams]);

  useEffect(() => {
    api.get(`/v1/onboarding/public/${slug}`)
      .then(r => setFormData(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#DC2626] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (notFound || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-gray-50 px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Formulário não encontrado</h1>
          <p className="text-sm text-gray-500">O link pode estar inválido ou expirado. Entre em contato com seu treinador.</p>
        </div>
      </div>
    );
  }

  const primaryColor = formData.primaryColor || '#DC2626';

  const handleAnswer = (questionId: string, value: string | string[] | number | boolean) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleMultiSelect = (questionId: string, option: string) => {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || [];
      return {
        ...prev,
        [questionId]: current.includes(option)
          ? current.filter(o => o !== option)
          : [...current, option],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athlete.name.trim() || !athlete.email.trim()) {
      setSubmitError('Nome e e-mail são obrigatórios');
      return;
    }
    setSubmitError('');
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async () => {
    if (!athleteId) return;
    setCheckingOut(true);
    try {
      const res = await api.post(`/v1/onboarding/public/${slug}/checkout`, { athleteId });
      const checkoutUrl = res.data?.init_point || res.data?.checkoutUrl || res.data?.url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        // No checkout URL (dev environment), go to success directly
        setStep('success');
      }
    } catch {
      setStep('success'); // fallback: treat as complete
    } finally {
      setCheckingOut(false);
    }
  };

  if (step === 'plan') {
    const plans = [
      {
        id: 'mensal' as const,
        label: 'Mensal',
        price: '174',
        cents: '00',
        period: 'por mês',
        badge: null,
        saving: null,
      },
      {
        id: 'trimestral' as const,
        label: 'Trimestral',
        price: '495',
        cents: '00',
        period: 'parcela única',
        badge: 'MAIS POPULAR',
        saving: 'Economia de R$27',
      },
      {
        id: 'semestral' as const,
        label: 'Semestral',
        price: '960',
        cents: '00',
        period: 'parcela única',
        badge: 'MELHOR VALOR',
        saving: 'Economia de R$84',
      },
    ];

    const features = [
      'Planilhas de treino personalizadas',
      'Treino no Parque Poliesportivo da Concha Acústica (terças de manhã)',
      'Treinos alternados aos sábados',
      'Assessoria em provas',
      'Acesso ao App da equipe para prescrição dos treinos',
      'Chat direto com o coach',
      'Análise de performance com IA',
      'Dados Garmin / Strava integrados',
    ];

    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-gray-50 px-4 py-8">
        <div className="w-full max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ background: primaryColor }}>
              {formData!.brandName.charAt(0)}
            </div>
            <h1 className="text-xl font-bold text-gray-900">Questionário enviado!</h1>
            <p className="text-sm text-gray-500 mt-1">Agora, escolha seu plano de treino</p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {['Dados', 'Questionário', 'Plano'].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: i <= 2 ? primaryColor : '#E5E7EB' }}>
                  {i < 2 ? '✓' : i + 1}
                </div>
                <span className="text-xs text-gray-500 hidden sm:block">{s}</span>
                {i < 2 && <div className="w-6 h-px bg-gray-300" />}
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {plans.map(plan => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative rounded-xl border-2 p-3 text-center transition-all cursor-pointer ${
                  selectedPlan === plan.id ? 'shadow-md' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
                style={selectedPlan === plan.id ? { borderColor: primaryColor, background: `${primaryColor}08` } : {}}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white whitespace-nowrap"
                    style={{ background: primaryColor }}>
                    {plan.badge}
                  </span>
                )}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">{plan.label}</p>
                <p className="text-2xl font-black text-gray-900 mt-1">
                  R${plan.price}<span className="text-sm font-normal text-gray-500">,{plan.cents}</span>
                </p>
                <p className="text-[11px] text-gray-400">{plan.period}</p>
                {plan.saving && (
                  <p className="text-[10px] font-semibold mt-1" style={{ color: primaryColor }}>{plan.saving}</p>
                )}
              </button>
            ))}
          </div>

          {/* Features */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">O que está incluído:</p>
            <ul className="space-y-2.5">
              {features.map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke={primaryColor} strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleCheckout}
            disabled={checkingOut}
            className="w-full py-4 rounded-xl text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-md mb-3"
            style={{ background: primaryColor }}
          >
            {checkingOut ? 'Redirecionando...' : `Assinar Plano ${plans.find(p => p.id === selectedPlan)?.label} →`}
          </button>
          <p className="text-center text-xs text-gray-400 mb-4">
            Pagamento seguro via Mercado Pago. Cancele quando quiser.
          </p>

          <p className="text-center text-xs text-gray-400">
            Já recebeu suas credenciais por email? <a href="/login" className="underline">Fazer login</a>
          </p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    const paymentConfirmed = searchParams.get('payment') === 'success';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-gray-50 px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: `${primaryColor}15` }}>
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke={primaryColor} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          {paymentConfirmed ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Pagamento confirmado!</h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-2">
                Bem-vindo(a) à assessoria, <strong>{athlete.name || 'atleta'}</strong>!
              </p>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Verifique seu e-mail — enviamos suas credenciais de acesso.
              </p>
              <a href="/login" className="inline-block px-6 py-3 rounded-xl text-white text-sm font-semibold" style={{ background: primaryColor }}>
                Acessar o app
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Tudo certo!</h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-2">
                Obrigado, <strong>{athlete.name}</strong>! Suas respostas foram recebidas.
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                <strong>{formData?.coachName}</strong> vai analisar seu perfil e entrar em contato em breve.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (step === 'intro') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-gray-50 px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {formData.logoUrl ? (
              <img src={formData.logoUrl} alt={formData.brandName} className="w-40 mx-auto mb-4 rounded-2xl shadow-md" />
            ) : (
              <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                style={{ background: primaryColor }}>
                {formData.brandName.charAt(0)}
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{formData.brandName}</h1>
            <p className="text-sm text-gray-500 mt-1">Assessoria de Corrida com {formData.coachName}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{formData.form.title}</h2>
            {formData.form.description && (
              <p className="text-sm text-gray-500 mb-4">{formData.form.description}</p>
            )}
            <p className="text-sm text-gray-500 mb-5">
              Preencha o questionário abaixo para que {formData.coachName} possa criar um plano de treino personalizado para você.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Seu nome completo *</label>
                <input
                  type="text"
                  value={athlete.name}
                  onChange={e => setAthlete(p => ({ ...p, name: e.target.value }))}
                  placeholder="João da Silva"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">E-mail *</label>
                <input
                  type="email"
                  value={athlete.email}
                  onChange={e => setAthlete(p => ({ ...p, email: e.target.value }))}
                  placeholder="joao@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">WhatsApp (opcional)</label>
                <input
                  type="tel"
                  value={athlete.phone}
                  onChange={e => setAthlete(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!athlete.name.trim() || !athlete.email.trim()) {
                  setSubmitError('Nome e e-mail são obrigatórios');
                  return;
                }
                setSubmitError('');
                setStep('form');
              }}
              className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition hover:opacity-90 cursor-pointer"
              style={{ background: primaryColor }}
            >
              Iniciar Questionário ({formData.form.questions.length} perguntas) →
            </button>
            {submitError && <p className="text-xs text-red-500 mt-2 text-center">{submitError}</p>}
          </div>
        </div>
      </div>
    );
  }

  // step === 'form'
  const totalQ = formData.form.questions.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-gray-50 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep('intro')} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-1">{formData.form.title}</p>
            <div className="w-full h-1.5 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ background: primaryColor, width: `${(Object.keys(answers).length / totalQ) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-gray-400">{Object.keys(answers).length}/{totalQ}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.form.questions.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                {q.order}. {q.question}
                {q.required && <span className="text-red-400 ml-1">*</span>}
              </label>

              {q.type === 'TEXT' && (
                <input
                  type="text"
                  value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder || ''}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              )}

              {q.type === 'TEXTAREA' && (
                <textarea
                  value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder || ''}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition resize-none"
                />
              )}

              {q.type === 'SELECT' && q.options && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleAnswer(q.id, opt)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition cursor-pointer ${
                        answers[q.id] === opt
                          ? 'text-white border-transparent'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={answers[q.id] === opt ? { background: primaryColor, borderColor: primaryColor } : {}}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'MULTISELECT' && q.options && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map(opt => {
                    const selected = ((answers[q.id] as string[]) || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleMultiSelect(q.id, opt)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition cursor-pointer ${
                          selected ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                        style={selected ? { background: primaryColor, borderColor: primaryColor } : {}}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {(q.type === 'NUMBER' || q.type === 'TIME') && (
                <input
                  type="text"
                  value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder || (q.type === 'TIME' ? 'mm:ss' : '')}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              )}

              {q.type === 'DATE' && (
                <input
                  type="date"
                  value={(answers[q.id] as string) || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#DC2626] transition"
                />
              )}

              {q.type === 'SCALE' && (
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleAnswer(q.id, n)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold border transition cursor-pointer ${
                        answers[q.id] === n ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={answers[q.id] === n ? { background: primaryColor } : {}}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'BOOLEAN' && (
                <div className="flex gap-3">
                  {['Sim', 'Não'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleAnswer(q.id, opt)}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition cursor-pointer ${
                        answers[q.id] === opt ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={answers[q.id] === opt ? { background: primaryColor } : {}}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 text-sm text-red-600">{submitError}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-lg"
            style={{ background: primaryColor }}
          >
            {submitting ? 'Enviando...' : 'Enviar Questionário →'}
          </button>

          <p className="text-center text-xs text-gray-400 pb-4">
            Suas respostas serão analisadas por {formData.coachName} e uma proposta personalizada será gerada.
          </p>
        </form>
      </div>
    </div>
  );
}
