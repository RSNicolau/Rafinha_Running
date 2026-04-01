'use client';

import Link from 'next/link';
import { useState } from 'react';

const features = [
  {
    icon: '📊',
    title: 'Dashboard Completo',
    desc: 'Acompanhe o desempenho de cada atleta em tempo real. Distância, pace, frequência cardíaca, evolução semana a semana.',
  },
  {
    icon: '📋',
    title: 'Planilhas Inteligentes',
    desc: 'Crie planilhas personalizadas com IA. Treinos adaptados ao nível e objetivo de cada atleta.',
  },
  {
    icon: '⌚',
    title: 'Sync com Garmin & Strava',
    desc: 'Dados do treino chegam automaticamente após a corrida. Integração nativa com Garmin Connect, Strava, Apple Health.',
  },
  {
    icon: '📍',
    title: 'Live Tracking',
    desc: 'Acompanhe seus atletas correndo em tempo real no mapa. Pace, distância e frequência cardíaca ao vivo.',
  },
  {
    icon: '🏆',
    title: 'Ranking & Evolução',
    desc: 'Gamificação que motiva. Recordes pessoais, streak de treinos e ranking entre os atletas da assessoria.',
  },
  {
    icon: '💬',
    title: 'Comunicação Direta',
    desc: 'Chat integrado entre coach e atleta. Feedback de treino, ajustes de planilha e motivação no mesmo lugar.',
  },
];

