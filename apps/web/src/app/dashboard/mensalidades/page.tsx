'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

// ─── Tipos (espelham GET /memberships/team e /memberships/team/summary) ──────

type Status = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED';

interface Summary {
  team: { id: string; name: string };
  activeCount: number;
  pastDueCount: number;
  pendingCount: number;
  pausedCount: number;
  canceledLast30: number;
  mrrInCents: number;
  receivedThisMonthInCents: number;
  overdueAmountInCents: number;
  upcoming7Days: Array<{ membershipId: string; athleteName: string; planName: string; amountInCents: number; dueDate: string }>;
  plansCount: number;
  hasPlans: boolean;
  athletesWithoutMembership: number;
}

interface Item {
  id: string;
  status: Status;
  athlete: { id: string; name: string; email: string | null };
  coach: { id: string; name: string } | null;
  plan: { id: string; name: string; interval: string };
  priceInCents: number;
  nextDueDate: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  hasAccess: boolean;
  lastPayment: { id: string; amountInCents: number; paidAt: string | null } | null;
  openInvoice: { paymentId: string; amountInCents: number; dueDate: string | null; invoiceUrl: string | null } | null;
  flags: string[];
}

interface ListResponse {
  items: Item[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' },
  PAST_DUE: { label: 'Inadimplente', cls: 'bg-red-100 text-red-700' },
  PENDING: { label: 'Aguardando 1º pagamento', cls: 'bg-amber-100 text-amber-700' },
  PAUSED: { label: 'Pausada', cls: 'bg-sky-100 text-sky-700' },
  CANCELED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
};

const INTERVAL: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };

const FLAG: Record<string, string> = {
  OVERDUE_IN_GRACE: 'Vencida (carência)',
  AMOUNT_MISMATCH: 'Valor divergente',
  REFERENCE_MISMATCH: 'Cobrança divergente',
  CHARGEBACK: 'Chargeback',
  NEEDS_REFUND: 'Estornar',
  REFUNDED: 'Estornada',
};

const input =
  'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none text-gray-900 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100';

const brl = (c: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((c ?? 0) / 100);
const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

function errMsg(e: any, fallback: string) {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m.join(' · ') : m) || fallback;
}

async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

// ─── Página ──────────────────────────────────────────────────────────────────

