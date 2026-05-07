'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Audience } from '../page';

const coachPlans = [
  {
    name: 'Starter',
    monthlyPrice: '197',
    annualPrice: '157',
    desc: 'Para coaches iniciando',
    features: ['Até 30 atletas', 'Questionário de anamnese', 'Planos de treino', 'App para atletas', 'Loja virtual', 'Sync Garmin & Strava'],
    cta: 'Começar agora',
    href: '/subscribe',
    highlight: false,
  },
  {
    name: 'Pro',
    monthlyPrice: '397',
    annualPrice: '317',
    desc: 'Para assessorias em crescimento',
    features: ['Até 100 atletas', 'Tudo do Starter', 'Coach Brain IA', 'Eventos e provas', 'Relatórios avançados', 'Live Tracking'],
    cta: 'Experimentar 14 dias grátis',
    href: '/subscribe',
    highlight: true,
  },
  {
    name: 'Scale',
    monthlyPrice: '697',
    annualPrice: '557',
    desc: 'Para assessorias escalando',
    features: ['Até 300 atletas', 'Tudo do Pro', 'Multi-coach', 'Dashboard analítico', 'Acesso à API'],
    cta: 'Quero esse plano',
    href: '/subscribe',
    highlight: false,
  },
  {
    name: 'Elite',
    monthlyPrice: '997',
    annualPrice: '797',
    desc: 'Para grandes assessorias',
    features: ['Atletas ilimitados', 'Tudo do Scale', 'SLA garantido', 'Integração Garmin/Strava', 'Onboarding dedicado'],
    cta: 'Falar com consultor',
    href: '/subscribe',
    highlight: false,
  },
];

const athletePlans = [
  {
    name: 'Mensal',
    monthlyPrice: '174',
    annualPrice: '174',
    desc: 'Flexibilidade total, sem fidelidade',
    features: ['Planilha personalizada', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
    cta: 'Começar agora',
    href: '/onboarding/rafinha',
    highlight: false,
  },
  {
    name: 'Trimestral',
    monthlyPrice: '165',
    annualPrice: '165',
    desc: 'Parcela única — economia de R$27',
    features: ['Tudo do Mensal', 'Equivale a R$165/mês', 'R$495 cobrado uma vez', 'Sem renovação automática'],
    cta: 'Quero esse plano',
    href: '/onboarding/rafinha',
    highlight: true,
  },
  {
    name: 'Semestral',
    monthlyPrice: '160',
    annualPrice: '160',
    desc: 'Parcela única — economia de R$84',
    features: ['Tudo do Mensal', 'Equivale a R$160/mês', 'R$960 cobrado uma vez', 'Sem renovação automática', 'Melhor valor 💰'],
    cta: 'Melhor valor',
    href: '/onboarding/rafinha',
    highlight: false,
  },
];

export function PricingSection({ audience = 'coach' }: { audience?: Audience }) {
  const [annual, setAnnual] = useState(false);
  const isAthlete = audience === 'athlete';
  const plans = isAthlete ? athletePlans : coachPlans;

  return (
    <section id="planos" className="py-24 px-6 bg-white">
      <div className={`${isAthlete ? 'max-w-5xl' : 'max-w-7xl'} mx-auto`}>
        <div className="text-center mb-10">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">Planos</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">
            {isAthlete ? 'Treine com o Rafinha' : 'Para toda assessoria'}
          </h2>
          <p className="text-lg text-gray-500 mb-8">
            {isAthlete ? 'Escolha seu plano e comece sua jornada hoje mesmo.' : 'Comece grátis por 14 dias. Sem cartão de crédito.'}
          </p>

          {!isAthlete && (
            <div className="inline-flex items-center gap-3 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${!annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Mensal
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Anual
                <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">-20%</span>
              </button>
            </div>
          )}
        </div>

        <div className={`grid ${isAthlete ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'} gap-5 md:gap-6 items-center`}>
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-6 border transition-all ${
                p.highlight
                  ? `bg-[#DC2626] border-[#DC2626] shadow-2xl shadow-red-200/60 ${isAthlete ? 'md:scale-105' : ''} ring-2 ring-[#DC2626]`
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              {p.highlight && (
                <div className="text-center mb-3">
                  <span className="px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full uppercase tracking-wide">Mais Popular</span>
                </div>
              )}
              <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${p.highlight ? 'text-red-200' : 'text-gray-400'}`}>{p.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className={`text-4xl font-black ${p.highlight ? 'text-white' : 'text-gray-900'}`}>
                  R${annual ? p.annualPrice : p.monthlyPrice}
                </span>
                <span className={`text-sm mb-1 ${p.highlight ? 'text-red-200' : 'text-gray-400'}`}>/mês</span>
              </div>
              {annual && <p className={`text-xs mb-1 ${p.highlight ? 'text-red-200' : 'text-emerald-600'}`}>cobrado anualmente</p>}
              <p className={`text-sm mb-6 ${p.highlight ? 'text-red-100' : 'text-gray-500'}`}>{p.desc}</p>
              <ul className="space-y-2.5 mb-8">
                {p.features.map((f) => (
                  <li key={f} className={`text-sm flex items-center gap-2 ${p.highlight ? 'text-white' : 'text-gray-600'}`}>
                    <svg className={`w-4 h-4 flex-shrink-0 ${p.highlight ? 'text-red-200' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition-colors ${
                  p.highlight ? 'bg-white text-[#DC2626] hover:bg-red-50' : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
