'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LEGAL_ROUTES } from '@/lib/legal';

const STORAGE_KEY = 'rr_cookie_notice_v1';

/**
 * Aviso informativo de cookies. A plataforma usa apenas cookies/armazenamento ESSENCIAIS
 * (sessão de login e cache offline do PWA), que dispensam consentimento — por isso é só um aviso,
 * sem opções de aceitar/recusar rastreadores.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== 'dismissed') setVisible(true);
    } catch {
      // Armazenamento bloqueado (modo privado etc.): mostra o aviso, que pode ser fechado na sessão
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {
      /* ignora */
    }
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl flex items-start sm:items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
        <p className="text-xs text-gray-600 leading-relaxed flex-1">
          Usamos apenas cookies essenciais para login e funcionamento offline. Nada de rastreadores de anúncios.{' '}
          <Link href={`${LEGAL_ROUTES.privacy}#cookies`} className="underline text-gray-800 hover:text-[#DC2626]">
            Saiba mais
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black cursor-pointer"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
