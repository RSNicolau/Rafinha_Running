import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUserLike, canManageCoachContent, coachIdsWhere, managedCoachIds, teamContentCoachIds } from '../../common/utils/ownership';

type ActorArg = string | AuthUserLike;
const toActor = (a: ActorArg): AuthUserLike => (typeof a === 'string' ? { id: a, role: 'COACH' } : a);

@Injectable()
export class TestimonialsService {
  constructor(private prisma: PrismaService) {}

  async upsert(athleteId: string, dto: { coachId?: string; rating: number; text: string }) {
    // Validate rating
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Nota deve ser entre 1 e 5');
    }

    // Atleta só avalia o PRÓPRIO treinador (derivado do vínculo, não do corpo da requisição)
    const profile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
      select: { coachId: true },
    });
    if (!profile?.coachId) throw new BadRequestException('Você não está vinculado a um treinador');
    if (dto.coachId && dto.coachId !== profile.coachId) {
      throw new ForbiddenException('Você só pode avaliar o seu próprio treinador');
    }
    const coachId = profile.coachId;

    return this.prisma.testimonial.upsert({
      where: { athleteId_coachId: { athleteId, coachId } },
      create: {
        athleteId,
        coachId,
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
    // slug da EQUIPE → depoimentos de todos os treinadores; senão slug/id do treinador
    let coachIds: string[] = [coachSlugOrId];
    const team = (this.prisma as any).team?.findFirst
      ? await this.prisma.team.findFirst({ where: { slug: coachSlugOrId, status: 'ACTIVE' }, select: { id: true, ownerId: true } })
      : null;
    if (team) {
      const ids = await teamContentCoachIds(this.prisma, team.id);
      coachIds = ids.length ? ids : [team.ownerId];
    } else {
      const bySlug = await this.prisma.coachProfile.findFirst({
        where: { slug: coachSlugOrId },
      });
      if (bySlug) coachIds = [bySlug.userId];
    }

    return this.prisma.testimonial.findMany({
      where: { ...coachIdsWhere(coachIds), isFeatured: true },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCoachTestimonials(actorArg: ActorArg) {
    return this.prisma.testimonial.findMany({
      where: coachIdsWhere(await managedCoachIds(this.prisma, toActor(actorArg))),
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleFeatured(id: string, actorArg: ActorArg) {
    const testimonial = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!testimonial) throw new NotFoundException('Depoimento não encontrado');
    if (!(await canManageCoachContent(this.prisma, toActor(actorArg), testimonial.coachId))) throw new ForbiddenException('Sem permissão');

    return this.prisma.testimonial.update({
      where: { id },
      data: { isFeatured: !testimonial.isFeatured },
    });
  }
}
