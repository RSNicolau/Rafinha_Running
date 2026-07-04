'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Partner {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  emoji?: string | null;
  color?: string | null;
  linkUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface PartnerForm {
  name: string;
  category: string;
  description: string;
  emoji: string;
  color: string;
  linkUrl: string;
}

const EMPTY_FORM: PartnerForm = { name: '', category: '', description: '', emoji: '', color: '#DC2626', linkUrl: '' };

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    api
      .get<Partner[]>('/partners/coach')
      .then(({ data }) => setPartners(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  };

  const openEdit = (p: Partner) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category ?? '',
      description: p.description ?? '',
      emoji: p.emoji ?? '',
      color: p.color ?? '#DC2626',
      linkUrl: p.linkUrl ?? '',
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      emoji: form.emoji.trim() || undefined,
      color: form.color || undefined,
      linkUrl: form.linkUrl.trim() || undefined,
    };
    try {
      if (editingId) {
        await api.put(`/partners/${editingId}`, payload);
      } else {
        await api.post('/partners', payload);
      }
      setShowForm(false);
      load();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Partner) => {
    setBusyId(p.id);
    try {
      await api.put(`/partners/${p.id}`, { isActive: !p.isActive });
      setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p: Partner) => {
    if (!confirm(`Remover o parceiro "${p.name}"?`)) return;
    setBusyId(p.id);
    try {
      await api.delete(`/partners/${p.id}`);
      setPartners((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Parceiros</h1>
          <p className="text-sm text-gray-500 mt-1">Patrocinadores e parceiros da assessoria — exibidos aos atletas no app e nos eventos</p>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:opacity-90 transition"
        >
          + Novo parceiro
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="glass-card p-6 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">{editingId ? 'Editar parceiro' : 'Novo parceiro'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Ex.: Garmin Brasil"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Ex.: Tecnologia, Hidratação"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Emoji</label>
              <input
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                maxLength={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="⌚"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cor de destaque</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-full h-9 px-1 py-1 border border-gray-200 rounded-xl cursor-pointer"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Ex.: Tecnologia GPS oficial dos eventos"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Link (site do parceiro)</label>
              <input
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="https://..."
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar parceiro'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {partners.length === 0 && !showForm ? (
        <div className="glass-card p-12 text-center">
          <p className="text-gray-500 font-medium">Nenhum parceiro cadastrado</p>
          <p className="text-gray-400 text-sm mt-1">Cadastre patrocinadores para exibi-los aos atletas no app</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => (
            <div key={p.id} className={`glass-card p-5 ${!p.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                  style={{ backgroundColor: (p.color ?? '#DC2626') + '18' }}
                >
                  {p.logoUrl ? (
                    <img src={p.logoUrl} alt={p.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span>{p.emoji || p.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    {p.category && (
                      <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">{p.category}</span>
                    )}
                    {!p.isActive && (
                      <span className="text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0">Inativo</span>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    disabled={busyId === p.id}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-60 ${
                      p.isActive
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    {p.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={busyId === p.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-60"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
