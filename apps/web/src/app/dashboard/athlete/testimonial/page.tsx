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
}

interface AthleteProfile {
  coachId?: string | null;
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => onChange && setHovered(star)}
          onMouseLeave={() => onChange && setHovered(0)}
          className="focus:outline-none disabled:cursor-default"
        >
          <svg
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value) ? 'text-amber-400' : 'text-gray-200'
            } ${onChange ? 'cursor-pointer hover:scale-110' : ''}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function TestimonialPage() {
  const [existing, setExisting] = useState<Testimonial | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        // Get athlete profile to find coach
        const { data: profile } = await api.get<{ athleteProfile?: AthleteProfile }>('/users/me');
        const athleteCoachId = (profile as any)?.athleteProfile?.coachId;
        setCoachId(athleteCoachId || null);

        // Get existing testimonial
        const { data } = await api.get<Testimonial | null>('/testimonials/my-coach');
        if (data) {
          setExisting(data);
          setRating(data.rating);
          setText(data.text);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async () => {
    if (!coachId) {
      setFeedback({ type: 'error', message: 'Você não tem um treinador associado.' });
      return;
    }
    if (!text.trim()) {
      setFeedback({ type: 'error', message: 'Por favor, escreva seu depoimento.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const { data } = await api.post<Testimonial>('/testimonials', { coachId, rating, text: text.trim() });
      setExisting(data);
      setEditing(false);
      setFeedback({ type: 'success', message: existing ? 'Depoimento atualizado com sucesso!' : 'Depoimento enviado com sucesso!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao enviar depoimento.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Meu Depoimento</h1>
        <p className="text-sm text-gray-500 mt-1">Compartilhe sua experiência com o treinador</p>
      </div>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {!coachId ? (
        <div className="glass-card p-8 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <p className="text-gray-500 text-sm">Você ainda não tem um treinador associado.</p>
          <p className="text-gray-400 text-xs mt-1">Fale com seu treinador para ser adicionado à equipe.</p>
        </div>
      ) : existing && !editing ? (
        /* Show existing testimonial */
        <div className="max-w-xl space-y-4">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Seu Depoimento</h2>
              {existing.isFeatured && (
                <span className="text-xs font-medium bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-100">
                  Em destaque
                </span>
              )}
            </div>

            <StarRating value={existing.rating} />

            <p className="mt-4 text-gray-700 text-sm leading-relaxed">{existing.text}</p>

            <p className="mt-3 text-xs text-gray-400">
              Enviado em {new Date(existing.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              {existing.updatedAt !== existing.createdAt && ' (editado)'}
            </p>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 rounded-xl transition"
              >
                Editar depoimento
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Form */
        <div className="max-w-xl">
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-6">
              {existing ? 'Editar Depoimento' : 'Novo Depoimento'}
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-3">Avaliação</label>
                <StarRating value={rating} onChange={setRating} />
                <p className="text-xs text-gray-400 mt-2">
                  {rating === 1 ? 'Ruim' : rating === 2 ? 'Regular' : rating === 3 ? 'Bom' : rating === 4 ? 'Muito bom' : 'Excelente'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Depoimento <span className="text-gray-300">({text.length}/500 caracteres)</span>
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 500))}
                  rows={5}
                  placeholder="Conte sua experiência com o treinador. Como foi a evolução? O que mudou na sua corrida?"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition resize-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving || !text.trim()}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {existing ? 'Atualizar' : 'Enviar Depoimento'}
              </button>
              {editing && (
                <button
                  onClick={() => { setEditing(false); setRating(existing!.rating); setText(existing!.text); setFeedback(null); }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
