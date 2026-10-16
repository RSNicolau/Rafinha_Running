import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

/**
 * Helpers de equipe sem dependência de DI (recebem o client Prisma / transação).
 * Usados por auth, invites, onboarding, users, store e pelo próprio TeamsModule.
 */

export type TeamRoleName = 'OWNER' | 'ADMIN' | 'COACH' | 'STAFF';
export const TEAM_ROLES: TeamRoleName[] = ['OWNER', 'ADMIN', 'COACH', 'STAFF'];
/** Papéis que podem ser treinadores responsáveis por atletas. */
export const COACHING_ROLES: TeamRoleName[] = ['OWNER', 'ADMIN', 'COACH'];

export interface ActiveTeamSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  role: TeamRoleName | 'ATHLETE';
}

const ROLE_PRIORITY: Record<string, number> = { OWNER: 0, ADMIN: 1, COACH: 2, STAFF: 3 };

/** Memberships ativos em equipes ativas, mais antigos primeiro. */
export async function activeMemberships(prisma: any, userId: string) {
  if (!prisma?.teamMember?.findMany) return [];
  return prisma.teamMember.findMany({
    where: { userId, isActive: true, team: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'asc' },
    select: {
      teamId: true,
      role: true,
      createdAt: true,
      team: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, ownerId: true, city: true } },
    },
  }) as Promise<Array<{ teamId: string; role: TeamRoleName; createdAt: Date; team: any }>>;
}

/** Equipe padrão: primeira em que é OWNER/ADMIN; senão a primeira em que é membro. */
export function pickDefaultMembership<T extends { role: string; createdAt?: Date }>(memberships: T[]): T | null {
  if (!memberships.length) return null;
  const managers = memberships.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN');
  return managers[0] ?? memberships[0];
}

/** Ordena pelo papel mais forte (útil para exibição). */
export function byRolePriority<T extends { role: string }>(a: T, b: T) {
  return (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9);
}

/**
 * Equipe ativa resumida para respostas de auth (/auth/login, /auth/register, /users/me).
 * Membros: equipe padrão (ou a de `preferredTeamId`, se for membro). Atletas: a equipe do perfil (role ATHLETE).
 */
export async function activeTeamSummary(
  prisma: any,
  user: { id: string; role?: string | null },
  preferredTeamId?: string | null,
): Promise<ActiveTeamSummary | null> {
  if (!user?.id) return null;
  if (user.role === 'ATHLETE') {
    if (!prisma?.athleteProfile?.findUnique) return null;
    const profile = await prisma.athleteProfile.findUnique({
      where: { userId: user.id },
      select: { team: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } } },
    });
    const t = profile?.team;
    return t ? { id: t.id, name: t.name, slug: t.slug, logoUrl: t.logoUrl ?? null, primaryColor: t.primaryColor ?? null, role: 'ATHLETE' } : null;
  }
  const memberships = await activeMemberships(prisma, user.id);
  const chosen = (preferredTeamId && memberships.find((m) => m.teamId === preferredTeamId)) || pickDefaultMembership(memberships);
  if (!chosen) return null;
  const t = chosen.team;
  return { id: t.id, name: t.name, slug: t.slug, logoUrl: t.logoUrl ?? null, primaryColor: t.primaryColor ?? null, role: chosen.role };
}

/** Equipe padrão (id) de um usuário — onde o atleta convidado/cadastrado por ele deve entrar. */
export async function defaultTeamIdForUser(prisma: any, userId: string): Promise<string | null> {
  const m = pickDefaultMembership(await activeMemberships(prisma, userId));
  return m?.teamId ?? null;
}

/**
 * Resolve slug público → equipe. Aceita: slug da equipe, id da equipe, slug legado do treinador
 * (coachProfile.slug) ou id do treinador (→ equipe padrão dele). Retorna null se nada encontrado.
 */
export async function resolveTeamBySlugOrCoach(
  prisma: any,
  slugOrId: string,
): Promise<{ teamId: string | null; ownerId: string; coachId: string } | null> {
  if (!slugOrId || typeof slugOrId !== 'string') return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const team = prisma.team?.findFirst
    ? await prisma.team.findFirst({
        where: { status: 'ACTIVE', OR: [{ slug: slugOrId }, ...(isUuid ? [{ id: slugOrId }] : [])] },
        select: { id: true, ownerId: true },
      })
    : null;
  if (team) return { teamId: team.id, ownerId: team.ownerId, coachId: team.ownerId };

  const coach = await prisma.user.findFirst({
    where: {
      role: { in: ['COACH', 'ADMIN', 'SUPER_ADMIN'] },
      coachProfile: { isNot: null },
      OR: [{ coachProfile: { slug: slugOrId } }, ...(isUuid ? [{ id: slugOrId }] : [])],
    },
    select: { id: true },
  });
  if (!coach) return null;
  const teamId = await defaultTeamIdForUser(prisma, coach.id);
  return { teamId, ownerId: coach.id, coachId: coach.id };
}

