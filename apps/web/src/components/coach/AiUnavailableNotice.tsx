'use client';

import Link from 'next/link';

/** Aviso padrão quando a IA não está configurada (sem chave da plataforma nem BYOK). */
export default function AiUnavailableNotice({
  message = 'IA não configurada — adicione sua chave em Configurações > IA',
  compact = false,
}: {
  message?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`rounded-xl border border-amber-200 bg-amber-50 text-amber-800 ${compact ? 'p-3 text-xs' : 'p-4 text-sm'}`}
    >
      <p className="font-medium">{message}</p>
      <Link href="/dashboard/settings/ai" className="mt-1 inline-block font-semibold text-amber-900 underline hover:no-underline">
        Abrir Configurações &gt; IA
      </Link>
    </div>
  );
}
