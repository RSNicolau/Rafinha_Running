'use client';
import { useEffect, useState } from 'react';

interface ApiTestimonial {
  id: string;
  rating: number;
  text: string;
  athlete: { id: string; name: string; avatarUrl?: string | null };
}

const COACH_SLUG = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID ?? 'rafinha';

export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<ApiTestimonial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/testimonials/featured/${COACH_SLUG}`)
      .then((r) => r.json())
      .then((data) => setTestimonials(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Sem depoimentos reais em destaque → seção não aparece (nada de conteúdo inventado)
  if (!loaded || testimonials.length === 0) return null;

  return (
    <section className="py-24 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">Depoimentos</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">O que os atletas dizem</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className={`w-4 h-4 ${i < t.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}`} viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-gray-600 text-sm leading-relaxed mb-6">"{t.text}"</blockquote>
              <div className="flex items-center gap-3">
                {t.athlete.avatarUrl ? (
                  <img src={t.athlete.avatarUrl} alt={t.athlete.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#DC2626] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {t.athlete.name.split(' ').map((s) => s.charAt(0)).slice(0, 2).join('').toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.athlete.name}</p>
                  <p className="text-xs text-gray-400">Atleta da assessoria</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