/** IDs dos membros ativos (todos os papéis) de uma equipe. */
export async function activeMemberIds(prisma: any, teamId: string): Promise<string[]> {
  const rows: { userId: string }[] = await prisma.teamMember.findMany({
    where: { teamId, isActive: true },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug
// ─────────────────────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  const base = String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'equipe';
}

/** Slug único entre equipes E slugs legados de treinador (evita sombrear links /onboarding/:slug existentes). */
export async function uniqueTeamSlug(tx: any, base: string, ownCoachUserId?: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [team, coach] = await Promise.all([
      tx.team.findUnique({ where: { slug: candidate }, select: { id: true } }),
      tx.coachProfile.findFirst({ where: { slug: candidate }, select: { userId: true } }),
    ]);
    if (!team && (!coach || coach.userId === ownCoachUserId)) return candidate;
  }
  return `${root}-${randomBytes(3).toString('hex')}`;
}

/**
 * Cria a equipe de um treinador (ele vira OWNER). Também grava coachProfile.slug = slug da equipe
 * quando o treinador ainda não tem slug (mantém /onboarding/:slug e /loja/:slug funcionando).
 */
export async function createTeamForOwner(tx: any, owner: { id: string; name: string }, teamName?: string | null) {
  const name = (teamName ?? '').trim() || owner.name.trim() || 'Minha Equipe';
  const profile = await tx.coachProfile.findUnique({ where: { userId: owner.id }, select: { slug: true } });
  const slug = profile?.slug ? await uniqueTeamSlug(tx, profile.slug, owner.id) : await uniqueTeamSlug(tx, name, owner.id);
  const team = await tx.team.create({
    data: {
      name: name.slice(0, 80),
      slug,
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
    select: { id: true, name: true, slug: true },
  });
  if (profile && !profile.slug) {
    await tx.coachProfile.update({ where: { userId: owner.id }, data: { slug } }).catch(() => undefined);
  }
  return team;
}

/** Adiciona (ou reativa) membro na equipe com o papel indicado. */
export async function upsertTeamMember(tx: any, teamId: string, userId: string, role: TeamRoleName) {
  return tx.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role, isActive: true },
    update: { role, isActive: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convite de membro da equipe (token assinado — sem tabela)
// ─────────────────────────────────────────────────────────────────────────────

export const TEAM_INVITE_PURPOSE = 'team-invite';
export const TEAM_INVITE_TTL = '7d';

export interface TeamInvitePayload {
  purpose: typeof TEAM_INVITE_PURPOSE;
  teamId: string;
  email: string;
  role: 'ADMIN' | 'COACH' | 'STAFF';
  inviterId: string;
}

function teamInviteSecret(): string {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado');
  // Segredo derivado: um convite nunca vale como access token (e vice-versa)
  return `${process.env.JWT_SECRET}:team-invite`;
}

export async function signTeamInvite(jwt: JwtService, data: Omit<TeamInvitePayload, 'purpose'>): Promise<string> {
  return jwt.signAsync(
    { purpose: TEAM_INVITE_PURPOSE, ...data, email: data.email.trim().toLowerCase() },
    { secret: teamInviteSecret(), expiresIn: TEAM_INVITE_TTL as any },
  );
}

export async function verifyTeamInvite(jwt: JwtService, token: string): Promise<TeamInvitePayload & { exp?: number }> {
  let p: any;
  try {
    p = await jwt.verifyAsync(String(token ?? ''), { secret: teamInviteSecret() });
  } catch {
    throw new BadRequestException('Convite inválido ou expirado');
  }
  if (
    !p || p.purpose !== TEAM_INVITE_PURPOSE || typeof p.teamId !== 'string' || typeof p.email !== 'string' ||
    !['ADMIN', 'COACH', 'STAFF'].includes(p.role)
  ) {
    throw new BadRequestException('Convite inválido ou expirado');
  }
  return p;
}
