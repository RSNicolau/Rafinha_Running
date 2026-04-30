import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TestimonialsService {
  constructor(private prisma: PrismaService) {}

  async upsert(athleteId: string, dto: { coachId: string; rating: number; text: string }) {
    // Validate rating
    if (dto.rating < 1 || dto.rating > 5) {
      throw new ForbiddenException('Rating deve ser entre 1 e 5');
    }

    return this.prisma.testimonial.upsert({
      where: { athleteId_coachId: { athleteId, coachId: dto.coachId } },
      create: {
        athleteId,
        coachId: dto.coachId,
        rating: dto.rating,
        text: dto.text,
      },
      update: {
        rating: dto.rating,
        text: dto.text,
      },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async getMyTestimonial(athleteId: string) {
    // Get the coach for this athlete
    const athleteProfile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
    });

    if (!athleteProfile?.coachId) {
      return null;
    }

    const testimonial = await this.prisma.testimonial.findUnique({
      where: { athleteId_coachId: { athleteId, coachId: athleteProfile.coachId } },
    });

    return testimonial;
  }

  async getFeatured(coachSlugOrId: string) {
    // Try by ID first, then by slug
    let coachId = coachSlugOrId;

    const bySlug = await this.prisma.coachProfile.findFirst({
      where: { slug: coachSlugOrId },
    });
    if (bySlug) {
      coachId = bySlug.userId;
    }

    return this.prisma.testimonial.findMany({
      where: { coachId, isFeatured: true },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCoachTestimonials(coachId: string) {
    return this.prisma.testimonial.findMany({
      where: { coachId },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleFeatured(id: string, coachId: string) {
    const testimonial = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!testimonial) throw new NotFoundException('Depoimento não encontrado');
    if (testimonial.coachId !== coachId) throw new ForbiddenException('Sem permissão');

    return this.prisma.testimonial.update({
      where: { id },
      data: { isFeatured: !testimonial.isFeatured },
    });
  }
}
