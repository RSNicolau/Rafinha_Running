'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AppointmentSettings {
  appointmentUrl: string | null;
}

type Feedback = { type: 'success' | 'error'; message: string } | null;

export default function AppointmentsSettingsPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api
      .get<AppointmentSettings>('/appointments/settings')
      .then(({ data }) => {
        setUrl(data.appointmentUrl ?? '');
        if (data.appointmentUrl) setShowPreview(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.put('/appointments/settings', { appointmentUrl: url || null });
      setFeedback({ type: 'success', message: 'URL de agendamento salva com sucesso.' });
      if (url) setShowPreview(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr.response?.data?.message ?? 'Erro ao salvar configuração.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const isValidUrl = (s: string) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div>
      <div className="mb-8">
        <a
          href="/dashboard/settings"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Configurações
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Agendamento 1:1</h1>
        <p className="text-sm text-gray-500 mt-1">Configure o link de agendamento para seus atletas</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* URL config card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Link de Agendamento</h2>

          {loading ? (
            <div className="space-y-4">
              <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-10 w-28 bg-gray-100 rounded-xl animate-pulse" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  URL do Calendly / Cal.com / Google Calendar
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setFeedback(null);
                    setShowPreview(false);
                  }}
                  placeholder="https://calendly.com/seu-usuario/30min"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Cole o link do seu Calendly, Cal.com ou qualquer ferramenta de agendamento
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {saving && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Salvar
                </button>

                {url && isValidUrl(url) && (
                  <button
                    onClick={() => setShowPreview((v) => !v)}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                  >
                    {showPreview ? 'Ocultar preview' : 'Ver preview'}
                  </button>
                )}
              </div>

              {feedback && (
                <p
                  className={`text-sm font-medium ${
                    feedback.type === 'success' ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {feedback.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tips card */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">Dicas</h3>
          <ul className="space-y-2 text-xs text-amber-800">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              Use o <strong>Calendly</strong> (calendly.com) — crie uma conta gratuita e copie o link do seu evento
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              O link <strong>Cal.com</strong> também funciona — é open-source e grátis
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              O atleta verá um calendário embutido diretamente no app para escolher o horário
            </li>
          </ul>
        </div>

        {/* Preview */}
        {showPreview && url && isValidUrl(url) && (
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <p className="text-xs font-medium text-gray-500">Preview — como o atleta verá</p>
            </div>
            <iframe
              src={url}
              width="100%"
              height="600"
              frameBorder="0"
              title="Preview do agendamento"
              className="block"
              allow="camera; microphone; fullscreen"
            />
          </div>
        )}
      </div>
    </div>
  );
}
