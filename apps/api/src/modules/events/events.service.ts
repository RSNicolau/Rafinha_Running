import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventStatus, EventRegistrationStatus, KitType, Prisma } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async listPublished(filters: {
    city?: string;
    modality?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      status: { in: [EventStatus.PUBLISHED, EventStatus.SOLD_OUT] },
    };

    if (filters.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters.modality) {
      where.modality = { contains: filters.modality, mode: 'insensitive' };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.eventDate = {};
      if (filters.dateFrom) where.eventDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.eventDate.lte = new Date(filters.dateTo);
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { registrations: { where: { status: { not: EventRegistrationStatus.CANCELED } } } } },
        },
        orderBy: { eventDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events.map((event) => ({
        ...event,
        registrationCount: event._count.registrations,
        _count: undefined,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: {
          select: {
            registrations: {
              where: { status: { not: EventRegistrationStatus.CANCELED } },
            },
          },
        },
      },
    });

    if (!event) throw new NotFoundException('Evento nao encontrado');

    return {
      ...event,
      registrationCount: event._count.registrations,
      _count: undefined,
    };
  }

  async create(createdById: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        createdById,
        title: dto.title,
        description: dto.description,
        coverImageUrl: dto.coverImageUrl,
        eventDate: new Date(dto.eventDate),
        eventEndDate: dto.eventEndDate ? new Date(dto.eventEndDate) : undefined,
        location: dto.location,
        city: dto.city,
        state: dto.state,
        modality: dto.modality,
        maxParticipants: dto.maxParticipants,
        price: dto.price ?? 0,
        status: dto.status ?? EventStatus.DRAFT,
        tags: dto.tags ?? [],
        rules: dto.rules,
        kitDescription: dto.kitDescription,
        routeMapUrl: dto.routeMapUrl,
      },
    });
  }

  async update(eventId: string, userId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento nao encontrado');
    if (event.createdById !== userId) throw new ForbiddenException('Apenas o criador pode editar este evento');

    const data: Prisma.EventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.eventDate !== undefined) data.eventDate = new Date(dto.eventDate);
    if (dto.eventEndDate !== undefined) data.eventEndDate = new Date(dto.eventEndDate);
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.modality !== undefined) data.modality = dto.modality;
    if (dto.maxParticipants !== undefined) data.maxParticipants = dto.maxParticipants;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.rules !== undefined) data.rules = dto.rules;
    if (dto.kitDescription !== undefined) data.kitDescription = dto.kitDescription;
    if (dto.routeMapUrl !== undefined) data.routeMapUrl = dto.routeMapUrl;

    return this.prisma.event.update({ where: { id: eventId }, data });
  }

  async register(eventId: string, userId: string, extra?: { shirtSize?: string; kitType?: KitType; emergencyContact?: string; medicalInfo?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        include: {
          _count: {
            select: {
              registrations: { where: { status: { not: EventRegistrationStatus.CANCELED } } },
            },
          },
        },
      });

      if (!event) throw new NotFoundException('Evento nao encontrado');
      if (event.status === EventStatus.CANCELED) throw new BadRequestException('Este evento foi cancelado');
      if (event.status === EventStatus.COMPLETED) throw new BadRequestException('Este evento ja foi encerrado');
      if (event.status === EventStatus.DRAFT) throw new BadRequestException('Este evento ainda nao esta publicado');

      const existing = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existing && existing.status !== EventRegistrationStatus.CANCELED) {
        throw new ConflictException('Voce ja esta inscrito neste evento');
      }

      // Re-count inside transaction for accurate capacity check
      const currentCount = await tx.eventRegistration.count({
        where: { eventId, status: { not: EventRegistrationStatus.CANCELED } },
      });

      let status: EventRegistrationStatus = EventRegistrationStatus.CONFIRMED;
      if (event.maxParticipants && currentCount >= event.maxParticipants) {
        status = EventRegistrationStatus.WAITLIST;
      }

      // Auto-generate bib number
      const bibCount = await tx.eventRegistration.count({ where: { eventId, status: { not: EventRegistrationStatus.CANCELED } } });
      const bibNumber = String(bibCount + 1).padStart(4, '0');

      // Schedule kit pickup = event's kitPickupDate (or null)
      const kitPickupScheduledAt = event.kitPickupDate ?? null;

      let registration;
      if (existing && existing.status === EventRegistrationStatus.CANCELED) {
        registration = await tx.eventRegistration.update({
          where: { id: existing.id },
          data: {
            status,
            registeredAt: new Date(),
            confirmedAt: status === EventRegistrationStatus.CONFIRMED ? new Date() : null,
            shirtSize: extra?.shirtSize,
            kitType: extra?.kitType,
            kitPickupScheduledAt,
            bibNumber,
            emergencyContact: extra?.emergencyContact,
            medicalInfo: extra?.medicalInfo,
          },
        });
      } else {
        registration = await tx.eventRegistration.create({
          data: {
            eventId,
            userId,
            status,
            confirmedAt: status === EventRegistrationStatus.CONFIRMED ? new Date() : undefined,
            shirtSize: extra?.shirtSize,
            kitType: extra?.kitType,
            kitPickupScheduledAt,
            bibNumber,
            emergencyContact: extra?.emergencyContact,
            medicalInfo: extra?.medicalInfo,
          },
        });
      }

      // Update event to SOLD_OUT if capacity reached
      if (event.maxParticipants && currentCount + 1 >= event.maxParticipants && event.status === EventStatus.PUBLISHED) {
        await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.SOLD_OUT } });
      }

      return registration;
    });
  }

  async cancelRegistration(eventId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const registration = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (!registration) throw new NotFoundException('Inscricao nao encontrada');
      if (registration.status === EventRegistrationStatus.CANCELED) {
        throw new BadRequestException('Inscricao ja esta cancelada');
      }

      const updated = await tx.eventRegistration.update({
        where: { id: registration.id },
        data: { status: EventRegistrationStatus.CANCELED },
      });

      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (event && event.maxParticipants) {
        // Promote first waitlist entry atomically inside transaction
        const nextInWaitlist = await tx.eventRegistration.findFirst({
          where: { eventId, status: EventRegistrationStatus.WAITLIST },
          orderBy: { registeredAt: 'asc' },
        });

        if (nextInWaitlist) {
          await tx.eventRegistration.update({
            where: { id: nextInWaitlist.id },
            data: { status: EventRegistrationStatus.CONFIRMED, confirmedAt: new Date() },
          });
        }

        // Revert SOLD_OUT if space opened up
        if (event.status === EventStatus.SOLD_OUT) {
          const activeCount = await tx.eventRegistration.count({
            where: { eventId, status: { not: EventRegistrationStatus.CANCELED } },
          });
          if (activeCount < event.maxParticipants) {
            await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.PUBLISHED } });
          }
        }
      }

      return updated;
    });
  }

  async getRegistrations(eventId: string, userId: string, page = 1, limit = 50) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento nao encontrado');
    if (event.createdById !== userId) throw new ForbiddenException('Apenas o criador pode ver as inscricoes');

    const skip = (page - 1) * limit;

    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { eventId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } } },
        orderBy: { registeredAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.eventRegistration.count({ where: { eventId } }),
    ]);

    return { data: registrations, total, page, totalPages: Math.ceil(total / limit) };
  }

  async checkin(eventId: string, userId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (!registration) throw new NotFoundException('Você não está inscrito neste evento');
    if (registration.status === EventRegistrationStatus.CANCELED) {
      throw new BadRequestException('Sua inscrição está cancelada');
    }
    if (registration.status === EventRegistrationStatus.CHECKED_IN) {
      throw new ConflictException('Check-in já realizado');
    }

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    // Allow check-in ±1 hour from event start
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - event.eventDate.getTime());
    const oneHour = 60 * 60 * 1000;
    if (diffMs > oneHour) {
      throw new BadRequestException(
        'Check-in disponível apenas 1 hora antes ou após o início do evento',
      );
    }

    return this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: EventRegistrationStatus.CHECKED_IN,
        checkinAt: new Date(),
      },
    });
  }

  async getAttendees(eventId: string, requesterId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.createdById !== requesterId) throw new ForbiddenException('Apenas o criador pode ver a lista de presença');

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: { not: EventRegistrationStatus.CANCELED } },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } } },
      orderBy: { registeredAt: 'asc' },
    });

    const counts = {
      total: registrations.length,
      checkedIn: registrations.filter((r) => r.status === EventRegistrationStatus.CHECKED_IN).length,
      registered: registrations.filter(
        (r) => r.status === EventRegistrationStatus.CONFIRMED || r.status === EventRegistrationStatus.PENDING,
      ).length,
      absent: registrations.filter((r) => r.status === EventRegistrationStatus.ABSENT).length,
    };

    return { registrations, counts };
  }

  async updateRegistrationStatus(
    eventId: string,
    registrationId: string,
    requesterId: string,
    status: EventRegistrationStatus,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.createdById !== requesterId) throw new ForbiddenException('Apenas o criador pode atualizar inscrições');

    const registration = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== eventId) throw new NotFoundException('Inscrição não encontrada');

    const data: any = { status };
    if (status === EventRegistrationStatus.CHECKED_IN && !registration.checkinAt) {
      data.checkinAt = new Date();
    }

    return this.prisma.eventRegistration.update({ where: { id: registrationId }, data });
  }

  async getMyRegistrations(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { userId, status: { not: EventRegistrationStatus.CANCELED } },
        include: {
          event: {
            include: {
              createdBy: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { registeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.eventRegistration.count({
        where: { userId, status: { not: EventRegistrationStatus.CANCELED } },
      }),
    ]);

    return { data: registrations, total, page, totalPages: Math.ceil(total / limit) };
  }
}
