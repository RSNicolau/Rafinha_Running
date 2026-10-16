'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PAY_STATUS, REG_STATUS, downloadCsv, errMsg, fmtBRL, inputCls } from './shared';

type Reg = {
  id: string;
  status: string;
  paymentStatus: string;
  bibNumber?: string | null;
  shirtSize?: string | null;
  kitType?: string | null;
  finalPrice?: number | null;
  registeredAt: string;
  paymentExpiresAt?: string | null;
  kitDeliveredAt?: string | null;
  checkinAt?: string | null;
  emergencyContact?: string | null;
  medicalInfo?: string | null;
  distance?: { id: string; name: string } | null;
  coupon?: { code: string } | null;
  user: { id: string; name: string; email: string; phone?: string | null; avatarUrl?: string | null };
};

export default function RegistrationsPanel({
  eventId,
  eventTitle,
  distances,
  onChanged,
}: {
  eventId: string;
  eventTitle: string;
  distances: Array<{ id: string; name: string }>;
  onChanged: () => void;
}) {
  const [filters, setFilters] = useState({ status: '', paymentStatus: '', distanceId: '', kitDelivered: '', search: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: Reg[]; total: number; totalPages: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    const { data } = await api.get(`/events/${eventId}/registrations?${query}${query ? '&' : ''}page=${page}&limit=50`);
    setData(data);
  }, [eventId, query, page]);

  useEffect(() => {
    const t = setTimeout(() => load().catch(() => setData({ data: [], total: 0, totalPages: 0 })), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(1), [query]);

  const act = async (r: Reg, kind: 'MARK_PAID' | 'CANCEL' | 'REFUND' | 'CHECKED_IN' | 'ABSENT' | 'CONFIRMED') => {
    const confirmText: Record<string, string> = {
      MARK_PAID: `Confirmar a inscrição de ${r.user.name} (pagamento recebido por fora ou cortesia)? O número de peito será gerado.`,
      CANCEL: `Cancelar a inscrição de ${r.user.name}? A vaga é liberada${r.paymentStatus === 'SUCCEEDED' ? ' (o valor pago NÃO é estornado automaticamente)' : ''}.`,
      REFUND: `Marcar a inscrição de ${r.user.name} como estornada? Faça o estorno no painel do gateway (Asaas/Stripe). A vaga é liberada.`,
    };
    if (confirmText[kind] && !window.confirm(confirmText[kind])) return;
    setBusy(r.id);
    try {
      if (kind === 'MARK_PAID' || kind === 'CANCEL' || kind === 'REFUND') {
        await api.post(`/events/${eventId}/registrations/${r.id}/payment`, { action: kind });
      } else {
        await api.put(`/events/${eventId}/registrations/${r.id}`, { status: kind });
      }
      await load();
      onChanged();
    } catch (e) {
      alert(errMsg(e, 'Não foi possível atualizar a inscrição'));
    } finally {
      setBusy(null);
    }
  };

  const safeTitle = eventTitle.replace(/[^\w-]+/g, '-').slice(0, 40);

  return (
    <div className="space-y-3">
      <div className="glass-card p-3 grid grid-cols-2 md:grid-cols-6 gap-2">
        <input className={`${inputCls} col-span-2`} placeholder="Nome, e-mail ou peito" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Status: todos</option>
          {Object.entries(REG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inputCls} value={filters.paymentStatus} onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}>
          <option value="">Pagamento: todos</option>
          {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inputCls} value={filters.distanceId} onChange={(e) => setFilters({ ...filters, distanceId: e.target.value })}>
          <option value="">Percurso: todos</option>
          {distances.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className={inputCls} value={filters.kitDelivered} onChange={(e) => setFilters({ ...filters, kitDelivered: e.target.value })}>
          <option value="">Kit: todos</option>
          <option value="true">Kit entregue</option>
          <option value="false">Kit pendente</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{data ? `${data.total} inscrição(ões)` : 'Carregando…'}</p>
        <button
          onClick={() => downloadCsv(`/events/${eventId}/registrations/export.csv${query ? `?${query}` : ''}`, `inscritos-${safeTitle}.csv`).catch((e) => alert(errMsg(e, 'Falha ao exportar')))}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {!data ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : data.data.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-gray-400">Nenhuma inscrição com esses filtros.</div>
      ) : (
        <div className="space-y-1.5">
          {data.data.map((r) => {
            const st = REG_STATUS[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-500' };
            const pay = PAY_STATUS[r.paymentStatus] ?? { label: r.paymentStatus, cls: 'text-gray-500' };
            return (
              <div key={r.id} className="glass-card p-3">
                <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="w-12 text-center font-mono text-xs font-bold text-gray-700 bg-gray-100 rounded py-1">{r.bibNumber ?? '—'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{r.user.email}{r.distance ? ` · ${r.distance.name}` : ''}{r.shirtSize ? ` · ${r.shirtSize}` : ''}{r.kitType ? ` · ${r.kitType === 'PREMIUM' ? 'Premium' : 'Completo'}` : ''}</p>
                  </div>
                  {r.kitDeliveredAt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">kit ✓</span>}
                  <span className={`text-xs font-semibold ${pay.cls}`}>{pay.label}{(r.finalPrice ?? 0) > 0 ? ` · ${fmtBRL(r.finalPrice)}` : ''}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                </button>
                {open === r.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      {r.user.phone && <p><strong>Telefone:</strong> {r.user.phone}</p>}
                      <p><strong>Inscrito em:</strong> {new Date(r.registeredAt).toLocaleString('pt-BR')}</p>
                      {r.status === 'PENDING' && r.paymentExpiresAt && <p><strong>Pagamento expira:</strong> {new Date(r.paymentExpiresAt).toLocaleString('pt-BR')}</p>}
                      {r.coupon && <p><strong>Cupom:</strong> {r.coupon.code}</p>}
                      {r.emergencyContact && <p><strong>Emergência:</strong> {r.emergencyContact}</p>}
                      {r.medicalInfo && <p><strong>Saúde:</strong> {r.medicalInfo}</p>}
                      {r.kitDeliveredAt && <p><strong>Kit entregue:</strong> {new Date(r.kitDeliveredAt).toLocaleString('pt-BR')}</p>}
                      {r.checkinAt && <p><strong>Check-in:</strong> {new Date(r.checkinAt).toLocaleString('pt-BR')}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 content-start">
                      {(r.status === 'PENDING' || r.status === 'WAITLIST') && (
                        <Btn disabled={busy === r.id} onClick={() => act(r, 'MARK_PAID')}>Confirmar (pago por fora/cortesia)</Btn>
                      )}
                      {r.status === 'CONFIRMED' && <Btn disabled={busy === r.id} onClick={() => act(r, 'CHECKED_IN')}>Check-in</Btn>}
                      {r.status === 'CONFIRMED' && <Btn disabled={busy === r.id} onClick={() => act(r, 'ABSENT')}>Ausente</Btn>}
                      {(r.status === 'CHECKED_IN' || r.status === 'ABSENT') && <Btn disabled={busy === r.id} onClick={() => act(r, 'CONFIRMED')}>Desfazer presença</Btn>}
                      {r.status !== 'CANCELED' && r.status !== 'CHECKED_IN' && <Btn danger disabled={busy === r.id} onClick={() => act(r, 'CANCEL')}>Cancelar inscrição</Btn>}
                      {r.paymentStatus === 'SUCCEEDED' && (r.finalPrice ?? 0) > 0 && <Btn danger disabled={busy === r.id} onClick={() => act(r, 'REFUND')}>Marcar estorno</Btn>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">←</button>
          <span className="text-gray-500">{page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold disabled:opacity-50 ${danger ? 'border-red-200 text-red-600' : 'border-gray-200 text-gray-700'}`}>
      {children}
    </button>
  );
}
