'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Testimonial {
  id: string;
  athleteId: string;
  coachId: string;
  rating: number;
  text: string;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  athlete: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= value ? 'text-amber-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsCoachPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Testimonial[]>('/testimonials/coach')
      .then(({ data }) => setTestimonials(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggleFeatured = async (id: string) => {
    setTogglingId(id);
    try {
      const { data } = await api.put<Testimonial>(`/testimonials/${id}/feature`);
      setTestimonials((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isFeatured: data.isFeatured } : t))
      );
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  };

  const featured = testimonials.filter((t) => t.isFeatured);
  const notFeatured = testimonials.filter((t) => !t.isFeatured);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Depoimentos</h1>
        <p className="text-sm text-gray-500 mt-1">Depoimentos dos seus atletas — destaque os melhores para exibir na landing page</p>
      </div>

      {testimonials.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <p className="text-gray-500 font-medium">Nenhum depoimento ainda</p>
          <p className="text-gray-400 text-sm mt-1">Seus atletas podem enviar depoimentos pelo app</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats bar */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{testimonials.length}</p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500">{featured.length}</p>
              <p className="text-xs text-gray-400">Em destaque</p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {testimonials.length > 0
                  ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-gray-400">Avaliação média</p>
            </div>
          </div>

          {/* Featured section */}
          {featured.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Em destaque ({featured.length})
              </h2>
              <div className="space-y-3">
                {featured.map((t) => (
                  <TestimonialCard
                    key={t.id}
                    testimonial={t}
                    toggling={togglingId === t.id}
                    onToggle={() => handleToggleFeatured(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All others */}
          {notFeatured.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Outros depoimentos ({notFeatured.length})
              </h2>
              <div className="space-y-3">
                {notFeatured.map((t) => (
                  <TestimonialCard
                    key={t.id}
                    testimonial={t}
                    toggling={togglingId === t.id}
                    onToggle={() => handleToggleFeatured(t.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestimonialCard({
  testimonial: t,
  toggling,
  onToggle,
}: {
  testimonial: Testimonial;
  toggling: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`glass-card p-5 ${t.isFeatured ? 'ring-2 ring-amber-200' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
          {t.athlete.avatarUrl ? (
            <img src={t.athlete.avatarUrl} alt={t.athlete.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-primary">{t.athlete.name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{t.athlete.name}</p>
              <StarDisplay value={t.rating} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.isFeatured && (
                <span className="text-xs font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                  Destaque
                </span>
              )}
              <button
                onClick={onToggle}
                disabled={toggling}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-60 ${
                  t.isFeatured
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {toggling ? (
                  <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                ) : t.isFeatured ? (
                  'Remover destaque'
                ) : (
                  'Destacar na Home'
                )}
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{t.text}</p>

          <p className="text-xs text-gray-400 mt-2">
            {new Date(t.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
