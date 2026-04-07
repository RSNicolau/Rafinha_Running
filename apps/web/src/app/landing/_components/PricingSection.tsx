'use client';
import { useState } from 'react';
import Link from 'next/link';

const plans = [
  {
    name: 'Básico',
    monthlyPrice: '49',
    annualPrice: '39',
    desc: 'Para coaches iniciando',
    features: ['Até 15 atletas', 'Planilhas ilimitadas', 'Sync Garmin & Strava', 'Dashboard web', 'Chat com atletas'],
    cta: 'Começar grátis',
    highlight: false,
  },
  {
    name: 'Pro',
    monthlyPrice: '99',
    annualPrice: '79',
    desc: 'Para assessorias em crescimento',
    features: ['Até 50 atletas', 'IA para planilhas', 'Live Tracking', 'App mobile white-label', 'Suporte prioritário', 'Análise de performance'],
    cta: 'Experimentar 14 dias grátis',
    highlight: true,
  },
  {
    name: 'Elite',
    monthlyPrice: '199',
    annualPrice: '159',
    desc: 'Para grandes assessorias',
    features: ['Atletas ilimitados', 'Tudo do Pro', 'Múltiplos coaches', 'Relatórios financeiros', 'API personalizada', 'Onboarding dedicado'],
    cta: 'Falar com consultor',
    highlight: false,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="planos" className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">Planos</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">Para toda assessoria</h2>
          <p className="text-lg text-gray-500 mb-8">Comece grátis por 14 dias. Sem cartão de crédito.</p>

          {/* Toggle anual/mensal */}
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
        </div>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6 items-center">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-6 border transition-all ${
                p.highlight
                  ? 'bg-[#DC2626] border-[#DC2626] shadow-2xl shadow-red-200/60 md:scale-105 ring-2 ring-[#DC2626]'
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
                href="/login"
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
