'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, friendlyError } from '@/lib/api';
import { passwordPolicyError, PASSWORD_POLICY_HINT } from '@/lib/password-policy';
import { rememberPortal } from '@/lib/portal';
import { ConsentCheckboxes, EMPTY_CONSENT, isConsentComplete, type ConsentState } from '@/components/legal/ConsentCheckboxes';

interface InviteInfo {
  email: string;
  existingAccount?: boolean;
  coachName: string;
  tenantName: string;
  /** Nome da EQUIPE (quando a API envia) — preferido ao nome do treinador */
  teamName?: string | null;
  team?: { name?: string | null; logoUrl?: string | null } | null;
  primaryColor: string;
  logoUrl: string | null;
  expiresAt: string;
}

/** Nome a exibir: equipe > marca (se não for só o nome do treinador) > "sua equipe". */
function inviteTeamName(inv: InviteInfo): string {
  const team = inv.teamName || inv.team?.name;
  if (team) return team;
  if (inv.tenantName && inv.tenantName !== inv.coachName) return inv.tenantName;
  return 'Sua nova equipe';
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  // Mesmos consentimentos do cadastro de atleta (Termos, dados de saúde, 18+, marketing) — o ConsentGate não pergunta de novo
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const acceptTerms = isConsentComplete(consent, true);
  const marketingOptIn = consent.marketing;
  const [legalVersions, setLegalVersions] = useState<{ termsVersion: string; privacyVersion: string } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    api.get('/legal/versions').then(({ data }) => setLegalVersions(data)).catch(() => {});
    try { setIsLoggedIn(!!localStorage.getItem('rr_access_token')); } catch { /* sem storage */ }
  }, []);

  // Conta já existente: aceitar convite autenticado (o e-mail logado precisa ser o do convite)
  const handleAcceptExisting = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/invites/accept-existing', { token });
      setLinked(true);
      setTimeout(() => router.push('/athlete'), 2500);
    } catch (err: any) {
      setError(friendlyError(err, 'Não foi possível aceitar o convite.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setInviteError('Token de convite inválido ou ausente.');
      return;
    }
    api.get(`/invites/check?token=${token}`)
      .then(({ data }) => setInvite(data))
      .catch((err) => {
        const msg = friendlyError(err, 'Convite inválido ou expirado.');
        setInviteError(msg);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe seu nome.');
      return;
    }
    const pwdError = passwordPolicyError(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (!acceptTerms) {
      setError('Marque os itens obrigatórios: Termos de Uso e Política de Privacidade, dados de saúde e idade.');
      return;
    }
    if (!legalVersions) {
      setError('Não foi possível carregar os Termos. Recarregue a página.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/invites/accept', {
        token,
        name,
        password,
        acceptTerms: true,
        termsVersion: legalVersions.termsVersion,
        privacyVersion: legalVersions.privacyVersion,
        marketingOptIn,
        healthDataConsent: consent.health,
      });
      setSuccess(true);
      // Convite é sempre de atleta: o login certo é o da área do atleta
      rememberPortal('athlete');
      setTimeout(() => router.push(`/athlete-login?registered=1&email=${encodeURIComponent(invite?.email ?? '')}`), 2500);
    } catch (err: any) {
      setError(friendlyError(err, 'Não foi possível aceitar o convite.'));
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = invite?.primaryColor ?? '#DC2626';

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Convite inválido</h2>
          <p className="text-gray-500 mb-6">{inviteError}</p>
          <a href="/athlete-login" className="text-sm text-blue-600 hover:underline">Ir para login</a>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (linked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Convite aceito!</h2>
          <p className="text-gray-500">Agora você faz parte da equipe {inviteTeamName(invite) === 'Sua nova equipe' ? `de ${invite.coachName}` : inviteTeamName(invite)}.</p>
        </div>
      </div>
    );
  }

  if (invite.existingAccount) {
    const next = typeof window !== 'undefined' ? encodeURIComponent(`/join?token=${token}`) : '';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{inviteTeamName(invite)}</h1>
          <p className="text-sm text-gray-500 mb-6">
            {invite.coachName} te convidou para treinar juntos. Já existe uma conta com o e-mail{' '}
            <span className="font-medium text-gray-700">{invite.email}</span>.
          </p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={handleAcceptExisting}
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold transition-opacity disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? 'Aceitando...' : 'Aceitar convite com minha conta'}
            </button>
          ) : (
            <a
              href={`/athlete-login?next=${next}`}
              className="block w-full py-3 rounded-xl text-white font-semibold"
              style={{ backgroundColor: primaryColor }}
            >
              Fazer login para aceitar
            </a>
          )}
          <p className="text-xs text-gray-400 mt-4">Entre com a conta de {invite.email} para aceitar este convite.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Conta criada!</h2>
          <p className="text-gray-500">Redirecionando para o login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        {/* Header with branding */}
        <div className="text-center mb-8">
          {invite.logoUrl ? (
            <img src={invite.logoUrl} alt={inviteTeamName(invite)} className="h-14 mx-auto mb-4 object-contain" />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {inviteTeamName(invite).charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{inviteTeamName(invite)}</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {invite.coachName} te convidou para treinar juntos
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Criar sua conta</h2>
          <p className="text-sm text-gray-500 mb-6">
            Email: <span className="font-medium text-gray-700">{invite.email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João Silva"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 text-gray-900"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Criar senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 text-gray-900 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{PASSWORD_POLICY_HINT}</p>
            </div>

            <ConsentCheckboxes value={consent} onChange={setConsent} showHealth accent={primaryColor} idPrefix="join" />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold transition-opacity disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? 'Criando conta...' : 'Entrar no time'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Já tem conta?{' '}
            <a href="/athlete-login" className="text-blue-600 hover:underline">Fazer login</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
