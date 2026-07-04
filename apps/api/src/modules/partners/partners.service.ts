import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  // Atleta: parceiros ativos do próprio coach
  async getForAthlete(athleteId: string) {
    const athleteProfile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
    });
    if (!athleteProfile?.coachId) return [];

    return this.prisma.partner.findMany({
      where: { coachId: athleteProfile.coachId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Público: parceiros ativos de um coach por slug ou id (landing/site do evento)
  async getPublic(coachSlugOrId: string) {
    let coachId = coachSlugOrId;
    const bySlug = await this.prisma.coachProfile.findFirst({
      where: { slug: coachSlugOrId },
    });
    if (bySlug) coachId = bySlug.userId;

    return this.prisma.partner.findMany({
      where: { coachId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Coach: lista completa (inclui inativos)
  async getForCoach(coachId: string) {
    return this.prisma.partner.findMany({
      where: { coachId },
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

  async update(id: string, coachId: string, dto: Partial<PartnerDto>) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    if (partner.coachId !== coachId) throw new ForbiddenException('Sem permissão');

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

  async remove(id: string, coachId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    if (partner.coachId !== coachId) throw new ForbiddenException('Sem permissão');

    await this.prisma.partner.delete({ where: { id } });
    return { deleted: true };
  }
}
