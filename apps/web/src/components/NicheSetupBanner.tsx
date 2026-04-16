'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const DISMISSED_KEY = 'rr_niche_banner_dismissed';

interface NicheInfo {
  niche: string;
  config: {
    label: string;
    icon: string;
  };
}

/**
 * Shows a one-time banner inviting the coach to configure their sport niche.
 * Dismissible — stores dismissed state in localStorage.
 */
export default function NicheSetupBanner() {
  const [visible, setVisible] = useState(false);
  const [nicheInfo, setNicheInfo] = useState<NicheInfo | null>(null);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    api.get('/niche/coach/me')
      .then((res) => {
        setNicheInfo(res.data);
        // Only show banner — user can always go to settings to change
        setVisible(true);
      })
      .catch(() => {
        // Silently fail — not critical
      });
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-start gap-4 p-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50">
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-xl">
        {nicheInfo?.config?.icon ?? '🎯'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-indigo-900">
          Configure o nicho da sua assessoria
        </p>
        <p className="text-xs text-indigo-600 mt-0.5">
          {nicheInfo
            ? `Atualmente: ${nicheInfo.config.label}. Você pode ajustar perguntas, métricas e zonas de treino para o seu esporte.`
            : 'Personalize perguntas, métricas, zonas de treino e planos de preço para o seu nicho esportivo.'}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Link
            href="/dashboard/settings/niche"
            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
          >
            Configurar nicho →
          </Link>
        </div>
      </div>

      <button
        onClick={dismiss}
        className="text-indigo-300 hover:text-indigo-600 transition shrink-0 cursor-pointer"
        title="Dispensar"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
