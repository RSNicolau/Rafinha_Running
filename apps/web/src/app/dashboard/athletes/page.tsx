'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDemo, MOCK_ATHLETES } from '@/contexts/demo-mode';

interface Athlete {
  id: string;
  level: string;
  weeklyGoalKm: number;
  user: { id: string; name: string; email: string };
}

interface Invite {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  athlete: { id: string; name: string } | null;
}

export default function AthletesPage() {
  const { isDemoMode } = useDemo();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [sentInviteLink, setSentInviteLink] = useState('');
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState('');
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState(0);

  const loadAthletes = () => {
    if (isDemoMode) {
      setAthletes(MOCK_ATHLETES.map((a) => ({
        id: a.id,
        level: a.athleteProfile.currentPlan === 'ATIVO' ? 'INTERMEDIÁRIO' : 'INICIANTE',
        weeklyGoalKm: a.athleteProfile.weeklyDistance,
        user: { id: a.id, name: a.name, email: a.email },
      })));
      setLoading(false);
      return;
    }
    setLoadError(false);
    api.get('/users/athletes')
      .then(({ data }) => setAthletes(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const loadInvites = () => {
    if (isDemoMode) return;
    api.get('/invites')
      .then(({ data }) => setPendingInvites(data.filter((i: Invite) => i.status === 'PENDING')))
      .catch(() => {});
  };

  useEffect(() => {
    loadAthletes();
    loadInvites();
    if (!isDemoMode) {
      api.get('/onboarding/pending').then(res => {
        setPendingOnboardingCount(Array.isArray(res.data) ? res.data.length : 0);
      }).catch(() => {});
    }
  }, [isDemoMode]);

  const filtered = athletes.filter((a) =>
    (a?.user?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a?.user?.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      setInviteError('Email inválido. Verifique o formato e tente novamente.');
      return;
    }
    setInviteError('');
    setInviteLoading(true);
    try {
      const { data } = await api.post('/invites', { email: inviteEmail.trim() });
      const link = `${window.location.origin}/join?token=${data.token}`;
      setSentInviteLink(link);
      loadInvites();
    } catch (err: any) {
      setInviteError(err.response?.data?.message || 'Erro ao enviar convite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCancelInvite = async (id: string) => {
    setCancellingInviteId(id);
    setCancelError('');
    setCancelSuccess('');
    try {
      await api.delete(`/invites/${id}`);
      setCancelSuccess('Convite cancelado com sucesso.');
      setTimeout(() => setCancelSuccess(''), 3000);
      loadInvites();
    } catch (err: any) {
      setCancelError(err.response?.data?.message || 'Erro ao cancelar convite. Tente novamente.');
      setTimeout(() => setCancelError(''), 4000);
    } finally {
      setCancellingInviteId(null);
    }
  };

  const copyLink = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Atletas</h1>
            {pendingOnboardingCount > 0 && (
              <Link
                href="/dashboard/onboarding"
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {pendingOnboardingCount} novo{pendingOnboardingCount !== 1 ? 's' : ''}
              </Link>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">{athletes.length} atletas cadastrados</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setInviteError(''); setInviteEmail(''); }}
          className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-xl transition cursor-pointer"
        >
          + Novo Atleta
        </button>
      </div>

      {/* API Error banner */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 mb-6">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="text-sm text-amber-800 flex-1">Erro ao carregar atletas. Verifique sua conexão.</span>
          <button onClick={loadAthletes} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar atleta..."
          className="w-full max-w-sm px-4 py-2.5 rounded-xl bg-white border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
        />
      </div>

      {/* Table */}
      <div className="glass-card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Atleta</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">E-mail</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nível</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Meta Semanal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={4} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-sm text-gray-400">
                  Nenhum atleta encontrado
                </td>
              </tr>
            ) : (
              filtered.map((athlete) => (
                <tr key={athlete.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-5 py-4">
                    <Link href={`/dashboard/athletes/${athlete?.user?.id ?? athlete.id}`} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {athlete?.user?.name?.charAt(0) ?? '?'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 hover:text-primary transition">
                        {athlete?.user?.name ?? 'Atleta'}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{athlete?.user?.email ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/8 text-primary">
                      {athlete.level}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {athlete.weeklyGoalKm ? `${athlete.weeklyGoalKm} km` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {!isDemoMode && pendingInvites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Convites pendentes</h2>

          {/* Cancel feedback banners */}
          {cancelSuccess && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-100 mb-3">
              <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-green-800">{cancelSuccess}</span>
            </div>
          )}
          {cancelError && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 mb-3">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <span className="text-sm text-red-800">{cancelError}</span>
            </div>
          )}

          <div className="glass-card divide-y divide-gray-50">
            {pendingInvites.map((inv) => {
              const isCancelling = cancellingInviteId === inv.id;
              return (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400">
                      Expira em {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copyLink(`${window.location.origin}/join?token=${inv.id}`, inv.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary/8 text-primary font-medium hover:bg-primary/15 transition"
                    >
                      {copied === inv.id ? 'Copiado!' : 'Copiar link'}
                    </button>
                    <button
                      onClick={() => handleCancelInvite(inv.id)}
                      disabled={isCancelling}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                    >
                      {isCancelling && (
                        <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      )}
                      {isCancelling ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Convidar Atleta</h2>
            <p className="text-sm text-gray-500 mb-5">
              Um link de convite será gerado para o atleta criar a conta.
            </p>

            {sentInviteLink ? (
              <div className="space-y-4">
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-green-800 mb-2">Convite criado! Envie este link ao atleta:</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={sentInviteLink}
                      className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-gray-700 min-w-0"
                    />
                    <button
                      onClick={() => copyLink(sentInviteLink, 'modal')}
                      className="shrink-0 px-3 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition"
                    >
                      {copied === 'modal' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setShowModal(false); setSentInviteLink(''); setInviteEmail(''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail do atleta</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="atleta@email.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
                {inviteError && (
                  <p className="text-sm text-red-600">{inviteError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setInviteEmail(''); setInviteError(''); }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium transition"
                  >
                    {inviteLoading ? 'Gerando...' : 'Gerar convite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
