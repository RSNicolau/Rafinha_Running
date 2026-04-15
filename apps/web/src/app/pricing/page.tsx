'use client';

import { useState } from 'react';
import Link from 'next/link';

const RED = '#DC2626';

// ─── Tier 1: Athlete plans (what athletes pay coaches) ───────────────────────
const ATHLETE_PLANS = [
  {
    name: 'Mensal',
    price: 174,
    period: '/mês',
    badge: null,
    description: 'Flexibilidade total, cancele quando quiser.',
    features: [
      'Planilha de treinos personalizada',
      'Treinos presenciais no grupo',
      'Assessoria em provas',
      'Acesso ao app da equipe',
      'Acompanhamento individual',
    ],
  },
  {
    name: 'Trimestral',
    price: 495,
    period: '/3 meses',
    badge: 'Mais popular',
    description: 'Parcela única. Equivale a R$165/mês.',
    features: [
      'Tudo do Mensal',
      'Economia de R$27 vs mensal',
      'Sem renovação automática',
    ],
  },
  {
    name: 'Semestral',
    price: 960,
    period: '/6 meses',
    badge: 'Melhor valor',
    description: 'Parcela única. Equivale a R$160/mês.',
    features: [
      'Tudo do Mensal',
      'Economia de R$84 vs mensal',
      'Sem renovação automática',
    ],
  },
];

// ─── Tier 2: Coach platform plans ───────────────────────────────────────────
const COACH_PLANS = [
  {
    name: 'Starter',
    price: 197,
    maxAthletes: 30,
    highlighted: false,
    features: ['Até 30 atletas', 'Questionário de anamnese', 'Planos de treino', 'App para atletas', 'Loja virtual'],
  },
  {
    name: 'Pro',
    price: 397,
    maxAthletes: 100,
    highlighted: false,
    features: ['Até 100 atletas', 'Tudo do Starter', 'Coach Brain IA', 'Eventos e provas', 'Relatórios avançados'],
  },
  {
    name: 'Scale',
    price: 697,
    maxAthletes: 300,
    highlighted: true,
    features: ['Até 300 atletas', 'Tudo do Pro', 'Multi-coach', 'Dashboard analítico', 'Acesso à API'],
  },
  {
    name: 'Elite',
    price: 997,
    maxAthletes: null,
    highlighted: false,
    features: ['Atletas ilimitados', 'Tudo do Scale', 'SLA garantido', 'Integração Garmin/Strava', 'Onboarding dedicado'],
  },
];

