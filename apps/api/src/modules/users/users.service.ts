import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateAiSettingsDto } from './dto/user-settings.dto';
import { InvitesService } from '../invites/invites.service';
import { encryptApiKey } from '../coach-brain/byok-crypto';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/legal.constants';
import { assertCoachOwnsAthlete, athleteProfileScopeWhere, isPlatformAdmin, redactHealthFields } from '../../common/utils/ownership';
import { activeTeamSummary } from '../teams/team-scope';
import { assertPasswordPolicy } from '../../common/validators/password-policy';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private invites: InvitesService,
  ) {}

  async findById(id: string, preferredTeamId?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        phone: true,
        dateOfBirth: true,
        aiProvider: true,
        aiModel: true,
        aiByok: true,
        createdAt: true,
        updatedAt: true,
        termsVersion: true,
        privacyVersion: true,
        termsAcceptedAt: true,
        marketingOptIn: true,
        athleteProfile: true,
        coachProfile: {
          select: {
            id: true, userId: true, slug: true, bio: true, specializations: true, certifications: true,
            maxAthletes: true, paymentProvider: true, paymentEnabled: true, platformFeePercent: true,
            niche: true, nicheConfig: true, appointmentUrl: true, createdAt: true, updatedAt: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    const needsConsent = user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION;
    // Equipe ativa {id, name, slug, role} — o front usa para rotear e montar o menu
    const t = await activeTeamSummary(this.prisma, user, preferredTeamId).catch(() => null);
    const team = t ? { id: t.id, name: t.name, slug: t.slug, role: t.role, logoUrl: t.logoUrl, primaryColor: t.primaryColor } : null;
    return { ...user, needsConsent, team };
  }

  async updateAvatarUrl(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  async updateBannerUrl(userId: string, bannerUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { bannerUrl },
      select: { id: true, bannerUrl: true },
    });
  }

  /** Somente COACH (ver controller). A chave BYOK é gravada criptografada (mesmo formato do coach-brain). */
  async updateAiSettings(userId: string, dto: UpdateAiSettingsDto) {
    const data: Record<string, any> = {};
    if (dto.aiProvider !== undefined) data.aiProvider = dto.aiProvider;
    if (dto.aiModel !== undefined) data.aiModel = dto.aiModel || null;
    if (dto.aiByok !== undefined) data.aiByok = dto.aiByok;
    if (dto.aiByok === false) {
      data.aiApiKey = null; // modo plataforma: descarta a chave própria
    } else if (dto.aiApiKey) {
      data.aiApiKey = encryptApiKey(dto.aiApiKey.trim());
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true },
    });
    const { aiApiKey, ...rest } = updated;
    return { ...rest, hasApiKey: !!aiApiKey };
  }

  /**
   * Campos públicos mínimos de um usuário (chat, cabeçalhos) — só se o chamador tiver relação com ele:
   * ele mesmo, admin da plataforma, conversa existente, treinador ↔ atleta, colegas de equipe
   * (equipe técnica) ou equipe técnica ↔ atleta da equipe. Caso contrário 404 (não revela existência).
   */
  async findPublicById(id: string, caller?: { id: string; role?: string | null } | null) {
    if (!id || typeof id !== 'string' || !caller?.id || !(await this.canSeeUser(caller, id))) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, avatarUrl: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  /** O chamador tem relação legítima com o usuário `targetId`? (ver findPublicById) */
  async canSeeUser(caller: { id: string; role?: string | null }, targetId: string): Promise<boolean> {
    if (caller.id === targetId) return true;
    if (isPlatformAdmin(caller)) return true;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { athleteId: caller.id, coachId: targetId },
          { athleteId: targetId, coachId: caller.id },
        ],
      },
      select: { id: true },
    });
    if (conversation) return true;

    const staffTeamsOf = async (userId: string): Promise<Set<string>> => {
      const [memberships, owned] = await Promise.all([
        this.prisma.teamMember.findMany({ where: { userId, isActive: true }, select: { teamId: true } }),
        this.prisma.team.findMany({ where: { ownerId: userId }, select: { id: true } }),
      ]);
      return new Set<string>([...memberships.map((m: any) => m.teamId), ...owned.map((t: any) => t.id)]);
    };

    const [callerAp, targetAp, callerTeams, targetTeams] = await Promise.all([
      this.prisma.athleteProfile.findUnique({ where: { userId: caller.id }, select: { coachId: true, teamId: true } }),
      this.prisma.athleteProfile.findUnique({ where: { userId: targetId }, select: { coachId: true, teamId: true } }),
      staffTeamsOf(caller.id),
      staffTeamsOf(targetId),
    ]);

    // Treinador responsável ↔ atleta
    if (callerAp?.coachId && callerAp.coachId === targetId) return true;
    if (targetAp?.coachId && targetAp.coachId === caller.id) return true;
    // Colegas da equipe técnica
    for (const t of callerTeams) if (targetTeams.has(t)) return true;
    // Equipe técnica → atleta da equipe, e atleta → equipe técnica da sua equipe
    if (targetAp?.teamId && callerTeams.has(targetAp.teamId)) return true;
    if (callerAp?.teamId && targetTeams.has(callerAp.teamId)) return true;
    return false;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    if (dto.athleteProfile) {
      // Campos permitidos explicitamente — coachId/niche/userId NUNCA vêm do corpo da requisição
      const ap = dto.athleteProfile;
      const apData: Record<string, any> = {};
      for (const k of ['weight', 'height', 'vo2max', 'restingHR', 'maxHR', 'weeklyGoalKm', 'level'] as const) {
        if (ap[k] !== undefined) apData[k] = ap[k];
      }
      if (Object.keys(apData).length > 0) {
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (me?.role !== 'ATHLETE') {
          throw new BadRequestException('Somente atletas possuem perfil de atleta');
        }
        data.athleteProfile = { upsert: { create: apData, update: apData } };
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, email: true, name: true, role: true,
        avatarUrl: true, phone: true, athleteProfile: true,
      },
    });
  }

  /**
   * Escopo de atletas do painel: treinador → atribuídos a ele; OWNER/ADMIN/STAFF de equipe → todos da equipe.
   * (ADMIN da plataforma aqui é tratado como treinador — a visão global fica no painel admin.)
   */
  private teamAthleteScope(coachId: string) {
    return athleteProfileScopeWhere(this.prisma, { id: coachId, role: 'COACH' });
  }

  async getCoachAthletes(coachId: string, page = 1, limit = 20, q?: string) {
    const skip = (page - 1) * limit;
    const scope = await this.teamAthleteScope(coachId);
    const term = q?.trim();
    const where = term
      ? {
          AND: [
            scope,
            {
              user: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { email: { contains: term, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : scope;
    const [athletes, total] = await Promise.all([
      this.prisma.athleteProfile.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          coach: { select: { id: true, name: true } },
        },
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.athleteProfile.count({ where }),
    ]);

    // A4: STAFF (apoio) não recebe peso/altura/FC/VO2max — seleção de campos pelo papel na equipe
    const data = await redactHealthFields(this.prisma, { id: coachId, role: 'COACH' }, athletes);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Perfil do atleta para o painel do treinador (acesso pelo vínculo atual: treinador atribuído / equipe). */
  async getAthleteForCoach(user: { id: string; role?: string | null }, athleteId: string) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
    const athlete = await this.prisma.user.findUnique({
      where: { id: athleteId },
      select: {
        id: true, name: true, email: true, phone: true, avatarUrl: true, createdAt: true, dateOfBirth: true,
        athleteProfile: {
          select: {
            level: true, weight: true, height: true, vo2max: true, restingHR: true, maxHR: true, weeklyGoalKm: true,
            coachId: true, teamId: true, coach: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!athlete) throw new NotFoundException('Atleta não encontrado');
    // STAFF (apoio) não recebe dados de saúde
    if (athlete.athleteProfile) {
      const [profile] = await redactHealthFields(this.prisma, user as any, [athlete.athleteProfile]);
      return { ...athlete, athleteProfile: profile };
    }
    return athlete;
  }

  /**
   * Coach adiciona atleta por e-mail. NUNCA altera o vínculo (coachId) de uma conta existente:
   * sempre gera um convite pendente que o próprio atleta precisa aceitar (logado com esse e-mail).
   */
  async addAthleteByEmail(coachId: string, email: string) {
    const normalized = (email ?? '').trim().toLowerCase();
    const targetUser = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true, role: true, athleteProfile: { select: { coachId: true } } },
    });
    if (targetUser && targetUser.role !== 'ATHLETE') {
      throw new BadRequestException('Este e-mail pertence a uma conta que não é de atleta');
    }
    if (targetUser?.athleteProfile?.coachId === coachId) {
      throw new ConflictException('Este atleta já está na sua equipe');
    }
    // Ao aceitar o convite o atleta entra na equipe padrão de quem convidou (ver InvitesService)

    const invite = await this.invites.createInvite(coachId, { email: normalized });
    return {
      success: true,
      invited: true,
      message: 'Convite enviado. O atleta entrará na sua equipe após aceitar o convite.',
      invite: { id: invite.id, email: invite.email, status: invite.status, expiresAt: invite.expiresAt },
    };
  }

  async getCoachAlerts(coachId: string) {
    // Athletes who missed workouts in the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const missedWorkouts = await this.prisma.workout.findMany({
      where: {
        status: { in: ['MISSED', 'SKIPPED'] as any },
        scheduledDate: { gte: since },
        athlete: { athleteProfile: await this.teamAthleteScope(coachId) },
      },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    // Group by athlete and count consecutive misses
    const alertMap = new Map<string, { name: string; avatarUrl: string | null; count: number; lastDate: Date }>();
    for (const w of missedWorkouts) {
      const existing = alertMap.get(w.athleteId);
      if (existing) {
        existing.count++;
      } else {
        alertMap.set(w.athleteId, {
          name: w.athlete.name,
          avatarUrl: w.athlete.avatarUrl,
          count: 1,
          lastDate: w.scheduledDate,
        });
      }
    }

    return Array.from(alertMap.entries()).map(([athleteId, data]) => ({
      athleteId,
      name: data.name,
      avatarUrl: data.avatarUrl,
      missedCount: data.count,
      lastMissedDate: data.lastDate,
    }));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Senha atual incorreta');

    assertPasswordPolicy(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Incrementa tokenVersion → revoga todas as sessões (inclusive a atual)
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.cache.del(`user:${userId}`).catch(() => {});
    return { message: 'Senha alterada com sucesso. Faça login novamente.', reauthRequired: true };
  }

  async deleteAccount(userId: string): Promise<{ deleted: true }> {
    // Soft-delete: anonimiza dados pessoais, mantém registros históricos
    const anonymizedEmail = `deleted_${userId}@anonymized.local`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        name: 'Conta Excluída',
        phone: null,
        avatarUrl: null,
        passwordHash: 'DELETED',
        deletedAt: new Date(),
        isActive: false,
      },
    });
    // Invalidar cache
    await this.cache.del(`user:${userId}`);
    return { deleted: true };
  }

  async exportMyData(userId: string): Promise<Record<string, any>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        athleteProfile: true,
        coachProfile: true,
        integrations: { select: { provider: true, isActive: true, createdAt: true } },
        subscriptions: { select: { status: true, planType: true, currentPeriodEnd: true, createdAt: true } },
        notifications: { take: 50, orderBy: { createdAt: 'desc' }, select: { title: true, body: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Remove sensitive fields
    const { passwordHash, aiApiKey, appleId, ...safeUser } = user as any;

    return {
      exportedAt: new Date().toISOString(),
      requestedBy: userId,
      data: safeUser,
    };
  }

  async getCoachStats(coachId: string) {
    const cacheKey = `coach_stats:${coachId}`;
    const cached = await this.cache.get<{ totalAthletes: number; alertCount: number; adherencePercent: number }>(cacheKey);
    if (cached) return cached;

    const athletes = await this.prisma.athleteProfile.findMany({ where: await this.teamAthleteScope(coachId) });
    const athleteIds = athletes.map(a => a.userId);

    if (athleteIds.length === 0) return { totalAthletes: 0, alertCount: 0, adherencePercent: 0 };

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [scheduled, completed, missed] = await Promise.all([
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart } },
      }),
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart }, status: 'COMPLETED' },
      }),
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart }, status: { in: ['MISSED', 'SKIPPED'] as any } },
      }),
    ]);

    const stats = {
      totalAthletes: athleteIds.length,
      alertCount: missed,
      adherencePercent: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
    };

    await this.cache.set(cacheKey, stats, 2 * 60); // 2 minutes TTL
    return stats;
  }
}
