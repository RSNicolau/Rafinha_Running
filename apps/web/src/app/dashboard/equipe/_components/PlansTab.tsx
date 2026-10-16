'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { apiError, brl, btnGhost, btnPrimary, INTERVAL_LABEL, inputCls, labelCls, parseBrlToCents, type TeamPlan } from './shared';

interface PlanForm {
  name: string;
  interval: TeamPlan['interval'];
  price: string;
  description: string;
  benefits: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: PlanForm = { name: '', interval: 'MONTHLY', price: '', description: '', benefits: '', sortOrder: '0', isActive: true };

export function PlansTab() {
  const [plans, setPlans] = useState<TeamPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<TeamPlan[]>('/teams/me/plans')
      .then(({ data }) => setPlans(data))
      .catch((err) => toast.error(apiError(err, 'Não foi possível carregar os planos')))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditingId(null); setForm({ ...EMPTY, sortOrder: String(plans.length + 1) }); };
  const openEdit = (p: TeamPlan) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      interval: p.interval,
      price: (p.priceInCents / 100).toFixed(2).replace('.', ','),
      description: p.description ?? '',
      benefits: (p.benefits ?? []).join('\n'),
      sortOrder: String(p.sortOrder ?? 0),
      isActive: p.isActive,
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const priceInCents = parseBrlToCents(form.price);
    if (!form.name.trim()) { toast.error('Informe o nome do plano'); return; }
    if (priceInCents === null || priceInCents < 500) { toast.error('Informe um preço válido (mínimo R$ 5,00)'); return; }
    const payload = {
      name: form.name.trim(),
      interval: form.interval,
      priceInCents,
      description: form.description.trim() || undefined,
      benefits: form.benefits.split('\n').map((b) => b.trim()).filter(Boolean),
      sortOrder: Math.max(0, parseInt(form.sortOrder, 10) || 0),
      isActive: form.isActive,
    };
    setSaving(true);
    try {
      if (editingId) await api.put(`/teams/me/plans/${editingId}`, payload);
      else await api.post('/teams/me/plans', payload);
      toast.success(editingId ? 'Plano atualizado' : 'Plano criado');
      setForm(null);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível salvar o plano'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: TeamPlan) => {
    if (!confirm(`Excluir o plano "${p.name}"? Se houver mensalidades vinculadas, ele será apenas desativado.`)) return;
    try {
      const { data } = await api.delete(`/teams/me/plans/${p.id}`);
      toast.success(data?.deactivated ? 'Plano desativado (há mensalidades vinculadas)' : 'Plano excluído');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível excluir o plano'));
    }
  };

  if (loading) return <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500">
          Tabela de preços da mensalidade que os atletas contratam com a equipe. Alterar o preço vale para novas contratações.
        </p>
        <button onClick={openNew} className={`${btnPrimary} shrink-0`}>+ Novo plano</button>
      </div>

      {form && (
        <form onSubmit={save} className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">{editingId ? 'Editar plano' : 'Novo plano'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls} htmlFor="p-name">Nome *</label>
              <input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Mensal" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="p-interval">Periodicidade *</label>
              <select id="p-interval" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as any })} className={inputCls}>
                {Object.entries(INTERVAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="p-price">Preço (R$) *</label>
              <input id="p-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="174,00" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="p-desc">Descrição</label>
              <input id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="p-order">Ordem de exibição</label>
              <input id="p-order" type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={inputCls} />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="p-benefits">Benefícios (um por linha)</label>
              <textarea id="p-benefits" rows={3} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Disponível para novas contratações
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancelar</button>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.id} className={`glass-card p-5 flex flex-col ${p.isActive ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{INTERVAL_LABEL[p.interval]}</p>
                <h3 className="text-base font-semibold text-gray-900">{p.name}</h3>
              </div>
              {!p.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-500">Inativo</span>}
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{brl(p.priceInCents)}</p>
            {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
            {p.benefits?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-gray-600 list-disc pl-5">
                {p.benefits.map((b) => <li key={b}>{b}</li>)}
              </ul>
            )}
            <p className="text-xs text-gray-400 mt-3">{p._count?.memberships ?? 0} mensalidade(s) vinculada(s)</p>
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button onClick={() => openEdit(p)} className={btnGhost}>Editar</button>
              <button onClick={() => remove(p)} className={btnGhost}>Excluir</button>
            </div>
          </div>
        ))}
        {plans.length === 0 && !form && (
          <div className="glass-card p-8 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">
            Nenhum plano cadastrado. Crie, por exemplo: Mensal, Trimestral e Semestral.
          </div>
        )}
      </div>
    </div>
  );
}
