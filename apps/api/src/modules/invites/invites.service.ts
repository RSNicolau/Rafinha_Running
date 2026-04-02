import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInviteDto, AcceptInviteDto } from './dto/invite.dto';

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  async createInvite(coachId: string, dto: CreateInviteDto) {
    // Check if invite already pending for this email+coach
    const existing = await this.prisma.coachInvite.findFirst({
      where: { coachId, email: dto.email, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException('Já existe um convite pendente para este email');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invite = await this.prisma.coachInvite.create({
      data: { coachId, email: dto.email, expiresAt },
      include: { coach: { select: { name: true, tenantBranding: true } } },
    });

    return invite;
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

    return {
      email: invite.email,
      coachName: invite.coach.name,
      tenantName: invite.coach.tenantBranding?.tenantName ?? invite.coach.name,
      primaryColor: invite.coach.tenantBranding?.primaryColor ?? '#DC2626',
      logoUrl: invite.coach.tenantBranding?.logoUrl ?? null,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.prisma.coachInvite.findUnique({
      where: { token: dto.token },
    });

    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Convite não está mais válido');
    }
    if (new Date() > invite.expiresAt) {
      await this.prisma.coachInvite.update({
        where: { token: dto.token },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Convite expirado');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existingUser) {
      // Link existing athlete to coach
      await this.prisma.$transaction([
        this.prisma.athleteProfile.upsert({
          where: { userId: existingUser.id },
          update: { coachId: invite.coachId },
          create: { userId: existingUser.id, coachId: invite.coachId },
        }),
        this.prisma.coachInvite.update({
          where: { token: dto.token },
          data: { status: 'ACCEPTED', acceptedAt: new Date(), athleteId: existingUser.id },
        }),
      ]);
      return { message: 'Conta vinculada ao treinador com sucesso', userId: existingUser.id };
    }

    // Create new athlete account
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          name: dto.name,
          passwordHash,
          role: 'ATHLETE',
        },
      });

      await tx.athleteProfile.create({
        data: { userId: user.id, coachId: invite.coachId },
      });

      await tx.coachInvite.update({
        where: { token: dto.token },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), athleteId: user.id },
      });

      return user;
    });

    return { message: 'Conta criada com sucesso', userId: result.id };
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
    });
  }
}
