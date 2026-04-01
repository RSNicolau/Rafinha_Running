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

  useEffect(() => { loadAthletes(); }, [isDemoMode]);

  const filtered = athletes.filter((a) =>
    a.user.name.toLowerCase().includes(search.toLowerCase()) ||
    a.user.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddAthlete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError('');
    setInviteLoading(true);
    try {
      await api.post('/users/athletes/add', { email: inviteEmail.trim() });
      setShowModal(false);
      setInviteEmail('');
      loadAthletes();
    } catch (err: any) {
      setInviteError(err.response?.data?.message || 'Erro ao adicionar atleta');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Atletas</h1>
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
                    <Link href={`/dashboard/athletes/${athlete.user.id}`} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {athlete.user.name?.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 hover:text-primary transition">
                        {athlete.user.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{athlete.user.email}</td>
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

      {/* Add Athlete Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Adicionar Atleta</h2>
            <p className="text-sm text-gray-500 mb-5">
              O atleta deve já ter uma conta registrada no app.
            </p>
            <form onSubmit={handleAddAthlete} className="space-y-4">
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
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-medium transition"
                >
                  {inviteLoading ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
