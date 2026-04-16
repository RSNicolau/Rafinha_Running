'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface CoachPublicData {
  coachId: string;
  coachName: string;
  brandName: string;
  primaryColor: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  welcomeMsg?: string | null;
  niche?: string | null;
  slug: string;
  bio?: string | null;
  specializations?: string[];
}

const NICHE_CONFIG: Record<string, { label: string; benefits: string[]; icon: string }> = {
  RUNNING: {
    label: 'Corrida',
    icon: '🏃',
    benefits: [
      'Planilhas personalizadas por pace e FC',
      'Acompanhamento semanal com feedback do coach',
      'Preparacao para provas: 5K, 10K, meia e completa',
    ],
  },
  CYCLING: {
    label: 'Ciclismo',
    icon: '🚴',
    benefits: [
      'Treinos por zonas de potencia (FTP)',
      'Periodizacao para granfondos e criteriums',
      'Analise de GPS e dados de performance',
    ],
  },
  TRIATHLON: {
    label: 'Triatlon',
    icon: '🏊',
    benefits: [
      'Planejamento integrado: natacao, bike e corrida',
      'Periodizacao para Ironman e olimpico',
      'Suporte nutricional e estrategia de prova',
    ],
  },
  CROSSFIT: {
    label: 'CrossFit',
    icon: '🏋️',
    benefits: [
      'Programacao funcional de alta intensidade',
      'Tecnica e mobilidade individualizadas',
      'Preparacao para Open e competicoes',
    ],
  },
  FITNESS: {
    label: 'Fitness',
    icon: '💪',
    benefits: [
      'Treinos adaptados ao seu objetivo',
      'Acompanhamento de composicao corporal',
      'Suporte nutricional e bem-estar',
    ],
  },
  GENERAL: {
    label: 'Esportes',
    icon: '⚡',
    benefits: [
      'Assessoria esportiva personalizada',
      'Planos adaptados ao seu nivel',
      'Suporte continuo do seu coach',
    ],
  },
};

const TESTIMONIALS = [
  { name: 'Ana Clara M.', stars: 5, text: 'Melhorei meu pace em 2 minutos no 5K em apenas 3 meses de assessoria. Recomendo demais!' },
  { name: 'Carlos Roberto S.', stars: 5, text: 'Finalmente consegui completar minha primeira meia maratona graças ao acompanhamento personalizado.' },
  { name: 'Mariana F.', stars: 5, text: 'O suporte e a dedicacao do coach fazem toda a diferenca. Evoluí muito mais do que sozinha.' },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function CoachPublicPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const [coach, setCoach] = useState<CoachPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.get(`/onboarding/public/${slug}`)
      .then((r) => setCoach(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !coach) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center p-8">
          <p className="text-gray-500 text-lg font-medium">Coach nao encontrado</p>
          <Link href="/" className="mt-4 inline-block text-sm text-red-600 hover:underline">Voltar ao inicio</Link>
        </div>
      </div>
    );
  }

  const primaryColor = coach.primaryColor || '#DC2626';
  const nicheKey = (coach.niche || 'RUNNING').toUpperCase();
  const niché = NICHE_CONFIG[nicheKey] || NICHE_CONFIG.RUNNING;

  const onboardingUrl = `/onboarding/${slug}`;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {coach.logoUrl ? (
              <img src={coach.logoUrl} alt={coach.brandName} className="h-9 w-auto rounded-xl" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black" style={{ backgroundColor: primaryColor }}>
                {(coach.brandName || coach.coachName).charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-gray-900 text-sm">{coach.brandName || coach.coachName}</span>
          </div>
          <Link
            href={onboardingUrl}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Comecar Agora
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20" style={{ background: `linear-gradient(135deg, ${primaryColor}15 0%, white 60%)` }}>
        {coach.bannerUrl && (
          <div className="absolute inset-0 overflow-hidden opacity-10">
            <img src={coach.bannerUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="relative max-w-4xl mx-auto text-center">
          {coach.logoUrl ? (
            <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-lg mx-auto mb-6 border-2 border-white">
              <img src={coach.logoUrl} alt={coach.brandName} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-lg mx-auto mb-6" style={{ backgroundColor: primaryColor }}>
              {(coach.brandName || coach.coachName).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4 text-white" style={{ backgroundColor: primaryColor }}>
            <span>{niché.icon}</span>
            <span>{niché.label}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4 text-gray-900">
            Transforme sua {niché.label.toLowerCase()} com assessoria personalizada
          </h1>
          <p className="text-lg text-gray-500 mb-2 max-w-2xl mx-auto">
            {coach.welcomeMsg || `Treinamento individualizado com ${coach.coachName}. Alcance seus objetivos com metodologia comprovada e acompanhamento dedicado.`}
          </p>
          {coach.bio && (
            <p className="text-sm text-gray-400 max-w-xl mx-auto mt-2">{coach.bio}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Link
              href={onboardingUrl}
              className="px-8 py-3.5 rounded-2xl text-base font-bold text-white shadow-lg transition hover:opacity-90 hover:scale-[1.02]"
              style={{ backgroundColor: primaryColor }}
            >
              Comecar Agora — e gratuito
            </Link>
            <a
              href="#beneficios"
              className="px-8 py-3.5 rounded-2xl text-base font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition"
            >
              Saiba mais
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="px-6 py-16 bg-gray-50/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2 text-gray-900">Por que treinar comigo?</h2>
          <p className="text-gray-400 text-center mb-10 text-sm">Beneficios exclusivos da assessoria personalizada</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {niché.benefits.map((benefit, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm mb-4" style={{ backgroundColor: primaryColor }}>
                  {i + 1}
                </div>
                <p className="text-sm font-medium text-gray-800">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2 text-gray-900">O que dizem os atletas</h2>
          <p className="text-gray-400 text-center mb-10 text-sm">Resultados reais de quem ja treina com assessoria personalizada</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6">
                <StarRating count={t.stars} />
                <p className="text-sm text-gray-600 mt-3 mb-4 leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <p className="text-xs font-semibold text-gray-500">{t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-16" style={{ background: `linear-gradient(135deg, ${primaryColor}10 0%, white 80%)` }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-black mb-3 text-gray-900">Pronto para comecar?</h2>
          <p className="text-gray-500 mb-8">Preencha o formulario de anamnese e receba seu plano personalizado.</p>
          <Link
            href={onboardingUrl}
            className="inline-block px-10 py-4 rounded-2xl text-base font-bold text-white shadow-lg transition hover:opacity-90 hover:scale-[1.02]"
            style={{ backgroundColor: primaryColor }}
          >
            Comecar Agora
          </Link>
          <p className="text-xs text-gray-400 mt-4">Sem compromisso. Responda o questionario em 3 minutos.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 text-center">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {coach.logoUrl ? (
              <img src={coach.logoUrl} alt={coach.brandName} className="h-7 w-auto rounded-lg" />
            ) : (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black" style={{ backgroundColor: primaryColor }}>
                {(coach.brandName || coach.coachName).charAt(0)}
              </div>
            )}
            <span className="text-sm font-semibold text-gray-700">{coach.brandName || coach.coachName}</span>
          </div>
          <p className="text-xs text-gray-400">Powered by RR Rafinha Running Platform</p>
        </div>
      </footer>
    </div>
  );
}
