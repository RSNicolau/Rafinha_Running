'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  subscriptions: { status: string }[];
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-red-50 text-[#DC2626]',
  COACH: 'bg-blue-50 text-blue-700',
  ATHLETE: 'bg-gray-100 text-gray-600',
};

export default function SuperAdminPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string; hard: boolean } | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') { router.replace('/dashboard'); return; }
    load();
  }, [isAuthenticated, user, authLoading]);

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, analyticsRes] = await Promise.all([
        api.get('/admin/users?limit=100'),
        api.get('/admin/analytics'),
      ]);
      setUsers(usersRes.data?.data ?? []);
      setAnalytics(analyticsRes.data ?? {});
    } catch {}
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm) return;
    setDeleting(confirm.id);
    setConfirm(null);
    try {
      if (confirm.hard) {
        await api.delete(`/admin/users/${confirm.id}/hard`);
      } else {
        await api.delete(`/admin/users/${confirm.id}`);
      }
      setUsers((prev) => confirm.hard ? prev.filter((u) => u.id !== confirm.id) : prev.map((u) => u.id === confirm.id ? { ...u, isActive: false } : u));
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Erro ao deletar usuário.');
    }
    setDeleting(null);
  };

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-white">Master System Admin</h1>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          className="text-xs text-gray-500 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-gray-800"
        >
          Sair
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Analytics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Usuários', value: analytics.totalUsers ?? '—', color: 'text-white' },
            { label: 'Atletas', value: analytics.athletes ?? '—', color: 'text-gray-300' },
            { label: 'Coaches', value: analytics.coaches ?? '—', color: 'text-blue-400' },
            { label: 'Assinaturas Ativas', value: analytics.activeSubscriptions ?? '—', color: 'text-emerald-400' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-3">
            <h2 className="font-semibold text-white flex-1">Todos os Usuários</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500 w-48"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {filtered.map((u) => (
                <div key={u.id} className={`px-5 py-3.5 flex items-center gap-4 ${!u.isActive ? 'opacity-40' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-gray-300">{u.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.name}</p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-gray-800 text-gray-400'}`}>
                    {u.role}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.subscriptions?.length ? 'bg-emerald-900 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                    {u.subscriptions?.length ? 'Assinante' : 'Sem plano'}
                  </span>
                  <span className="text-xs text-gray-600">{formatDate(u.createdAt)}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {u.role === 'ATHLETE' && !u.subscriptions?.length && (
                      <button
                        onClick={async () => {
                          setActivating(u.id);
                          try {
                            await api.post(`/admin/users/${u.id}/activate-subscription`);
                            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, subscriptions: [{ status: 'ACTIVE' }] } : x));
                            alert(`✅ Assinatura ativada para ${u.name}`);
                          } catch (e: any) {
                            alert(e?.response?.data?.message ?? 'Erro ao ativar.');
                          }
                          setActivating(null);
                        }}
                        disabled={activating === u.id}
                        title="Ativar assinatura (teste)"
                        className="px-2.5 py-1 rounded-lg bg-emerald-900/50 hover:bg-emerald-800 text-emerald-400 text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {activating === u.id ? '...' : 'Ativar'}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirm({ id: u.id, name: u.name, hard: false })}
                      disabled={deleting === u.id || u.role === 'SUPER_ADMIN'}
                      title="Desativar"
                      className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-amber-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirm({ id: u.id, name: u.name, hard: true })}
                      disabled={deleting === u.id || u.role === 'SUPER_ADMIN'}
                      title="Deletar permanentemente"
                      className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-white mb-2">
              {confirm.hard ? 'Deletar permanentemente?' : 'Desativar usuário?'}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              <strong className="text-white">{confirm.name}</strong>
              {confirm.hard
                ? ' será removido permanentemente. Esta ação não pode ser desfeita.'
                : ' perderá acesso ao sistema. Pode ser reativado depois.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition ${confirm.hard ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {confirm.hard ? 'Deletar' : 'Desativar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
