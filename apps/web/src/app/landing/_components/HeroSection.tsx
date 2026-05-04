import Link from 'next/link';
import type { Audience } from '../page';

export function HeroSection({ audience = 'coach' }: { audience?: Audience }) {
  const isAthlete = audience === 'athlete';

  return (
    <section className="relative pt-12 pb-24 px-6 overflow-hidden">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(220,38,38,0.10) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(220,38,38,0.05) 0%, transparent 60%)',
      }} />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,white_100%)] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        {/* Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 border border-red-100 rounded-full">
            <span className="w-2 h-2 bg-[#DC2626] rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-[#DC2626] uppercase tracking-widest">
              {isAthlete ? 'Para Atletas e Corredores' : 'Plataforma de Assessoria de Corrida'}
            </span>
          </div>
        </div>

        {/* Headline */}
        {isAthlete ? (
          <>
            <h1 className="text-center text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-gray-900 mb-6 leading-[1.05]">
              Treine com método.<br />
              <span className="text-[#DC2626]">Evolua com dados.</span>
            </h1>
            <p className="text-center text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Planilha personalizada do Rafinha, sync automático com seu Garmin/Strava, análise de performance e chat direto com o coach. Tudo no app.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-center text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-gray-900 mb-6 leading-[1.05]">
              Gerencie sua assessoria<br />
              <span className="text-[#DC2626]">com dados reais.</span>
            </h1>
            <p className="text-center text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Planilhas com IA, live tracking, sync automático com Garmin e Strava, e análise de desempenho de cada atleta — em uma plataforma só.
            </p>
          </>
        )}

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
          {isAthlete ? (
            <>
              <Link href="/onboarding/rafinha" className="inline-flex items-center gap-2 justify-center px-8 py-4 bg-[#DC2626] hover:bg-red-700 text-white font-bold rounded-2xl text-lg transition-colors shadow-lg shadow-red-200/60">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Quero treinar com o Rafinha
              </Link>
              <Link href="/athlete-login" className="inline-flex items-center gap-2 justify-center px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-2xl text-lg border-2 border-gray-200 hover:border-gray-300 transition-colors">
                Já sou aluno — Entrar
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="inline-flex items-center gap-2 justify-center px-8 py-4 bg-[#DC2626] hover:bg-red-700 text-white font-bold rounded-2xl text-lg transition-colors shadow-lg shadow-red-200/60">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Sou Treinador — Começar grátis
              </Link>
              <Link href="/athlete-login" className="inline-flex items-center gap-2 justify-center px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-2xl text-lg border-2 border-gray-200 hover:border-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Sou Atleta
              </Link>
            </>
          )}
        </div>
        <p className="text-center text-sm text-gray-400">
          {isAthlete ? '14 dias para experimentar · Cancele quando quiser' : '14 dias grátis · Sem cartão de crédito · Cancele quando quiser'}
        </p>

        {/* Dashboard mockup with 3D perspective */}
        <div className="mt-16 relative">
          <div className="absolute -inset-4 bg-gradient-to-b from-transparent to-white/50 pointer-events-none z-10 rounded-3xl" />
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-300/40 border border-gray-200/60 overflow-hidden"
            style={{ transform: 'perspective(1200px) rotateX(8deg) rotateY(-3deg)', transformOrigin: 'center top' }}>
            {/* Browser chrome */}
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <div className="mx-3 flex-1 bg-gray-100 rounded-lg px-3 py-1 text-xs text-gray-400 font-mono max-w-xs">
                app.rafinharunning.com/dashboard
              </div>
            </div>
            {/* Dashboard content */}
            <div className="p-6 bg-gradient-to-br from-gray-50 to-white">
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Atletas Ativos', value: '47', color: 'text-gray-900' },
                  { label: 'Treinos Hoje', value: '23', color: 'text-emerald-600' },
                  { label: 'km Este Mês', value: '2.840', color: 'text-[#DC2626]' },
                  { label: 'Taxa Conclusão', value: '91%', color: 'text-[#DC2626]' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Volume Semanal (km)</p>
                  <div className="flex items-end gap-2 h-20">
                    {[45, 62, 38, 71, 58, 83, 69].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-lg" style={{ height: `${(h / 83) * 100}%`, backgroundColor: i === 5 ? '#DC2626' : '#FEE2E2' }} />
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Ao Vivo</p>
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
      </div>
    </section>
  );
}
