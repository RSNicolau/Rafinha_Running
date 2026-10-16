import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  EventStatus,
  EventRegistrationStatus,
  KitType,
  PaymentStatus,
  PaymentPurpose,
  Prisma,
  UserRole,
  NotificationType,
} from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import {
  FulfillmentService,
  CHECKOUT_TTL_MS,
  OCCUPYING_STATUSES,
} from '../payments/checkout/fulfillment.service';
import { CheckoutService } from '../payments/checkout/checkout.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateDistanceDto,
  CreateEventCouponDto,
  DistanceDto,
  RegisterEventDto,
  RegistrationsQueryDto,
  UpdateEventCouponDto,
} from './dto/event-management.dto';
import { fmtBrl, toCsv } from '../store/csv.util';
import {
  assertCanCreateTeamContent, canManageCoachContent, canPublishTeamContent, ContentTeamCtx, teamContentWhere,
} from '../../common/utils/ownership';

/** `team` = equipe ativa (TeamActorInterceptor) — escopo de eventos/inscrições é o da equipe ativa. */
type Actor = { id: string; role?: UserRole | string | null; team?: ContentTeamCtx };

/** Check-in liberado a partir de 24 h antes do início da prova (o organizador pode forçar). */
export const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;
const isAdmin = (role?: string | null) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

/** Prefixo do QR Code da inscrição (lido no /kit-entrega e no check-in). */
export const REG_QR_PREFIX = 'RRKIT:';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REG_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  WAITLIST: 'Lista de espera',
  CHECKED_IN: 'Presente',
  ABSENT: 'Ausente',
};
const PAY_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SUCCEEDED: 'Pago',
  FAILED: 'Não pago',
  REFUNDED: 'Estornado',
};

/**
 * Preço da inscrição (centavos) — regra única, sempre no servidor:
 *   base  = preço do percurso escolhido (se > 0) senão preço do evento
 *   kit   = adicional do kit escolhido (COMPLETO: kitCompletePrice, PREMIUM: kitPremiumPrice; null = 0)
 *   total = base + kit, e o cupom incide sobre o total.
 */
export function computeRegistrationPrice(
  event: { price: number; kitCompletePrice: number | null; kitPremiumPrice: number | null },
  distance: { price: number } | null,
  kitType: KitType | null | undefined,
) {
  const base = distance && distance.price > 0 ? distance.price : event.price;
  const kit =
    kitType === KitType.PREMIUM ? event.kitPremiumPrice ?? 0 : kitType === KitType.COMPLETO ? event.kitCompletePrice ?? 0 : 0;
  return { base, kit, subtotal: base + kit };
}

