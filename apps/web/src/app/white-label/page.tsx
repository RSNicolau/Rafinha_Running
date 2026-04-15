'use client';

import { useState } from 'react';
import Link from 'next/link';

const RED = '#DC2626';

const FEATURES = [
  {
    icon: '📋',
    title: 'Onboarding inteligente',
    desc: 'Formulário de anamnese personalizável com análise automática por IA. Cada novo aluno recebe login e senha por e-mail ao preencher.',
  },
  {
    icon: '🤖',
    title: 'IA Cérebro do Coach',
    desc: 'Chat com Claude (Anthropic) com contexto completo de todos os seus atletas. Gere planilhas, analise desempenho e tome decisões em segundos.',
  },
  {
    icon: '📅',
    title: 'Planos de treino',
    desc: 'Monte planilhas semanais por atleta ou em grupo. Atletas recebem treinos no app com descrições, métricas e feedback.',
  },
  {
    icon: '🏪',
    title: 'Loja virtual',
    desc: 'Venda uniformes, acessórios e produtos da sua equipe direto pelo app. Reserva de estoque com confirmação por e-mail.',
  },
  {
    icon: '🏆',
    title: 'Gestão de eventos',
    desc: 'Inscrições para provas e eventos com seleção de kit, geração de número de peito e controle de retirada.',
  },
  {
    icon: '📅',
    title: 'Agendamento de consultorias',
    desc: 'Integração com Calendly para sessões 1:1. Atletas agendam direto pelo app sem precisar de WhatsApp.',
  },
  {
    icon: '⌚',
    title: 'Integração Garmin & Strava',
    desc: 'Sincronize dados de treino, HRV, sono e frequência cardíaca automaticamente dos dispositivos dos atletas.',
  },
  {
    icon: '📊',
    title: 'Dashboard analítico',
    desc: 'Visão geral de todos os atletas em tempo real: evolução, carga de treino, adesão ao plano e alertas automáticos.',
  },
  {
    icon: '💬',
    title: 'Chat coach ↔ atleta',
    desc: 'Comunicação direta dentro do app, sem depender de WhatsApp ou grupos externos.',
  },
  {
    icon: '📩',
    title: 'E-mails automáticos',
    desc: 'Boas-vindas, credenciais, lembretes de pagamento e notificações de eventos enviados automaticamente.',
  },
  {
    icon: '🏷️',
    title: 'Sua marca, seu domínio',
    desc: 'O app sai com seu logo, suas cores e seu domínio. Seus atletas nem sabem qual é a tecnologia por trás.',
  },
  {
    icon: '👥',
    title: 'Multi-coach',
    desc: 'Adicione assistentes, co-treinadores e staff. Cada um tem acesso ao painel com o nível de permissão que você definir.',
  },
];

const SPORTS = [
  'Corrida de Rua', 'Triathlon', 'Natação', 'Ciclismo',
  'Crossfit', 'Futebol', 'Vôlei', 'Basquete',
  'Tênis', 'Jiu-Jitsu', 'Musculação', 'Pilates',
  'Yoga', 'Surf', 'Escalada', 'Qualquer esporte',
];

