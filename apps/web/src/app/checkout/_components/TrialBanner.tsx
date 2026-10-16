'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

/**
 * Aviso NÃO bloqueante do período de teste (dono sem plano da plataforma).
 * Decisão de produto pendente sobre bloqueio — por ora só informa e leva ao /dashboard/billing.
 */
export default function TrialBanner({ enabled }: { enabled: boolean }) {
  const [info, setInfo] = useState<{ maxAthletes: number; trialEndsAt?: string | null; expired?: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem('rr_trial_banner_hidden') === '1') { setHidden(true); return; }
    } catch { /* sem storage */ }
    api.get('/platform/my-subscription')
      .then((r) => {
        if (r.data?.status === 'NONE') setInfo({ maxAthletes: r.data?.trial?.maxAthletes ?? 5, trialEndsAt: r.data?.trial?.trialEndsAt, expired: r.data?.trial?.expired });
      })
      .catch(() => undefined);
  }, [enabled]);

  if (!enabled || hidden || !info) return null;
  const until = info.trialEndsAt ? new Date(info.trialEndsAt).toLocaleDateString('pt-BR') : null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 flex flex-wrap items-center gap-2">
      <span className="font-semibold">Período de teste</span>
      <span className="text-amber-800">
        {info.expired ? 'O período de teste terminou.' : `Até ${info.maxAthletes} atletas${until ? `, até ${until}` : ''}.`}
      </span>
      <Link href="/dashboard/billing" className="font-semibold underline">Assinar plano</Link>
      <button
        type="button"
        onClick={() => { setHidden(true); try { sessionStorage.setItem('rr_trial_banner_hidden', '1'); } catch { /* ok */ } }}
        className="ml-auto text-amber-700 text-xs"
        aria-label="Fechar aviso"
      >
        Fechar
      </button>
    </div>
  );
}
