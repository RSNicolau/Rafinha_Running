'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { LEGAL_ROUTES, PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal';
import { ConsentCheckboxes, EMPTY_CONSENT, isConsentComplete, type ConsentState } from './ConsentCheckboxes';

interface LegalStatus {
  needsConsent: boolean;
  termsVersion: string;
  privacyVersion: string;
  healthDataConsent?: boolean | null;
}

/**
 * Modal BLOQUEANTE de aceite dos Termos/Política para usuários sem aceite da versão vigente
 * (contas criadas por convite, pelo treinador, via Google/Apple, ou após atualização dos documentos).
 * Enquanto não aceitar, o app fica inutilizável (overlay), mas o usuário pode sair da conta.
 */
export function ConsentGate() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAthlete = user?.role === 'ATHLETE';

  const check = useCallback(async () => {
    let hasToken = false;
    try {
      hasToken = !!localStorage.getItem('rr_access_token');
    } catch {
      hasToken = false;
    }
    if (!hasToken) return;
    try {
      const { data } = await api.get<LegalStatus>('/legal/me');
      setStatus(data);
    } catch {
      // Falha de rede: não bloqueia por engano; tentaremos de novo na próxima navegação/carregamento
    }
  }, []);

  // Verifica ao montar e sempre que a sessão mudar (check() ignora visitantes sem token)
  useEffect(() => {
    check();
  }, [isAuthenticated, user?.id, check]);

  // Atleta que nunca respondeu ao consentimento de saúde (conta criada pelo treinador, convite,
  // login social ou falha na chamada pós-cadastro) também passa pelo modal.
  const open = !!status && (status.needsConsent || (isAthlete && status.healthDataConsent == null));

  // Impede rolagem do conteúdo atrás do overlay
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!status || !open) return null;

  const outdatedClient = status.termsVersion !== TERMS_VERSION || status.privacyVersion !== PRIVACY_VERSION;
  const canSubmit = isConsentComplete(consent, isAthlete) && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post<LegalStatus>('/legal/accept', {
        acceptTerms: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        marketingOptIn: consent.marketing,
        ...(isAthlete ? { healthDataConsent: consent.health } : {}),
      });
      setStatus(data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(' ') : msg || 'Não foi possível registrar o aceite. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 sm:p-7 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[#DC2626]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </span>
          <div>
            <h2 id="consent-gate-title" className="text-lg font-bold text-gray-900 leading-tight">
              Termos de Uso e Privacidade
            </h2>
            <p className="text-xs text-gray-500">Versão {TERMS_VERSION}</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-gray-600 leading-relaxed">
          Para continuar usando a plataforma, leia e aceite os{' '}
          <a href={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer" className="font-medium text-[#DC2626] underline">
            Termos de Uso
          </a>{' '}
          e a{' '}
          <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noopener noreferrer" className="font-medium text-[#DC2626] underline">
            Política de Privacidade
          </a>
          . Eles explicam como seus dados são tratados pela plataforma e pela sua assessoria.
        </p>

        {outdatedClient && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Há uma versão mais recente dos documentos. <button type="button" onClick={() => window.location.reload()} className="underline font-semibold cursor-pointer">Recarregue a página</button> para continuar.
          </div>
        )}

        <ConsentCheckboxes value={consent} onChange={setConsent} showHealth={isAthlete} idPrefix="gate" />

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600" role="alert">{error}</p>
        )}

        <p className="mt-4 text-xs text-gray-500 leading-relaxed">
          Não concorda? Você pode{' '}
          <a href={LEGAL_ROUTES.myData} className="underline text-gray-700">baixar seus dados ou solicitar a exclusão da conta</a>{' '}
          sem aceitar a nova versão.
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={logout}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            Sair da conta
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || outdatedClient}
            className="flex-1 rounded-xl bg-[#DC2626] px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Aceitar e continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
