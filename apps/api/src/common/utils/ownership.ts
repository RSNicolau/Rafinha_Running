import { ForbiddenException, NotFoundException } from '@nestjs/common';

export interface AuthUserLike {
  id: string;
  role?: string | null;
}

/** Contexto da equipe ativa do chamador (ver TeamContextService). */
export interface TeamCtxLike {
  teamId: string;
  role: string; // TeamRole: OWNER | ADMIN | COACH | STAFF
}

/** Papéis de equipe que gerenciam TUDO da equipe (atletas, treinadores, loja, eventos...). */
export const TEAM_MANAGER_ROLES = ['OWNER', 'ADMIN'] as const;
/** Papéis de equipe que enxergam todos os atletas da equipe (STAFF: leitura, sem dados de saúde). */
export const TEAM_WIDE_ATHLETE_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

/** ADMIN e SUPER_ADMIN (dona da plataforma) podem operar entre tenants. */
export function isPlatformAdmin(user: AuthUserLike | null | undefined): boolean {
  return !!user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
}

export interface AthleteAccessOptions {
  /** default true — o próprio atleta acessa os seus dados */
  allowSelf?: boolean;
  /**
   * true quando o recurso é dado de saúde (avaliações físicas, documentos/exames, nutrição).
   * Membros STAFF da equipe NÃO acessam dados de saúde (LGPD art. 11 — mínimo necessário).
   */
  healthData?: boolean;
}

/**
 * Garante que `user` pode acessar dados do atleta `athleteId`. Caminhos de acesso:
 *  (a) o próprio atleta (se allowSelf);
 *  (b) ADMIN / SUPER_ADMIN da plataforma (cross-tenant);
 *  (c) o treinador responsável (AthleteProfile.coachId === user.id);
 *  (d) membro ATIVO OWNER/ADMIN/STAFF da equipe do atleta (AthleteProfile.teamId) — STAFF sem dados de saúde.
 * Demais: 404 (não revela existência) ou 403.
 */
export async function assertCoachOwnsAthlete(
  prisma: any,
  user: AuthUserLike | null | undefined,
  athleteId: string,
  opts: AthleteAccessOptions = {},
): Promise<void> {
  const allowSelf = opts.allowSelf ?? true;
  if (!user?.id) throw new ForbiddenException('Acesso negado');
  if (!athleteId || typeof athleteId !== 'string') throw new NotFoundException('Atleta não encontrado');
  if (isPlatformAdmin(user)) return;
  if (user.id === athleteId) {
    if (allowSelf) return;
    throw new ForbiddenException('Acesso negado');
  }
  if (user.role !== 'COACH') throw new ForbiddenException('Acesso negado');

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: athleteId },
    select: { coachId: true, teamId: true },
  });
  if (!profile) throw new NotFoundException('Atleta não encontrado');
  if (profile.coachId === user.id) return;

  if (profile.teamId && prisma.teamMember?.findFirst) {
    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId: profile.teamId,
        userId: user.id,
        isActive: true,
        role: { in: [...TEAM_WIDE_ATHLETE_ROLES] },
        team: { status: 'ACTIVE' },
      },
      select: { role: true },
    });
    if (membership) {
      if (membership.role === 'STAFF' && opts.healthData) {
        throw new ForbiddenException('A equipe de apoio não tem acesso a dados de saúde do atleta');
      }
      return;
    }
  }
  throw new NotFoundException('Atleta não encontrado');
}

