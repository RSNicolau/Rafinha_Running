'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

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
  if (!password) errors.password = 'Senha é obrigatória';
  else if (password.length < 6) errors.password = 'Senha deve ter no mínimo 6 caracteres';
  return Object.keys(errors).length > 0 ? errors : null;
}

export default function RegisterPage() {
  const router = useRouter();
  const { loadUser, isAuthenticated } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { if (isAuthenticated) router.replace('/dashboard'); }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const errors = validateRegisterForm(name, email, password);
    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', { name: name.trim(), email, password, role: 'COACH' });
      toast.success('Conta criada com sucesso!');
      router.replace('/login?registered=1');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao criar conta. Tente novamente.';
      toast.error(msg);
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
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Criar conta</h2>
          <p className="text-sm text-gray-500 mb-6">Comece a gerenciar sua assessoria</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: undefined })); }}
                placeholder="Seu nome"
                className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition ${fieldErrors.name ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                autoComplete="name"
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">E-mail</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                  placeholder="Mínimo 6 caracteres"
                  className={`w-full px-4 py-3 rounded-xl bg-gray-50/80 border text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition pr-12 ${fieldErrors.password ? 'border-red-400 bg-red-50/40' : 'border-gray-200/60'}`}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              {loading ? 'Criando conta...' : 'Criar conta de treinador'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-[#DC2626] font-medium hover:text-red-800 transition">
            Entrar →
          </Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">RR — Rafinha Running v1.0.0</p>
      </div>
    </div>
  );
}
