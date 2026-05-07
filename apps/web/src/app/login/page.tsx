'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

function getSubscriptionRoute(status: string | undefined, role?: string): string {
  // Athletes use /athlete-login + /athlete-subscribe, never /subscribe (coach plans)
  if (role === 'ATHLETE') {
    return status === 'ACTIVE' || status === 'TRIALING' ? '/athlete' : '/athlete-subscribe';
  }
  return status === 'ACTIVE' || status === 'TRIALING' ? '/dashboard' : '/subscribe';
}

// Roles that bypass subscription check and go straight to dashboard
const BYPASS_SUBSCRIPTION_ROLES = ['COACH', 'SUPER_ADMIN', 'ADMIN'];

function validateLoginForm(email: string, password: string): string | null {
  if (!email.trim()) return 'E-mail é obrigatório';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido';
  if (!password) return 'Senha é obrigatória';
  if (password.length < 6) return 'Senha deve ter no mínimo 6 caracteres';
  return null;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';
  const { login, loadUser, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (justRegistered) {
      toast.success('Conta criada com sucesso! Faça login para continuar.');
    }
  }, [justRegistered]);

  useEffect(() => {
    if (isAuthenticated) {
      api.get('/users/me')
        .then(({ data: me }) => {
          if (me?.role === 'SUPER_ADMIN') { router.replace('/super-admin'); return; }
          if (me?.role === 'ADMIN') { router.replace('/dashboard/admin/plans'); return; }
          // COACH goes straight to dashboard — no subscription required
          if (BYPASS_SUBSCRIPTION_ROLES.includes(me?.role)) { router.replace('/dashboard'); return; }
          // Athlete flow
          if (me?.role === 'ATHLETE') {
            return api.get('/subscriptions/current')
              .then(({ data }) => router.replace(getSubscriptionRoute(data?.status, 'ATHLETE')))
              .catch(() => router.replace('/athlete-subscribe'));
          }
          return api.get('/subscriptions/current')
            .then(({ data }) => router.replace(getSubscriptionRoute(data?.status, me?.role)))
            .catch((err) => {
              if (err?.response?.status === 404 || err?.response?.status === 400) {
                router.replace('/subscribe');
              }
            });
        })
        .catch(() => {
          api.get('/subscriptions/current')
            .then(({ data }) => router.replace(getSubscriptionRoute(data?.status)))
            .catch(() => {});
        });
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setFieldErrors({});

    const validationError = validateLoginForm(email, password);
    if (validationError) {
      if (validationError.includes('E-mail')) setFieldErrors({ email: validationError });
      else setFieldErrors({ password: validationError });
      return;
    }

    try {
      await login(email, password);
      try {
        const meRes = await api.get('/users/me');
        const role = meRes.data?.role;
        if (role === 'SUPER_ADMIN') { router.replace('/super-admin'); return; }
        if (role === 'ADMIN') { router.replace('/dashboard/admin/plans'); return; }
        // COACH and other bypass roles go straight to dashboard — no subscription required
        if (BYPASS_SUBSCRIPTION_ROLES.includes(role)) { router.replace('/dashboard'); return; }
        // Athlete flow
        if (role === 'ATHLETE') {
          try {
            const { data } = await api.get('/subscriptions/current');
            router.replace(getSubscriptionRoute(data?.status, 'ATHLETE'));
          } catch {
            router.replace('/athlete-subscribe');
          }
          return;
        }
        const { data } = await api.get('/subscriptions/current');
        router.replace(getSubscriptionRoute(data?.status, role));
      } catch (err: any) {
        if (err?.response?.status === 404 || err?.response?.status === 400) {
          router.replace('/subscribe');
        } else {
          router.replace('/dashboard');
        }
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'E-mail ou senha incorretos');
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
            <img
              src="/logo.png"
              alt="Rafinha Running"
              className="w-full block"
              style={{ filter: 'url(#logo-red-fix)' }}
            />
          </div>
          <p className="text-sm text-gray-500 font-medium">Painel do Treinador</p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Bem-vindo de volta</h2>

          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 mb-5">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-red-600">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }}
                placeholder="seu@email.com"
                className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition ${fieldErrors.email ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                autoComplete="email"
              />
              {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition pr-12 ${fieldErrors.password ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
            </div>

            <div className="flex justify-end">
              <a href="/forgot-password" className="text-xs text-[#DC2626] hover:text-red-800 transition font-medium">
                Esqueci minha senha
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-medium tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Não tem conta?{' '}
          <a href="/register" className="text-[#DC2626] font-medium hover:text-red-800 transition">
            Criar conta de treinador →
          </a>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          RR — Rafinha Running v1.0.0
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
