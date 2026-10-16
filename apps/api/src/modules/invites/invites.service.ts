import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { emailEquals, normalizeEmail } from '../../common/utils/email';
import { LegalService, ConsentContext } from '../legal/legal.service';
import { CreateInviteDto, AcceptInviteDto } from './dto/invite.dto';
import { NotificationType } from '@prisma/client';
import { defaultTeamIdForUser } from '../teams/team-scope';
import { assertPasswordPolicy } from '../../common/validators/password-policy';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private legal: LegalService,
  ) {}

  /**
   * Cria convite pendente. O token NUNCA é retornado pela API (vai apenas por e-mail ao convidado);
   * exceção: NODE_ENV=test, para testes automatizados.
   */
  async createInvite(coachId: string, dto: CreateInviteDto) {
    const email = normalizeEmail(dto.email);
    // Check if invite already pending for this email+coach (insensitive: convites legados com maiúsculas)
    const existing = await this.prisma.coachInvite.findFirst({
      where: { coachId, email: emailEquals(email), status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException('Já existe um convite pendente para este email');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invite = await this.prisma.coachInvite.create({
      data: { coachId, email, expiresAt },
      include: { coach: { select: { name: true, tenantBranding: true } } },
    });

    // Send invite email (fire-and-forget, don't block response)
    this.emailService.sendAthleteInvite(
      email,
      invite.coach.name,
      invite.token,
      invite.coach.tenantBranding?.tenantName ?? undefined,
    ).catch(() => {});

    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      ...(process.env.NODE_ENV === 'test' ? { token: invite.token } : {}),
    };
  }

  async listInvites(coachId: string) {
    return this.prisma.coachInvite.findMany({
      where: { coachId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async getInviteByToken(token: string) {
    if (typeof token !== 'string' || !token.trim() || token.length > 512) {
      throw new BadRequestException('Token do convite é obrigatório');
    }
    const invite = await this.prisma.coachInvite.findUnique({
      where: { token },
      include: {
        coach: {
          select: {
            id: true,
            name: true,
            tenantBranding: {
              select: { tenantName: true, primaryColor: true, logoUrl: true },
            },
          },
        },
      },
    });

    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException(`Convite ${invite.status === 'ACCEPTED' ? 'já foi aceito' : 'não está mais válido'}`);
    }
    if (new Date() > invite.expiresAt) {
      await this.prisma.coachInvite.update({
        where: { token },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Convite expirado');
    }

    const existingAccount = !!(await this.prisma.user.findFirst({
      where: { email: { equals: invite.email, mode: 'insensitive' } },
      select: { id: true },
    }));

    // Equipe do treinador que convidou: a que ele é dono, senão a primeira equipe ativa dele
    const membership = await this.prisma.teamMember.findFirst({
      where: { userId: invite.coach.id, isActive: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { team: { select: { name: true, logoUrl: true, primaryColor: true } } },
    });
    const ownedTeam = await this.prisma.team.findFirst({
      where: { ownerId: invite.coach.id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, logoUrl: true, primaryColor: true },
    });
    const team = ownedTeam ?? membership?.team ?? null;

    return {
      email: invite.email,
      existingAccount,
      teamName: team?.name ?? null,
      teamLogoUrl: team?.logoUrl ?? null,
      teamPrimaryColor: team?.primaryColor ?? null,
      coachName: invite.coach.name,
      tenantName: invite.coach.tenantBranding?.tenantName ?? invite.coach.name,
      primaryColor: invite.coach.tenantBranding?.primaryColor ?? '#DC2626',
      logoUrl: invite.coach.tenantBranding?.logoUrl ?? null,
      expiresAt: invite.expiresAt,
    };
  }

  private async loadPendingInvite(token: string) {
    if (!token || typeof token !== 'string') throw new NotFoundException('Convite não encontrado');
    const invite = await this.prisma.coachInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Convite não está mais válido');
    }
    if (new Date() > invite.expiresAt) {
      await this.prisma.coachInvite.update({ where: { token }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Convite expirado');
    }
    return invite;
  }

  /**
   * Público: cria uma conta NOVA a partir do convite (token + senha) e registra o aceite LGPD.
   * Se o e-mail já tem conta, recusa — o atleta precisa fazer login e usar POST /invites/accept-existing.
   */
  async acceptInvite(dto: AcceptInviteDto, ctx: ConsentContext = {}) {
    this.legal.assertCurrentVersions(dto);
    const invite = await this.loadPendingInvite(dto.token);

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: invite.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'Já existe uma conta com este e-mail. Faça login com ela para aceitar o convite.',
      );
    }

    // Atleta entra na equipe padrão de quem convidou; o responsável (coachId) é quem convidou —
    // a gestão pode reatribuir depois (PATCH /teams/me/athletes/:id/coach).
    const teamId = await defaultTeamIdForUser(this.prisma, invite.coachId);

    // Create new athlete account
    assertPasswordPolicy(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizeEmail(invite.email),
          name: dto.name.trim(),
          passwordHash,
          role: 'ATHLETE',
        },
      });

      await tx.athleteProfile.create({
        data: { userId: user.id, coachId: invite.coachId, teamId },
      });

      await tx.coachInvite.update({
        where: { token: dto.token },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), athleteId: user.id },
      });

      await this.legal.recordConsent(
        user.id,
        {
          termsVersion: dto.termsVersion,
          privacyVersion: dto.privacyVersion,
          marketingOptIn: !!dto.marketingOptIn,
          ...(dto.healthDataConsent !== undefined && { healthDataConsent: dto.healthDataConsent }),
        },
        ctx,
        tx,
      );

      return user;
    });

    // Notify coach that new athlete joined
    this.notifications.createNotification(
      invite.coachId,
      NotificationType.PLAN_ASSIGNED,
      'Novo atleta na equipe',
      `${result.name} criou conta e está na sua lista de atletas.`,
      { athleteId: result.id },
    ).catch(() => {});

    return { message: 'Conta criada com sucesso', userId: result.id };
  }

  /**
   * Autenticado: o usuário logado aceita um convite endereçado ao SEU e-mail.
   * Só então o vínculo com o treinador (coachId) é alterado.
   */
  async acceptInviteAsExistingUser(user: { id: string; email?: string | null; role?: string }, token: string) {
    const invite = await this.loadPendingInvite(token);
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!me || !me.email || normalizeEmail(me.email) !== normalizeEmail(invite.email)) {
      throw new ForbiddenException('Este convite foi enviado para outro e-mail.');
    }
    if (me.role !== 'ATHLETE') {
      throw new BadRequestException('Somente contas de atleta podem aceitar convites de treinador.');
    }

    const teamId = await defaultTeamIdForUser(this.prisma, invite.coachId);
    await this.prisma.$transaction([
      this.prisma.athleteProfile.upsert({
        where: { userId: me.id },
        update: { coachId: invite.coachId, teamId },
        create: { userId: me.id, coachId: invite.coachId, teamId },
      }),
      this.prisma.coachInvite.update({
        where: { token },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), athleteId: me.id },
      }),
    ]);

    this.notifications.createNotification(
      invite.coachId,
      NotificationType.PLAN_ASSIGNED,
      'Atleta vinculado',
      `${me.name} aceitou seu convite e está na sua lista de atletas.`,
      { athleteId: me.id },
    ).catch(() => {});

    return { message: 'Conta vinculada ao treinador com sucesso', userId: me.id };
  }

  async cancelInvite(coachId: string, inviteId: string) {
    const invite = await this.prisma.coachInvite.findFirst({
      where: { id: inviteId, coachId },
    });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Só é possível cancelar convites pendentes');
    }

    return this.prisma.coachInvite.update({
      where: { id: inviteId },
      data: { status: 'CANCELLED' },
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
    });
  }
}
