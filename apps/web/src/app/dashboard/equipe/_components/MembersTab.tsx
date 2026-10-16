'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { apiError, btnGhost, btnPrimary, inputCls, labelCls, ROLE_LABEL, type TeamMember, type TeamRole } from './shared';

interface Props {
  members: TeamMember[];
  myRole: TeamRole;
  myUserId?: string;
  isPlatformAdmin: boolean;
  onChanged: () => void;
}

export function MembersTab({ members, myRole, myUserId, isPlatformAdmin, onChanged }: Props) {
  const isOwner = myRole === 'OWNER' || isPlatformAdmin;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'COACH' | 'STAFF' | 'ADMIN'>('COACH');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const canInvite = myRole === 'OWNER' || myRole === 'ADMIN' || isPlatformAdmin;
  const [invites, setInvites] = useState<Array<{ email: string; role: string | null; sentAt: string; expiresAt: string | null; link?: string | null; inviteUrl?: string | null }>>([]);
  // Links de convite devolvidos pela API (só quando ela expõe o link/token — ex.: ambiente de teste)
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});

  const rememberLink = (inviteEmail: string, data: any) => {
    const direct = data?.link ?? data?.inviteUrl ?? data?.inviteLink ?? null;
    const link = typeof direct === 'string' && direct
      ? direct
      : typeof data?.token === 'string' && data.token
        ? `${window.location.origin}/register?teamInvite=${encodeURIComponent(data.token)}`
        : null;
    if (link) setInviteLinks((prev) => ({ ...prev, [inviteEmail.trim().toLowerCase()]: link }));
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link do convite copiado');
    } catch {
      window.prompt('Copie o link do convite:', link);
    }
  };

  // B8: convites enviados recentemente (registrados no histórico) que ainda não viraram membros
  const loadInvites = useCallback(() => {
    if (!canInvite) return;
    api.get('/teams/me/invites').then((r) => setInvites(Array.isArray(r.data) ? r.data : [])).catch(() => setInvites([]));
  }, [canInvite]);
  useEffect(() => { loadInvites(); }, [loadInvites, members]);

  const resend = async (inv: { email: string; role: string | null }) => {
    try {
      const { data } = await api.post('/teams/me/members/invite', { email: inv.email, role: inv.role ?? 'COACH' });
      rememberLink(inv.email, data);
      toast.success(`Convite reenviado para ${inv.email}`);
      loadInvites();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível reenviar o convite'));
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Informe um e-mail válido');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/teams/me/members/invite', { email: email.trim(), role });
      rememberLink(email, data);
      toast.success('Convite enviado por e-mail (válido por 7 dias).');
      setEmail('');
      loadInvites();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível enviar o convite'));
    } finally {
      setSending(false);
    }
  };

  const changeRole = async (m: TeamMember, next: TeamRole) => {
    if (next === m.role) return;
    setBusy(m.userId);
    try {
      await api.patch(`/teams/me/members/${m.userId}`, { role: next });
      toast.success(`${m.name} agora é ${ROLE_LABEL[next].toLowerCase()}`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível alterar o papel'));
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (m: TeamMember) => {
    if (m.isActive && !confirm(`Desativar ${m.name}? Os atletas dele(a) voltam para o dono da equipe.`)) return;
    setBusy(m.userId);
    try {
      await api.patch(`/teams/me/members/${m.userId}`, { isActive: !m.isActive });
      toast.success(m.isActive ? 'Membro desativado' : 'Membro reativado');
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível atualizar o membro'));
    } finally {
      setBusy(null);
    }
  };

  const transfer = async (m: TeamMember) => {
    if (!confirm(`Transferir a propriedade da equipe para ${m.name}? Você passará a ser gestor(a) (ADMIN).`)) return;
    setBusy(m.userId);
    try {
      const { data } = await api.post('/teams/me/transfer-ownership', { userId: m.userId });
      // M4: o servidor explica o que aconteceu com o plano da plataforma
      toast.success(data?.message || 'Propriedade transferida', { duration: 10000 });
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível transferir a propriedade'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="glass-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Convidar para a equipe</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            A pessoa recebe um link por e-mail para criar a conta de treinador (ou entrar, se já tiver) e entrar na equipe.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div>
            <label className={labelCls} htmlFor="invite-email">E-mail</label>
            <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="treinador@email.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="invite-role">Papel</label>
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as any)} className={inputCls}>
              <option value="COACH">Treinador(a)</option>
              <option value="STAFF">Apoio (sem dados de saúde)</option>
              {isOwner && <option value="ADMIN">Gestor(a)</option>}
            </select>
          </div>
          <button type="submit" disabled={sending} className={btnPrimary}>{sending ? 'Enviando...' : 'Enviar convite'}</button>
        </div>
      </form>

      {canInvite && invites.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900">Convites enviados recentemente</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Últimos 7 dias, ainda não aceitos. Se a pessoa não recebeu o e-mail, reenvie.</p>
          <ul className="divide-y divide-gray-100">
            {invites.map((inv) => {
              const link = inv.link || inv.inviteUrl || inviteLinks[inv.email.toLowerCase()];
              return (
              <li key={inv.email} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-800">{inv.email}</span>
                <span className="text-xs text-gray-500">{inv.role ? ROLE_LABEL[inv.role as TeamRole] ?? inv.role : ''}</span>
                <span className="text-xs text-gray-400">{new Date(inv.sentAt).toLocaleDateString('pt-BR')}</span>
                {link && <button type="button" onClick={() => copyLink(link)} className={btnGhost}>Copiar link</button>}
                <button type="button" onClick={() => resend(inv)} className={btnGhost}>Reenviar</button>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Atletas</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.userId === myUserId;
                const editable = m.role !== 'OWNER' && (isOwner || m.role !== 'ADMIN' || isSelf);
                return (
                  <tr key={m.userId} className={`border-b border-gray-50 last:border-0 ${m.isActive ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{m.name}{isSelf && <span className="text-xs text-gray-400"> (você)</span>}</p>
                      {m.email && <p className="text-xs text-gray-500">{m.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {editable && !isSelf ? (
                        <select
                          value={m.role}
                          disabled={busy === m.userId}
                          onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white"
                          aria-label={`Papel de ${m.name}`}
                        >
                          <option value="COACH">Treinador(a)</option>
                          <option value="STAFF">Apoio</option>
                          {(isOwner || m.role === 'ADMIN') && <option value="ADMIN">Gestor(a)</option>}
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-gray-700">{ROLE_LABEL[m.role]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.athleteCount}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {m.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {isOwner && m.isActive && m.role !== 'OWNER' && m.role !== 'STAFF' && !isSelf && (
                          <button onClick={() => transfer(m)} disabled={busy === m.userId} className={btnGhost}>Tornar dono(a)</button>
                        )}
                        {editable && !isSelf && (
                          <button onClick={() => toggleActive(m)} disabled={busy === m.userId} className={btnGhost}>
                            {m.isActive ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">Nenhum membro ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
