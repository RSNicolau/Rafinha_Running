'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Audience } from '../page';

interface ApiPlan {
  id: string;
  name: string;
  price: number; // cents
  description?: string;
  features: string[];
}

interface PlansConfig {
  coach: ApiPlan[];
  athlete: ApiPlan[];
}

const HIGHLIGHT_IDS = new Set(['PRO', 'QUARTERLY']);
const ATHLETE_HREF = `/onboarding/${process.env.NEXT_PUBLIC_DEFAULT_COACH_ID ?? 'rafinha'}`;

function formatPrice(cents: number): string {
  return Math.round(cents / 100).toLocaleString('pt-BR');
}

export function PricingSection({ audience = 'coach' }: { audience?: Audience }) {
  const isAthlete = audience === 'athlete';
  const [config, setConfig] = useState<PlansConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform/plans-config')
      .then((r) => r.json())
      .then((data) => {
        if (data?.coach && data?.athlete) setConfig(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const plans = config ? (isAthlete ? config.athlete : config.coach) : [];

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
        </div>

        {loading ? (
          <div className={`grid ${isAthlete ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'} gap-5 md:gap-6`}>
            {[...Array(isAthlete ? 3 : 4)].map((_, i) => (
              <div key={i} className="rounded-2xl p-6 border border-gray-100 animate-pulse">
                <div className="h-3 w-16 bg-gray-100 rounded mb-3" />
                <div className="h-9 w-24 bg-gray-100 rounded mb-4" />
                <div className="space-y-2 mb-8">
                  {[...Array(4)].map((_, j) => <div key={j} className="h-3 bg-gray-100 rounded" />)}
                </div>
                <div className="h-11 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-gray-400 text-sm">
            Não foi possível carregar os planos agora. <Link href={isAthlete ? ATHLETE_HREF : '/subscribe'} className="text-[#DC2626] font-semibold">Fale com a gente →</Link>
          </p>
        ) : (
          <div className={`grid ${isAthlete ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'} gap-5 md:gap-6 items-center`}>
            {plans.map((p) => {
              const highlight = HIGHLIGHT_IDS.has(p.id);
              const href = isAthlete ? ATHLETE_HREF : '/subscribe';
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-6 border transition-all ${
                    highlight
                      ? `bg-[#DC2626] border-[#DC2626] shadow-2xl shadow-red-200/60 ${isAthlete ? 'md:scale-105' : ''} ring-2 ring-[#DC2626]`
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  {highlight && (
                    <div className="text-center mb-3">
                      <span className="px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full uppercase tracking-wide">Mais Popular</span>
                    </div>
                  )}
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${highlight ? 'text-red-200' : 'text-gray-400'}`}>{p.name}</p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className={`text-4xl font-black ${highlight ? 'text-white' : 'text-gray-900'}`}>
                      R${formatPrice(p.price)}
                    </span>
                    {!isAthlete && <span className={`text-sm mb-1 ${highlight ? 'text-red-200' : 'text-gray-400'}`}>/mês</span>}
                  </div>
                  {p.description && <p className={`text-sm mb-6 ${highlight ? 'text-red-100' : 'text-gray-500'}`}>{p.description}</p>}
                  <ul className="space-y-2.5 mb-8">
                    {p.features.map((f) => (
                      <li key={f} className={`text-sm flex items-center gap-2 ${highlight ? 'text-white' : 'text-gray-600'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-red-200' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={href}
                    className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition-colors ${
                      highlight ? 'bg-white text-[#DC2626] hover:bg-red-50' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    Começar agora
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
