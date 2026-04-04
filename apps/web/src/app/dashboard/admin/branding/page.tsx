'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { NICHES, NicheKey } from '@/lib/niches';

interface BrandingForm {
  tenantName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  niche: string;
  domain: string | null;
  welcomeMsg: string | null;
}

const PRIMARY_PRESETS = [
  { label: 'Vermelho', value: '#DC2626' },
  { label: 'Laranja', value: '#EA580C' },
  { label: 'Azul', value: '#2563EB' },
  { label: 'Verde', value: '#16A34A' },
  { label: 'Roxo', value: '#7C3AED' },
  { label: 'Rosa', value: '#DB2777' },
  { label: 'Índigo', value: '#4F46E5' },
  { label: 'Teal', value: '#0D9488' },
];

const SECONDARY_PRESETS = [
  { label: 'Carvão', value: '#1F2937' },
  { label: 'Grafite', value: '#374151' },
  { label: 'Preto', value: '#111827' },
  { label: 'Pedra', value: '#4B5563' },
  { label: 'Cinza', value: '#6B7280' },
  { label: 'Meia-noite', value: '#0F172A' },
];

export default function BrandingPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [user]);

  const [form, setForm] = useState<BrandingForm>({
    tenantName: '',
    primaryColor: '#DC2626',
    secondaryColor: '#1F2937',
    logoUrl: null,
    bannerUrl: null,
    niche: 'running',
    domain: null,
    welcomeMsg: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/config/branding')
      .then((r) => setForm({
        tenantName: r.data.tenantName || '',
        primaryColor: r.data.primaryColor || '#DC2626',
        secondaryColor: r.data.secondaryColor || '#1F2937',
        logoUrl: r.data.logoUrl || null,
        bannerUrl: r.data.bannerUrl || null,
        niche: r.data.niche || 'running',
        domain: r.data.domain || null,
        welcomeMsg: r.data.welcomeMsg || null,
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (file: File, type: 'logo' | 'banner') => {
    const setter = type === 'logo' ? setUploadingLogo : setUploadingBanner;
    setter(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      const { data } = await api.post('/config/branding/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm(p => ({ ...p, [type === 'logo' ? 'logoUrl' : 'bannerUrl']: data.url }));
    } catch {
      alert('Erro ao fazer upload. Verifique a configuração do Supabase Storage.');
    } finally {
      setter(false);
    }
  };

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

  const currentNiche = NICHES[form.niche as NicheKey] ?? NICHES.running;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">White-label & Marca</h1>
        <p className="text-sm text-gray-500 mt-1">Personalize o app com a identidade visual da sua assessoria</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Niche */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">Nicho do Esporte</h3>
            <p className="text-xs text-gray-400 mb-5">Define a terminologia e métricas exibidas em todo o app</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {(Object.entries(NICHES) as [NicheKey, typeof NICHES[NicheKey]][]).map(([key, n]) => (
                <button
                  key={key}
                  onClick={() => setForm(p => ({ ...p, niche: key }))}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                    form.niche === key
                      ? 'bg-red-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                  style={form.niche === key ? { borderColor: form.primaryColor, backgroundColor: `${form.primaryColor}10` } : {}}
                >
                  <span className="text-2xl">{n.icon}</span>
                  <span className="text-xs font-medium text-gray-600 text-center leading-tight">{n.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Identity */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Identidade</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome da Assessoria</label>
                <input type="text" value={form.tenantName} onChange={(e) => setForm(p => ({ ...p, tenantName: e.target.value }))} placeholder="Ex: Speed Running Club" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Mensagem de Boas-vindas</label>
                <input type="text" value={form.welcomeMsg || ''} onChange={(e) => setForm(p => ({ ...p, welcomeMsg: e.target.value || null }))} placeholder="Entre para acessar seus treinos" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Domínio Personalizado (opcional)</label>
                <input type="text" value={form.domain || ''} onChange={(e) => setForm(p => ({ ...p, domain: e.target.value || null }))} placeholder="speedrunning.app" className={inputClass} />
                <p className="text-xs text-gray-400 mt-1.5">Aponte o CNAME do seu domínio para app.rafinharunning.com.br</p>
              </div>
            </div>
          </div>

          {/* Logo */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">Logo da Marca</h3>
            <p className="text-xs text-gray-400 mb-5">Aparece no topo do app e nos emails enviados aos atletas</p>
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <span className="text-3xl opacity-40">🏷️</span>
                }
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-3">
                  {form.logoUrl ? 'Logo carregado com sucesso.' : 'Nenhum logo configurado — o app usa o logo padrão.'}
                </p>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logo'); }} />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
                    {uploadingLogo ? 'Enviando...' : 'Escolher imagem'}
                  </button>
                  {form.logoUrl && (
                    <button onClick={() => setForm(p => ({ ...p, logoUrl: null }))} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer">
                      Remover
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">PNG, JPG ou SVG · máx. 5MB · recomendado 200×200px</p>
              </div>
            </div>
          </div>

          {/* Banner */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">Banner da Marca</h3>
            <p className="text-xs text-gray-400 mb-5">Imagem de destaque exibida no topo do perfil e comunicações</p>
            {form.bannerUrl && (
              <div className="w-full aspect-[3/1] rounded-xl overflow-hidden mb-4 border border-gray-200">
                <img src={form.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'banner'); }} />
              <button onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium transition disabled:opacity-50 cursor-pointer">
                {uploadingBanner ? 'Enviando...' : form.bannerUrl ? 'Trocar banner' : 'Escolher banner'}
              </button>
              {form.bannerUrl && (
                <button onClick={() => setForm(p => ({ ...p, bannerUrl: null }))} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer">
                  Remover
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">PNG ou JPG · máx. 5MB · recomendado 1200×400px</p>
          </div>

          {/* Colors */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Cores</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {/* Primary */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-3">Cor Primária</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {PRIMARY_PRESETS.map((c) => (
                    <button key={c.value} title={c.label} onClick={() => setForm(p => ({ ...p, primaryColor: c.value }))}
                      className="w-8 h-8 rounded-lg border-2 transition-all cursor-pointer"
                      style={{ backgroundColor: c.value, borderColor: form.primaryColor === c.value ? c.value : 'transparent', boxShadow: form.primaryColor === c.value ? `0 0 0 3px ${c.value}40` : 'none' }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primaryColor} onChange={(e) => setForm(p => ({ ...p, primaryColor: e.target.value }))} className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5" />
                  <span className="text-sm font-mono text-gray-700 font-medium">{form.primaryColor.toUpperCase()}</span>
                </div>
              </div>
              {/* Secondary */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-3">Cor Secundária</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {SECONDARY_PRESETS.map((c) => (
                    <button key={c.value} title={c.label} onClick={() => setForm(p => ({ ...p, secondaryColor: c.value }))}
                      className="w-8 h-8 rounded-lg border-2 transition-all cursor-pointer"
                      style={{ backgroundColor: c.value, borderColor: form.secondaryColor === c.value ? '#6B7280' : 'transparent', boxShadow: form.secondaryColor === c.value ? '0 0 0 3px #6B728040' : 'none' }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.secondaryColor} onChange={(e) => setForm(p => ({ ...p, secondaryColor: e.target.value }))} className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5" />
                  <span className="text-sm font-mono text-gray-700 font-medium">{form.secondaryColor.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer" style={{ backgroundColor: form.primaryColor }}>
            {saving ? 'Salvando...' : saved ? '✓ Salvo com sucesso' : 'Salvar Configurações'}
          </button>
        </div>

        {/* Preview */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 sticky top-8">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-5">Preview do App</h3>
            <div className="bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              {/* Status bar */}
              <div className="h-6 flex items-center justify-between px-4" style={{ backgroundColor: form.primaryColor }}>
                <span className="text-white text-xs">9:41</span>
                <span className="text-white text-xs">●●●</span>
              </div>
              {/* Header */}
              <div className="px-4 pt-3 pb-3 flex items-center gap-3" style={{ backgroundColor: form.primaryColor }}>
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="logo" className="w-9 h-9 rounded-xl object-contain bg-white/20 p-0.5" />
                  : <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-sm">{form.tenantName?.[0] || 'A'}</div>
                }
                <div>
                  <p className="text-white/70 text-xs">Bem-vindo,</p>
                  <p className="text-white font-bold text-sm">{form.tenantName || 'Sua Assessoria'}</p>
                </div>
              </div>
              {/* Banner strip */}
              {form.bannerUrl && (
                <div className="w-full h-12 overflow-hidden">
                  <img src={form.bannerUrl} alt="banner" className="w-full h-full object-cover" />
                </div>
              )}
              {/* Content */}
              <div className="p-3 space-y-2">
                <div className="bg-white rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: form.secondaryColor }}>
                      Próximo {currentNiche.workoutLabel}
                    </span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: form.primaryColor }} />
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full w-3/4 rounded-full" style={{ backgroundColor: form.primaryColor }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold" style={{ color: form.secondaryColor }}>42 {currentNiche.unit}</p>
                    <p className="text-xs text-gray-400">esta semana</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center">
                    <p className="text-sm font-bold" style={{ color: form.secondaryColor }}>5 {currentNiche.workoutLabel}s</p>
                    <p className="text-xs text-gray-400">este mês</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Color legend */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-lg border border-gray-200" style={{ backgroundColor: form.primaryColor }} />
                <div>
                  <p className="text-xs font-medium text-gray-700">Primária</p>
                  <p className="text-xs text-gray-400 font-mono">{form.primaryColor.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-lg border border-gray-200" style={{ backgroundColor: form.secondaryColor }} />
                <div>
                  <p className="text-xs font-medium text-gray-700">Secundária</p>
                  <p className="text-xs text-gray-400 font-mono">{form.secondaryColor.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg">{currentNiche.icon}</span>
                <div>
                  <p className="text-xs font-medium text-gray-700">Nicho</p>
                  <p className="text-xs text-gray-400">{currentNiche.label}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