const TESTIMONIAL_NICHES = [
  { sport: 'Corrida de rua', text: '"Com 420 atletas, o app pagou seu custo na primeira semana. Hoje não consigo imaginar gerir a equipe sem ele."', name: 'Coach de corrida — RJ' },
  { sport: 'Assessoria esportiva', text: '"Criamos o onboarding em 10 minutos e já na primeira semana recebemos 15 inscrições com análise de IA pronta para cada um."', name: 'Coach multiesportes — SP' },
];

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function WhiteLabelPage() {
  const [sport, setSport] = useState('');

  return (
    <main className="min-h-screen bg-white">

      {/* ── HERO ── */}
      <section style={{ background: `linear-gradient(135deg, ${RED} 0%, #7F1D1D 100%)` }} className="min-h-[90vh] flex flex-col items-center justify-center text-center text-white px-4 py-20 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-white/90 text-xs font-semibold mb-6 uppercase tracking-widest">
            🏷️ Plataforma White Label
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
            Seu app.<br />Sua marca.<br />
            <span className="text-white/80">Qualquer esporte.</span>
          </h1>
          <p className="text-white/80 text-lg sm:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            Uma plataforma completa de gestão esportiva que você customiza com seu logo, suas cores e seu domínio — e revende para outros coaches.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://wa.me/5521999987530" className="px-8 py-4 rounded-xl font-black text-red-600 bg-white hover:bg-gray-50 transition text-sm uppercase tracking-wider">
              Solicitar demonstração
            </a>
            <a href="/pricing" className="px-8 py-4 rounded-xl font-black text-white border-2 border-white/40 hover:border-white/70 transition text-sm uppercase tracking-wider">
              Ver preços →
            </a>
          </div>
        </div>
      </section>

      {/* ── SPORTS TICKER ── */}
      <section className="bg-gray-950 py-5 overflow-hidden">
        <div className="flex gap-8 animate-none whitespace-nowrap">
          {[...SPORTS, ...SPORTS].map((s, i) => (
            <span key={i} className="text-white/40 text-sm font-medium shrink-0">
              {s} <span className="text-white/20 mx-3">·</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── WHAT IS IT ── */}
      <section className="py-20 px-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: RED }}>Para coaches e equipes</p>
            <h2 className="text-3xl font-black text-gray-900 mb-4 leading-tight">
              Uma plataforma. Infinitos nichos esportivos.
            </h2>
            <p className="text-gray-500 leading-relaxed mb-6">
              Não importa se você gerencia corredores, nadadores, ciclistas ou jogadores de futebol.
              A plataforma se adapta à sua metodologia, ao seu vocabulário e à sua identidade visual.
            </p>
            <ul className="space-y-3">
              {[
                'Formulário de anamnese personalizável por esporte',
                'Planos de treino com métricas específicas da modalidade',
                'Loja de produtos e uniformes integrada',
                'Inscrições em eventos e provas',
                'IA com contexto completo da sua equipe',
                'App mobile para atletas (iOS e Android)',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckIcon /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-50 rounded-3xl p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Para qual esporte você gerencia atletas?</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {SPORTS.slice(0, 12).map(s => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${sport === s ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {sport && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-900 mb-1">✅ {sport}</p>
                <p className="text-xs text-gray-500">A plataforma já funciona para {sport}. Você personaliza o onboarding, os planos de treino e a loja virtual em minutos.</p>
                <a href="https://wa.me/5521999987530" className="mt-3 inline-block text-xs font-bold text-white px-4 py-2 rounded-lg transition" style={{ background: RED }}>
                  Ver demo para {sport} →
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: RED }}>Tudo incluso</p>
            <h2 className="text-3xl font-black text-gray-900">Recursos da plataforma</h2>
            <p className="text-gray-500 mt-2">Tudo que você precisa para gerir sua equipe, vender seus serviços e escalar seu negócio.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition">
                <span className="text-2xl mb-3 block">{f.icon}</span>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3-TIER MODEL ── */}
      <section className="py-20 px-4 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: RED }}>Modelo de licenças</p>
          <h2 className="text-3xl font-black text-gray-900">Você vende. Eles pagam. Você lucra.</h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">O modelo white-label cria três camadas de receita recorrente.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              num: '1',
              title: 'Plataforma → Você',
              price: 'R$1.497/mês',
              desc: 'Você paga a licença white-label. Seu domínio, sua marca, seu painel completo.',
              color: '#DC2626',
            },
            {
              num: '2',
              title: 'Você → Coaches',
              price: 'R$300–500/mês cada',
              desc: 'Você vende licenças de uso aos coaches da sua rede. Você define o preço.',
              color: '#7C3AED',
            },
            {
              num: '3',
              title: 'Coaches → Atletas',
              price: 'R$150–300/mês cada',
              desc: 'Cada coach cobra seus alunos pelo app e pelos treinos. Receita recorrente em cascata.',
              color: '#059669',
            },
          ].map(tier => (
            <div key={tier.num} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white mx-auto mb-4 text-lg" style={{ background: tier.color }}>
                {tier.num}
              </div>
              <p className="font-black text-gray-900 text-sm mb-1">{tier.title}</p>
              <p className="font-black text-lg mb-2" style={{ color: tier.color }}>{tier.price}</p>
              <p className="text-xs text-gray-500">{tier.desc}</p>
            </div>
          ))}
        </div>

        {/* Revenue calculator */}
        <div className="mt-10 bg-gray-50 rounded-2xl border border-gray-100 p-6">
          <h3 className="font-black text-gray-900 mb-4 text-center">Simulação de receita com 8 coaches</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: '8 coaches × R$400/mês', value: 'R$3.200', color: '#059669' },
              { label: 'Licença white-label', value: '– R$1.497', color: '#DC2626' },
              { label: 'Lucro mensal', value: 'R$1.703', color: '#7C3AED' },
            ].map(item => (
              <div key={item.label}>
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <p className="text-xl font-black" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">* Não incluídos os pagamentos que cada coach recebe dos seus atletas</p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: `linear-gradient(135deg, ${RED} 0%, #7F1D1D 100%)` }} className="py-20 px-4 text-center text-white">
        <h2 className="text-3xl font-black mb-3">Pronto para lançar seu app?</h2>
        <p className="text-white/70 mb-8 max-w-lg mx-auto">
          Nossa equipe configura tudo para você em menos de 48h: domínio, marca, primeiros coaches e onboarding completo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://wa.me/5521999987530"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-black text-red-600 bg-white hover:bg-gray-50 transition text-sm uppercase tracking-wider"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Falar no WhatsApp
          </a>
          <a href="/pricing" className="px-8 py-4 rounded-xl font-black text-white border-2 border-white/40 hover:border-white/70 transition text-sm uppercase tracking-wider">
            Ver todos os planos
          </a>
        </div>
        <p className="text-white/50 text-xs mt-6">Sem fidelidade · Cancele quando quiser · Setup em 48h</p>
      </section>
    </main>
  );
}
