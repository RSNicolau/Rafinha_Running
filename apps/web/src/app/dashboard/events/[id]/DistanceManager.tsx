'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface EventDistance {
  id: string;
  eventId: string;
  name: string;
  distanceKm?: number | null;
  price: number;
  maxParticipants?: number | null;
  registeredCount: number;
  description?: string | null;
  ageGroup?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { registrations: number };
}

interface DistanceForm {
  name: string;
  distanceKm: string;
  price: string;
  maxParticipants: string;
  description: string;
  ageGroup: string;
}

const EMPTY_FORM: DistanceForm = {
  name: '',
  distanceKm: '',
  price: '',
  maxParticipants: '',
  description: '',
  ageGroup: '',
};

const AGE_GROUP_OPTIONS = [
  '',
  '5-6 anos',
  '7-8 anos',
  '9-11 anos',
  '12-15 anos',
  'Adulto geral',
  'Sub-20',
  'Master 40+',
  'Master 50+',
];

function formatPrice(cents: number) {
  if (cents === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function DistanceManager({ eventId, eventPrice, onDistancesChange }: { eventId: string; eventPrice: number; onDistancesChange?: () => void }) {
  const { user } = useAuthStore();
  const isCoach = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [distances, setDistances] = useState<EventDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDistance, setEditingDistance] = useState<EventDistance | null>(null);
  const [form, setForm] = useState<DistanceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    api
      .get<EventDistance[]>(`/events/${eventId}/distances`)
      .then(({ data }) => setDistances(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [eventId]);

  const openCreate = () => {
    setEditingDistance(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (d: EventDistance) => {
    setEditingDistance(d);
    setForm({
      name: d.name,
      distanceKm: d.distanceKm != null ? String(d.distanceKm) : '',
      price: d.price > 0 ? String(d.price / 100) : '',
      maxParticipants: d.maxParticipants != null ? String(d.maxParticipants) : '',
      description: d.description || '',
      ageGroup: d.ageGroup || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        distanceKm: form.distanceKm ? Number(form.distanceKm) : undefined,
        price: form.price ? Math.round(Number(form.price) * 100) : 0,
        maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
        description: form.description || undefined,
        ageGroup: form.ageGroup || undefined,
      };

      if (editingDistance) {
        await api.put(`/events/distances/${editingDistance.id}`, payload);
      } else {
        await api.post(`/events/${eventId}/distances`, payload);
      }

      setShowModal(false);
      load();
      onDistancesChange?.();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao salvar percurso');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este percurso?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/events/distances/${id}`);
      load();
      onDistancesChange?.();
    } catch {
      alert('Erro ao remover percurso');
    } finally {
      setDeletingId(null);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition';
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider';

  return (
    <div className="glass-card p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Distancias / Percursos</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {distances.length === 0
              ? 'Nenhum percurso cadastrado'
              : `${distances.length} percurso${distances.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {isCoach && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Adicionar Percurso
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : distances.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-xs text-gray-400">
            {isCoach ? 'Clique em "Adicionar Percurso" para criar opções de distância.' : 'Nenhum percurso disponível.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {distances.map((d) => {
            const registeredCount = d._count?.registrations ?? d.registeredCount ?? 0;
            const effectivePrice = d.price > 0 ? d.price : eventPrice;
            return (
              <div key={d.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                    {d.distanceKm != null && (
                      <span className="shrink-0 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                        {d.distanceKm}km
                      </span>
                    )}
                    {d.ageGroup && (
                      <span className="shrink-0 text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
                        {d.ageGroup}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{formatPrice(effectivePrice)}{d.price === 0 && eventPrice > 0 ? ' (padrão)' : ''}</span>
                    {d.maxParticipants != null ? (
                      <span className={registeredCount >= d.maxParticipants ? 'text-red-500 font-medium' : ''}>
                        {registeredCount} / {d.maxParticipants} vagas
                      </span>
                    ) : (
                      registeredCount > 0 && <span>{registeredCount} inscritos</span>
                    )}
                    {d.description && (
                      <span className="truncate text-gray-400">{d.description}</span>
                    )}
                  </div>
                </div>
                {isCoach && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEdit(d)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      disabled={deletingId === d.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Remover"
                    >
                      {deletingId === d.id ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">
                {editingDistance ? 'Editar Percurso' : 'Novo Percurso'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: 5K, 10K, Corrida Infantil"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Distância (km)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.distanceKm}
                    onChange={(e) => setForm((p) => ({ ...p, distanceKm: e.target.value }))}
                    placeholder="Ex: 5"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Valor (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="0 = usa preço do evento"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Vagas máximas</label>
                <input
                  type="number"
                  min={0}
                  value={form.maxParticipants}
                  onChange={(e) => setForm((p) => ({ ...p, maxParticipants: e.target.value }))}
                  placeholder="0 = sem limite"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Faixa Etária</label>
                <div className="flex gap-2">
                  <select
                    value={AGE_GROUP_OPTIONS.includes(form.ageGroup) ? form.ageGroup : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') return;
                      setForm((p) => ({ ...p, ageGroup: e.target.value }));
                    }}
                    className={inputClass + ' flex-1'}
                  >
                    <option value="">Sem faixa definida</option>
                    {AGE_GROUP_OPTIONS.filter(Boolean).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {form.ageGroup && !AGE_GROUP_OPTIONS.includes(form.ageGroup) && (
                      <option value="__custom__">{form.ageGroup} (personalizado)</option>
                    )}
                  </select>
                  <input
                    type="text"
                    value={form.ageGroup}
                    onChange={(e) => setForm((p) => ({ ...p, ageGroup: e.target.value }))}
                    placeholder="Personalizar..."
                    className={inputClass + ' w-36 shrink-0'}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Descrição (opcional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Ex: Para iniciantes e crianças"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editingDistance ? 'Salvar Alterações' : 'Adicionar Percurso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