// ─── Check icon ──────────────────────────────────────────────────────────────
function Check({ color = RED }: { color?: string }) {
  return (
    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<'athletes' | 'coaches' | 'whitelabel'>('athletes');

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div style={{ background: RED }} className="py-14 px-4 text-center text-white">
        <Link href="/" className="inline-block mb-4 text-white/70 hover:text-white text-sm transition">← Voltar</Link>
        <h1 className="text-3xl sm:text-4xl font-black mb-2">Planos & Preços</h1>
        <p className="text-white/80 max-w-lg mx-auto text-sm sm:text-base">
          Transparência total em todas as camadas da plataforma.
        </p>

        {/* Tab selector */}
        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
          {[
            { key: 'athletes', label: '🏃 Para Atletas' },
            { key: 'coaches', label: '📋 Para Coaches' },
            { key: 'whitelabel', label: '🏷️ White Label' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-red-600'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* ── TAB: ATHLETES ── */}
        {activeTab === 'athletes' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-xl font-black text-gray-900 mb-1">Planos para Atletas</h2>
              <p className="text-gray-500 text-sm">Os planos incluem planilha personalizada, treinos presenciais e acesso ao app.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
              {ATHLETE_PLANS.map(plan => (
                <div key={plan.name} className={`bg-white rounded-2xl border-2 flex flex-col ${plan.badge === 'Mais popular' ? 'border-red-500 shadow-xl shadow-red-50' : 'border-gray-100 shadow-sm'}`}>
                  {plan.badge && (
                    <div className="text-center py-1.5 rounded-t-xl text-xs font-black uppercase tracking-widest text-white" style={{ background: RED }}>
                      {plan.badge}
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <p className="font-black text-gray-900 text-base mb-0.5">{plan.name}</p>
                    <p className="text-xs text-gray-400 mb-4">{plan.description}</p>
                    <div className="mb-4">
                      <span className="text-3xl font-black" style={{ color: RED }}>R${plan.price.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-400 text-sm">{plan.period}</span>
                    </div>
                    <ul className="space-y-2 flex-1 mb-5">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                          <Check /> {f}
                        </li>
                      ))}
                    </ul>
                    <a href="/onboarding/rafinha" className="block text-center py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white transition" style={{ background: RED }}>
                      Quero treinar
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-6">
              📍 Treinos na Concha Acústica (terças) e alternados aos sábados · 📞 21 99987-5830
            </p>
          </div>
        )}

        {/* ── TAB: COACHES ── */}
        {activeTab === 'coaches' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-xl font-black text-gray-900 mb-1">Planos para Coaches</h2>
              <p className="text-gray-500 text-sm max-w-xl mx-auto">
                O que a plataforma cobra do coach para gerir sua equipe. Você define o que cobra dos seus atletas.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {COACH_PLANS.map(plan => (
                <div key={plan.name} className={`bg-white rounded-2xl border-2 flex flex-col ${plan.highlighted ? 'border-red-500 shadow-xl shadow-red-50 scale-[1.02]' : 'border-gray-100 shadow-sm'}`}>
                  {plan.highlighted && (
                    <div className="text-center py-1.5 rounded-t-xl text-xs font-black uppercase tracking-widest text-white" style={{ background: RED }}>
                      Mais popular
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <p className="font-black text-gray-900">{plan.name}</p>
                    <div className="my-3">
                      <span className="text-2xl font-black" style={{ color: RED }}>R${plan.price}</span>
                      <span className="text-gray-400 text-sm">/mês</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{plan.maxAthletes ? `Até ${plan.maxAthletes} atletas` : 'Atletas ilimitados'}</p>
                    <ul className="space-y-1.5 flex-1 mb-4">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <Check /> {f}
                        </li>
                      ))}
                    </ul>
                    <a href="/login" className="block text-center py-2 rounded-xl text-xs font-black uppercase tracking-wider transition" style={plan.highlighted ? { background: RED, color: 'white' } : { background: '#F3F4F6', color: '#111827' }}>
                      Começar
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* ROI calculator teaser */}
            <div className="mt-10 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl mx-auto">
              <h3 className="font-black text-gray-900 mb-3">Quanto você ganha com o Scale?</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: '150 atletas × R$174/mês', value: 'R$26.100', sub: 'receita bruta' },
                  { label: 'Plano Scale', value: '– R$697', sub: 'custo da plataforma' },
                  { label: 'Margem líquida', value: 'R$25.403', sub: '97,3% de margem' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className="text-lg font-black" style={{ color: RED }}>{item.value}</p>
                    <p className="text-xs text-gray-500">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: WHITE LABEL ── */}
        {activeTab === 'whitelabel' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-xl font-black text-gray-900 mb-1">White Label</h2>
              <p className="text-gray-500 text-sm max-w-2xl mx-auto">
                Compre a licença da plataforma com sua marca e revenda para coaches de qualquer esporte.
                Você define os preços e fica com 100% da diferença.
              </p>
            </div>

            {/* WL plan card */}
            <div className="max-w-md mx-auto mb-10">
              <div className="bg-white rounded-2xl border-2 border-amber-400 shadow-xl shadow-amber-50 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏷️</span>
                  <p className="font-black text-gray-900 text-lg">White Label</p>
                </div>
                <p className="text-xs text-gray-400 mb-4">Licença completa da plataforma com sua marca</p>
                <div className="mb-4">
                  <span className="text-4xl font-black" style={{ color: RED }}>R$1.497</span>
                  <span className="text-gray-400 text-sm">/mês</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {[
                    'Atletas e coaches ilimitados',
                    'Domínio próprio (seusite.com.br)',
                    'Logo, cores e marca personalizados',
                    'Gerencie até 10 coaches',
                    'Coaches pagam licença para você',
                    'Tudo do plano Elite incluído',
                    'Suporte White Glove dedicado',
                    'Onboarding completo da equipe',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check color="#D97706" /> {f}
                    </li>
                  ))}
                </ul>
                <a href="https://wa.me/5521999987530" className="block text-center py-3 rounded-xl text-sm font-black uppercase tracking-wider text-white transition" style={{ background: '#D97706' }}>
                  Falar com especialista
                </a>
              </div>
            </div>

            {/* How it works */}
            <h3 className="text-center font-black text-gray-900 mb-6">Como funciona o fluxo de licenças</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto mb-10">
              {[
                { step: '1', title: 'Você assina White Label', desc: 'R$1.497/mês — plataforma com sua marca, domínio e painel de controle de coaches.' },
                { step: '2', title: 'Você vende para coaches', desc: 'Cada coach paga você (ex: R$300–500/mês) e gerencia sua equipe de atletas no app.' },
                { step: '3', title: 'Coaches vendem para atletas', desc: 'Cada atleta paga o coach (ex: R$150–300/mês) pelos treinos e pelo acesso ao app.' },
              ].map(item => (
                <div key={item.step} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-sm mb-3" style={{ background: '#D97706' }}>
                    {item.step}
                  </div>
                  <p className="font-bold text-gray-900 text-sm mb-1">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Revenue example */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl mx-auto">
              <h4 className="font-black text-gray-900 mb-4">Exemplo de receita com 5 coaches</h4>
              <div className="space-y-2 text-sm">
                {[
                  { label: '5 coaches × R$400/mês', value: 'R$2.000', positive: true },
                  { label: 'Licença White Label', value: '– R$1.497', positive: false },
                  { label: 'Lucro líquido', value: 'R$503/mês', positive: true, bold: true },
                ].map(row => (
                  <div key={row.label} className={`flex justify-between py-2 ${row.bold ? 'border-t border-gray-100 pt-3' : ''}`}>
                    <span className="text-gray-500">{row.label}</span>
                    <span className={`font-bold ${row.bold ? 'text-lg' : ''}`} style={{ color: row.positive ? '#16A34A' : '#DC2626' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">* Com 10 coaches você lucra R$2.503/mês mantendo o mesmo custo.</p>
            </div>

            <div className="text-center mt-8">
              <a href="/white-label" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm transition" style={{ background: RED }}>
                Ver plataforma completa →
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
