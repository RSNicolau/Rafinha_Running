import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { isPlatformAdmin } from '../../common/utils/ownership';
import type { TeamContext } from './team-context.service';
import {
  activeMemberships,
  byRolePriority,
  COACHING_ROLES,
  pickDefaultMembership,
  resolveTeamBySlugOrCoach,
  signTeamInvite,
  TeamRoleName,
  upsertTeamMember,
  verifyTeamInvite,
} from './team-scope';
import {
  AssignCoachDto,
  CreateTeamPlanDto,
  InviteMemberDto,
  ListTeamAthletesQueryDto,
  UpdateMemberDto,
  UpdateTeamDto,
  UpdateTeamPlanDto,
} from './dto/teams.dto';

type Actor = { id: string; role?: string | null; email?: string | null };

const TEAM_PUBLIC_SELECT = {
  id: true, name: true, slug: true, status: true, logoUrl: true, primaryColor: true, city: true,
  graceDays: true, ownerId: true, createdAt: true,
} as const;

const ROLE_LABEL: Record<string, string> = { OWNER: 'Dono(a)', ADMIN: 'Gestor(a)', COACH: 'Treinador(a)', STAFF: 'Apoio' };

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private email: EmailService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  // Equipe
  // ════════════════════════════════════════════════════════════════════════

  /** Equipes do usuário + equipe ativa (header x-team-id já resolvido em `ctx`). */
  async getMyTeams(user: Actor, ctx: TeamContext | null) {
    const memberships = await activeMemberships(this.prisma, user.id);
    const teams = memberships
      .map((m) => ({
        id: m.team.id, name: m.team.name, slug: m.team.slug, logoUrl: m.team.logoUrl,
        primaryColor: m.team.primaryColor, city: m.team.city, role: m.role,
      }))
      .sort(byRolePriority);

    let activeTeam: any = null;
    const activeId = ctx?.teamId ?? pickDefaultMembership(memberships)?.teamId ?? null;
    if (activeId) {
      const team = await this.prisma.team.findUnique({
        where: { id: activeId },
        select: { ...TEAM_PUBLIC_SELECT, asaasWalletId: true, platformFeePercent: true },
      });
      if (team) {
        const role: TeamRoleName = ctx?.teamId === activeId ? ctx.role : (memberships.find((m) => m.teamId === activeId)?.role as TeamRoleName);
        activeTeam = this.presentTeam(team, role);
      }
    } else if (user.role === 'ATHLETE') {
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: user.id },
        select: { team: { select: TEAM_PUBLIC_SELECT }, coach: { select: { id: true, name: true } } },
      });
      if (profile?.team) activeTeam = { ...this.presentTeam(profile.team, 'ATHLETE' as any), coach: profile.coach };
    }
    return { activeTeam, teams };
  }

  /** Esconde dados financeiros de quem não é OWNER/ADMIN. */
  private presentTeam(team: any, role: TeamRoleName | 'ATHLETE') {
    const financial = role === 'OWNER' || role === 'ADMIN';
    const { asaasWalletId, platformFeePercent, ...rest } = team;
    return {
      ...rest,
      role,
      ...(financial
        ? { asaasWalletId: asaasWalletId ?? null, hasWallet: !!asaasWalletId, platformFeePercent: platformFeePercent ?? 0 }
        : {}),
    };
  }

  async updateTeam(user: Actor, ctx: TeamContext, dto: UpdateTeamDto) {
    const data: Record<string, any> = {};
    if (dto.name !== undefined) {
      // M5: trim + 2–80 caracteres (o DTO já valida; aqui é a garantia final — nunca grava nome vazio)
      const name = String(dto.name ?? '').trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80) throw new BadRequestException('O nome da equipe precisa ter entre 2 e 80 caracteres');
      data.name = name;
    }
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl || null;
    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor || null;
    if (dto.city !== undefined) data.city = dto.city?.trim() || null;
    if (dto.graceDays !== undefined) data.graceDays = dto.graceDays;
    if (dto.asaasWalletId !== undefined) {
      if (ctx.role !== 'OWNER' && !isPlatformAdmin(user)) {
        throw new ForbiddenException('Somente o dono da equipe pode alterar a carteira de recebimento');
      }
      data.asaasWalletId = dto.asaasWalletId ? dto.asaasWalletId.trim().toLowerCase() : null;
    }
    const team = await this.prisma.team.update({
      where: { id: ctx.teamId },
      data,
      select: { ...TEAM_PUBLIC_SELECT, asaasWalletId: true, platformFeePercent: true },
    });
    return this.presentTeam(team, ctx.role);
  }

  /** Staff da plataforma: taxa por equipe. */
  async setPlatformFee(teamId: string, platformFeePercent: number) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundException('Equipe não encontrada');
    return this.prisma.team.update({
      where: { id: teamId },
      data: { platformFeePercent },
      select: { id: true, name: true, slug: true, platformFeePercent: true },
    });
  }

  async listAllTeams(q: { search?: string } = {}) {
    return this.prisma.team.findMany({
      where: q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search.toLowerCase() } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        ...TEAM_PUBLIC_SELECT, platformFeePercent: true, asaasWalletId: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, athletes: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Membros
  // ════════════════════════════════════════════════════════════════════════

  async listMembers(ctx: TeamContext) {
    const [members, counts] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: { teamId: ctx.teamId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        select: {
          userId: true, role: true, isActive: true, createdAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.athleteProfile.groupBy({
        by: ['coachId'],
        where: { teamId: ctx.teamId, coachId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c: any) => [c.coachId, c._count._all]));
    const showEmail = ctx.role !== 'COACH';
    return members
      .map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: showEmail ? m.user.email : undefined,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        roleLabel: ROLE_LABEL[m.role] ?? m.role,
        isActive: m.isActive,
        joinedAt: m.createdAt,
        athleteCount: countBy.get(m.userId) ?? 0,
      }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || byRolePriority(a, b));
  }

  /** Convida membro (token assinado de 7 dias por e-mail; o token só volta na resposta em NODE_ENV=test). */
  async inviteMember(user: Actor, ctx: TeamContext, dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();
    if (dto.role === 'ADMIN' && ctx.role !== 'OWNER' && !isPlatformAdmin(user)) {
      throw new ForbiddenException('Somente o dono da equipe pode convidar gestores (ADMIN)');
    }
    const team = await this.prisma.team.findUnique({ where: { id: ctx.teamId }, select: { id: true, name: true } });
    if (!team) throw new NotFoundException('Equipe não encontrada');

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, role: true, teamMemberships: { where: { teamId: ctx.teamId }, select: { isActive: true } } },
    });
    if (existing?.teamMemberships?.[0]?.isActive) {
      throw new ConflictException('Esta pessoa já faz parte da equipe');
    }
    if (existing && existing.role === 'ATHLETE') {
      throw new BadRequestException(
        'Este e-mail pertence a uma conta de atleta. A equipe técnica precisa de uma conta de treinador — use outro e-mail.',
      );
    }

    const token = await signTeamInvite(this.jwt, { teamId: team.id, email, role: dto.role, inviterId: user.id });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001';
    const link = `${frontendUrl}/register?teamInvite=${encodeURIComponent(token)}`;
    const inviter = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });

    this.email
      .sendTransactional(
        email,
        `Convite para a equipe ${team.name}`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#DC2626;margin-bottom:8px">Você foi convidado(a)!</h2>
          <p><strong>${esc(inviter?.name ?? 'A gestão')}</strong> convidou você para a equipe <strong>${esc(team.name)}</strong>
          como <strong>${esc(ROLE_LABEL[dto.role] ?? dto.role)}</strong>.</p>
          <p>${existing ? 'Entre com a sua conta e aceite o convite:' : 'Crie sua conta de treinador e entre na equipe:'}</p>
          <a href="${esc(link)}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a>
          <p style="color:#6B7280;font-size:13px">Este link expira em 7 dias. Se você não esperava este convite, ignore este e-mail.</p>
        </div>`,
      )
      .catch((err: any) => this.logger.error(`Falha ao enviar convite de equipe: ${err?.message ?? err}`));

    // B8: convites são tokens assinados (sem tabela) — registra no AuditLog para a lista "enviados recentemente"
    await this.prisma.auditLog
      ?.create?.({
        data: { actorId: user.id, action: 'TEAM_INVITE', entityType: 'Team', entityId: team.id, metadata: { email, role: dto.role, expiresAt: expiresAt.toISOString() } },
      })
      .catch((err: any) => this.logger.warn(`AuditLog TEAM_INVITE: ${err?.message ?? err}`));

    return {
      invited: true,
      email,
      role: dto.role,
      existingAccount: !!existing,
      expiresAt,
      message: 'Convite enviado por e-mail.',
      ...(process.env.NODE_ENV === 'test' ? { token } : {}),
    };
  }

  /** Público: informações do convite para a tela de cadastro. */
  /** B8: convites enviados nos últimos 7 dias (via AuditLog) que ainda não viraram membros ativos. */
  async listRecentInvites(ctx: TeamContext) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows: any[] = (await this.prisma.auditLog?.findMany?.({
      where: { action: 'TEAM_INVITE', entityType: 'Team', entityId: ctx.teamId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, metadata: true, actorId: true },
    })) ?? [];
    const latest = new Map<string, any>();
    for (const r of rows) {
      const email = String(r.metadata?.email ?? '').toLowerCase();
      if (email && !latest.has(email)) latest.set(email, r);
    }
    if (!latest.size) return [];
    const members = await this.prisma.teamMember.findMany({
      where: { teamId: ctx.teamId, isActive: true, user: { email: { in: Array.from(latest.keys()), mode: 'insensitive' } } },
      select: { user: { select: { email: true } } },
    });
    const joined = new Set(members.map((m: any) => String(m.user.email).toLowerCase()));
    return Array.from(latest.entries())
      .filter(([email]) => !joined.has(email))
      .map(([email, r]) => ({ email, role: r.metadata?.role ?? null, sentAt: r.createdAt, expiresAt: r.metadata?.expiresAt ?? null }));
  }

  async checkInvite(token: string) {
    const p = await verifyTeamInvite(this.jwt, token);
    const team = await this.prisma.team.findUnique({
      where: { id: p.teamId },
      select: { name: true, slug: true, logoUrl: true, primaryColor: true, status: true },
    });
    if (!team || team.status !== 'ACTIVE') throw new BadRequestException('Convite inválido ou expirado');
    const existingAccount = !!(await this.prisma.user.findFirst({
      where: { email: { equals: p.email, mode: 'insensitive' } },
      select: { id: true },
    }));
    return {
      email: p.email,
      role: p.role,
      roleLabel: ROLE_LABEL[p.role],
      team: { name: team.name, slug: team.slug, logoUrl: team.logoUrl, primaryColor: team.primaryColor },
      existingAccount,
      expiresAt: p.exp ? new Date(p.exp * 1000) : null,
    };
  }

  /** Usuário logado aceita convite enviado ao SEU e-mail. Exige conta de treinador (COACH). */
  async acceptInvite(user: Actor, token: string) {
    const p = await verifyTeamInvite(this.jwt, token);
    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, role: true } });
    if (!me?.email || me.email.trim().toLowerCase() !== p.email) {
      throw new ForbiddenException('Este convite foi enviado para outro e-mail.');
    }
    if (me.role === 'ATHLETE') {
      throw new BadRequestException(
        'Convites da equipe técnica exigem uma conta de treinador. Esta conta é de atleta — peça um convite para outro e-mail.',
      );
    }
    if (me.role !== 'COACH') {
      throw new BadRequestException('Contas da administração da plataforma não entram em equipes por convite.');
    }
    const team = await this.prisma.team.findUnique({ where: { id: p.teamId }, select: { id: true, name: true, slug: true, status: true, ownerId: true } });
    if (!team || team.status !== 'ACTIVE') throw new BadRequestException('Convite inválido ou expirado');
    if (team.ownerId === me.id) throw new BadRequestException('Você já é o dono desta equipe');

    await this.prisma.$transaction(async (tx: any) => {
      await upsertTeamMember(tx, team.id, me.id, p.role);
      await tx.coachProfile.upsert({ where: { userId: me.id }, create: { userId: me.id }, update: {} });
    });
    return { message: 'Você agora faz parte da equipe.', team: { id: team.id, name: team.name, slug: team.slug, role: p.role } };
  }

  private async loadMember(teamId: string, userId: string) {
    const m = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { userId: true, role: true, isActive: true },
    });
    if (!m) throw new NotFoundException('Membro não encontrado');
    return m;
  }

  async updateMember(user: Actor, ctx: TeamContext, userId: string, dto: UpdateMemberDto) {
    if (dto.role === undefined && dto.isActive === undefined) throw new BadRequestException('Nada para atualizar');
    const target = await this.loadMember(ctx.teamId, userId);
    const actorIsOwner = ctx.role === 'OWNER' || isPlatformAdmin(user);

    if (target.role === 'OWNER') {
      throw new BadRequestException('O dono da equipe não pode ser alterado aqui. Use a transferência de propriedade.');
    }
    if (!actorIsOwner) {
      // ADMIN não altera outros ADMIN nem promove a ADMIN
      if (target.role === 'ADMIN' && target.userId !== user.id) throw new ForbiddenException('Somente o dono pode alterar gestores');
      if (dto.role === 'ADMIN') throw new ForbiddenException('Somente o dono pode promover a gestor');
    }
    if (userId === user.id && dto.isActive === false) throw new BadRequestException('Você não pode desativar a si mesmo');

    const team = await this.prisma.team.findUnique({ where: { id: ctx.teamId }, select: { ownerId: true } });
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const m = await tx.teamMember.update({
        where: { teamId_userId: { teamId: ctx.teamId, userId } },
        data: { ...(dto.role ? { role: dto.role } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) },
        select: { userId: true, role: true, isActive: true },
      });
      // Treinador saiu (desativado ou virou STAFF): atletas dele voltam para o dono da equipe
      if ((dto.isActive === false || m.role === 'STAFF') && team?.ownerId) {
        await tx.athleteProfile.updateMany({ where: { teamId: ctx.teamId, coachId: userId }, data: { coachId: team.ownerId } });
      }
      return m;
    });
    return updated;
  }

  async deactivateMember(user: Actor, ctx: TeamContext, userId: string) {
    return this.updateMember(user, ctx, userId, { isActive: false });
  }

  async transferOwnership(user: Actor, ctx: TeamContext, newOwnerId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: ctx.teamId }, select: { id: true, ownerId: true } });
    if (!team) throw new NotFoundException('Equipe não encontrada');
    if (newOwnerId === team.ownerId) throw new BadRequestException('Esta pessoa já é a dona da equipe');
    const target = await this.loadMember(ctx.teamId, newOwnerId);
    if (!target.isActive) throw new BadRequestException('O novo dono precisa ser um membro ativo');
    if (target.role === 'STAFF') throw new BadRequestException('Promova o membro a treinador ou gestor antes de transferir');

    // M4: o plano da plataforma (CoachSubscription) é por usuário. Ele acompanha a equipe quando
    // o novo dono não tem plano próprio e o dono atual não é dono de outra equipe ativa.
    const [oldSub, newSub, otherOwned] = await Promise.all([
      this.prisma.coachSubscription?.findUnique?.({ where: { coachId: team.ownerId }, select: { id: true } }) ?? null,
      this.prisma.coachSubscription?.findUnique?.({ where: { coachId: newOwnerId }, select: { id: true } }) ?? null,
      this.prisma.team.count({ where: { ownerId: team.ownerId, status: 'ACTIVE', id: { not: team.id } } }),
    ]);
    const moveSub = !!oldSub && !newSub && otherOwned === 0;

    await this.prisma.$transaction(async (tx: any) => {
      await tx.team.update({ where: { id: team.id }, data: { ownerId: newOwnerId } });
      await tx.teamMember.update({ where: { teamId_userId: { teamId: team.id, userId: newOwnerId } }, data: { role: 'OWNER' } });
      await tx.teamMember.updateMany({ where: { teamId: team.id, userId: team.ownerId }, data: { role: 'ADMIN' } });
      if (moveSub) await tx.coachSubscription.update({ where: { id: oldSub!.id }, data: { coachId: newOwnerId } });
    });
    let subscriptionNote: string;
    if (!oldSub) subscriptionNote = 'A equipe não tinha plano da plataforma ativo.';
    else if (moveSub) subscriptionNote = 'O plano da plataforma foi transferido para o novo dono.';
    else if (newSub) subscriptionNote = 'O novo dono já tem um plano da plataforma próprio — o plano anterior continua com você. Cancele-o em Assinatura se não for mais usar.';
    else subscriptionNote = 'Você é dono de outra equipe, então o plano da plataforma continua com você. O novo dono precisa assinar um plano em Assinatura.';
    return { message: `Propriedade da equipe transferida. ${subscriptionNote}`, ownerId: newOwnerId, subscriptionTransferred: moveSub, subscriptionNote };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Atletas da equipe
  // ════════════════════════════════════════════════════════════════════════

  async listAthletes(user: Actor, ctx: TeamContext, q: ListTeamAthletesQueryDto = {}) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const coachFilter = ctx.role === 'COACH' && !isPlatformAdmin(user) ? user.id : q.coachId;

    const userWhere: Record<string, any> = { deletedAt: null };
    if (q.search?.trim()) {
      const s = q.search.trim();
      userWhere.OR = [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }];
    }
    if (q.membershipStatus === 'NONE') {
      userWhere.athleteMemberships = { none: { teamId: ctx.teamId } };
    } else if (q.membershipStatus) {
      userWhere.athleteMemberships = { some: { teamId: ctx.teamId, status: q.membershipStatus } };
    }
    const where = { teamId: ctx.teamId, ...(coachFilter ? { coachId: coachFilter } : {}), user: userWhere };

    const [rows, total] = await Promise.all([
      this.prisma.athleteProfile.findMany({
        where,
        orderBy: { user: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          userId: true, level: true, coachId: true, createdAt: true,
          coach: { select: { id: true, name: true } },
          user: {
            select: {
              id: true, name: true, email: true, avatarUrl: true, phone: true,
              athleteMemberships: {
                where: { teamId: ctx.teamId },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, status: true, nextDueDate: true, priceInCents: true, plan: { select: { id: true, name: true, interval: true } } },
              },
            },
          },
        },
      }),
      this.prisma.athleteProfile.count({ where }),
    ]);

    return {
      data: rows.map((r: any) => ({
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        avatarUrl: r.user.avatarUrl,
        level: r.level,
        coach: r.coach,
        membership: r.user.athleteMemberships[0] ?? null,
        joinedAt: r.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async assignCoach(ctx: TeamContext, athleteId: string, dto: AssignCoachDto) {
    const profile = await this.prisma.athleteProfile.findUnique({ where: { userId: athleteId }, select: { teamId: true } });
    if (!profile || profile.teamId !== ctx.teamId) throw new NotFoundException('Atleta não encontrado nesta equipe');
    const coach = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: ctx.teamId, userId: dto.coachId } },
      select: { role: true, isActive: true },
    });
    if (!coach || !coach.isActive || !COACHING_ROLES.includes(coach.role as TeamRoleName)) {
      throw new BadRequestException('O treinador precisa ser membro ativo da equipe (dono, gestor ou treinador)');
    }
    await this.prisma.athleteProfile.update({ where: { userId: athleteId }, data: { coachId: dto.coachId } });
    return { athleteId, coachId: dto.coachId };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Planos de mensalidade (TeamPlan)
  // ════════════════════════════════════════════════════════════════════════

  async listPlans(ctx: TeamContext) {
    return this.prisma.teamPlan.findMany({
      where: { teamId: ctx.teamId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { priceInCents: 'asc' }],
      include: { _count: { select: { memberships: true } } },
    });
  }

  async createPlan(ctx: TeamContext, dto: CreateTeamPlanDto) {
    return this.prisma.teamPlan.create({
      data: {
        teamId: ctx.teamId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        interval: dto.interval as any,
        priceInCents: dto.priceInCents,
        benefits: dto.benefits ?? [],
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  private async ownPlan(ctx: TeamContext, planId: string) {
    const plan = await this.prisma.teamPlan.findFirst({ where: { id: planId, teamId: ctx.teamId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    return plan;
  }

  async updatePlan(ctx: TeamContext, planId: string, dto: UpdateTeamPlanDto) {
    await this.ownPlan(ctx, planId);
    const data: Record<string, any> = {};
    for (const k of ['interval', 'priceInCents', 'benefits', 'isActive', 'sortOrder'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    // Preço novo vale para novas contratações; mensalidades existentes mantêm o preço travado (AthleteMembership.priceInCents)
    return this.prisma.teamPlan.update({ where: { id: planId }, data });
  }

  async deletePlan(ctx: TeamContext, planId: string) {
    await this.ownPlan(ctx, planId);
    const used = await this.prisma.athleteMembership.count({ where: { planId } });
    if (used > 0) {
      await this.prisma.teamPlan.update({ where: { id: planId }, data: { isActive: false } });
      return { deleted: false, deactivated: true, message: 'Plano com mensalidades vinculadas: foi desativado para novas contratações.' };
    }
    await this.prisma.teamPlan.delete({ where: { id: planId } });
    return { deleted: true, deactivated: false };
  }

  /** Público: dados da equipe + planos ativos para a página de cadastro/assinatura do atleta. */
  async getPublicTeam(slug: string) {
    // slug da equipe; senão slug legado/id do treinador → equipe padrão dele (links /onboarding/:slug e /loja/:slug antigos)
    let where: Record<string, any> = { slug: String(slug ?? '').toLowerCase(), status: 'ACTIVE' };
    const direct = await this.prisma.team.findFirst({ where, select: { id: true } });
    if (!direct) {
      const target = await resolveTeamBySlugOrCoach(this.prisma, String(slug ?? '')).catch(() => null);
      if (target?.teamId) where = { id: target.teamId, status: 'ACTIVE' };
    }
    const team = await this.prisma.team.findFirst({
      where,
      select: {
        id: true, name: true, slug: true, logoUrl: true, primaryColor: true, city: true,
        plans: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { priceInCents: 'asc' }],
          select: { id: true, name: true, description: true, interval: true, priceInCents: true, benefits: true, sortOrder: true },
        },
      },
    });
    if (!team) throw new NotFoundException('Equipe não encontrada');
    return team;
  }
}