function MensalidadesScreen() {
  const search = useSearchParams();
  const { user } = useAuthStore();
  const teamRole = (user as any)?.team?.role as string | undefined;
  const canRegisterOffline = teamRole === 'OWNER' || teamRole === 'ADMIN' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [offline, setOffline] = useState<{ item: Item; paidAt: string; note: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [list, setList] = useState<ListResponse | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ status: search.get('status') ?? '', planId: '', search: '' });
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters.search.trim()), 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.status) p.set('status', filters.status);
    if (filters.planId) p.set('planId', filters.planId);
    if (debounced) p.set('search', debounced);
    return p.toString();
  }, [filters.status, filters.planId, debounced]);

  const loadSummary = useCallback(async () => {
    const { data } = await api.get<Summary>('/memberships/team/summary');
    setSummary(data);
  }, []);

  const loadList = useCallback(async () => {
    const qs = new URLSearchParams(query);
    qs.set('page', String(page));
    qs.set('limit', '20');
    const { data } = await api.get<ListResponse>(`/memberships/team?${qs.toString()}`);
    setList(data);
  }, [query, page]);

  // Treinador (COACH) da equipe não acessa mensalidades: não chama a API (evita 403 no console)
  const coachMemberOnly = teamRole === 'COACH' && user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN';

  const userReady = !!user;
  useEffect(() => {
    if (!userReady) return; // espera o papel na equipe antes de chamar a API
    if (coachMemberOnly) {
      setError('As mensalidades da equipe são gerenciadas pelo dono, gestores e equipe de apoio. Fale com o responsável pela equipe se precisar de alguma informação.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await loadSummary();
        // planos para o filtro: endpoint da equipe (outro módulo) — opcional
        const p = await api.get('/teams/me/plans').catch(() => null);
        const arr = Array.isArray(p?.data) ? p!.data : p?.data?.items;
        if (Array.isArray(arr)) setPlans(arr.map((x: any) => ({ id: x.id, name: x.name })));
      } catch (e: any) {
        const st = e?.response?.status;
        setError(
          st === 403
            ? 'Somente o dono, gestores e a equipe de apoio acessam as mensalidades.'
            : st === 404
              ? 'Você ainda não tem uma equipe configurada.'
              : errMsg(e, 'Não foi possível carregar as mensalidades.'),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSummary, coachMemberOnly, userReady]);

  useEffect(() => {
    if (!summary) return;
    loadList().catch((e) => setError(errMsg(e, 'Não foi possível carregar a lista.')));
  }, [summary, loadList]);

  useEffect(() => setPage(1), [query]);

  const act = async (item: Item, action: 'remind' | 'cancel' | 'pause' | 'resume') => {
    const name = item.athlete.name;
    if (action === 'cancel') {
      const reason = window.prompt(`Cancelar a mensalidade de ${name}? A cobrança recorrente é encerrada; o acesso vale até o fim do período pago.\n\nMotivo (opcional):`, '');
      if (reason === null) return;
      setBusy(item.id);
      try {
        await api.post(`/memberships/team/${item.id}/cancel`, reason ? { reason } : {});
        setNotice(`Mensalidade de ${name} cancelada.`);
        await Promise.all([loadSummary(), loadList()]);
      } catch (e) {
        alert(errMsg(e, 'Não foi possível cancelar.'));
      } finally {
        setBusy(null);
      }
      return;
    }
    if (action === 'pause' && !window.confirm(`Pausar a mensalidade de ${name}? A cobrança recorrente é suspensa até você retomar.`)) return;
    if (action === 'resume' && !window.confirm(`Retomar a mensalidade de ${name}? Uma nova cobrança recorrente é criada (vence no fim do período já pago, ou hoje).`)) return;
    setBusy(item.id);
    try {
      await api.post(`/memberships/team/${item.id}/${action}`, {});
      setNotice(
        action === 'remind'
          ? `Lembrete enviado para ${name}.`
          : action === 'pause'
            ? `Mensalidade de ${name} pausada.`
            : `Mensalidade de ${name} retomada.`,
      );
      await Promise.all([loadSummary(), loadList()]);
    } catch (e: any) {
      alert(e?.response?.status === 429 ? 'Já enviamos um lembrete para este atleta nas últimas 24 horas.' : errMsg(e, 'Não foi possível concluir a ação.'));
    } finally {
      setBusy(null);
    }
  };

  const submitOffline = async () => {
    if (!offline) return;
    const { item, paidAt, note } = offline;
    setBusy(item.id);
    try {
      await api.post(`/memberships/team/${item.id}/mark-paid-offline`, {
        amountInCents: item.priceInCents,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(paidAt ? { paidAt: new Date(`${paidAt}T12:00:00-03:00`).toISOString() } : {}),
      });
      setOffline(null);
      setNotice(`Pagamento de ${item.athlete.name} registrado.`);
      await Promise.all([loadSummary(), loadList()]);
    } catch (e: any) {
      alert(e?.response?.status === 403 ? 'Somente o dono ou um gestor da equipe pode registrar pagamentos por fora.' : errMsg(e, 'Não foi possível registrar o pagamento.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 rounded-lg bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-3xl mb-2">💳</p>
        <p className="font-semibold text-gray-900">{error}</p>
        {!coachMemberOnly && teamRole !== 'STAFF' && (
          <Link href="/dashboard/equipe" className="inline-block mt-4 text-sm font-semibold text-red-700 underline">Ir para Equipe</Link>
        )}
        {coachMemberOnly && (
          <Link href="/dashboard" className="inline-block mt-4 text-sm font-semibold text-red-700 underline">Voltar ao painel</Link>
        )}
      </div>
    );
  }

  const s = summary!;
  const kpis = [
    { label: 'Ativos', value: String(s.activeCount), tone: 'text-emerald-700', onClick: () => setFilters({ ...filters, status: 'ACTIVE' }) },
    { label: 'Inadimplentes', value: String(s.pastDueCount), tone: 'text-red-700', onClick: () => setFilters({ ...filters, status: 'PAST_DUE' }) },
    { label: 'Pendentes', value: String(s.pendingCount), tone: 'text-amber-700', onClick: () => setFilters({ ...filters, status: 'PENDING' }) },
    { label: 'MRR', value: brl(s.mrrInCents), tone: 'text-gray-900', hint: 'Receita mensal recorrente (planos longos ÷ meses)' },
    { label: 'Recebido no mês', value: brl(s.receivedThisMonthInCents), tone: 'text-gray-900' },
    { label: 'Valor em atraso', value: brl(s.overdueAmountInCents), tone: s.overdueAmountInCents > 0 ? 'text-red-700' : 'text-gray-900' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mensalidades</h1>
          <p className="text-sm text-gray-500">{s.team.name} · cobrança recorrente dos atletas</p>
        </div>
        <button
          onClick={() => downloadCsv(`/memberships/team/export.csv${query ? `?${query}` : ''}`, `mensalidades-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => alert(errMsg(e, 'Falha ao exportar')))}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold bg-white"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {!s.hasPlans && (
        <div className="glass-card p-6 border border-amber-200 bg-amber-50/60">
          <p className="font-bold text-amber-900">Sua equipe ainda não tem planos de mensalidade</p>
          <p className="text-sm text-amber-800 mt-1">Crie os planos (mensal, trimestral, semestral…) para que os atletas possam assinar pelo app.</p>
          <Link href="/dashboard/equipe?tab=planos" className="inline-block mt-3 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold">
            Criar planos de mensalidade →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={k.onClick}
            disabled={!k.onClick}
            title={k.hint}
            className={`glass-card p-4 text-left ${k.onClick ? 'hover:ring-2 hover:ring-red-100 cursor-pointer' : 'cursor-default'}`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{k.label}</p>
            <p className={`text-xl font-black mt-1 ${k.tone}`}>{k.value}</p>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="glass-card p-4 md:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Vencimentos nos próximos 7 dias</p>
          {s.upcoming7Days.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum vencimento na semana.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {s.upcoming7Days.slice(0, 8).map((u) => (
                <li key={u.membershipId} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-800 truncate">{u.athleteName} <span className="text-gray-400">· {u.planName}</span></span>
                  <span className="text-gray-600 shrink-0 ml-3">{date(u.dueDate)} · <strong className="text-gray-900">{brl(u.amountInCents)}</strong></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass-card p-4 text-sm text-gray-600 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Visão geral</p>
          <p>Pausadas: <strong className="text-gray-900">{s.pausedCount}</strong></p>
          <p>Canceladas (30 dias): <strong className="text-gray-900">{s.canceledLast30}</strong></p>
          <p>Atletas sem mensalidade: <strong className="text-gray-900">{s.athletesWithoutMembership}</strong></p>
          <p>Planos ativos: <strong className="text-gray-900">{s.plansCount}</strong> · <Link href="/dashboard/equipe?tab=planos" className="underline">gerenciar</Link></p>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-800 flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Fechar aviso" className="text-emerald-700 font-bold">×</button>
        </div>
      )}

      <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        <input aria-label="Buscar atleta (nome ou e-mail)" className={`${input} md:col-span-2`} placeholder="Buscar atleta (nome ou e-mail)" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select aria-label="Filtrar por situação" className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS) as Status[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
        </select>
        <select aria-label="Filtrar por plano" className={input} value={filters.planId} onChange={(e) => setFilters({ ...filters, planId: e.target.value })}>
          <option value="">Todos os planos</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {offline && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOffline(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900">Registrar pagamento recebido por fora</h2>
            <p className="text-sm text-gray-500">
              {offline.item.athlete.name} · {offline.item.plan.name}. Use para dinheiro ou Pix direto na conta da equipe.
              A fatura em aberto deste ciclo é cancelada para não ser cobrada em dobro.
            </p>
            <label className="block text-xs font-semibold text-gray-600">
              Valor recebido
              <input className={`${input} mt-1 bg-gray-50`} value={brl(offline.item.priceInCents)} readOnly />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Data do recebimento
              <input type="date" className={`${input} mt-1`} value={offline.paidAt} max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}
                onChange={(e) => setOffline({ ...offline, paidAt: e.target.value })} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Observação (opcional)
              <textarea className={`${input} mt-1 h-20`} maxLength={500} placeholder="Ex.: Pix direto, recebido no treino de terça"
                value={offline.note} onChange={(e) => setOffline({ ...offline, note: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOffline(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700">Voltar</button>
              <button onClick={submitOffline} disabled={busy === offline.item.id} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                {busy === offline.item.id ? 'Registrando…' : 'Confirmar recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!list ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : list.items.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-gray-400">
          {query ? 'Nenhuma mensalidade com estes filtros.' : 'Nenhum atleta assinou ainda. Compartilhe o app com a equipe — a assinatura fica em “Minha mensalidade”.'}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3">Atleta</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Próx. vencimento</th>
                <th className="px-4 py-3">Último pagamento</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.items.map((i) => {
                const st = STATUS[i.status] ?? { label: i.status, cls: 'bg-gray-100 text-gray-600' };
                const canRemind = !!i.openInvoice && ['PENDING', 'ACTIVE', 'PAST_DUE'].includes(i.status);
                return (
                  <tr key={i.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{i.athlete.name}</p>
                      <p className="text-xs text-gray-400">{i.athlete.email}{i.coach ? ` · ${i.coach.name}` : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{i.plan.name}</p>
                      <p className="text-xs text-gray-400">{INTERVAL[i.plan.interval] ?? i.plan.interval} · {brl(i.priceInCents)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      {i.status === 'CANCELED' && i.hasAccess && i.currentPeriodEnd && (
                        <p className="text-[11px] text-gray-400 mt-1">acesso até {date(i.currentPeriodEnd)}</p>
                      )}
                      {i.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {i.flags.map((f) => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">{FLAG[f] ?? f}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {date(i.nextDueDate)}
                      {i.openInvoice && (
                        <p className="text-xs text-gray-400">
                          em aberto {brl(i.openInvoice.amountInCents)}
                          {i.openInvoice.invoiceUrl && (
                            <> · <a href={i.openInvoice.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">fatura</a></>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {i.lastPayment ? (
                        <>
                          {date(i.lastPayment.paidAt)}
                          <p className="text-xs text-gray-400">{brl(i.lastPayment.amountInCents)}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canRemind && (
                          <button disabled={busy === i.id} onClick={() => act(i, 'remind')} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 font-semibold disabled:opacity-50">Lembrar</button>
                        )}
                        {canRegisterOffline && ['PENDING', 'ACTIVE', 'PAST_DUE'].includes(i.status) && (
                          <button
                            disabled={busy === i.id}
                            onClick={() => setOffline({ item: i, paidAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), note: '' })}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 font-semibold disabled:opacity-50"
                          >
                            Registrar pagamento recebido por fora
                          </button>
                        )}
                        {i.status === 'PAUSED' ? (
                          <button disabled={busy === i.id} onClick={() => act(i, 'resume')} className="text-xs px-2.5 py-1.5 rounded-lg border border-sky-200 text-sky-700 font-semibold disabled:opacity-50">Retomar</button>
                        ) : i.status !== 'CANCELED' ? (
                          <button disabled={busy === i.id} onClick={() => act(i, 'pause')} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 font-semibold disabled:opacity-50">Pausar</button>
                        ) : null}
                        {i.status !== 'CANCELED' && (
                          <button disabled={busy === i.id} onClick={() => act(i, 'cancel')} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 font-semibold disabled:opacity-50">Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
              <span>{list.total} mensalidade(s) · página {list.page} de {list.totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Anterior</button>
                <button disabled={page >= list.totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Próxima</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MensalidadesPage() {
  return (
    <Suspense fallback={null}>
      <MensalidadesScreen />
    </Suspense>
  );
}
