'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED' | 'COURTESY';
  value: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventId: string;
  eventPrice: number; // cents
}

export default function CouponManager({ eventId, eventPrice }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'PERCENT' as 'PERCENT' | 'FIXED' | 'COURTESY',
    value: '',
    maxUses: '',
    expiresAt: '',
  });
  const [kitSessionLabel, setKitSessionLabel] = useState('');
  const [kitLink, setKitLink] = useState('');
  const [generatingKit, setGeneratingKit] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/events/${eventId}/coupons`);
      setCoupons(r.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eventId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/events/${eventId}/coupons`, {
        code: form.code,
        type: form.type,
        value: form.type !== 'COURTESY' ? parseFloat(form.value) : 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      setForm({ code: '', type: 'PERCENT', value: '', maxUses: '', expiresAt: '' });
      setShowForm(false);
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Erro ao criar cupom');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateKitSession = async () => {
    if (!kitSessionLabel.trim()) {
      alert('Informe o nome do voluntário');
      return;
    }
    setGeneratingKit(true);
    try {
      const r = await api.post(`/events/${eventId}/kit-session`, { label: kitSessionLabel });
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/kit-entrega?token=${r.data.token}`;
      setKitLink(link);
      setKitSessionLabel('');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Erro ao gerar sessão');
    } finally {
      setGeneratingKit(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.type === 'COURTESY') return '100% (cortesia)';
    if (coupon.type === 'PERCENT') return `${coupon.value}%`;
    return `R$ ${(coupon.value / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      {/* ===== CUPONS ===== */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            🎟️ Cupons de Desconto
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
          >
            + Novo Cupom
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="EX: CORRA10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="PERCENT">Percentual (%)</option>
                  <option value="FIXED">Fixo (R$)</option>
                  <option value="COURTESY">Cortesia (100%)</option>
                </select>
              </div>
            </div>

            {form.type !== 'COURTESY' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (em centavos)'} *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={form.type === 'PERCENT' ? 100 : eventPrice}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === 'PERCENT' ? '10' : '1000'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {form.type === 'FIXED' && form.value && (
                  <p className="text-xs text-gray-400 mt-0.5">= R$ {(parseInt(form.value) / 100).toFixed(2)}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Limite de usos</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="Ilimitado"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expira em</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Criando...' : 'Criar Cupom'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-4 text-sm text-gray-400">Carregando...</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400">
            Nenhum cupom criado. Crie cupons de desconto ou cortesia para este evento.
          </div>
        ) : (
          <div className="space-y-2">
            {coupons.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-primary">{c.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.type === 'COURTESY' ? 'bg-purple-100 text-purple-700' :
                      c.type === 'PERCENT' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {formatDiscount(c)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.usedCount} usado{c.usedCount !== 1 ? 's' : ''}
                    {c.maxUses ? ` / ${c.maxUses} limite` : ' (ilimitado)'}
                    {c.expiresAt ? ` · expira ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(c.code)}
                  className="text-xs text-gray-400 hover:text-primary transition-colors px-2 py-1 rounded hover:bg-primary/5"
                  title="Copiar código"
                >
                  📋
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== KIT DELIVERY SESSION ===== */}
      <div className="glass-card p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          📦 Entrega de Kits — Acesso para Voluntários
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Gere um link seguro de 8 horas para que voluntários possam entregar kits com indicadores verde/amarelo/vermelho, sem precisar de login.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={kitSessionLabel}
            onChange={(e) => setKitSessionLabel(e.target.value)}
            placeholder="Nome do voluntário (ex: Voluntário João)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleGenerateKitSession}
            disabled={generatingKit || !kitSessionLabel.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generatingKit ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>

        {kitLink && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs font-medium text-green-800 mb-1.5">✅ Link gerado! Válido por 8 horas:</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-green-700 font-mono break-all">{kitLink}</p>
              <button
                onClick={() => copyToClipboard(kitLink)}
                className="shrink-0 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
