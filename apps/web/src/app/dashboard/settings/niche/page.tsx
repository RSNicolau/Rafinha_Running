'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import ZoneTable from './ZoneTable';

interface NicheOption {
  key: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  primaryMetric: string;
  features: string[];
  integrations: string[];
  monthlyPrice: number;
}

interface NicheDetail extends NicheOption {
  zoneConfig?: {
    label: string;
    unit: string;
    zones: Array<{
      name: string;
      description: string;
      min?: number;
      max?: number;
    }>;
  };
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

export default function NicheSettingsPage() {
  const [niches, setNiches] = useState<NicheOption[]>([]);
  const [loadingNiches, setLoadingNiches] = useState(true);

  const [currentNiche, setCurrentNiche] = useState<string | null>(null);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);

  const [nicheDetail, setNicheDetail] = useState<NicheDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const hasChanged = selectedNiche !== null && selectedNiche !== currentNiche;

  // Load all niches
  useEffect(() => {
    api
      .get<NicheOption[]>('/niche')
      .then(({ data }) => setNiches(data))
      .catch(() => {})
      .finally(() => setLoadingNiches(false));
  }, []);

  // Load coach's current niche
  useEffect(() => {
    api
      .get<{ niche: string }>('/niche/coach/me')
      .then(({ data }) => {
        setCurrentNiche(data.niche);
        setSelectedNiche(data.niche);
      })
      .catch(() => {});
  }, []);

  // Load niche detail when selectedNiche changes
  useEffect(() => {
    if (!selectedNiche) return;
    setLoadingDetail(true);
    api
      .get<NicheDetail>(`/niche/${selectedNiche}`)
      .then(({ data }) => setNicheDetail(data))
      .catch(() => setNicheDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedNiche]);

  const handleSave = async () => {
    if (!selectedNiche) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.put('/niche/coach/me', {
        niche: selectedNiche,
        seedQuestions: true,
      });
      setCurrentNiche(selectedNiche);
      setFeedback({ type: 'success', message: 'Nicho atualizado com sucesso! As perguntas de anamnese foram substituídas pelas do novo nicho.' });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Erro ao salvar o nicho.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const selectedNicheData = niches.find((n) => n.key === selectedNiche);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <a
          href="/dashboard/settings"
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label="Voltar para configurações"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </a>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nicho do Esporte</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Escolha o nicho principal da sua assessoria. Isso ajusta perguntas, métricas e planos para os seus atletas.
          </p>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* ── Section 1: Niche Selection Grid ── */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
            Selecionar Nicho
          </h2>

          {loadingNiches ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl bg-gray-100 h-32" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {niches.map((niche) => {
                const isSelected = selectedNiche === niche.key;
                const isCurrent = currentNiche === niche.key;
                return (
                  <button
                    key={niche.key}
                    type="button"
                    onClick={() => {
                      setSelectedNiche(niche.key);
                      setFeedback(null);
                    }}
                    className="relative rounded-2xl border-2 p-4 text-left transition-all cursor-pointer hover:shadow-sm"
                    style={
                      isSelected
                        ? {
                            borderColor: niche.color,
                            background: `${niche.color}0d`,
                            boxShadow: `0 4px 20px ${niche.color}28`,
                          }
                        : { borderColor: '#E5E7EB', background: '#FFFFFF' }
                    }
                  >
                    {/* Selected check */}
                    {isSelected && (
                      <span
                        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: niche.color }}
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}

                    {/* Current badge */}
                    {isCurrent && !isSelected && (
                      <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        atual
                      </span>
                    )}

                    <div className="text-3xl mb-2">{niche.icon}</div>
                    <p className="text-sm font-bold text-gray-800 leading-tight mb-1">{niche.label}</p>
                    <p className="text-xs text-gray-500 leading-snug mb-3 line-clamp-2">
                      {niche.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-400">{niche.primaryMetric}</span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: isSelected ? `${niche.color}20` : '#F3F4F6',
                          color: isSelected ? niche.color : '#6B7280',
                        }}
                      >
                        R${niche.monthlyPrice}/mês
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Warning */}
          {hasChanged && currentNiche && (
            <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-amber-800">
                <strong>Atenção:</strong> ao trocar o nicho, as perguntas do questionário de anamnese serão substituídas pelas perguntas padrão do novo nicho. Você poderá editá-las depois.
              </p>
            </div>
          )}

          {/* Save button */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!hasChanged || saving}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
            >
              {saving && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Salvar Nicho
            </button>
            {!hasChanged && selectedNiche && (
              <p className="text-xs text-gray-400">Nenhuma alteração</p>
            )}
          </div>

          {/* Feedback */}
          {feedback && (
            <p
              className={`text-sm mt-3 font-medium ${
                feedback.type === 'success' ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {feedback.message}
            </p>
          )}
        </div>

        {/* ── Section 2: Features Preview ── */}
        {selectedNicheData && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{selectedNicheData.icon}</span>
              <div>
                <h2 className="text-sm font-bold text-gray-800">{selectedNicheData.label}</h2>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Recursos do Nicho</p>
              </div>
            </div>

            {loadingDetail ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + i * 7}%` }} />
                ))}
              </div>
            ) : nicheDetail ? (
              <>
                {/* Features list */}
                <ul className="space-y-2 mb-5">
                  {nicheDetail.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <svg
                        className="w-4 h-4 shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke={selectedNicheData.color}
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Integrations */}
                {nicheDetail.integrations && nicheDetail.integrations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Integrações suportadas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {nicheDetail.integrations.map((integration) => (
                        <span
                          key={integration}
                          className="px-3 py-1 text-xs font-medium rounded-full border"
                          style={{
                            background: `${selectedNicheData.color}12`,
                            borderColor: `${selectedNicheData.color}30`,
                            color: selectedNicheData.color,
                          }}
                        >
                          {integration}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <ul className="space-y-2 mb-5">
                {selectedNicheData.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <svg
                      className="w-4 h-4 shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke={selectedNicheData.color}
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Section 3: Zone Preview ── */}
        {nicheDetail?.zoneConfig && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
              Configuração de Zonas
            </h2>
            <ZoneTable
              zoneConfig={nicheDetail.zoneConfig}
              nicheColor={selectedNicheData?.color ?? '#DC2626'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
