'use client';

import { useState } from 'react';
import Link from 'next/link';

const RED = '#DC2626';
const DARK = '#111827';

const PLANS = [
  {
    type: 'STARTER',
    name: 'Starter',
    price: 197,
    maxAthletes: 30,
    highlighted: false,
    cta: 'Começar agora',
    description: 'Perfeito para coaches iniciando sua assessoria.',
    features: [
      'Até 30 atletas',
      'Questionário de anamnese',
      'Planos de treino personalizados',
      'App para atletas',
      'Loja virtual',
    ],
  },
  {
    type: 'PRO',
    name: 'Pro',
    price: 397,
    maxAthletes: 100,
    highlighted: false,
    cta: 'Assinar Pro',
    description: 'Para assessorias em crescimento com equipe estruturada.',
    features: [
      'Até 100 atletas',
      'Tudo do Starter',
      'Coach Brain IA (Claude)',
      'Gestão de eventos e provas',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
  },
  {
    type: 'SCALE',
    name: 'Scale',
    price: 697,
    maxAthletes: 300,
    highlighted: true,
    cta: 'Assinar Scale',
    description: 'Para times consolidados com grande base de atletas.',
    features: [
      'Até 300 atletas',
      'Tudo do Pro',
      'Múltiplos coaches',
      'Dashboard analítico',
      'Acesso à API',
    ],
  },
  {
    type: 'ELITE',
    name: 'Elite',
    price: 997,
    maxAthletes: null,
    highlighted: false,
    cta: 'Assinar Elite',
    description: 'Sem limites para as maiores assessorias do Brasil.',
    features: [
      'Atletas ilimitados',
      'Tudo do Scale',
      'SLA garantido',
      'Onboarding dedicado',
      'Integração Garmin & Strava',
    ],
  },
  {
    type: 'WHITE_LABEL',
    name: 'White Label',
    price: 1497,
    maxAthletes: null,
    highlighted: false,
    cta: 'Falar com vendas',
    description: 'Venda o app com sua própria marca para outros coaches.',
    features: [
      'Atletas ilimitados',
      'Tudo do Elite',
      'Domínio próprio',
      'Sua marca (logo, cores)',
      'Gerencie até 10 coaches',
      'Coaches pagam licença para você',
      'Suporte White Glove',
    ],
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const discount = 0.17; // 2 meses grátis no anual

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div style={{ background: RED }} className="py-16 px-4 text-center text-white">
        <Link href="/" className="inline-block mb-6 opacity-80 hover:opacity-100 transition">
          <span className="text-sm font-medium">← Voltar</span>
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black mb-3">Planos para cada tamanho de assessoria</h1>
        <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto">
          Do coach solo às maiores equipes do Brasil. Cancele quando quiser.
        </p>

        {/* Annual toggle */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <span className={`text-sm font-medium ${!annual ? 'text-white' : 'text-white/60'}`}>Mensal</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`w-12 h-6 rounded-full transition-colors relative ${annual ? 'bg-white/30' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${annual ? 'left-7' : 'left-1'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-white' : 'text-white/60'}`}>
            Anual <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full ml-1">2 meses grátis</span>
          </span>
        </div>
      </div>

      {/* Plans grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {PLANS.map(plan => {
            const monthlyPrice = annual ? Math.round(plan.price * (1 - discount)) : plan.price;
            return (
              <div
                key={plan.type}
                className={`bg-white rounded-2xl border-2 flex flex-col ${
                  plan.highlighted
                    ? 'border-red-500 shadow-xl shadow-red-100 scale-[1.02]'
                    : 'border-gray-100 shadow-sm'
                }`}
              >
                {plan.highlighted && (
                  <div className="text-center py-1.5 rounded-t-xl text-xs font-black uppercase tracking-widest text-white" style={{ background: RED }}>
                    Mais popular
                  </div>
                )}

                <div className="p-5 flex flex-col flex-1">
                  <p className="font-black text-lg text-gray-900">{plan.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-4">{plan.description}</p>

                  <div className="mb-4">
                    <span className="text-3xl font-black" style={{ color: RED }}>
                      R${monthlyPrice.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-gray-400 text-sm">/mês</span>
                    {annual && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        R${(monthlyPrice * 10).toLocaleString('pt-BR')}/ano (10x)
                      </p>
                    )}
                  </div>

                  <div className="text-xs font-semibold text-gray-500 mb-3">
                    {plan.maxAthletes ? `Até ${plan.maxAthletes} atletas` : 'Atletas ilimitados'}
                  </div>

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                        <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: RED }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={plan.type === 'WHITE_LABEL' ? 'https://wa.me/5521999987530' : '/login'}
                    className="mt-auto block text-center py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition"
                    style={plan.highlighted
                      ? { background: RED, color: 'white' }
                      : { background: '#F3F4F6', color: DARK }}
                  >
                    {plan.cta}
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ / comparison */}
        <div className="mt-16 text-center">
          <h2 className="text-xl font-black text-gray-900 mb-2">Como funciona o White Label?</h2>
          <p className="text-gray-500 text-sm max-w-2xl mx-auto">
            Você assina o plano White Label e recebe o app com sua marca, domínio próprio e cores personalizadas.
            Então você vende licenças para outros coaches (ex: R$300/mês cada), que por sua vez cobram seus atletas.
            Você controla tudo pelo painel de administração.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 max-w-3xl mx-auto text-left">
            {[
              { step: '1', title: 'Você assina White Label', desc: 'R$1.497/mês com sua marca, domínio e até 10 coaches' },
              { step: '2', title: 'Você vende para coaches', desc: 'Cada coach paga você (ex: R$300–500/mês) e gerencia seus atletas' },
              { step: '3', title: 'Coaches vendem para atletas', desc: 'Cada atleta paga o coach mensalmente pelo app e pelos treinos' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-sm mb-3" style={{ background: RED }}>
                  {item.step}
                </div>
                <p className="font-bold text-gray-900 text-sm mb-1">{item.title}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 text-sm mb-4">Dúvidas? Fale com a gente</p>
          <a
            href="https://wa.me/5521999987530"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm transition"
            style={{ background: '#16A34A' }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        </div>
      </div>
    </main>
  );
}
