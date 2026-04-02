'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface PlanItem {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  active?: boolean;
}

interface PlansConfig {
  coach: PlanItem[];
  athlete: PlanItem[];
}

function newPlan(): PlanItem {
  return {
    id: `plan_${Date.now()}`,
    name: 'Novo Plano',
    price: 4900,
    description: 'Descrição do plano',
    features: ['Funcionalidade 1'],
    active: true,
  };
}

export default function AdminPlansPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [config, setConfig] = useState<PlansConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Role guard: only ADMIN and SUPER_ADMIN can access this page
  useEffect(() => {
    if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [user]);

  useEffect(() => {
    api.get('/admin/config/plans')
      .then(({ data }) => setConfig(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updatePlan = (type: 'coach' | 'athlete', idx: number, field: keyof PlanItem, value: any) => {
    if (!config) return;
    const updated = { ...config, [type]: [...config[type]] };
    (updated[type][idx] as any)[field] = value;
    setConfig(updated);
  };

  const updateFeature = (type: 'coach' | 'athlete', planIdx: number, featIdx: number, value: string) => {
    if (!config) return;
    const updated = { ...config, [type]: config[type].map((p, i) => i === planIdx ? { ...p, features: p.features.map((f, fi) => fi === featIdx ? value : f) } : p) };
    setConfig(updated);
  };

  const addFeature = (type: 'coach' | 'athlete', planIdx: number) => {
    if (!config) return;
    const updated = { ...config, [type]: config[type].map((p, i) => i === planIdx ? { ...p, features: [...p.features, ''] } : p) };
    setConfig(updated);
  };

  const removeFeature = (type: 'coach' | 'athlete', planIdx: number, featIdx: number) => {
    if (!config) return;
    const updated = { ...config, [type]: config[type].map((p, i) => i === planIdx ? { ...p, features: p.features.filter((_, fi) => fi !== featIdx) } : p) };
    setConfig(updated);
  };

  const addPlan = (type: 'coach' | 'athlete') => {
    if (!config) return;
    setConfig({ ...config, [type]: [...config[type], newPlan()] });
  };

  const removePlan = (type: 'coach' | 'athlete', idx: number) => {
    if (!config) return;
    if (config[type].length <= 1) return; // keep at least 1 plan
    setConfig({ ...config, [type]: config[type].filter((_, i) => i !== idx) });
  };

  const togglePlanActive = (type: 'coach' | 'athlete', idx: number) => {
    if (!config) return;
    const updated = { ...config, [type]: config[type].map((p, i) => i === idx ? { ...p, active: !(p.active ?? true) } : p) };
    setConfig(updated);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put('/admin/config/plans', config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Erro ao salvar.');
    }
    setSaving(false);
  };

  const formatPrice = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Planos & Preços</h1>
          <p className="text-sm text-gray-500 mt-1">Configure os planos e preços exibidos na plataforma</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-primary hover:bg-red-700 text-white text-sm font-medium rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />
          ) : saved ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H7a2 2 0 00-2 2v14l7-3 7 3V5a2 2 0 00-2-2z" />
            </svg>
          )}
          {saved ? 'Salvo!' : 'Salvar alterações'}
        </button>
      </div>

      {(['coach', 'athlete'] as const).map((type) => (
        <div key={type} className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${type === 'coach' ? 'bg-[#DC2626]' : 'bg-gray-500'}`} />
              Planos para {type === 'coach' ? 'Treinadores (Coach)' : 'Atletas'}
            </h2>
            <button
              onClick={() => addPlan(type)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-primary hover:text-primary transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Adicionar Plano
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {config[type].map((plan, pIdx) => {
              const isActive = plan.active ?? true;
              return (
                <div key={plan.id} className={`glass-card p-5 relative transition-opacity ${isActive ? '' : 'opacity-60'}`}>
                  {/* Header: active toggle + delete */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => togglePlanActive(type, pIdx)}
                      title={isActive ? 'Desativar plano' : 'Ativar plano'}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {isActive ? 'Ativo' : 'Inativo'}
                    </button>
                    {config[type].length > 1 && (
                      <button
                        onClick={() => removePlan(type, pIdx)}
                        title="Remover plano"
                        className="p-1 text-gray-300 hover:text-red-500 transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Nome do plano</label>
                    <input
                      value={plan.name}
                      onChange={(e) => updatePlan(type, pIdx, 'name', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Preço (centavos)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={plan.price}
                        onChange={(e) => updatePlan(type, pIdx, 'price', Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="text-xs text-gray-500 whitespace-nowrap">{formatPrice(plan.price)}/mês</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Descrição</label>
                    <input
                      value={plan.description}
                      onChange={(e) => updatePlan(type, pIdx, 'description', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Funcionalidades</label>
                    <div className="space-y-2">
                      {plan.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-center gap-1.5">
                          <input
                            value={feat}
                            onChange={(e) => updateFeature(type, pIdx, fIdx, e.target.value)}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary/20"
                          />
                          <button
                            onClick={() => removeFeature(type, pIdx, fIdx)}
                            className="p-1 text-gray-300 hover:text-red-500 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addFeature(type, pIdx)}
                        className="w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-400 transition"
                      >
                        + Adicionar funcionalidade
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
