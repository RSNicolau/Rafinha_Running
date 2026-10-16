'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { consumeReturnTo, isPriorityReturnTo } from '@/lib/return-to';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { CookieNotice } from '@/components/legal/CookieNotice';

function AthleteLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyMfa, loadUser, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState(() => {
    const e = searchParams.get('email');
    return e && e.length <= 254 ? e : '';
  });
  const [password, setPassword] = useState('');
  // Vindo do aceite de convite / cadastro (?registered=1)
  const justRegistered = searchParams.get('registered') === '1';
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  // Destino de retorno (?redirect=, ?next= ou localStorage rr_return_to) — lido uma única vez
  const returnToRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Declarado antes dos demais efeitos: roda primeiro no mesmo commit
    if (returnToRef.current === undefined) returnToRef.current = consumeReturnTo(searchParams);
    loadUser();
  }, []);

  const redirectAfterLogin = async () => {
    const returnTo = returnToRef.current;
    if (isPriorityReturnTo(returnTo)) {
      router.replace(returnTo);
      return;
    }
    // Treinador / gestão da equipe / plataforma que entrou pela tela do atleta → painel correto
    const role = useAuthStore.getState().user?.role;
    if (role === 'SUPER_ADMIN') { router.replace('/super-admin'); return; }
    if (role === 'COACH' || role === 'ADMIN') { router.replace('/dashboard'); return; }
    const dest = await athleteDestination();
    router.replace(dest ?? '/athlete'); // falha de API: não bloqueia o atleta
  };

  useEffect(() => {
    if (isAuthenticated) {
      const returnTo = returnToRef.current;
      if (isPriorityReturnTo(returnTo)) {
        router.replace(returnTo);
        return;
      }
      const role = useAuthStore.getState().user?.role;
      if (role === 'SUPER_ADMIN') { router.replace('/super-admin'); return; }
      if (role === 'COACH' || role === 'ADMIN') { router.replace('/dashboard'); return; }
      // Em erro de API não redireciona (evita loop)
      athleteDestination().then((dest) => { if (dest) router.replace(dest); });
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      useAuthStore.setState({ error: 'Informe um e-mail válido' });
      return;
    }
    if (!password) {
      useAuthStore.setState({ error: 'Informe sua senha' });
      return;
    }
    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode('');
        return;
      }
      await redirectAfterLogin();
    } catch {
      // erro exibido pelo store (campo `error`)
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!mfaToken) return;
    if (!/^\d{6}$/.test(mfaCode)) {
      toast.error('Digite o código de 6 dígitos do seu aplicativo autenticador');
      return;
    }
    try {
      await verifyMfa(mfaToken, mfaCode);
      await redirectAfterLogin();
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message ?? 'Código inválido';
      // mfaToken expirado/inválido → volta para a etapa de senha
      if (status === 401 && /sess[aã]o/i.test(String(message))) {
        setMfaToken(null);
        setMfaCode('');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8" style={{ background: 'linear-gradient(to bottom, #E5E7EB 0%, #F2F2F7 55%)' }}>
      <div className="w-full max-w-[420px]">
        {/* SVG color matrix: maps logo red → #DC2626, white stays white */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <filter id="logo-red-fix" colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
            </filter>
          </defs>
        </svg>

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-40 sm:w-52 mx-auto mb-5 rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/logo.png"
              alt="Rafinha Running"
              className="w-full block"
              style={{ filter: 'url(#logo-red-fix)' }}
            />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Portal do Atleta
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-gray-500 mb-6">Acesse seu painel de treinos</p>

          {error && (
            <div role="alert" aria-live="assertive" className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 mb-5">
              <svg aria-hidden="true" className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-red-600">{error}</span>
            </div>
          )}

          {mfaToken ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4" noValidate>
              <p className="text-sm text-gray-600">
                Sua conta tem verificação em duas etapas. Digite o código de 6 dígitos do seu aplicativo autenticador.
              </p>
              <div>
                <label htmlFor="athlete-login-mfa" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Código de verificação
                </label>
                <input
                  id="athlete-login-mfa"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-center text-lg tracking-[0.5em] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  autoComplete="one-time-code"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || mfaCode.length !== 6}
                className="w-full py-3.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
              >
                {isLoading ? 'Verificando...' : 'Verificar'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaToken(null); setMfaCode(''); clearError(); }}
                className="w-full text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Voltar
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {justRegistered && !error && (
                <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">
                  Conta criada! Entre com seu e-mail e senha.
                </div>
              )}
              <div>
                <label htmlFor="athlete-login-email" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  E-mail
                </label>
                <input
                  id="athlete-login-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  required
                />
              </div>

              <div>
                <label htmlFor="athlete-login-password" className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="athlete-login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition pr-12"
                    required
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
              </div>

              <div className="flex justify-end">
                <a href="/forgot-password?portal=athlete" className="text-xs text-gray-600 hover:text-gray-900 transition font-medium">
                  Esqueci minha senha
                </a>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
              >
                {isLoading ? 'Entrando...' : 'Acessar meus treinos'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-5 space-y-2">
          <p className="text-xs text-gray-400">
            Não tem conta?{' '}
            <Link href="/athlete-register" className="text-gray-700 font-medium hover:text-gray-900 transition">
              Criar conta de atleta →
            </Link>
          </p>
          <p className="text-xs text-gray-400">
            É treinador?{' '}
            <Link href="/login" className="text-gray-500 font-medium hover:text-gray-900 transition">
              Acessar painel do coach →
            </Link>
          </p>
        </div>

        <LegalFooterLinks className="mt-5" />
        <p className="text-center text-xs text-gray-400 mt-3">
          RR — Rafinha Running v1.0.0
        </p>
      </div>
      <CookieNotice />
    </div>
  );
}

/**
 * Para onde o atleta vai após o login:
 *  1. mensalidade da equipe (GET /memberships/me): acesso vigente, em atraso ou pausada → /athlete
 *     (treino não é bloqueado; o card "Minha mensalidade" mostra o aviso); aguardando 1º pagamento → assinatura;
 *  2. senão, assinatura legada (GET /subscriptions/current) ativa → /athlete;
 *  3. sem nenhuma das duas → /athlete-subscribe.
 * Retorna null quando as duas consultas falham por erro de servidor/rede.
 */
async function athleteDestination(): Promise<string | null> {
  let membershipFailed = false;
  try {
    const { data } = await api.get('/memberships/me');
    if (data?.access?.active) return '/athlete';
    const st = data?.membership?.status;
    if (st === 'PAST_DUE' || st === 'PAUSED') return '/athlete';
    if (st === 'PENDING') return '/athlete-subscribe';
  } catch {
    membershipFailed = true;
  }
  try {
    const { data } = await api.get('/subscriptions/current');
    if (data?.status === 'ACTIVE' || data?.status === 'TRIALING') return '/athlete';
    return '/athlete-subscribe';
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.response?.status === 400) return '/athlete-subscribe';
    return membershipFailed ? null : '/athlete-subscribe';
  }
}

export default function AthleteLoginPage() {
  return (
    <Suspense fallback={null}>
      <AthleteLoginContent />
    </Suspense>
  );
}
