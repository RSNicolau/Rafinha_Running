'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { MembersTab } from './_components/MembersTab';
import { AthletesTab } from './_components/AthletesTab';
import { PlansTab } from './_components/PlansTab';
import { SettingsTab } from './_components/SettingsTab';
import { apiError, ROLE_LABEL, type ActiveTeamDetails, type TeamMember } from './_components/shared';

const TABS = [
  { id: 'treinadores', label: 'Treinadores' },
  { id: 'atletas', label: 'Atletas' },
  { id: 'planos', label: 'Planos de mensalidade' },
  { id: 'configuracoes', label: 'Configurações' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function EquipeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshTeam } = useAuthStore();
  const initialTab = (TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'treinadores') as TabId;
  const [tab, setTab] = useState<TabId>(initialTab);
  const [team, setTeam] = useState<ActiveTeamDetails | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [noTeam, setNoTeam] = useState(false);

  const isPlatformAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/teams/me');
      if (!data?.activeTeam || data.activeTeam.role === 'ATHLETE') {
        setNoTeam(true);
        return;
      }
      setTeam(data.activeTeam);
      const m = await api.get<TeamMember[]>('/teams/me/members');
      setMembers(m.data);
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível carregar a equipe'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectTab = (id: TabId) => {
    setTab(id);
    router.replace(`/dashboard/equipe?tab=${id}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-10 w-full bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (noTeam || !team) {
    return (
      <div className="glass-card p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Você ainda não faz parte de uma equipe</h1>
        <p className="text-sm text-gray-500 mt-1">Peça um convite à gestão da sua assessoria.</p>
      </div>
    );
  }

  const isManager = team.role === 'OWNER' || team.role === 'ADMIN' || isPlatformAdmin;
  if (!isManager) {
    return (
      <div className="glass-card p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acesso restrito à gestão da equipe</h1>
        <p className="text-sm text-gray-500 mt-1">Somente o dono e os gestores da equipe acessam esta área.</p>
      </div>
    );
  }
  const isOwner = team.role === 'OWNER' || isPlatformAdmin;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{team.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestão da equipe · você é {ROLE_LABEL[team.role]?.toLowerCase() ?? team.role}
          {team.city ? ` · ${team.city}` : ''}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-6 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'treinadores' && (
        <MembersTab members={members} myRole={team.role} myUserId={user?.id} isPlatformAdmin={isPlatformAdmin} onChanged={() => { load(); refreshTeam(); }} />
      )}
      {tab === 'atletas' && <AthletesTab members={members} canAssign={isManager} />}
      {tab === 'planos' && <PlansTab />}
      {tab === 'configuracoes' && (
        <SettingsTab key={team.id + team.name} team={team} isOwner={isOwner} onSaved={() => { load(); refreshTeam(); }} />
      )}
    </div>
  );
}

export default function EquipePage() {
  return (
    <Suspense fallback={<div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />}>
      <EquipeContent />
    </Suspense>
  );
}
