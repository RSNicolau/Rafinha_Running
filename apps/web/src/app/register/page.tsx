'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { api, friendlyError } from '@/lib/api';
import { passwordPolicyError, PASSWORD_POLICY_HINT } from '@/lib/password-policy';
import { registerConsentPayload } from '@/lib/legal';
import { ConsentCheckboxes, EMPTY_CONSENT, isConsentComplete, type ConsentState } from '@/components/legal/ConsentCheckboxes';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { CookieNotice } from '@/components/legal/CookieNotice';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

function validateRegisterForm(name: string, email: string, password: string): FieldErrors | null {
  const errors: FieldErrors = {};
  if (!name.trim() || name.trim().length < 2) errors.name = 'Nome deve ter no mínimo 2 caracteres';
  if (!email.trim()) errors.email = 'E-mail é obrigatório';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'E-mail inválido';
  const pwdError = passwordPolicyError(password);
  if (pwdError) errors.password = pwdError;
  return Object.keys(errors).length > 0 ? errors : null;
}

interface TeamInviteInfo {
  email: string;
  role: 'ADMIN' | 'COACH' | 'STAFF';
  roleLabel: string;
  team: { name: string; slug: string; logoUrl: string | null; primaryColor: string | null };
  existingAccount: boolean;
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamInviteToken = searchParams.get('teamInvite');
  const { loadUser, isAuthenticated, login, user, refreshTeam, setSession } = useAuthStore();
  const [invite, setInvite] = useState<TeamInviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!teamInviteToken);
  const [accepting, setAccepting] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const consentOk = isConsentComplete(consent, false);

  useEffect(() => { loadUser(); }, []);
  // Com convite de equipe a página continua (aceite com a conta logada); sem convite, segue para o plano
  useEffect(() => { if (isAuthenticated && !teamInviteToken) router.replace('/subscribe'); }, [isAuthenticated, teamInviteToken]);

  useEffect(() => {
    if (!teamInviteToken) return;
    api.get('/teams/invites/check', { params: { token: teamInviteToken } })
      .then(({ data }) => { setInvite(data); setEmail(data.email); })
      .catch((err) => {
        const raw = err?.response?.data?.message;
        setInviteError((Array.isArray(raw) ? raw.join(' ') : raw) ?? 'Convite inválido ou expirado');
      })
      .finally(() => setInviteLoading(false));
  }, [teamInviteToken]);

  /** Usuário já tem conta: entra (se preciso) e aceita o convite. */
  const acceptWithAccount = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!teamInviteToken || !invite) return;
    setAccepting(true);
    try {
      if (!isAuthenticated) {
        if (!password) { toast.error('Informe sua senha'); return; }
        const res = await login(invite.email, password);
        if (res.mfaRequired) {
          toast.message('Sua conta usa verificação em duas etapas. Entre pelo login e abra o link do convite novamente.');
          router.replace('/login');
          return;
        }
      }
      await api.post('/teams/invites/accept', { token: teamInviteToken });
      await refreshTeam();
      toast.success(`Bem-vindo(a) à equipe ${invite.team.name}!`);
      router.replace('/dashboard');
    } catch (err: any) {
      toast.error(friendlyError(err, 'Não foi possível aceitar o convite'));
    } finally {
      setAccepting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const errors = validateRegisterForm(name, email, password);
    if (errors) {
      setFieldErrors(errors);
      return;
    }
    if (!consentOk) {
      toast.error('Aceite os Termos de Uso e a Política de Privacidade para continuar.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        name: name.trim(),
        email,
        password,
        role: 'COACH',
        ...(teamInviteToken
          ? { teamInviteToken }
          : teamName.trim() ? { teamName: teamName.trim() } : {}),
        ...registerConsentPayload(consent.marketing),
      });
      toast.success(teamInviteToken ? 'Conta criada! Entrando na equipe...' : 'Conta criada! Direcionando para escolher seu plano...');
      // Auto-login: dono de equipe nova → escolher plano; membro convidado → painel
      try {
        if (data?.accessToken && data?.user) setSession(data);
        else await login(email, password);
        router.replace(teamInviteToken ? '/dashboard' : '/subscribe');
      } catch {
        // If auto-login fails, fallback to login page
        router.replace('/login?registered=1');
      }
    } catch (err: any) {
      toast.error(friendlyError(err, 'Erro ao criar conta. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <div className="w-full max-w-[420px]">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <filter id="logo-red-fix" colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
            </filter>
          </defs>
        </svg>

        <div className="text-center mb-10">
          <div className="w-40 sm:w-52 mx-auto mb-5 rounded-2xl overflow-hidden shadow-lg">
            <img src="/logo.png" alt="Rafinha Running" className="w-full block" style={{ filter: 'url(#logo-red-fix)' }} />
          </div>
          <p className="text-sm text-gray-500 font-medium">Painel do Treinador</p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          {teamInviteToken && inviteLoading && (
            <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          )}
          {teamInviteToken && inviteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {inviteError}. Peça um novo convite à gestão da equipe.
            </div>
          )}
          {invite && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Convite de equipe</p>
              <p className="text-sm text-gray-900 mt-1">
                Você foi convidado(a) para a equipe <strong>{invite.team.name}</strong> como <strong>{invite.roleLabel?.toLowerCase()}</strong>.
              </p>
            </div>
          )}

          {invite?.existingAccount ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Aceitar convite</h2>
              {isAuthenticated && user?.email?.toLowerCase() !== invite.email ? (
                <p className="text-sm text-gray-600">
                  Este convite foi enviado para <strong>{invite.email}</strong>, mas você está conectado(a) como {user?.email}.
                  Saia e entre com a conta do convite.
                </p>
              ) : isAuthenticated ? (
                <button onClick={() => acceptWithAccount()} disabled={accepting} className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
                  {accepting ? 'Entrando na equipe...' : `Entrar na equipe ${invite.team.name}`}
                </button>
              ) : (
                <form onSubmit={acceptWithAccount} className="space-y-4" noValidate>
                  <p className="text-sm text-gray-600">Você já tem conta com <strong>{invite.email}</strong>. Entre com sua senha para aceitar.</p>
                  <input
                    type="password"
                    aria-label="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  />
                  <button type="submit" disabled={accepting} className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
                    {accepting ? 'Entrando...' : 'Entrar e aceitar convite'}
                  </button>
                </form>
              )}
            </div>
          ) : (teamInviteToken && (inviteLoading || inviteError)) ? null : (
          <>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Criar conta</h2>
          <p className="text-sm text-gray-500 mb-6">{invite ? 'Crie sua conta de treinador para entrar na equipe' : 'Comece a gerenciar sua assessoria'}</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="register-name" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Nome completo</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: undefined })); }}
                placeholder="Seu nome"
                className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition ${fieldErrors.name ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                autoComplete="name"
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
            </div>
            {!invite && (
              <div>
                <label htmlFor="register-team" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Nome da assessoria/equipe <span className="normal-case tracking-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="register-team"
                  type="text"
                  value={teamName}
                  maxLength={80}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Ex.: Assessoria Corre Junto"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  autoComplete="organization"
                />
                <p className="mt-1 text-xs text-gray-400">Treina sozinho? Tudo bem — você é uma equipe de uma pessoa. Se deixar em branco, usamos o seu nome.</p>
              </div>
            )}
            <div>
              <label htmlFor="register-email" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">E-mail</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }}
                readOnly={!!invite}
                placeholder="seu@email.com"
                className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition ${fieldErrors.email ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                autoComplete="email"
              />
              {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
            </div>
            <div>
              <label htmlFor="register-password" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Senha</label>
              <div className="relative">
                <input
                  id="register-password"
                  aria-describedby="register-password-hint"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                  placeholder="Mínimo 8 caracteres"
                  className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition pr-12 ${fieldErrors.password ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {fieldErrors.password
                ? <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                : <p id="register-password-hint" className="mt-1 text-[11px] text-gray-400">{PASSWORD_POLICY_HINT}</p>}
            </div>

            <div className="pt-1">
              <ConsentCheckboxes value={consent} onChange={setConsent} showHealth={false} idPrefix="register" />
            </div>

            <button
              type="submit"
              disabled={loading || !consentOk}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              {loading ? 'Criando conta...' : invite ? `Criar conta e entrar na equipe` : 'Criar conta de treinador'}
            </button>
          </form>
          </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-[#DC2626] font-medium hover:text-red-800 transition">
            Entrar →
          </Link>
        </p>
        <LegalFooterLinks className="mt-4" />
        <p className="text-center text-xs text-gray-400 mt-2">RR — Rafinha Running v1.0.0</p>
      </div>
      <CookieNotice />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RegisterContent />
    </Suspense>
  );
}
