'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface Branding {
  tenantName: string;
  primaryColor: string;
  logoUrl: string | null;
  domain: string | null;
  welcomeMsg: string | null;
}

const COLOR_PRESETS = [
  { label: 'Vermelho', value: '#DC2626' },
  { label: 'Laranja', value: '#EA580C' },
  { label: 'Azul', value: '#2563EB' },
  { label: 'Verde', value: '#16A34A' },
  { label: 'Roxo', value: '#7C3AED' },
  { label: 'Rosa', value: '#DB2777' },
  { label: 'Índigo', value: '#4F46E5' },
  { label: 'Teal', value: '#0D9488' },
];

export default function BrandingPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Role guard: only ADMIN and SUPER_ADMIN can access this page
  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [user]);

  const [form, setForm] = useState<Branding>({
    tenantName: '',
    primaryColor: '#DC2626',
    logoUrl: null,
    domain: null,
    welcomeMsg: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/config/branding')
      .then((r) => setForm({
        tenantName: r.data.tenantName || '',
        primaryColor: r.data.primaryColor || '#DC2626',
        logoUrl: r.data.logoUrl || null,
        domain: r.data.domain || null,
        welcomeMsg: r.data.welcomeMsg || null,
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/config/branding', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition';
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">White-label & Marca</h1>
        <p className="text-sm text-gray-500 mt-1">Personalize o app com a identidade visual da sua assessoria</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identity */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Identidade</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome da Assessoria</label>
                <input
                  type="text"
                  value={form.tenantName}
                  onChange={(e) => setForm(p => ({ ...p, tenantName: e.target.value }))}
                  placeholder="Ex: Speed Running Club"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Mensagem de Boas-vindas</label>
                <input
                  type="text"
                  value={form.welcomeMsg || ''}
                  onChange={(e) => setForm(p => ({ ...p, welcomeMsg: e.target.value }))}
                  placeholder="Entre para acessar seus treinos"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>URL do Logo (opcional)</label>
                <input
                  type="url"
                  value={form.logoUrl || ''}
                  onChange={(e) => setForm(p => ({ ...p, logoUrl: e.target.value || null }))}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Domínio Personalizado (opcional)</label>
                <input
                  type="text"
                  value={form.domain || ''}
                  onChange={(e) => setForm(p => ({ ...p, domain: e.target.value || null }))}
                  placeholder="speedrunning.app"
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1.5">Aponte o CNAME do seu domínio para app.rafinharunning.com.br</p>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Cor Primária</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setForm(p => ({ ...p, primaryColor: c.value }))}
                  className="flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <div
                    className="w-10 h-10 rounded-xl border-2 transition-all"
                    style={{
                      backgroundColor: c.value,
                      borderColor: form.primaryColor === c.value ? c.value : 'transparent',
                      boxShadow: form.primaryColor === c.value ? `0 0 0 3px ${c.value}30` : 'none',
                    }}
                  />
                  <span className="text-xs text-gray-500">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Personalizada</label>
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm(p => ({ ...p, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5"
              />
              <span className="text-sm font-mono text-gray-600">{form.primaryColor}</span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Salvando...' : saved ? '✓ Salvo com sucesso' : 'Salvar Configurações'}
          </button>
        </div>

        {/* Preview */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 sticky top-8">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Preview</h3>
            {/* App mockup */}
            <div className="bg-gray-100 rounded-2xl overflow-hidden border border-gray-200">
              {/* Status bar */}
              <div className="h-6 flex items-center justify-between px-4" style={{ backgroundColor: form.primaryColor }}>
                <span className="text-white text-xs">9:41</span>
                <span className="text-white text-xs">●●●</span>
              </div>
              {/* Header */}
              <div className="px-4 pt-4 pb-3" style={{ backgroundColor: form.primaryColor }}>
                <p className="text-white/70 text-xs mb-0.5">Bem-vindo,</p>
                <p className="text-white font-bold text-base">{form.tenantName || 'Sua Assessoria'}</p>
              </div>
              {/* Content */}
              <div className="p-3 space-y-2">
                <div className="bg-white rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700">Próximo treino</span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: form.primaryColor }} />
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full w-3/4 rounded-full" style={{ backgroundColor: form.primaryColor }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['42 km', '5 treinos'].map((v) => (
                    <div key={v} className="bg-white rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-gray-900">{v}</p>
                      <p className="text-xs text-gray-400">esta semana</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">Preview em tempo real</p>
          </div>
        </div>
      </div>
    </div>
  );
}