const plans = [
  {
    name: 'Básico',
    price: '49',
    desc: 'Para coaches iniciando',
    features: ['Até 15 atletas', 'Planilhas ilimitadas', 'Sync Garmin & Strava', 'Dashboard web'],
    cta: 'Começar grátis',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '99',
    desc: 'Para assessorias em crescimento',
    features: ['Até 50 atletas', 'IA para planilhas', 'Live Tracking', 'App mobile white-label', 'Suporte prioritário'],
    cta: 'Experimentar 14 dias grátis',
    highlight: true,
  },
  {
    name: 'Elite',
    price: '199',
    desc: 'Para grandes assessorias',
    features: ['Atletas ilimitados', 'Tudo do Pro', 'Múltiplos coaches', 'Relatórios financeiros', 'API personalizada'],
    cta: 'Falar com consultor',
    highlight: false,
  },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden">
              <img src="/logo.png" alt="Rafinha Running" className="w-full h-full object-cover" style={{ filter: 'hue-rotate(-4deg) saturate(1.07) brightness(0.97)' }} />
            </div>
            <span className="font-bold text-gray-900 text-lg">Rafinha Running</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#funcionalidades" className="text-sm text-gray-600 hover:text-gray-900 transition">Funcionalidades</a>
            <a href="#planos" className="text-sm text-gray-600 hover:text-gray-900 transition">Planos</a>
            <Link href="/athlete-login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">Área do Atleta</Link>
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition">Área do Coach</Link>
            <Link href="/login" className="px-4 py-2 bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition">
              Começar grátis
            </Link>
          </div>
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="w-5 h-0.5 bg-gray-700 mb-1" />
            <div className="w-5 h-0.5 bg-gray-700 mb-1" />
            <div className="w-5 h-0.5 bg-gray-700" />
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-6 pb-4 flex flex-col gap-4 bg-white border-t border-gray-100">
            <a href="#funcionalidades" className="text-sm text-gray-600">Funcionalidades</a>
            <a href="#planos" className="text-sm text-gray-600">Planos</a>
            <Link href="/athlete-login" className="text-sm text-gray-600">Área do Atleta</Link>
            <Link href="/login" className="text-sm text-gray-600">Área do Coach</Link>
            <Link href="/login" className="px-4 py-2 bg-[#DC2626] text-white text-sm font-semibold rounded-xl text-center">Começar grátis</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6" style={{ background: 'linear-gradient(160deg, #FEF2F2 0%, #fff 50%, #F9FAFB 100%)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 border border-red-100 rounded-full mb-8">
            <span className="w-2 h-2 bg-[#DC2626] rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-[#DC2626] uppercase tracking-wide">Plataforma de Assessoria de Corrida</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-gray-900 mb-6 leading-tight">
            Gerencie sua assessoria<br className="hidden sm:block" />
            {' '}<span className="text-[#DC2626]">de corrida com dados.</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Planilhas inteligentes, live tracking, sync com Garmin e Strava, e dados reais de cada atleta — tudo em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-4 bg-[#DC2626] hover:bg-red-700 text-white font-bold rounded-2xl text-lg transition shadow-lg shadow-red-200 flex items-center gap-2 justify-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Sou Treinador
            </Link>
            <Link
              href="/athlete-login"
              className="px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-2xl text-lg border-2 border-gray-300 hover:border-gray-400 transition flex items-center gap-2 justify-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Sou Atleta
            </Link>
          </div>
          <p className="text-sm text-gray-400 mt-6">App disponível para iOS e Android · Sem cartão de crédito</p>
        </div>

        {/* Dashboard preview */}
        <div className="max-w-5xl mx-auto mt-16">
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/80 border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-gray-400 font-mono">rr-rafinha-running.vercel.app/dashboard</span>
            </div>
            <div className="p-4 sm:p-8 bg-gradient-to-br from-gray-50 to-white">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {[
                  { label: 'Atletas Ativos', value: '47', color: 'text-gray-900' },
                  { label: 'Treinos Hoje', value: '23', color: 'text-emerald-600' },
                  { label: 'km Este Mês', value: '2.840', color: 'text-[#DC2626]' },
                  { label: 'Taxa Conclusão', value: '91%', color: 'text-[#DC2626]' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                    <p className={`text-xl sm:text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="sm:col-span-2 bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Volume Semanal (km)</p>
                  <div className="flex items-end gap-2 h-20">
                    {[45, 62, 38, 71, 58, 83, 69].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-lg" style={{ height: `${(h / 83) * 100}%`, backgroundColor: i === 5 ? '#DC2626' : '#FEE2E2' }} />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                      <span key={d} className="text-[10px] text-gray-300 flex-1 text-center">{d}</span>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Atletas ao Vivo</p>
                  {['Ana S.', 'Carlos M.', 'Beatriz L.'].map((name, i) => (
                    <div key={name} className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-[#DC2626]">{name[0]}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-gray-700">{name}</p>
                        <p className="text-[10px] text-gray-400">{['5:12/km', '4:48/km', '6:01/km'][i]}</p>
                      </div>
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-gray-900 mb-4">Tudo que sua assessoria precisa</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">Da planilha ao relógio do atleta, passando pelo live tracking — uma plataforma completa.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-gray-100 hover:border-red-100 hover:shadow-md hover:shadow-red-50 transition-all">
                <span className="text-3xl mb-4 block">{f.icon}</span>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16 px-6 bg-gray-50 border-y border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">Integra com as ferramentas que seus atletas já usam</p>
          <div className="flex flex-wrap justify-center gap-6">
            {['Garmin', 'Strava', 'Apple Health', 'Google Fit', 'Coros', 'Polar'].map((brand) => (
              <div key={brand} className="px-6 py-3 bg-white rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 shadow-sm">
                {brand}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="planos" className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-gray-900 mb-4">Planos para toda assessoria</h2>
            <p className="text-lg text-gray-500">Comece grátis por 14 dias. Sem cartão de crédito.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-6 border transition-all ${p.highlight ? 'bg-[#DC2626] border-[#DC2626] shadow-xl shadow-red-200 md:scale-105' : 'bg-white border-gray-200'}`}
              >
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${p.highlight ? 'text-red-200' : 'text-gray-400'}`}>{p.name}</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className={`text-4xl font-black ${p.highlight ? 'text-white' : 'text-gray-900'}`}>R${p.price}</span>
                  <span className={`text-sm mb-1 ${p.highlight ? 'text-red-200' : 'text-gray-400'}`}>/mês</span>
                </div>
                <p className={`text-sm mb-6 ${p.highlight ? 'text-red-100' : 'text-gray-500'}`}>{p.desc}</p>
                <ul className="space-y-2 mb-8">
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
                  className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition ${p.highlight ? 'bg-white text-[#DC2626] hover:bg-red-50' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6" style={{ background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">Pronto para transformar sua assessoria?</h2>
          <p className="text-red-100 text-lg mb-8">Comece agora mesmo. Seus atletas merecem o melhor.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="px-8 py-4 bg-white text-[#DC2626] font-bold rounded-2xl text-lg hover:bg-red-50 transition">
              Começar grátis →
            </Link>
            <Link href="/athlete-login" className="px-8 py-4 bg-red-700 text-white font-bold rounded-2xl text-lg hover:bg-red-800 border border-red-500 transition">
              Área do Atleta
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 bg-gray-900 text-gray-400">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden">
              <img src="/logo.png" alt="RR" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-semibold text-gray-300">Rafinha Running</span>
          </div>
          <p className="text-xs">© 2026 Rafinha Running. Todos os direitos reservados.</p>
          <div className="flex gap-6 text-xs">
            <Link href="/login" className="hover:text-white transition">Treinadores</Link>
            <Link href="/athlete-login" className="hover:text-white transition">Atletas</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
