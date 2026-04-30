'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const RED = '#CC1F1A';
const DARK = '#18181B';
const GRAY = '#71717A';
const LIGHT = '#E4E4E7';
const PAGE = '#F4F4F5';
const GREEN = '#16A34A';

type Coach = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
  coachProfile?: {
    slug?: string;
    maxAthletes: number;
    platformFeePercent?: number;
    paymentEnabled: boolean;
  };
  _count?: { coachAthletes: number };
};

type PlatformStats = {
  totalCoaches: number;
  activeCoaches: number;
  totalAthletes: number;
  totalRevenue: number;
};

export default function PlatformAdminPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFee, setEditingFee] = useState<{ id: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [coachRes, statsRes] = await Promise.allSettled([
        api.get('/v1/admin/coaches'),
        api.get('/v1/admin/platform-stats'),
      ]);
      if (coachRes.status === 'fulfilled') setCoaches(coachRes.value.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function saveFee(coachId: string, feePercent: number) {
    setSaving(true);
    try {
      await api.patch(`/v1/admin/coaches/${coachId}/platform-fee`, { platformFeePercent: feePercent });
      setEditingFee(null);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoachStatus(coachId: string, active: boolean) {
    try {
      await api.patch(`/v1/admin/coaches/${coachId}/status`, { isActive: active });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Erro');
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: GRAY }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚙️</div>
          <div>Carregando plataforma...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: PAGE, minHeight: '100vh', padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: DARK, margin: 0 }}>Gestão da Plataforma</h1>
        <p style={{ color: GRAY, margin: '4px 0 0', fontSize: 14 }}>
          Coaches, split de pagamentos e métricas gerais
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Coaches', value: stats.totalCoaches, icon: '🏋️' },
            { label: 'Coaches Ativos', value: stats.activeCoaches, icon: '✅' },
            { label: 'Total Atletas', value: stats.totalAthletes, icon: '🏃' },
            { label: 'Receita Plataforma', value: `R$ ${(stats.totalRevenue / 100).toFixed(2)}`, icon: '💰' },
          ].map(card => (
            <div key={card.label} style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${LIGHT}`,
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: DARK }}>{card.value}</div>
              <div style={{ fontSize: 12, color: GRAY }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Split payments explainer */}
      <div style={{
        background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12,
        padding: '16px 20px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <strong style={{ color: '#92400E' }}>Split de Pagamentos</strong>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
          Configure a % que a plataforma retém de cada pagamento recebido pelo coach.
          Quando um atleta paga uma mensalidade de R$100 e o split é 15%, a plataforma recebe R$15 e o coach recebe R$85.
          Requer integração com Stripe Connect ou Pagarme Marketplace para processamento automático.
        </p>
      </div>

      {/* Coaches table */}
      <div style={{
        background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        border: `1px solid ${LIGHT}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${LIGHT}` }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: DARK }}>
            Coaches ({coaches.length})
          </h2>
        </div>

        {coaches.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: GRAY }}>
            Nenhum coach cadastrado ainda.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: PAGE }}>
                {['Coach', 'Email', 'Atletas', 'Status', 'Split Plataforma', 'Ações'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left', fontSize: 12,
                    fontWeight: 600, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coaches.map((coach, i) => (
                <tr key={coach.id} style={{ borderTop: i > 0 ? `1px solid ${LIGHT}` : 'none' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {coach.avatarUrl ? (
                        <img src={coach.avatarUrl} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', background: RED,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 700, fontSize: 14,
                        }}>
                          {coach.name[0]}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>{coach.name}</div>
                        {coach.coachProfile?.slug && (
                          <div style={{ fontSize: 12, color: GRAY }}>/{coach.coachProfile.slug}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: GRAY }}>{coach.email}</td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: DARK }}>
                    {coach._count?.coachAthletes ?? 0}/{coach.coachProfile?.maxAthletes ?? 30}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12,
                      background: coach.isActive ? '#DCFCE7' : '#FEE2E2',
                      color: coach.isActive ? GREEN : RED,
                      fontWeight: 600,
                    }}>
                      {coach.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {editingFee?.id === coach.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number" min="0" max="50" step="0.5"
                          value={editingFee.value}
                          onChange={e => setEditingFee({ id: coach.id, value: e.target.value })}
                          style={{
                            width: 70, padding: '4px 8px', borderRadius: 6,
                            border: `1px solid ${LIGHT}`, fontSize: 13,
                          }}
                        />
                        <span style={{ fontSize: 13, color: GRAY }}>%</span>
                        <button
                          onClick={() => saveFee(coach.id, parseFloat(editingFee.value) || 0)}
                          disabled={saving}
                          style={{
                            padding: '4px 12px', background: RED, color: '#fff',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {saving ? '...' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => setEditingFee(null)}
                          style={{
                            padding: '4px 8px', background: 'none', color: GRAY,
                            border: `1px solid ${LIGHT}`, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: DARK }}>
                          {coach.coachProfile?.platformFeePercent ?? 0}%
                        </span>
                        <button
                          onClick={() => setEditingFee({ id: coach.id, value: String(coach.coachProfile?.platformFeePercent ?? 0) })}
                          style={{
                            padding: '2px 8px', background: 'none', color: GRAY,
                            border: `1px solid ${LIGHT}`, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button
                      onClick={() => toggleCoachStatus(coach.id, !coach.isActive)}
                      style={{
                        padding: '4px 12px', fontSize: 12, fontWeight: 600,
                        background: coach.isActive ? '#FEE2E2' : '#DCFCE7',
                        color: coach.isActive ? RED : GREEN,
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      {coach.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
