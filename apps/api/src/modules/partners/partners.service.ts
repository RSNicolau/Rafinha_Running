import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUserLike, canManageCoachContent, coachIdsWhere, managedCoachIds, teamContentCoachIds } from '../../common/utils/ownership';

type ActorArg = string | AuthUserLike;
const toActor = (a: ActorArg): AuthUserLike => (typeof a === 'string' ? { id: a, role: 'COACH' } : a);

export interface PartnerDto {
  name: string;
  category?: string;
  description?: string;
  logoUrl?: string;
  emoji?: string;
  color?: string;
  linkUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  // Atleta: parceiros ativos da equipe (ou do próprio coach, se o atleta não tiver equipe)
  async getForAthlete(athleteId: string) {
    const athleteProfile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
    });
    if (!athleteProfile?.coachId && !athleteProfile?.teamId) return [];
    const coachIds = athleteProfile.teamId
      ? await teamContentCoachIds(this.prisma, athleteProfile.teamId)
      : [athleteProfile.coachId as string];

    return this.prisma.partner.findMany({
      where: { ...coachIdsWhere(coachIds.length ? coachIds : [athleteProfile.coachId ?? '']), isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Público: parceiros ativos por slug/id da EQUIPE (todos os treinadores) ou do treinador (landing/site do evento)
  async getPublic(coachSlugOrId: string) {
    const coachIds = await this.publicCoachIds(coachSlugOrId);
    return this.prisma.partner.findMany({
      where: { ...coachIdsWhere(coachIds), isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async publicCoachIds(slugOrId: string): Promise<string[]> {
    const team = (this.prisma as any).team?.findFirst
      ? await this.prisma.team.findFirst({ where: { slug: slugOrId, status: 'ACTIVE' }, select: { id: true, ownerId: true } })
      : null;
    if (team) {
      const ids = await teamContentCoachIds(this.prisma, team.id);
      return ids.length ? ids : [team.ownerId];
    }
    const bySlug = await this.prisma.coachProfile.findFirst({ where: { slug: slugOrId } });
    if (bySlug) return [bySlug.userId];
    return [slugOrId];
  }

  // Coach: lista completa (inclui inativos). Gestão da equipe vê os parceiros de todos os treinadores.
  async getForCoach(actorArg: ActorArg) {
    return this.prisma.partner.findMany({
      where: coachIdsWhere(await managedCoachIds(this.prisma, toActor(actorArg))),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(coachId: string, dto: PartnerDto) {
    if (!dto.name?.trim()) throw new ForbiddenException('Nome do parceiro é obrigatório');
    return this.prisma.partner.create({
      data: {
        coachId,
        name: dto.name.trim(),
        category: dto.category,
        description: dto.description,
        logoUrl: dto.logoUrl,
        emoji: dto.emoji,
        color: dto.color,
        linkUrl: dto.linkUrl,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, actorArg: ActorArg, dto: Partial<PartnerDto>) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    if (!(await canManageCoachContent(this.prisma, toActor(actorArg), partner.coachId))) throw new ForbiddenException('Sem permissão');

    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.emoji !== undefined ? { emoji: dto.emoji } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string, actorArg: ActorArg) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    if (!(await canManageCoachContent(this.prisma, toActor(actorArg), partner.coachId))) throw new ForbiddenException('Sem permissão');

    await this.prisma.partner.delete({ where: { id } });
    return { deleted: true };
  }
}