/** Extrai o id da inscrição de "RRKIT:<uuid>" ou de um uuid puro. */
export function parseRegistrationCode(code: string): string | null {
  const c = code.trim();
  const raw = c.toUpperCase().startsWith(REG_QR_PREFIX) ? c.slice(REG_QR_PREFIX.length) : c;
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private fulfillment: FulfillmentService,
    private checkout: CheckoutService,
    private notifications: NotificationsService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  // Permissões
  // ════════════════════════════════════════════════════════════════════════

  /** Criador do evento, gestão (OWNER/ADMIN) da equipe do criador, ou ADMIN/SUPER_ADMIN. */
  async assertCanManage(eventId: string, actor: Actor | string) {
    const a: Actor = typeof actor === 'string' ? { id: actor } : actor;
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.createdById !== a.id && !isAdmin(a.role) && !(await canManageCoachContent(this.prisma, a, event.createdById, a.team))) {
      throw new ForbiddenException('Apenas o organizador do evento pode gerenciá-lo');
    }
    return event;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Eventos
  // ════════════════════════════════════════════════════════════════════════

  async listPublished(filters: {
    city?: string;
    modality?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.EventWhereInput = {
      status: { in: [EventStatus.PUBLISHED, EventStatus.SOLD_OUT] },
    };
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.modality) where.modality = { contains: filters.modality, mode: 'insensitive' };
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
          _count: { select: { registrations: { where: this.occupyingWhere(now) } } },
        },
        orderBy: { eventDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events.map((event) => ({ ...event, registrationCount: event._count.registrations, _count: undefined })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  private occupyingWhere(now: Date): Prisma.EventRegistrationWhereInput {
    return {
      OR: [
        { status: { in: OCCUPYING_STATUSES } },
        { status: EventRegistrationStatus.PENDING, OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: now } }] },
      ],
    };
  }

  /** Detalhe público — rascunhos só aparecem para quem pode gerenciar. */
  async findById(id: string, actor?: Actor | null) {
    const now = new Date();
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { registrations: { where: this.occupyingWhere(now) } } },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    const canManage = !!actor && (
      event.createdById === actor.id || isAdmin(actor.role) || (await canManageCoachContent(this.prisma, actor, event.createdById, actor.team))
    );
    if (event.status === EventStatus.DRAFT && !canManage) throw new NotFoundException('Evento não encontrado');

    return {
      ...event,
      registrationCount: event._count.registrations,
      spotsLeft: event.maxParticipants ? Math.max(0, event.maxParticipants - event._count.registrations) : null,
      // compatibilidade com telas que leem _count.registrations
      _count: { registrations: event._count.registrations },
      canManage,
    };
  }

  /** Eventos que o coach gerencia (todos os status) com contadores. */
  async listManaged(actor: Actor, q: { status?: EventStatus; search?: string } = {}) {
    const where: Prisma.EventWhereInput = await teamContentWhere(this.prisma, actor, actor.team, 'createdById');
    if (q.status) where.status = q.status;
    if (q.search) where.title = { contains: q.search, mode: 'insensitive' };
    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'desc' },
      take: 200,
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!events.length) return [];
    const ids = events.map((e) => e.id);
    const now = new Date();
    const [byStatus, revenue] = await Promise.all([
      this.prisma.eventRegistration.groupBy({
        by: ['eventId', 'status'],
        where: { eventId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['eventId'],
        where: { eventId: { in: ids }, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: EventRegistrationStatus.CANCELED } },
        _sum: { finalPrice: true },
      }),
    ]);
    return events.map((e) => {
      const counts: Record<string, number> = {};
      for (const r of byStatus.filter((x) => x.eventId === e.id)) counts[r.status] = r._count._all;
      const confirmed = (counts.CONFIRMED ?? 0) + (counts.CHECKED_IN ?? 0) + (counts.ABSENT ?? 0);
      return {
        ...e,
        counts: {
          confirmed,
          pending: counts.PENDING ?? 0,
          waitlist: counts.WAITLIST ?? 0,
          checkedIn: counts.CHECKED_IN ?? 0,
          canceled: counts.CANCELED ?? 0,
        },
        registrationCount: confirmed + (counts.PENDING ?? 0),
        revenueInCents: revenue.find((r) => r.eventId === e.id)?._sum.finalPrice ?? 0,
        isPast: e.eventDate.getTime() < now.getTime(),
      };
    });
  }

  async create(createdById: string, dto: CreateEventDto, actor?: Actor) {
    // M10: STAFF não cria; COACH cria só como rascunho (dono/gestor publica); só na equipe principal do autor
    const { canPublish } = await assertCanCreateTeamContent(this.prisma, actor ?? { id: createdById, role: 'COACH' }, actor?.team);
    const wantsPublic = !!dto.status && dto.status !== EventStatus.DRAFT;
    if (wantsPublic && !canPublish) {
      throw new ForbiddenException('Treinadores criam eventos como rascunho — o dono ou um gestor da equipe publica');
    }
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
        kitCompletePrice: dto.kitCompletePrice,
        kitPremiumPrice: dto.kitPremiumPrice,
        kitPickupLocation: dto.kitPickupLocation,
        kitPickupDate: dto.kitPickupDate ? new Date(dto.kitPickupDate) : undefined,
        routeMapUrl: dto.routeMapUrl,
        latitude: dto.latitude,
        longitude: dto.longitude,
        meetingPoint: dto.meetingPoint,
        meetingPointLat: dto.meetingPointLat,
        meetingPointLng: dto.meetingPointLng,
      },
    });
  }

  async update(eventId: string, actor: Actor | string, dto: UpdateEventDto) {
    const event = await this.assertCanManage(eventId, actor);
    const a: Actor = typeof actor === 'string' ? { id: actor } : actor;
    const publishing =
      (dto.status === EventStatus.PUBLISHED || dto.status === EventStatus.SOLD_OUT) &&
      event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.SOLD_OUT;
    if (publishing && !isAdmin(a.role) && !canPublishTeamContent(a, a.team)) {
      throw new ForbiddenException('Somente o dono ou um gestor da equipe publica eventos');
    }

    const data: Prisma.EventUpdateInput = {};
    const assign = <K extends keyof UpdateEventDto>(k: K, transform?: (v: any) => any) => {
      if (dto[k] !== undefined) (data as any)[k] = transform ? transform(dto[k]) : dto[k];
    };
    assign('title');
    assign('description');
    assign('coverImageUrl');
    assign('eventDate', (v) => new Date(v));
    assign('eventEndDate', (v) => (v ? new Date(v) : null));
    assign('location');
    assign('city');
    assign('state');
    assign('modality');
    assign('maxParticipants');
    assign('price');
    assign('status');
    assign('tags');
    assign('rules');
    assign('kitDescription');
    assign('kitCompletePrice');
    assign('kitPremiumPrice');
    assign('kitPickupLocation');
    assign('kitPickupDate', (v) => (v ? new Date(v) : null));
    assign('routeMapUrl');
    assign('latitude');
    assign('longitude');
    assign('meetingPoint');
    assign('meetingPointLat');
    assign('meetingPointLng');

    const cancelling = dto.status === EventStatus.CANCELED && event.status !== EventStatus.CANCELED;
    if (!cancelling) {
      const updated = await this.prisma.event.update({ where: { id: eventId }, data });
      // B7: republicar evento lotado (ou mudar vagas) recalcula PUBLISHED ↔ SOLD_OUT
      if (dto.maxParticipants !== undefined || dto.status === EventStatus.PUBLISHED) {
        await this.prisma.$transaction((tx) => this.fulfillment.refreshSoldOut(tx, eventId));
        return (await this.prisma.event.findUnique({ where: { id: eventId } })) ?? updated;
      }
      return updated;
    }

    // Cancelamento do evento: inscrições aguardando pagamento são liberadas e as cobranças canceladas.
    // Inscrições pagas permanecem para o organizador decidir estorno (ação REFUND por inscrição).
    const closed: Array<{ provider: string; externalPaymentId: string | null }> = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      const ev = await tx.event.update({ where: { id: eventId }, data });
      const pending = await tx.eventRegistration.findMany({
        where: { eventId, status: { in: [EventRegistrationStatus.PENDING, EventRegistrationStatus.WAITLIST] } },
        select: { id: true },
      });
      for (const r of pending) {
        const rel = await this.fulfillment.releaseEventRegistration(tx, r.id, { failureReason: 'EVENT_CANCELED' });
        if (rel) closed.push(...rel.closedPayments);
      }
      return ev;
    });
    await this.checkout.cancelAtGateway(closed);
    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Inscrição
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Inscrição atômica (lock na linha do evento):
   *  - vagas = confirmadas + pendentes não expiradas; lotado → lista de espera
   *  - preço calculado no servidor (percurso/kit) e cupom resgatado com limite atômico
   *  - total 0 (gratuito/cortesia) → CONFIRMED na hora com número de peito
   *  - total > 0 → PENDING por 30 min aguardando o checkout (POST /checkout)
   */
  async register(eventId: string, userId: string, dto: RegisterEventDto = {}) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.fulfillment.lockEvent(tx, eventId);
      const event = await tx.event.findUnique({ where: { id: eventId } });

      if (!event) throw new NotFoundException('Evento não encontrado');
      if (event.status === EventStatus.CANCELED) throw new BadRequestException('Este evento foi cancelado');
      if (event.status === EventStatus.COMPLETED) throw new BadRequestException('Este evento já foi encerrado');
      if (event.status === EventStatus.DRAFT) throw new BadRequestException('Este evento ainda não está publicado');
      if (event.eventDate.getTime() < now.getTime() - 6 * 60 * 60 * 1000) {
        throw new BadRequestException('As inscrições para este evento estão encerradas');
      }

      const existing = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
      if (existing && existing.status !== EventRegistrationStatus.CANCELED) {
        const pendingValid =
          existing.status === EventRegistrationStatus.PENDING &&
          (!existing.paymentExpiresAt || existing.paymentExpiresAt.getTime() > now.getTime());
        if (pendingValid) {
          // idempotente: devolve a inscrição pendente para o atleta concluir o pagamento
          return { registration: existing, requiresPayment: (existing.finalPrice ?? 0) > 0, amountInCents: existing.finalPrice ?? 0, resumed: true };
        }
        throw new ConflictException('Você já está inscrito neste evento');
      }

      // Percurso
      let distance: { id: string; price: number; maxParticipants: number | null; registeredCount: number } | null = null;
      const activeDistances = await tx.eventDistance.count({ where: { eventId, isActive: true } });
      if (dto.distanceId) {
        const d = await tx.eventDistance.findUnique({ where: { id: dto.distanceId } });
        if (!d || d.eventId !== eventId || !d.isActive) throw new BadRequestException('Percurso inválido para este evento');
        distance = d;
      } else if (activeDistances > 0) {
        throw new BadRequestException('Escolha um percurso');
      }

      // Kit
      const hasKits = event.kitCompletePrice !== null || event.kitPremiumPrice !== null;
      const kitType = dto.kitType ?? (hasKits ? KitType.COMPLETO : null);
      if (kitType === KitType.PREMIUM && event.kitPremiumPrice === null) {
        throw new BadRequestException('Kit Premium não disponível neste evento');
      }

      const occupying = await this.fulfillment.countOccupying(tx, eventId, now);
      const eventFull = !!event.maxParticipants && occupying >= event.maxParticipants;
      if (!eventFull && distance && distance.maxParticipants !== null && distance.registeredCount >= distance.maxParticipants) {
        throw new BadRequestException('Este percurso está com vagas esgotadas');
      }

      const price = computeRegistrationPrice(event, distance, kitType);

      // Lista de espera (sem cupom e sem cobrança até a vaga abrir)
      if (eventFull) {
        const data = {
          status: EventRegistrationStatus.WAITLIST,
          paymentStatus: PaymentStatus.PENDING,
          registeredAt: now,
          confirmedAt: null,
          paymentExpiresAt: null,
          shirtSize: dto.shirtSize,
          kitType,
          emergencyContact: dto.emergencyContact,
          medicalInfo: dto.medicalInfo,
          couponId: null,
          finalPrice: price.subtotal,
          distanceId: distance?.id ?? null,
          bibNumber: existing?.bibNumber ?? null,
        };
        const registration = existing
          ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
          : await tx.eventRegistration.create({ data: { ...data, eventId, userId } });
        if (event.status === EventStatus.PUBLISHED) {
          await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.SOLD_OUT } });
        }
        return { registration, requiresPayment: false, amountInCents: price.subtotal, waitlisted: true };
      }

      // Cupom (código ou id), validade + limite atômico
      let couponId: string | null = null;
      let discount = 0;
      if (dto.couponCode?.trim() || dto.couponId) {
        const coupon = dto.couponCode?.trim()
          ? await tx.eventCoupon.findUnique({ where: { eventId_code: { eventId, code: dto.couponCode.toUpperCase().trim() } } })
          : await tx.eventCoupon.findUnique({ where: { id: dto.couponId! } });
        if (coupon && coupon.eventId !== eventId) throw new BadRequestException('Cupom inválido para este evento');
        const problem = FulfillmentService.couponProblem(coupon, now);
        if (problem) throw new BadRequestException(problem);
        if (!(await this.fulfillment.redeemEventCoupon(tx, coupon!, now))) {
          throw new BadRequestException('Cupom atingiu o limite de usos');
        }
        couponId = coupon!.id;
        discount = FulfillmentService.couponDiscount(coupon!.type, coupon!.value, price.subtotal);
      }
      const finalPrice = Math.max(0, price.subtotal - discount);
      const free = finalPrice === 0;

      const bibNumber = free ? existing?.bibNumber ?? (await this.fulfillment.assignBib(tx, eventId)) : existing?.bibNumber ?? null;
      const data = {
        status: free ? EventRegistrationStatus.CONFIRMED : EventRegistrationStatus.PENDING,
        paymentStatus: free ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
        registeredAt: now,
        confirmedAt: free ? now : null,
        paymentExpiresAt: free ? null : new Date(now.getTime() + CHECKOUT_TTL_MS),
        shirtSize: dto.shirtSize,
        kitType,
        kitPickupScheduledAt: event.kitPickupDate ?? null,
        emergencyContact: dto.emergencyContact,
        medicalInfo: dto.medicalInfo,
        couponId,
        finalPrice,
        distanceId: distance?.id ?? null,
        bibNumber,
        kitDeliveredAt: null,
        kitDeliveredBy: null,
        kitPickupConfirmed: false,
        checkinAt: null,
      };
      const registration = existing
        ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
        : await tx.eventRegistration.create({ data: { ...data, eventId, userId } });

      if (couponId) {
        await tx.eventCouponUse.deleteMany({ where: { registrationId: registration.id } });
        await tx.eventCouponUse.create({ data: { couponId, registrationId: registration.id } });
      }
      if (distance) {
        await tx.eventDistance.update({ where: { id: distance.id }, data: { registeredCount: { increment: 1 } } });
      }
      await this.fulfillment.refreshSoldOut(tx, eventId, now);

      return { registration, requiresPayment: !free, amountInCents: finalPrice, discountInCents: discount, priceBreakdown: price };
    });

    if (result.registration.status === EventRegistrationStatus.CONFIRMED && !(result as any).resumed) {
      await this.checkout.sendRegistrationConfirmed(result.registration.id, 0).catch(() => undefined);
    }

    // Compatível com clientes antigos (campos da inscrição no topo) + metadados do checkout
    return {
      ...result.registration,
      requiresPayment: result.requiresPayment,
      amountInCents: result.amountInCents,
      waitlisted: (result as any).waitlisted ?? false,
      priceBreakdown: (result as any).priceBreakdown ?? null,
      discountInCents: (result as any).discountInCents ?? 0,
    };
  }

  /** Prévia de preço (percurso + kit + cupom) — não resgata o cupom. */
  async quote(eventId: string, opts: { distanceId?: string; kitType?: KitType; code?: string }) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.status === EventStatus.DRAFT) throw new NotFoundException('Evento não encontrado');
    let distance: { price: number } | null = null;
    if (opts.distanceId) {
      distance = await this.prisma.eventDistance.findFirst({ where: { id: opts.distanceId, eventId, isActive: true } });
      if (!distance) throw new BadRequestException('Percurso inválido');
    }
    const hasKits = event.kitCompletePrice !== null || event.kitPremiumPrice !== null;
    const price = computeRegistrationPrice(event, distance, opts.kitType ?? (hasKits ? KitType.COMPLETO : null));
    let discount = 0;
    let coupon: any = null;
    if (opts.code?.trim()) {
      coupon = await this.prisma.eventCoupon.findUnique({ where: { eventId_code: { eventId, code: opts.code.toUpperCase().trim() } } });
      const problem = FulfillmentService.couponProblem(coupon);
      if (problem) throw (problem.startsWith('Cupom inválido') ? new NotFoundException(problem) : new BadRequestException(problem));
      discount = FulfillmentService.couponDiscount(coupon.type, coupon.value, price.subtotal);
    }
    return {
      ...price,
      discountInCents: discount,
      totalInCents: Math.max(0, price.subtotal - discount),
      coupon: coupon ? { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value } : null,
    };
  }

  async cancelRegistration(eventId: string, userId: string) {
    const now = new Date();
    const res = await this.prisma.$transaction(async (tx) => {
      await this.fulfillment.lockEvent(tx, eventId);
      const registration = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
      if (!registration) throw new NotFoundException('Inscrição não encontrada');
      if (registration.status === EventRegistrationStatus.CANCELED) throw new BadRequestException('Inscrição já está cancelada');
      if (registration.status === EventRegistrationStatus.CHECKED_IN) throw new BadRequestException('Check-in já realizado');
      // Inscrição PAGA não é autocancelável (sem reembolso automático): só PENDING/WAITLIST ou CONFIRMED gratuita
      // "Paga" = valor > 0 E pagamento confirmado (Payment SUCCEEDED, ou baixa manual pelo organizador).
      // Inscrição gratuita/cortesia é gravada com paymentStatus SUCCEEDED mas sem Payment → pode cancelar.
      if (registration.status === EventRegistrationStatus.CONFIRMED && (registration.finalPrice ?? 0) > 0) {
        const paid = await tx.payment.findFirst({
          where: {
            eventRegistrationId: registration.id,
            purpose: PaymentPurpose.EVENT_REGISTRATION,
            OR: [{ status: PaymentStatus.SUCCEEDED }, { failureReason: 'MANUAL_PAID' }],
          },
          select: { id: true },
        });
        if (paid) throw new ConflictException('Inscrição paga — fale com a organização para cancelar/reembolsar');
      }

      const released = await this.fulfillment.releaseEventRegistration(tx, registration.id, { failureReason: 'CANCELED_BY_ATHLETE' });
      const promoted = await this.fulfillment.promoteWaitlist(tx, eventId, now);
      await this.fulfillment.refreshSoldOut(tx, eventId, now);
      const updated = await tx.eventRegistration.findUnique({ where: { id: registration.id } });
      return { updated, closed: released?.closedPayments ?? [], promoted };
    });
    await this.checkout.cancelAtGateway(res.closed);
    if (res.promoted) {
      await this.checkout.notifyPromotion(res.promoted.registration.id, res.promoted.requiresPayment).catch(() => undefined);
    }
    return res.updated;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Gestão de inscritos (organizador)
  // ════════════════════════════════════════════════════════════════════════

  private registrationsWhere(eventId: string, q: RegistrationsQueryDto): Prisma.EventRegistrationWhereInput {
    const where: Prisma.EventRegistrationWhereInput = { eventId };
    if (q.status) where.status = q.status;
    if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
    if (q.distanceId) where.distanceId = q.distanceId;
    if (q.kitDelivered) where.kitDeliveredAt = q.kitDelivered === 'true' ? { not: null } : null;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
        { bibNumber: { contains: s } },
      ];
    }
    return where;
  }

  async getRegistrations(eventId: string, actor: Actor | string, q: RegistrationsQueryDto = {}) {
    await this.assertCanManage(eventId, actor);
    const page = q.page || 1;
    const limit = q.limit || 50;
    const where = this.registrationsWhere(eventId, q);

    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } },
          distance: { select: { id: true, name: true, distanceKm: true } },
          coupon: { select: { code: true } },
        },
        orderBy: { registeredAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    return { data: registrations, total, page, totalPages: Math.ceil(total / limit) };
  }

  async exportRegistrationsCsv(eventId: string, actor: Actor, q: RegistrationsQueryDto = {}) {
    const event = await this.assertCanManage(eventId, actor);
    const regs = await this.prisma.eventRegistration.findMany({
      where: this.registrationsWhere(eventId, q),
      include: {
        user: { select: { name: true, email: true, phone: true } },
        distance: { select: { name: true } },
        coupon: { select: { code: true } },
      },
      orderBy: [{ bibNumber: 'asc' }, { registeredAt: 'asc' }],
      take: 20000,
    });
    const header = [
      'Peito', 'Nome', 'E-mail', 'Telefone', 'Percurso', 'Camiseta', 'Kit', 'Status', 'Pagamento', 'Valor (R$)', 'Cupom',
      'Inscrito em', 'Confirmado em', 'Kit entregue', 'Entregue por', 'Check-in', 'Contato de emergência',
    ];
    const tz = { timeZone: 'America/Sao_Paulo' } as const;
    const rows = regs.map((r) => [
      r.bibNumber,
      r.user.name,
      r.user.email,
      r.user.phone,
      r.distance?.name,
      r.shirtSize,
      r.kitType === 'PREMIUM' ? 'Premium' : r.kitType === 'COMPLETO' ? 'Completo' : '',
      REG_STATUS_LABEL[r.status] ?? r.status,
      PAY_STATUS_LABEL[r.paymentStatus] ?? r.paymentStatus,
      fmtBrl(r.finalPrice ?? 0),
      r.coupon?.code,
      r.registeredAt.toLocaleString('pt-BR', tz),
      r.confirmedAt ? r.confirmedAt.toLocaleString('pt-BR', tz) : '',
      r.kitDeliveredAt ? r.kitDeliveredAt.toLocaleString('pt-BR', tz) : '',
      r.kitDeliveredBy,
      r.checkinAt ? r.checkinAt.toLocaleString('pt-BR', tz) : '',
      r.emergencyContact,
    ]);
    return { filename: `inscritos-${event.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.csv`, csv: toCsv(header, rows) };
  }

  /** Painel do evento: contagens, receita, percursos, camisetas e kits. */
  async getStats(eventId: string, actor: Actor) {
    const event = await this.assertCanManage(eventId, actor);
    const now = new Date();
    const regs = await this.prisma.eventRegistration.findMany({
      where: { eventId },
      select: {
        status: true, paymentStatus: true, finalPrice: true, distanceId: true, shirtSize: true, kitType: true,
        kitDeliveredAt: true, paymentExpiresAt: true,
      },
    });
    const distances = await this.prisma.eventDistance.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });

    const confirmedLike = (s: EventRegistrationStatus) => (OCCUPYING_STATUSES as string[]).includes(s);
    const pendingActive = (r: (typeof regs)[number]) =>
      r.status === EventRegistrationStatus.PENDING && (!r.paymentExpiresAt || r.paymentExpiresAt.getTime() > now.getTime());

    const confirmed = regs.filter((r) => confirmedLike(r.status));
    const shirt: Record<string, number> = {};
    const kit: Record<string, number> = {};
    for (const r of confirmed) {
      if (r.shirtSize) shirt[r.shirtSize] = (shirt[r.shirtSize] ?? 0) + 1;
      if (r.kitType) kit[r.kitType] = (kit[r.kitType] ?? 0) + 1;
    }
    return {
      eventId,
      status: event.status,
      maxParticipants: event.maxParticipants,
      occupying: confirmed.length + regs.filter(pendingActive).length,
      confirmed: confirmed.length,
      pendingPayment: regs.filter(pendingActive).length,
      waitlist: regs.filter((r) => r.status === EventRegistrationStatus.WAITLIST).length,
      checkedIn: regs.filter((r) => r.status === EventRegistrationStatus.CHECKED_IN).length,
      absent: regs.filter((r) => r.status === EventRegistrationStatus.ABSENT).length,
      canceled: regs.filter((r) => r.status === EventRegistrationStatus.CANCELED).length,
      kitsDelivered: regs.filter((r) => !!r.kitDeliveredAt).length,
      paidCount: regs.filter((r) => r.paymentStatus === PaymentStatus.SUCCEEDED && (r.finalPrice ?? 0) > 0 && r.status !== EventRegistrationStatus.CANCELED).length,
      revenueInCents: regs
        .filter((r) => r.paymentStatus === PaymentStatus.SUCCEEDED && r.status !== EventRegistrationStatus.CANCELED)
        .reduce((s, r) => s + (r.finalPrice ?? 0), 0),
      refundPending: regs.filter((r) => r.status === EventRegistrationStatus.CANCELED && r.paymentStatus === PaymentStatus.SUCCEEDED && (r.finalPrice ?? 0) > 0).length,
      byDistance: distances.map((d) => ({
        id: d.id,
        name: d.name,
        isActive: d.isActive,
        maxParticipants: d.maxParticipants,
        registeredCount: d.registeredCount,
        confirmed: confirmed.filter((r) => r.distanceId === d.id).length,
      })),
      byShirtSize: shirt,
      byKit: kit,
    };
  }

  /** Ações de pagamento manuais do organizador (dinheiro/cortesia, cancelamento, estorno). */
  async registrationPaymentAction(eventId: string, registrationId: string, actor: Actor, action: 'MARK_PAID' | 'CANCEL' | 'REFUND') {
    await this.assertCanManage(eventId, actor);
    const reg = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.eventId !== eventId) throw new NotFoundException('Inscrição não encontrada');
    const now = new Date();

    if (action === 'MARK_PAID') {
      if (reg.status !== EventRegistrationStatus.PENDING && reg.status !== EventRegistrationStatus.WAITLIST) {
        throw new BadRequestException('Só é possível confirmar inscrições pendentes ou em lista de espera');
      }
      const closed: Array<{ provider: string; externalPaymentId: string | null }> = [];
      await this.prisma.$transaction(async (tx) => {
        await this.fulfillment.lockEvent(tx, eventId);
        if (reg.status === EventRegistrationStatus.WAITLIST) {
          // organizador decide encaixar além do limite: passa a ocupar vaga
          if (reg.distanceId) {
            await tx.eventDistance.update({ where: { id: reg.distanceId }, data: { registeredCount: { increment: 1 } } });
          }
          await tx.eventRegistration.update({ where: { id: reg.id }, data: { status: EventRegistrationStatus.PENDING } });
        }
        const r = await this.fulfillment.eventRegistrationPaid(tx, reg.id, now);
        if (r.outcome !== 'FULFILLED') throw new ConflictException('A inscrição já foi confirmada ou mudou de status — atualize a página');
        const pending = await tx.payment.findMany({
          where: { eventRegistrationId: reg.id, status: PaymentStatus.PENDING },
          select: { id: true, provider: true, externalPaymentId: true },
        });
        if (pending.length) {
          await tx.payment.updateMany({
            where: { id: { in: pending.map((p) => p.id) } },
            data: { status: PaymentStatus.FAILED, failureReason: 'MANUAL_PAID' },
          });
          closed.push(...pending);
        }
      });
      await this.checkout.cancelAtGateway(closed);
      await this.checkout.sendRegistrationConfirmed(reg.id, reg.finalPrice ?? 0).catch(() => undefined);
    } else {
      if (reg.status === EventRegistrationStatus.CANCELED && action === 'CANCEL') {
        throw new BadRequestException('Inscrição já está cancelada');
      }
      const res = await this.prisma.$transaction(async (tx) => {
        await this.fulfillment.lockEvent(tx, eventId);
        const released = await this.fulfillment.releaseEventRegistration(tx, reg.id, {
          paymentStatus: action === 'REFUND' ? PaymentStatus.REFUNDED : undefined,
          failureReason: 'CANCELED_BY_ORGANIZER',
        });
        if (!released && action === 'REFUND') {
          await tx.eventRegistration.update({ where: { id: reg.id }, data: { paymentStatus: PaymentStatus.REFUNDED } });
        }
        if (action === 'REFUND') {
          // marcação manual — o dinheiro é estornado no painel do gateway
          await tx.payment.updateMany({
            where: { eventRegistrationId: reg.id, status: PaymentStatus.SUCCEEDED },
            data: { status: PaymentStatus.REFUNDED, refundedAt: now },
          });
        }
        const promoted = await this.fulfillment.promoteWaitlist(tx, eventId, now);
        await this.fulfillment.refreshSoldOut(tx, eventId, now);
        return { closed: released?.closedPayments ?? [], promoted };
      });
      await this.checkout.cancelAtGateway(res.closed);
      if (res.promoted) {
        await this.checkout.notifyPromotion(res.promoted.registration.id, res.promoted.requiresPayment).catch(() => undefined);
      }
    }
    return this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { user: { select: { id: true, name: true, email: true } }, distance: { select: { name: true } } },
    });
  }

  async checkin(eventId: string, userId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!registration) throw new NotFoundException('Você não está inscrito neste evento');
    if (registration.status === EventRegistrationStatus.CHECKED_IN) throw new ConflictException('Check-in já realizado');
    if (registration.status !== EventRegistrationStatus.CONFIRMED) {
      throw new BadRequestException('Sua inscrição não está confirmada');
    }

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const diffMs = Math.abs(Date.now() - event.eventDate.getTime());
    if (diffMs > 60 * 60 * 1000) {
      throw new BadRequestException('Check-in disponível apenas 1 hora antes ou após o início do evento');
    }

    return this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: EventRegistrationStatus.CHECKED_IN, checkinAt: new Date() },
    });
  }

  /** Check-in pelo organizador no dia da prova (QR da inscrição, id ou número de peito). */
  async checkinScan(eventId: string, actor: Actor, code: string, force = false) {
    const event = await this.assertCanManage(eventId, actor);
    const id = parseRegistrationCode(code);
    const reg = await this.prisma.eventRegistration.findFirst({
      where: id ? { id, eventId } : { eventId, bibNumber: code.trim().padStart(4, '0') },
      include: { user: { select: { name: true, avatarUrl: true } }, distance: { select: { name: true } } },
    });
    if (!reg) throw new NotFoundException('Inscrição não encontrada neste evento');
    // N3: código/peito desconhecido → 404 antes da confirmação de data.
    // B6: check-in só a partir de 1 dia antes da prova; antes disso o organizador precisa confirmar (force)
    if (!force && event.eventDate.getTime() - Date.now() > CHECKIN_WINDOW_MS) {
      return {
        success: false,
        requiresConfirmation: true,
        message: `O check-in abre 1 dia antes da prova (${event.eventDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}). Confirme para registrar mesmo assim.`,
      };
    }
    if (reg.status === EventRegistrationStatus.CHECKED_IN) {
      return { success: false, alreadyCheckedIn: true, message: `${reg.user.name} já fez check-in`, registration: reg };
    }
    if (reg.status !== EventRegistrationStatus.CONFIRMED && reg.status !== EventRegistrationStatus.ABSENT) {
      return { success: false, message: `Inscrição ${REG_STATUS_LABEL[reg.status]?.toLowerCase() ?? reg.status} — check-in bloqueado`, registration: reg };
    }
    const updated = await this.prisma.eventRegistration.update({
      where: { id: reg.id },
      data: { status: EventRegistrationStatus.CHECKED_IN, checkinAt: new Date() },
      include: { user: { select: { name: true, avatarUrl: true } }, distance: { select: { name: true } } },
    });
    return { success: true, message: `Check-in de ${updated.user.name} (peito ${updated.bibNumber ?? '—'})`, registration: updated };
  }

  async getAttendees(eventId: string, actor: Actor | string) {
    await this.assertCanManage(eventId, actor);
    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: { notIn: [EventRegistrationStatus.CANCELED, EventRegistrationStatus.WAITLIST] } },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, phone: true } } },
      orderBy: { registeredAt: 'asc' },
    });

    const counts = {
      total: registrations.length,
      checkedIn: registrations.filter((r) => r.status === EventRegistrationStatus.CHECKED_IN).length,
      registered: registrations.filter((r) => r.status === EventRegistrationStatus.CONFIRMED || r.status === EventRegistrationStatus.PENDING).length,
      absent: registrations.filter((r) => r.status === EventRegistrationStatus.ABSENT).length,
    };
    return { registrations, counts };
  }

  /** Presença manual (CHECKED_IN/ABSENT/CONFIRMED). Confirmação de pagamento usa registrationPaymentAction. */
  async updateRegistrationStatus(eventId: string, registrationId: string, actor: Actor | string, status: EventRegistrationStatus) {
    await this.assertCanManage(eventId, actor);
    const registration = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== eventId) throw new NotFoundException('Inscrição não encontrada');

    const allowedFrom: EventRegistrationStatus[] = [
      EventRegistrationStatus.CONFIRMED,
      EventRegistrationStatus.CHECKED_IN,
      EventRegistrationStatus.ABSENT,
    ];
    if (!allowedFrom.includes(registration.status) || !allowedFrom.includes(status)) {
      throw new BadRequestException('Para confirmar, cancelar ou estornar use as ações de pagamento da inscrição');
    }
    const data: Prisma.EventRegistrationUpdateInput = { status };
    if (status === EventRegistrationStatus.CHECKED_IN && !registration.checkinAt) data.checkinAt = new Date();
    if (status === EventRegistrationStatus.CONFIRMED) data.checkinAt = null;
    return this.prisma.eventRegistration.update({ where: { id: registrationId }, data });
  }

  async getMyRegistrations(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.EventRegistrationWhereInput = { userId, status: { not: EventRegistrationStatus.CANCELED } };
    const [registrations, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        include: {
          event: { include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } } },
          distance: { select: { id: true, name: true, distanceKm: true } },
        },
        orderBy: { registeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);
    return { data: registrations, total, page, totalPages: Math.ceil(total / limit) };
  }

  /** QR Code da inscrição do atleta (retirada de kit e check-in). */
  async myRegistrationQr(registrationId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.userId !== userId) throw new NotFoundException('Inscrição não encontrada');
    if (reg.status !== EventRegistrationStatus.CONFIRMED && reg.status !== EventRegistrationStatus.CHECKED_IN) {
      throw new BadRequestException('O QR Code fica disponível após a confirmação da inscrição');
    }
    const payload = `${REG_QR_PREFIX}${reg.id}`;
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 360 });
    return { payload, qrDataUrl, bibNumber: reg.bibNumber };
  }

  async notifyRegistrants(eventId: string, actor: Actor, message: string) {
    const event = await this.assertCanManage(eventId, actor);
    const regs = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: { in: [...OCCUPYING_STATUSES, EventRegistrationStatus.PENDING] } },
      select: { userId: true },
    });
    let sent = 0;
    for (const r of regs) {
      try {
        await this.notifications.createNotification(r.userId, NotificationType.EVENT_REMINDER, event.title, message.trim(), { eventId });
        sent++;
      } catch (e: any) {
        this.logger.warn(`Notificação para ${r.userId} falhou: ${e?.message}`);
      }
    }
    return { sent, total: regs.length };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Cupons
  // ════════════════════════════════════════════════════════════════════════

  async createCoupon(eventId: string, actor: Actor | string, dto: CreateEventCouponDto) {
    const event = await this.assertCanManage(eventId, actor);
    if (dto.type === 'PERCENT' && (!dto.value || dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Percentual deve estar entre 1 e 100');
    }
    if (dto.type === 'FIXED') {
      if (!dto.value || dto.value <= 0) throw new BadRequestException('Informe o valor do desconto (R$)');
      // M1: valida contra o MAIOR preço aplicável (percurso mais caro ou preço base + kit mais caro)
      const max = await this.maxApplicablePrice(event);
      if (max <= 0) throw new BadRequestException('Evento gratuito: cupom de valor fixo não se aplica');
      if (dto.value > max) {
        throw new BadRequestException(`O desconto não pode passar do maior preço de inscrição (R$ ${fmtBrl(max)})`);
      }
    }
    if (dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('A validade do cupom precisa ser uma data futura');
    }
    const code = dto.code.toUpperCase().trim();
    const existing = await this.prisma.eventCoupon.findUnique({ where: { eventId_code: { eventId, code } } });
    if (existing) throw new ConflictException('Código já existe para este evento');

    return this.prisma.eventCoupon.create({
      data: {
        eventId,
        code,
        type: dto.type,
        value: dto.type === 'COURTESY' ? 0 : (dto.value ?? 0),
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  /** Maior valor de inscrição possível (centavos): max(preço base, percursos ativos) + kit mais caro. */
  private async maxApplicablePrice(event: { id: string; price: number; kitCompletePrice: number | null; kitPremiumPrice: number | null }) {
    const distances = await this.prisma.eventDistance.findMany({ where: { eventId: event.id, isActive: true }, select: { price: true } }).catch(() => []);
    const base = Math.max(event.price ?? 0, ...distances.map((d: { price: number }) => d.price ?? 0));
    const kit = Math.max(0, event.kitCompletePrice ?? 0, event.kitPremiumPrice ?? 0);
    return base + kit;
  }

  async listCoupons(eventId: string, actor: Actor | string) {
    await this.assertCanManage(eventId, actor);
    return this.prisma.eventCoupon.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  }

  async updateCoupon(couponId: string, actor: Actor, dto: UpdateEventCouponDto) {
    const coupon = await this.prisma.eventCoupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    await this.assertCanManage(coupon.eventId, actor);
    return this.prisma.eventCoupon.update({
      where: { id: couponId },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
      },
    });
  }

  /** Validação pública do cupom (prévia). O resgate só acontece na inscrição. */
  async validateCoupon(eventId: string, code: string) {
    const coupon = await this.prisma.eventCoupon.findUnique({
      where: { eventId_code: { eventId, code: code.toUpperCase().trim() } },
    });
    const problem = FulfillmentService.couponProblem(coupon);
    if (problem) throw (problem.startsWith('Cupom inválido') ? new NotFoundException(problem) : new BadRequestException(problem));
    return { id: coupon!.id, code: coupon!.code, type: coupon!.type, value: coupon!.value, valid: true };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Entrega de kit (voluntários)
  // ════════════════════════════════════════════════════════════════════════

  async createKitSession(eventId: string, actor: Actor | string, label: string, hours = 8) {
    await this.assertCanManage(eventId, actor);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + Math.min(Math.max(hours, 1), 72) * 60 * 60 * 1000);
    return this.prisma.kitDeliverySession.create({ data: { eventId, token, label, expiresAt } });
  }

  async listKitSessions(eventId: string, actor: Actor) {
    await this.assertCanManage(eventId, actor);
    return this.prisma.kitDeliverySession.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  }

  async revokeKitSession(sessionId: string, actor: Actor) {
    const s = await this.prisma.kitDeliverySession.findUnique({ where: { id: sessionId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    await this.assertCanManage(s.eventId, actor);
    await this.prisma.kitDeliverySession.update({ where: { id: sessionId }, data: { expiresAt: new Date() } });
    return { success: true };
  }

  async getKitDeliveryData(token: string) {
    if (!token) throw new NotFoundException('Sessão inválida');
    const session = await this.prisma.kitDeliverySession.findUnique({
      where: { token },
      include: { event: { select: { id: true, title: true, eventDate: true, kitPickupLocation: true } } },
    });
    if (!session) throw new NotFoundException('Sessão inválida');
    if (session.expiresAt < new Date()) throw new BadRequestException('Sessão expirada');
    return { eventId: session.eventId, event: session.event, volunteerLabel: session.label, expiresAt: session.expiresAt };
  }

  async searchKitRegistrations(eventId: string, token: string, query: string) {
    await this.getKitDeliveryData(token);
    const q = (query ?? '').trim();
    if (!q) return [];
    const id = parseRegistrationCode(q);

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: { not: EventRegistrationStatus.CANCELED },
        ...(id
          ? { id }
          : {
              OR: [
                { bibNumber: { contains: q, mode: 'insensitive' } },
                { user: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        distance: { select: { name: true } },
      },
      take: 20,
    });

    return registrations.map((r) => {
      const valid =
        (r.status === EventRegistrationStatus.CONFIRMED || r.status === EventRegistrationStatus.CHECKED_IN) &&
        r.paymentStatus === PaymentStatus.SUCCEEDED;
      return {
        id: r.id,
        bibNumber: r.bibNumber,
        name: r.user.name,
        email: r.user.email,
        avatarUrl: r.user.avatarUrl,
        shirtSize: r.shirtSize,
        kitType: r.kitType,
        distanceName: r.distance?.name ?? null,
        paymentStatus: r.paymentStatus,
        status: r.status,
        kitDeliveredAt: r.kitDeliveredAt,
        kitDeliveredBy: r.kitDeliveredBy,
        // GREEN = confirmada e paga, não entregue | YELLOW = já entregue | RED = não confirmada/não paga
        indicator: r.kitDeliveredAt ? 'YELLOW' : valid ? 'GREEN' : 'RED',
      };
    });
  }

  async deliverKit(registrationIdOrCode: string, token: string, volunteerLabel?: string) {
    const session = await this.prisma.kitDeliverySession.findUnique({ where: { token } });
    if (!session) throw new NotFoundException('Sessão inválida');
    if (session.expiresAt < new Date()) throw new BadRequestException('Sessão expirada');

    const registrationId = parseRegistrationCode(registrationIdOrCode);
    if (!registrationId) throw new BadRequestException('QR Code inválido');

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { user: { select: { name: true } } },
    });
    if (!registration) throw new NotFoundException('Inscrição não encontrada');
    if (registration.eventId !== session.eventId) throw new ForbiddenException('Inscrição de outro evento');
    if (registration.kitDeliveredAt) {
      return {
        success: false,
        alreadyDelivered: true,
        message: `Kit já entregue em ${registration.kitDeliveredAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${registration.kitDeliveredBy}`,
        registration,
      };
    }
    const valid =
      (registration.status === EventRegistrationStatus.CONFIRMED || registration.status === EventRegistrationStatus.CHECKED_IN) &&
      registration.paymentStatus === PaymentStatus.SUCCEEDED;
    if (!valid) {
      return {
        success: false,
        message: `Inscrição de ${registration.user.name} não está confirmada/paga — kit não pode ser entregue`,
        registration,
      };
    }

    // condicional: dois voluntários escaneando ao mesmo tempo não entregam em dobro
    const label = (volunteerLabel || session.label).slice(0, 80);
    const upd = await this.prisma.eventRegistration.updateMany({
      where: { id: registrationId, kitDeliveredAt: null },
      data: { kitDeliveredAt: new Date(), kitDeliveredBy: label, kitPickupConfirmed: true },
    });
    const updated = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: { user: { select: { name: true } } },
    });
    if (upd.count === 0) {
      return { success: false, alreadyDelivered: true, message: 'Kit acabou de ser entregue por outro voluntário', registration: updated };
    }
    return { success: true, message: `Kit entregue para ${updated!.user.name}`, registration: updated };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Percursos
  // ════════════════════════════════════════════════════════════════════════

  async createDistance(eventId: string, actor: Actor | string, dto: CreateDistanceDto) {
    await this.assertCanManage(eventId, actor);
    return this.prisma.eventDistance.create({
      data: {
        eventId,
        name: dto.name,
        distanceKm: dto.distanceKm,
        price: dto.price ?? 0,
        maxParticipants: dto.maxParticipants ?? null,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
        ageGroup: dto.ageGroup,
      },
    });
  }

  async listDistances(eventId: string, includeInactive = false) {
    return this.prisma.eventDistance.findMany({
      where: { eventId, ...(includeInactive ? {} : { isActive: true }) },
      include: { _count: { select: { registrations: { where: { status: { in: [...OCCUPYING_STATUSES, EventRegistrationStatus.PENDING] } } } } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateDistance(distanceId: string, actor: Actor | string, dto: DistanceDto) {
    const distance = await this.prisma.eventDistance.findUnique({ where: { id: distanceId } });
    if (!distance) throw new NotFoundException('Percurso não encontrado');
    await this.assertCanManage(distance.eventId, actor);
    if (dto.maxParticipants !== undefined && dto.maxParticipants !== null && dto.maxParticipants < distance.registeredCount) {
      throw new BadRequestException(`Limite menor que o número de inscritos no percurso (${distance.registeredCount})`);
    }
    const data: Prisma.EventDistanceUpdateInput = {};
    for (const k of ['name', 'distanceKm', 'price', 'maxParticipants', 'description', 'sortOrder', 'isActive', 'ageGroup'] as const) {
      if (dto[k] !== undefined) (data as any)[k] = dto[k];
    }
    return this.prisma.eventDistance.update({ where: { id: distanceId }, data });
  }

  async deleteDistance(distanceId: string, actor: Actor | string) {
    const distance = await this.prisma.eventDistance.findUnique({ where: { id: distanceId } });
    if (!distance) throw new NotFoundException('Percurso não encontrado');
    await this.assertCanManage(distance.eventId, actor);
    await this.prisma.eventDistance.update({ where: { id: distanceId }, data: { isActive: false } });
    return { success: true };
  }
}
