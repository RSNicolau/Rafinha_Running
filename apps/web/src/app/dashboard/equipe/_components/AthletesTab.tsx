'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { apiError, inputCls, labelCls, MEMBERSHIP_LABEL, type TeamMember } from './shared';

interface TeamAthlete {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  level: string;
  coach: { id: string; name: string } | null;
  membership: { status: string; nextDueDate: string | null; plan: { name: string } | null } | null;
}

interface Props {
  members: TeamMember[];
  canAssign: boolean;
}

const LEVEL_LABEL: Record<string, string> = { BEGINNER: 'Iniciante', INTERMEDIATE: 'Intermediário', ADVANCED: 'Avançado', ELITE: 'Elite' };

export function AthletesTab({ members, canAssign }: Props) {
  const coaches = members.filter((m) => m.isActive && m.role !== 'STAFF');
  const [coachId, setCoachId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: TeamAthlete[]; total: number; totalPages: number }>({ data: [], total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/teams/me/athletes', {
        params: { coachId: coachId || undefined, membershipStatus: status || undefined, search: search.trim() || undefined, page, limit: 25 },
      });
      setData(res);
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível carregar os atletas'));
    } finally {
      setLoading(false);
    }
  }, [coachId, status, search, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const assign = async (a: TeamAthlete, nextCoachId: string) => {
    if (!nextCoachId || nextCoachId === a.coach?.id) return;
    setBusy(a.id);
    try {
      await api.patch(`/teams/me/athletes/${a.id}/coach`, { coachId: nextCoachId });
      const coach = coaches.find((c) => c.userId === nextCoachId);
      toast.success(`${a.name} agora está com ${coach?.name ?? 'o novo treinador'}`);
      load();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível atribuir o treinador'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="f-search">Buscar</label>
          <input id="f-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Nome ou e-mail" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-coach">Treinador</label>
          <select id="f-coach" value={coachId} onChange={(e) => { setCoachId(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">Todos</option>
            {coaches.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="f-status">Mensalidade</label>
          <select id="f-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">Todas</option>
            <option value="ACTIVE">Em dia</option>
            <option value="PENDING">Aguardando pagamento</option>
            <option value="PAST_DUE">Em atraso</option>
            <option value="PAUSED">Pausada</option>
            <option value="CANCELED">Cancelada</option>
            <option value="NONE">Sem mensalidade</option>
          </select>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{loading ? 'Carregando...' : `${data.total} atleta(s)`}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Atleta</th>
                <th className="px-4 py-3 font-medium">Nível</th>
                <th className="px-4 py-3 font-medium">Mensalidade</th>
                <th className="px-4 py-3 font-medium">Treinador responsável</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((a) => {
                const ms = a.membership ? MEMBERSHIP_LABEL[a.membership.status] : null;
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{a.name}</p>
                      {a.email && <p className="text-xs text-gray-500">{a.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{LEVEL_LABEL[a.level] ?? a.level}</td>
                    <td className="px-4 py-3">
                      {ms ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${ms.cls}`}>
                          {ms.label}{a.membership?.plan?.name ? ` · ${a.membership.plan.name}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sem mensalidade</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canAssign ? (
                        <select
                          value={a.coach?.id ?? ''}
                          disabled={busy === a.id}
                          onChange={(e) => assign(a, e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white max-w-[200px]"
                          aria-label={`Treinador de ${a.name}`}
                        >
                          {!a.coach && <option value="">— sem treinador —</option>}
                          {a.coach && !coaches.some((c) => c.userId === a.coach!.id) && <option value={a.coach.id}>{a.coach.name}</option>}
                          {coaches.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700">{a.coach?.name ?? '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && data.data.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Nenhum atleta encontrado com estes filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">← Anterior</button>
            <span>Página {page} de {data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">Próxima →</button>
          </div>
        )}
      </div>
    </div>
  );
}