/** Variante booleana (não lança). */
export async function coachOwnsAthlete(
  prisma: any,
  user: AuthUserLike,
  athleteId: string,
  opts: AthleteAccessOptions = {},
): Promise<boolean> {
  try {
    await assertCoachOwnsAthlete(prisma, user, athleteId, opts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filtro Prisma (modelo User) restringindo a atletas visíveis ao chamador.
 *  - ADMIN/SUPER_ADMIN → {} (sem filtro);
 *  - com contexto de equipe OWNER/ADMIN/STAFF → todos os atletas da equipe;
 *  - demais (treinador) → apenas os atletas atribuídos a ele.
 */
export function athleteScopeWhere(user: AuthUserLike, team?: TeamCtxLike | null): Record<string, any> {
  if (isPlatformAdmin(user)) return {};
  if (team && (TEAM_WIDE_ATHLETE_ROLES as readonly string[]).includes(team.role)) {
    return { athleteProfile: { teamId: team.teamId } };
  }
  return { athleteProfile: { coachId: user.id } };
}

/**
 * Versão assíncrona para o modelo AthleteProfile, sem contexto de requisição: considera TODAS as equipes
 * em que o chamador é OWNER/ADMIN/STAFF ativo, mais os atletas atribuídos a ele.
 */
export async function athleteProfileScopeWhere(prisma: any, user: AuthUserLike): Promise<Record<string, any>> {
  if (isPlatformAdmin(user)) return {};
  const teamIds = await teamIdsWithRoles(prisma, user.id, TEAM_WIDE_ATHLETE_ROLES);
  if (!teamIds.length) return { coachId: user.id };
  return { OR: [{ coachId: user.id }, { teamId: { in: teamIds } }] };
}

/** Equipes ATIVAS em que o usuário é membro ativo com um dos papéis indicados. */
export async function teamIdsWithRoles(prisma: any, userId: string, roles: readonly string[]): Promise<string[]> {
  if (!prisma?.teamMember?.findMany) return [];
  const rows: { teamId: string }[] = await prisma.teamMember.findMany({
    where: { userId, isActive: true, role: { in: [...roles] }, team: { status: 'ACTIVE' } },
    select: { teamId: true },
  });
  return Array.from(new Set(rows.map((r) => r.teamId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da equipe (loja, pedidos, cupons, eventos, inscrições, parceiros, depoimentos)
// ─────────────────────────────────────────────────────────────────────────────
//
// Produtos/eventos/cupons/parceiros NÃO têm coluna teamId (pedido de schema registrado). Até lá o conteúdo é
// ATRIBUÍDO a uma única equipe a partir do treinador que o criou — a "equipe principal" dele:
//   1) a equipe ATIVA em que ele é OWNER (a mais antiga, se houver mais de uma);
//   2) senão, a equipe ATIVA do membership mais antigo (ativo OU inativo — quem saiu da equipe não leva o
//      histórico de pedidos/inscrições para a equipe nova).
// Gestores de outras equipes das quais ele também participa NÃO veem esse conteúdo.
// Quando a coluna teamId existir basta trocar `teamContentWhere` por `{ teamId }` e gravar
// `contentTeamIdForCreator()` na criação.

type MembershipRow = { teamId: string; userId: string; role: string; isActive: boolean; createdAt?: Date | string | null; team?: { status?: string | null } | null };

function pickPrimaryTeam(rows: MembershipRow[]): string | null {
  const live = rows
    .filter((r) => !r.team || r.team.status === undefined || r.team.status === null || r.team.status === 'ACTIVE')
    .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  const owner = live.find((r) => r.role === 'OWNER' && r.isActive !== false);
  if (owner) return owner.teamId;
  return live[0]?.teamId ?? null;
}

/** Equipe principal de cada usuário (ver regra acima). Usuário sem nenhuma equipe → null. */
export async function primaryTeamIds(prisma: any, userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  for (const id of ids) out.set(id, null);
  if (!ids.length || !prisma?.teamMember?.findMany) return out;
  const rows: MembershipRow[] = await prisma.teamMember.findMany({
    where: { userId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: { teamId: true, userId: true, role: true, isActive: true, createdAt: true, team: { select: { status: true } } },
  });
  for (const id of ids) out.set(id, pickPrimaryTeam(rows.filter((r) => r.userId === id)));
  return out;
}

export async function primaryTeamIdForCoach(prisma: any, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  return (await primaryTeamIds(prisma, [userId])).get(userId) ?? null;
}

/** Equipe à qual o conteúdo criado por `coachId` pertence (use para gravar teamId quando a coluna existir). */
export const contentTeamIdForCreator = primaryTeamIdForCoach;

/** Treinadores cujo conteúdo é ATRIBUÍDO à equipe `teamId` (membros atuais ou antigos cuja equipe principal é ela). */
export async function teamContentCoachIds(prisma: any, teamId: string): Promise<string[]> {
  if (!teamId || !prisma?.teamMember?.findMany) return [];
  const rows: { userId: string }[] = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  const primaries = await primaryTeamIds(prisma, rows.map((r) => r.userId));
  return Array.from(primaries.entries()).filter(([, t]) => t === teamId).map(([u]) => u);
}

/** Equipe padrão do usuário sem header (mesma regra do TeamContextService: 1ª OWNER/ADMIN, senão a 1ª). */
async function defaultTeamCtx(prisma: any, userId: string): Promise<TeamCtxLike | null> {
  if (!prisma?.teamMember?.findMany) return null;
  const rows: Array<{ teamId: string; role: string }> = await prisma.teamMember.findMany({
    where: { userId, isActive: true, team: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'asc' },
    select: { teamId: true, role: true },
  });
  if (!rows.length) return null;
  return rows.find((r) => r.role === 'OWNER' || r.role === 'ADMIN') ?? rows[0];
}

export type ContentTeamCtx = (TeamCtxLike & { platformAdmin?: boolean }) | null | undefined;

/**
 * IDs dos treinadores cujo conteúdo o chamador enxerga/gerencia NA EQUIPE ATIVA `team`
 * (sem `team`: a equipe padrão dele):
 *  - null para ADMIN/SUPER_ADMIN sem equipe escolhida (sem filtro);
 *  - OWNER/ADMIN da equipe ativa → treinadores cujo conteúdo é atribuído a ESSA equipe;
 *  - COACH/STAFF → só ele mesmo, e apenas se a equipe ativa for a equipe principal dele;
 *  - sem equipe (treinador legado) → só ele mesmo.
 */
export async function managedCoachIds(prisma: any, user: AuthUserLike, team?: ContentTeamCtx): Promise<string[] | null> {
  if (isPlatformAdmin(user) && !team) return null;
  const ctx: (TeamCtxLike & { platformAdmin?: boolean }) | null = team ?? (await defaultTeamCtx(prisma, user.id));
  if (!ctx) return [user.id];
  if (ctx.platformAdmin || (TEAM_MANAGER_ROLES as readonly string[]).includes(ctx.role)) {
    return teamContentCoachIds(prisma, ctx.teamId);
  }
  const primary = await primaryTeamIdForCoach(prisma, user.id);
  return primary === ctx.teamId || primary === null ? [user.id] : [];
}

/** Converte a lista de managedCoachIds em filtro Prisma no campo indicado (default coachId). */
export function coachIdsWhere(ids: string[] | null, field = 'coachId'): Record<string, any> {
  if (ids === null) return {};
  if (ids.length === 1) return { [field]: ids[0] };
  return { [field]: { in: ids } };
}

/**
 * Filtro Prisma do conteúdo da equipe ativa — ÚNICO ponto a trocar quando existir a coluna teamId
 * (passará a ser `{ teamId: team.teamId }`).
 */
export async function teamContentWhere(prisma: any, user: AuthUserLike, team?: ContentTeamCtx, field = 'coachId'): Promise<Record<string, any>> {
  return coachIdsWhere(await managedCoachIds(prisma, user, team), field);
}

/**
 * true se o chamador pode gerenciar um item criado pelo treinador `ownerCoachId`:
 * o próprio autor, ADMIN/SUPER_ADMIN, ou OWNER/ADMIN ativo da equipe à qual o item é atribuído
 * (se `team` for informado, ela precisa ser essa equipe).
 */
export async function canManageCoachContent(
  prisma: any,
  user: AuthUserLike,
  ownerCoachId: string | null | undefined,
  team?: ContentTeamCtx,
): Promise<boolean> {
  if (isPlatformAdmin(user) && (!team || team.platformAdmin)) return true;
  if (!ownerCoachId) return false;
  if (ownerCoachId === user.id) return true;
  const contentTeam = await primaryTeamIdForCoach(prisma, ownerCoachId);
  if (!contentTeam) return false;
  if (team && team.teamId !== contentTeam) return false;
  if (team?.platformAdmin) return true;
  if (!prisma?.teamMember?.findFirst) return false;
  const m = await prisma.teamMember.findFirst({
    where: { teamId: contentTeam, userId: user.id, isActive: true, role: { in: [...TEAM_MANAGER_ROLES] }, team: { status: 'ACTIVE' } },
    select: { role: true },
  });
  return !!m;
}

/**
 * Regras de criação de conteúdo (loja/eventos) na equipe ativa:
 *  - STAFF não cria; COACH cria como rascunho/inativo (publicar = OWNER/ADMIN);
 *  - o conteúdo é atribuído à equipe principal do autor, então só pode ser criado com ela ativa
 *    (evita "criei na equipe B e apareceu na A").
 * Retorna se o autor pode publicar diretamente.
 */
export async function assertCanCreateTeamContent(
  prisma: any,
  user: AuthUserLike,
  team: ContentTeamCtx,
): Promise<{ canPublish: boolean }> {
  if (isPlatformAdmin(user)) return { canPublish: true };
  if (!team) return { canPublish: true }; // treinador sem equipe (legado)
  if (team.role === 'STAFF') throw new ForbiddenException('A equipe de apoio não cria produtos nem eventos');
  const primary = await primaryTeamIdForCoach(prisma, user.id);
  if (primary && primary !== team.teamId) {
    throw new ForbiddenException(
      'Seus produtos e eventos ficam vinculados à sua equipe principal. Troque para ela no seletor de equipe para criar.',
    );
  }
  return { canPublish: (TEAM_MANAGER_ROLES as readonly string[]).includes(team.role) };
}

/** OWNER/ADMIN (ou sem equipe / admin da plataforma) publicam; COACH/STAFF não. */
export function canPublishTeamContent(user: AuthUserLike, team: ContentTeamCtx): boolean {
  if (isPlatformAdmin(user) || !team) return true;
  return (TEAM_MANAGER_ROLES as readonly string[]).includes(team.role);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados de saúde em listagens (LGPD art. 11 — mínimo necessário)
// ─────────────────────────────────────────────────────────────────────────────

/** Campos biométricos do AthleteProfile que STAFF (apoio) não recebe. */
export const HEALTH_PROFILE_FIELDS = ['weight', 'height', 'vo2max', 'restingHR', 'maxHR'] as const;

/**
 * Remove (null) os campos de saúde dos perfis que o chamador não pode ver:
 * vê quem é o treinador responsável, OWNER/ADMIN ativo da equipe do atleta ou ADMIN da plataforma.
 * STAFF — e qualquer outro caminho de leitura — recebe os perfis sem os dados biométricos.
 */
export async function redactHealthFields<T extends { coachId?: string | null; teamId?: string | null }>(
  prisma: any,
  user: AuthUserLike,
  profiles: T[],
): Promise<T[]> {
  if (isPlatformAdmin(user) || !profiles.length) return profiles;
  const managerTeams = new Set(await teamIdsWithRoles(prisma, user.id, TEAM_MANAGER_ROLES));
  return profiles.map((p) => {
    if (p.coachId === user.id || (p.teamId && managerTeams.has(p.teamId))) return p;
    const copy: any = { ...p };
    for (const f of HEALTH_PROFILE_FIELDS) if (f in copy) copy[f] = null;
    copy.healthDataHidden = true;
    return copy;
  });
}
