import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { NotificationType, PaymentStatus, Prisma, StoreOrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FulfillmentService, CHECKOUT_TTL_MS } from '../payments/checkout/fulfillment.service';
import { CheckoutService, sha256 } from '../payments/checkout/checkout.service';
import {
  CreateProductDto, CreateStoreCouponDto, CreateStoreOrderDto, ListOrdersQueryDto, UpdateOrderStatusDto,
  UpdateProductDto, UpdateStoreCouponDto, ValidateStoreCouponDto,
} from './dto/store.dto';
import { fmtBrl, toCsv } from './csv.util';
import {
  assertCanCreateTeamContent, canPublishTeamContent, coachIdsWhere, ContentTeamCtx, primaryTeamIdForCoach,
  teamContentCoachIds, teamContentWhere,
} from '../../common/utils/ownership';

/** `team` = equipe ativa (TeamContextService) — o escopo de conteúdo é SEMPRE o da equipe ativa. */
type Actor = { id: string; role?: UserRole | string | null; team?: ContentTeamCtx };

export const MAX_OPEN_ORDERS_PER_EMAIL = 3;

const isAdmin = (role?: string | null) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

/** Status contados como venda concretizada (receita / produção). */
export const PAID_ORDER_STATUSES: StoreOrderStatus[] = [
  StoreOrderStatus.PAID,
  StoreOrderStatus.CONFIRMED,
  StoreOrderStatus.PROCESSING,
  StoreOrderStatus.SHIPPED,
  StoreOrderStatus.READY_FOR_PICKUP,
  StoreOrderStatus.DELIVERED,
];

/** Fluxo de status do pedido no painel do coach. */
export const ORDER_TRANSITIONS: Record<StoreOrderStatus, StoreOrderStatus[]> = {
  PENDING_PAYMENT: [StoreOrderStatus.PAID, StoreOrderStatus.CANCELLED],
  PAID: [StoreOrderStatus.PROCESSING, StoreOrderStatus.SHIPPED, StoreOrderStatus.READY_FOR_PICKUP, StoreOrderStatus.DELIVERED, StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED],
  CONFIRMED: [StoreOrderStatus.PROCESSING, StoreOrderStatus.SHIPPED, StoreOrderStatus.READY_FOR_PICKUP, StoreOrderStatus.DELIVERED, StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED],
  PROCESSING: [StoreOrderStatus.SHIPPED, StoreOrderStatus.READY_FOR_PICKUP, StoreOrderStatus.DELIVERED, StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED],
  SHIPPED: [StoreOrderStatus.DELIVERED, StoreOrderStatus.REFUNDED],
  READY_FOR_PICKUP: [StoreOrderStatus.DELIVERED, StoreOrderStatus.PROCESSING, StoreOrderStatus.REFUNDED],
  DELIVERED: [StoreOrderStatus.REFUNDED],
  CANCELLED: [],
  REFUNDED: [],
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CONFIRMED: 'Confirmado',
  PROCESSING: 'Em produção/separação',
  SHIPPED: 'Enviado',
  READY_FOR_PICKUP: 'Pronto para retirada',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Estornado',
};

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  coachId: true,
  name: true,
  description: true,
  category: true,
  priceInCents: true,
  images: true,
  sizes: true,
  colors: true,
  totalStock: true,
  reserved: true,
  featured: true,
  athleteDiscountPercent: true,
  isPreOrder: true,
  preOrderDeadline: true,
  estimatedDelivery: true,
  preOrderLimit: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private prisma: PrismaService,
    private fulfillment: FulfillmentService,
    private checkout: CheckoutService,
    private email: EmailService,
    private notifications: NotificationsService,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  // PRODUTOS
  // ════════════════════════════════════════════════════════════════════════

  /** Resolve slug ou UUID para o id do coach (slug de equipe → dono da equipe). */
  private async resolveCoachId(slugOrId: string): Promise<string> {
    const byId = await this.prisma.user.findUnique({ where: { id: slugOrId }, select: { id: true } }).catch(() => null);
    if (byId) return byId.id;
    const bySlug = await this.prisma.coachProfile.findFirst({
      where: { slug: slugOrId },
      select: { userId: true },
    });
    if (bySlug) return bySlug.userId;
    const team = await (this.prisma as any).team?.findFirst?.({ where: { slug: slugOrId, status: 'ACTIVE' }, select: { ownerId: true } });
    if (team) return team.ownerId;
    throw new NotFoundException('Coach não encontrado');
  }

  /**
   * Vitrine pública: slug/id da EQUIPE → produtos de todos os treinadores ativos da equipe;
   * slug/id de treinador → somente dele (compatibilidade).
   */
  private async resolvePublicCoachIds(slugOrId: string): Promise<string[]> {
    const teamModel = (this.prisma as any).team;
    if (teamModel?.findFirst) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      const team = await teamModel.findFirst({
        where: { status: 'ACTIVE', OR: [{ slug: slugOrId }, ...(isUuid ? [{ id: slugOrId }] : [])] },
        select: { id: true, ownerId: true },
      });
      if (team) {
        // mesma atribuição do painel: só o conteúdo cuja equipe principal do autor é ESTA equipe
        const ids = await teamContentCoachIds(this.prisma, team.id);
        return ids.length ? ids : [team.ownerId];
      }
    }
    return [await this.resolveCoachId(slugOrId)];
  }

  /** Treinadores da equipe à qual o produto (autor `coachId`) é atribuído — loja/cupons da equipe inteira. */
  private async teamCoachIdsOf(coachId: string): Promise<{ teamId: string | null; coachIds: string[] }> {
    const teamId = await primaryTeamIdForCoach(this.prisma, coachId);
    if (!teamId) return { teamId: null, coachIds: [coachId] };
    const ids = await teamContentCoachIds(this.prisma, teamId);
    return { teamId, coachIds: ids.includes(coachId) ? ids : [...ids, coachId] };
  }

  /** Equipe do atleta: AthleteProfile.teamId; senão a equipe principal do treinador responsável. */
  private async athleteTeam(athleteId: string): Promise<{ teamId: string | null; coachId: string | null } | null> {
    const ap = await this.prisma.athleteProfile.findUnique({ where: { userId: athleteId }, select: { coachId: true, teamId: true } });
    if (!ap) return null;
    const teamId = ap.teamId ?? (ap.coachId ? await primaryTeamIdForCoach(this.prisma, ap.coachId) : null);
    return { teamId, coachId: ap.coachId ?? null };
  }

  /** Desconto de aluno vale para QUALQUER atleta da equipe dona do produto (ou do treinador, se sem equipe). */
  private async athleteDiscountApplies(userId: string | null | undefined, productCoachId: string): Promise<boolean> {
    if (!userId) return false;
    const at = await this.athleteTeam(userId);
    if (!at) return false;
    if (at.coachId === productCoachId) return true;
    if (!at.teamId) return false;
    return (await primaryTeamIdForCoach(this.prisma, productCoachId)) === at.teamId;
  }

  /** Preço unitário com desconto de aluno (calculado no servidor). */
  private async unitPriceFor(product: { priceInCents: number; athleteDiscountPercent: number; coachId: string }, userId?: string | null) {
    if (product.athleteDiscountPercent > 0 && (await this.athleteDiscountApplies(userId, product.coachId))) {
      return Math.round(product.priceInCents * (1 - product.athleteDiscountPercent / 100));
    }
    return product.priceInCents;
  }

  /** Cupom da equipe: procura entre os treinadores da equipe, preferindo o do autor do produto. */
  private async findTeamCoupon(db: any, coachIds: string[], code: string, preferCoachId?: string) {
    const list = await db.storeCoupon.findMany({ where: { code: code.toUpperCase().trim(), coachId: { in: coachIds } } });
    if (!list?.length) return null;
    return list.find((c: any) => c.coachId === preferCoachId) ?? list[0];
  }

  /** Filtro de produto por escopo do ator: ADMIN/SUPER_ADMIN → tudo; gestão → conteúdo da EQUIPE ATIVA. */
  private async productScope(actor: Actor): Promise<Record<string, any>> {
    return teamContentWhere(this.prisma, actor, actor.team);
  }

  /** Unidades de encomenda já comprometidas (pedidos não cancelados/estornados) por produto. */
  private async preOrderCommitted(productIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!productIds.length) return map;
    const rows = await this.prisma.storeOrder.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        isPreOrder: true,
        status: { notIn: [StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED] },
      },
      _sum: { quantity: true },
    });
    for (const r of rows) map.set(r.productId, r._sum.quantity ?? 0);
    return map;
  }

  /** Disponibilidade calculada no servidor (o cliente nunca decide). */
  private withAvailability<T extends { id: string; isPreOrder: boolean; totalStock: number; reserved: number; preOrderLimit: number | null; preOrderDeadline: Date | null }>(
    p: T,
    committed: Map<string, number>,
    now = new Date(),
  ) {
    if (p.isPreOrder) {
      const deadlinePassed = !!p.preOrderDeadline && p.preOrderDeadline.getTime() < now.getTime();
      const remaining = p.preOrderLimit !== null ? Math.max(0, p.preOrderLimit - (committed.get(p.id) ?? 0)) : null;
      return {
        ...p,
        available: deadlinePassed ? 0 : remaining ?? 999,
        purchasable: !deadlinePassed && (remaining === null || remaining > 0),
        preOrderRemaining: remaining,
      };
    }
    const available = Math.max(0, p.totalStock - p.reserved);
    return { ...p, available, purchasable: available > 0, preOrderRemaining: null };
  }

  async listPublicProducts(slugOrId: string, userId?: string | null) {
    const coachIds = await this.resolvePublicCoachIds(slugOrId);
    const products = await this.prisma.product.findMany({
      where: { ...coachIdsWhere(coachIds), active: true },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      select: PUBLIC_PRODUCT_SELECT,
    });
    const committed = await this.preOrderCommitted(products.filter((p) => p.isPreOrder).map((p) => p.id));
    // atleta logado da equipe: preço final com desconto de aluno já na vitrine/checkout
    const isTeamAthlete = !!userId && products.length > 0 && (await this.athleteDiscountApplies(userId, products[0].coachId));
    return products.map((p) => {
      const base = this.withAvailability(p, committed);
      if (!userId) return base;
      const discounted = isTeamAthlete && (p.athleteDiscountPercent || 0) > 0;
      return {
        ...base,
        finalPriceInCents: discounted ? Math.round(p.priceInCents * (1 - p.athleteDiscountPercent / 100)) : p.priceInCents,
        hasAthleteDiscount: discounted,
      };
    });
  }

  async listForAthlete(athleteId: string) {
    const at = await this.athleteTeam(athleteId);
    if (!at) return [];
    // loja da EQUIPE do atleta (mesma atribuição da vitrine pública), não só do treinador responsável
    const coachIds = at.teamId ? await teamContentCoachIds(this.prisma, at.teamId) : at.coachId ? [at.coachId] : [];
    if (!coachIds.length) return [];

    const products = await this.prisma.product.findMany({
      where: { ...coachIdsWhere(coachIds), active: true },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      select: PUBLIC_PRODUCT_SELECT,
    });
    const committed = await this.preOrderCommitted(products.filter((p) => p.isPreOrder).map((p) => p.id));

    return products.map((p) => ({
      ...this.withAvailability(p, committed),
      originalPriceInCents: p.priceInCents,
      finalPriceInCents: Math.round(p.priceInCents * (1 - (p.athleteDiscountPercent || 0) / 100)),
      hasAthleteDiscount: (p.athleteDiscountPercent || 0) > 0,
    }));
  }

  async listCoachProducts(userId: string, role?: string, team?: ContentTeamCtx) {
    const where = await this.productScope({ id: userId, role, team });
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    });
    const committed = await this.preOrderCommitted(products.filter((p) => p.isPreOrder).map((p) => p.id));
    return products.map((p) => ({ ...this.withAvailability(p, committed), preOrderCommitted: committed.get(p.id) ?? 0 }));
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, active: true }, select: PUBLIC_PRODUCT_SELECT });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const committed = await this.preOrderCommitted(product.isPreOrder ? [product.id] : []);
    return this.withAvailability(product, committed);
  }

  private productData(dto: CreateProductDto | UpdateProductDto) {
    const data: Prisma.ProductUncheckedUpdateInput = {};
    const keys = [
      'name', 'description', 'category', 'priceInCents', 'images', 'sizes', 'colors', 'totalStock',
      'featured', 'active', 'athleteDiscountPercent', 'isPreOrder', 'preOrderLimit',
    ] as const;
    for (const k of keys) {
      if ((dto as any)[k] !== undefined) (data as any)[k] = (dto as any)[k];
    }
    if (dto.preOrderDeadline !== undefined) data.preOrderDeadline = dto.preOrderDeadline ? new Date(dto.preOrderDeadline) : null;
    if (dto.estimatedDelivery !== undefined) data.estimatedDelivery = dto.estimatedDelivery ? new Date(dto.estimatedDelivery) : null;
    return data;
  }

  async createProduct(coachId: string, dto: CreateProductDto, actor?: Actor) {
    // M10: STAFF não cria; COACH cria inativo (o dono/gestor publica); só na equipe principal do autor
    const { canPublish } = await assertCanCreateTeamContent(this.prisma, actor ?? { id: coachId, role: 'COACH' }, actor?.team);
    const data = this.productData(dto);
    return this.prisma.product.create({
      data: {
        ...(data as any),
        ...(canPublish ? {} : { active: false }),
        coachId,
        name: dto.name,
        category: dto.category,
        priceInCents: dto.priceInCents,
        images: dto.images ?? [],
        sizes: dto.sizes ?? [],
        colors: dto.colors ?? [],
        totalStock: dto.totalStock ?? 0,
        featured: dto.featured ?? false,
        athleteDiscountPercent: dto.athleteDiscountPercent ?? 0,
        isPreOrder: dto.isPreOrder ?? false,
      },
    });
  }

  private async ownedProduct(id: string, actor: Actor) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(await this.productScope(actor)) },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async updateProduct(id: string, actor: Actor, dto: UpdateProductDto) {
    const product = await this.ownedProduct(id, actor);
    const data = this.productData(dto);
    if (dto.active === true && !product.active && !canPublishTeamContent(actor, actor.team)) {
      throw new ForbiddenException('Somente o dono ou um gestor da equipe publica produtos na loja');
    }
    if (dto.totalStock !== undefined && dto.totalStock < product.reserved) {
      throw new BadRequestException(`Estoque não pode ser menor que as unidades reservadas em pedidos pendentes (${product.reserved})`);
    }
    return this.prisma.product.update({ where: { id }, data });
  }

  async deleteProduct(id: string, actor: Actor) {
    await this.ownedProduct(id, actor);
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }

  // ════════════════════════════════════════════════════════════════════════
  // PEDIDOS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Cria o pedido reservando estoque (pronta-entrega) ou vaga de encomenda — tudo atômico.
   * Preço 100% calculado no servidor: desconto de aluno só para atleta autenticado do coach.
   * Retorna `accessToken` (exibido uma única vez) para consultar/pagar o pedido sem login.
   */
  async createOrder(dto: CreateStoreOrderDto, user?: { id: string; role?: string } | null) {
    const now = new Date();
    const accessToken = randomBytes(24).toString('base64url');

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product || !product.active) throw new NotFoundException('Produto indisponível');
    if (product.sizes.length > 0 && (!dto.size || !product.sizes.includes(dto.size))) {
      throw new BadRequestException('Selecione um tamanho válido');
    }
    if (product.colors.length > 0 && (!dto.color || !product.colors.includes(dto.color))) {
      throw new BadRequestException('Selecione uma cor válida');
    }
    if (product.isPreOrder && product.preOrderDeadline && product.preOrderDeadline.getTime() < now.getTime()) {
      throw new BadRequestException('O prazo de encomenda deste produto foi encerrado');
    }

    // Desconto de aluno: atleta autenticado de QUALQUER treinador da equipe dona do produto
    const athleteId: string | null = user?.id ?? null;
    const unit = await this.unitPriceFor(product, athleteId);
    const teamCoaches = dto.couponCode?.trim() ? (await this.teamCoachIdsOf(product.coachId)).coachIds : [product.coachId];
    const subtotal = unit * dto.quantity;

    // Anti-travamento de estoque: no máximo 3 pedidos em aberto (não pagos) por e-mail
    const openOrders = await this.prisma.storeOrder.count({
      where: {
        customerEmail: normalizeEmail(dto.customerEmail),
        status: StoreOrderStatus.PENDING_PAYMENT,
        expiresAt: { gt: now },
      },
    });
    if (openOrders >= MAX_OPEN_ORDERS_PER_EMAIL) {
      throw new BadRequestException(`Você já tem ${openOrders} pedidos aguardando pagamento. Conclua ou aguarde a expiração antes de fazer outro.`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (product.isPreOrder) {
        if (product.preOrderLimit !== null) {
          await this.fulfillment.lockProduct(tx, product.id);
          const agg = await tx.storeOrder.aggregate({
            where: {
              productId: product.id,
              isPreOrder: true,
              status: { notIn: [StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED] },
            },
            _sum: { quantity: true },
          });
          const committed = agg._sum.quantity ?? 0;
          if (committed + dto.quantity > product.preOrderLimit) {
            throw new BadRequestException(`Limite de encomendas atingido. Restam ${Math.max(0, product.preOrderLimit - committed)}`);
          }
        }
      } else {
        // reserva atômica: só incrementa se ainda houver saldo (total - reservado)
        const n = await tx.$executeRaw`
          UPDATE "products" SET "reserved" = "reserved" + ${dto.quantity}, "updated_at" = NOW()
          WHERE "id" = ${product.id} AND "active" = true AND "total_stock" - "reserved" >= ${dto.quantity}`;
        if (n === 0) throw new BadRequestException('Estoque insuficiente para a quantidade solicitada');
      }

      let discountInCents = 0;
      let couponId: string | null = null;
      if (dto.couponCode?.trim()) {
        const coupon = await this.findTeamCoupon(tx, teamCoaches, dto.couponCode, product.coachId);
        const problem = FulfillmentService.couponProblem(coupon, now);
        if (problem) throw new BadRequestException(problem);
        if (!(await this.fulfillment.redeemStoreCoupon(tx, coupon!, now))) {
          throw new BadRequestException('Cupom atingiu o limite de usos');
        }
        discountInCents = FulfillmentService.couponDiscount(coupon!.type, coupon!.value, subtotal);
        couponId = coupon!.id;
      }
      const finalInCents = Math.max(0, subtotal - discountInCents);

      const order = await tx.storeOrder.create({
        data: {
          productId: product.id,
          athleteId,
          customerName: dto.customerName,
          customerEmail: normalizeEmail(dto.customerEmail),
          customerPhone: dto.customerPhone || null,
          size: dto.size || null,
          color: dto.color || null,
          quantity: dto.quantity,
          totalInCents: subtotal,
          discountInCents,
          finalInCents,
          couponId,
          isPreOrder: product.isPreOrder,
          deliveryMethod: dto.deliveryMethod ?? 'PICKUP',
          shippingAddress: dto.deliveryMethod === 'SHIPPING' ? dto.shippingAddress : null,
          notes: dto.notes || null,
          status: StoreOrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
          accessTokenHash: sha256(accessToken),
          statusUpdatedAt: now,
        },
      });

      // Cortesia / 100% de desconto → pago na hora
      if (finalInCents === 0) await this.fulfillment.storeOrderPaid(tx, order.id, now);
      return tx.storeOrder.findUniqueOrThrow({ where: { id: order.id }, include: { product: { select: { name: true, estimatedDelivery: true } } } });
    });

    if (result.status === StoreOrderStatus.PAID) {
      await this.email
        .sendStoreOrderPaid(result.customerEmail, {
          name: result.customerName,
          orderId: result.id,
          productName: result.product.name,
          quantity: result.quantity,
          size: result.size,
          color: result.color,
          totalInCents: 0,
          isPreOrder: result.isPreOrder,
          estimatedDelivery: result.product.estimatedDelivery,
          deliveryMethod: result.deliveryMethod,
        })
        .catch(() => undefined);
    }

    return {
      ...this.publicOrderView(result),
      accessToken,
      requiresPayment: result.status === StoreOrderStatus.PENDING_PAYMENT,
    };
  }

  /** Visão pública do pedido — sem PII (nome, e-mail, telefone, endereço). */
  private publicOrderView(o: any) {
    return {
      id: o.id,
      code: o.id.slice(0, 8).toUpperCase(),
      status: o.status,
      statusLabel: ORDER_STATUS_LABEL[o.status] ?? o.status,
      productName: o.product?.name,
      quantity: o.quantity,
      size: o.size,
      color: o.color,
      isPreOrder: o.isPreOrder,
      estimatedDelivery: o.product?.estimatedDelivery ?? null,
      deliveryMethod: o.deliveryMethod,
      totalInCents: o.totalInCents,
      discountInCents: o.discountInCents,
      finalInCents: o.finalInCents ?? o.totalInCents - o.discountInCents,
      trackingCode: o.trackingCode ?? null,
      expiresAt: o.expiresAt,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    };
  }

  /** GET público: exige o token do pedido (ou o atleta dono autenticado). */
  async getPublicOrder(orderId: string, token?: string | null, userId?: string | null) {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: { product: { select: { name: true, estimatedDelivery: true } } },
    });
    const ownerOk = !!order && !!userId && order.athleteId === userId;
    let tokenOk = false;
    if (order?.accessTokenHash && token) {
      const a = Buffer.from(sha256(token));
      const b = Buffer.from(order.accessTokenHash);
      tokenOk = a.length === b.length && timingSafeEqual(a, b);
    }
    if (!order || (!ownerOk && !tokenOk)) throw new NotFoundException('Pedido não encontrado');
    const payment = await this.prisma.payment.findFirst({
      where: { storeOrderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    return { ...this.publicOrderView(order), lastPayment: payment };
  }

  /** Pedidos do atleta logado (app). */
  async listMyOrders(userId: string) {
    const orders = await this.prisma.storeOrder.findMany({
      where: { athleteId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { product: { select: { name: true, estimatedDelivery: true } } },
    });
    return orders.map((o) => this.publicOrderView(o));
  }

  private async orderWhere(actor: Actor, q: ListOrdersQueryDto = {}): Promise<Prisma.StoreOrderWhereInput> {
    const where: Prisma.StoreOrderWhereInput = {
      product: await this.productScope(actor),
    };
    if (q.status) where.status = q.status;
    if (q.preOrder) where.isPreOrder = q.preOrder === 'true';
    if (q.productId) where.productId = q.productId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerEmail: { contains: s, mode: 'insensitive' } },
        { id: { startsWith: s.toLowerCase() } },
      ];
    }
    return where;
  }

  async listCoachOrders(actor: Actor, q: ListOrdersQueryDto = {}) {
    return this.prisma.storeOrder.findMany({
      where: await this.orderWhere(actor, q),
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        product: { select: { name: true, category: true, priceInCents: true, isPreOrder: true } },
        coupon: { select: { code: true } },
      },
    });
  }

  async exportOrdersCsv(actor: Actor, q: ListOrdersQueryDto = {}) {
    const orders = await this.prisma.storeOrder.findMany({
      where: await this.orderWhere(actor, q),
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { product: { select: { name: true } }, coupon: { select: { code: true } } },
    });
    const header = [
      'Pedido', 'Data', 'Status', 'Tipo', 'Produto', 'Tamanho', 'Cor', 'Qtd', 'Subtotal (R$)', 'Desconto (R$)', 'Total (R$)',
      'Cupom', 'Cliente', 'E-mail', 'Telefone', 'Entrega', 'Endereço', 'Rastreio', 'Pago em', 'Observações',
    ];
    const rows = orders.map((o) => [
      o.id.slice(0, 8).toUpperCase(),
      o.createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      ORDER_STATUS_LABEL[o.status] ?? o.status,
      o.isPreOrder ? 'Encomenda' : 'Pronta-entrega',
      o.product.name,
      o.size,
      o.color,
      o.quantity,
      fmtBrl(o.totalInCents),
      fmtBrl(o.discountInCents),
      fmtBrl(o.finalInCents ?? o.totalInCents - o.discountInCents),
      o.coupon?.code,
      o.customerName,
      o.customerEmail,
      o.customerPhone,
      o.deliveryMethod === 'SHIPPING' ? 'Envio' : 'Retirada',
      o.shippingAddress,
      o.trackingCode,
      o.paidAt ? o.paidAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
      o.notes,
    ]);
    return toCsv(header, rows);
  }

  /**
   * Lista de produção das encomendas: quantidades por produto × tamanho × cor.
   * `paid` = já pago (produzir); `pending` = aguardando pagamento.
   */
  async preOrderSummary(actor: Actor) {
    const rows = await this.prisma.storeOrder.groupBy({
      by: ['productId', 'size', 'color', 'status'],
      where: {
        isPreOrder: true,
        status: { notIn: [StoreOrderStatus.CANCELLED, StoreOrderStatus.REFUNDED] },
        product: await this.productScope(actor),
      },
      _sum: { quantity: true },
    });
    const productIds = Array.from(new Set(rows.map((r) => r.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, preOrderLimit: true, preOrderDeadline: true, estimatedDelivery: true },
    });
    const byProduct = new Map<string, any>();
    for (const p of products) {
      byProduct.set(p.id, { ...p, paid: 0, pending: 0, variants: new Map<string, { size: string | null; color: string | null; paid: number; pending: number }>() });
    }
    for (const r of rows) {
      const p = byProduct.get(r.productId);
      if (!p) continue;
      const qty = r._sum.quantity ?? 0;
      const key = `${r.size ?? ''}|${r.color ?? ''}`;
      const v = p.variants.get(key) ?? { size: r.size, color: r.color, paid: 0, pending: 0 };
      if (r.status === StoreOrderStatus.PENDING_PAYMENT) {
        v.pending += qty;
        p.pending += qty;
      } else {
        v.paid += qty;
        p.paid += qty;
      }
      p.variants.set(key, v);
    }
    return Array.from(byProduct.values()).map((p) => ({
      ...p,
      variants: Array.from(p.variants.values()).sort((a: any, b: any) => String(a.size).localeCompare(String(b.size))),
    }));
  }

  async updateOrderStatus(orderId: string, actor: Actor, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, ...(isAdmin(actor.role) ? {} : { product: await this.productScope(actor) }) },
      include: { product: { select: { name: true, estimatedDelivery: true } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    const target = dto.status;
    const now = new Date();

    if (target === order.status) {
      if (dto.trackingCode === undefined) return order;
      return this.prisma.storeOrder.update({ where: { id: orderId }, data: { trackingCode: dto.trackingCode || null } });
    }
    if (!ORDER_TRANSITIONS[order.status]?.includes(target)) {
      throw new BadRequestException(`Transição inválida: ${ORDER_STATUS_LABEL[order.status]} → ${ORDER_STATUS_LABEL[target] ?? target}`);
    }

    let gatewayToCancel: Array<{ provider: string; externalPaymentId: string | null }> = [];

    if (order.status === StoreOrderStatus.PENDING_PAYMENT && target === StoreOrderStatus.PAID) {
      // Pagamento recebido fora do gateway (dinheiro/maquininha) — baixa manual
      await this.prisma.$transaction(async (tx) => {
        const r = await this.fulfillment.storeOrderPaid(tx, orderId, now);
        if (r.outcome !== 'FULFILLED') throw new ConflictException('O pedido já foi pago ou mudou de status — atualize a página');
        const pending = await tx.payment.findMany({
          where: { storeOrderId: orderId, status: PaymentStatus.PENDING },
          select: { id: true, provider: true, externalPaymentId: true },
        });
        if (pending.length) {
          await tx.payment.updateMany({
            where: { id: { in: pending.map((p) => p.id) } },
            data: { status: PaymentStatus.FAILED, failureReason: 'MANUAL_PAID' },
          });
        }
        gatewayToCancel = pending;
      });
      await this.checkout.cancelAtGateway(gatewayToCancel);
      await this.email
        .sendStoreOrderPaid(order.customerEmail, {
          name: order.customerName,
          orderId: order.id,
          productName: order.product.name,
          quantity: order.quantity,
          size: order.size,
          color: order.color,
          totalInCents: order.finalInCents ?? order.totalInCents - order.discountInCents,
          isPreOrder: order.isPreOrder,
          estimatedDelivery: order.product.estimatedDelivery,
          deliveryMethod: order.deliveryMethod,
        })
        .catch(() => undefined);
      return this.prisma.storeOrder.findUnique({ where: { id: orderId } });
    }

    if (order.status === StoreOrderStatus.PENDING_PAYMENT && target === StoreOrderStatus.CANCELLED) {
      const r = await this.prisma.$transaction((tx) => this.fulfillment.releaseStoreOrder(tx, orderId, 'COACH', now));
      if (!r.released) throw new ConflictException('O pedido mudou de status — atualize a página');
      await this.checkout.cancelAtGateway(r.closedPayments);
    } else if (target === StoreOrderStatus.CANCELLED || target === StoreOrderStatus.REFUNDED) {
      await this.prisma.$transaction(async (tx) => {
        const upd = await tx.storeOrder.updateMany({
          where: { id: orderId, status: order.status },
          data: {
            status: target,
            cancelReason: target === StoreOrderStatus.REFUNDED ? 'REFUND' : 'COACH',
            statusUpdatedAt: now,
          },
        });
        if (upd.count === 0) throw new ConflictException('O pedido mudou de status — atualize a página');
        await this.fulfillment.restockPaidOrder(tx, order);
        if (target === StoreOrderStatus.REFUNDED) {
          // marcação manual — o estorno do dinheiro é feito no painel do gateway
          await tx.payment.updateMany({
            where: { storeOrderId: orderId, status: PaymentStatus.SUCCEEDED },
            data: { status: PaymentStatus.REFUNDED, refundedAt: now },
          });
        }
      });
    } else {
      const upd = await this.prisma.storeOrder.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: target,
          statusUpdatedAt: now,
          ...(dto.trackingCode !== undefined ? { trackingCode: dto.trackingCode || null } : {}),
        },
      });
      if (upd.count === 0) throw new ConflictException('O pedido mudou de status — atualize a página');
    }

    const updated = await this.prisma.storeOrder.findUnique({ where: { id: orderId } });
    await this.notifyStatus(updated!, order.product.name).catch((e) => this.logger.warn(`Notificação pedido ${orderId}: ${e?.message}`));
    return updated;
  }

  private async notifyStatus(order: { id: string; status: StoreOrderStatus; customerEmail: string; customerName: string; athleteId: string | null; trackingCode: string | null }, productName: string) {
    await this.email.sendStoreOrderStatus(order.customerEmail, {
      name: order.customerName,
      orderId: order.id,
      productName,
      status: order.status,
      trackingCode: order.trackingCode,
    });
    if (order.athleteId) {
      await this.notifications
        .createNotification(order.athleteId, NotificationType.SYSTEM, 'Atualização do pedido', `${productName}: ${ORDER_STATUS_LABEL[order.status] ?? order.status}`, { storeOrderId: order.id })
        .catch(() => undefined);
    }
  }

  async getOrderForCoach(orderId: string, actor: Actor) {
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, ...(isAdmin(actor.role) ? {} : { product: await this.productScope(actor) }) },
      include: { product: true, coupon: { select: { code: true } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    const payments = await this.prisma.payment.findMany({
      where: { storeOrderId: orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, method: true, status: true, amount: true, paidAt: true, failureReason: true, createdAt: true },
    });
    return { ...order, accessTokenHash: undefined, payments };
  }

  async getStoreStats(userId: string, role?: string, team?: ContentTeamCtx) {
    const orderProductFilter = await this.productScope({ id: userId, role, team });
    const productWhere = { ...orderProductFilter, active: true };
    const [products, orders, revenue, pending, preOrders] = await Promise.all([
      this.prisma.product.count({ where: productWhere }),
      this.prisma.storeOrder.count({ where: { product: orderProductFilter } }),
      this.prisma.storeOrder.aggregate({
        where: { product: orderProductFilter, status: { in: PAID_ORDER_STATUSES } },
        _sum: { finalInCents: true },
      }),
      this.prisma.storeOrder.count({ where: { product: orderProductFilter, status: StoreOrderStatus.PENDING_PAYMENT } }),
      this.prisma.storeOrder.count({ where: { product: orderProductFilter, isPreOrder: true, status: { in: PAID_ORDER_STATUSES } } }),
    ]);
    return {
      activeProducts: products,
      totalOrders: orders,
      pendingPayment: pending,
      paidPreOrders: preOrders,
      revenueInCents: revenue._sum.finalInCents ?? 0,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // CUPONS
  // ════════════════════════════════════════════════════════════════════════

  async createStoreCoupon(coachId: string, dto: CreateStoreCouponDto, actor?: Actor) {
    await assertCanCreateTeamContent(this.prisma, actor ?? { id: coachId, role: 'COACH' }, actor?.team);
    const code = dto.code.toUpperCase().trim();
    if (dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('A validade do cupom precisa ser uma data futura');
    }
    if (dto.type === 'PERCENT' && (!dto.value || dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Percentual deve estar entre 1 e 100');
    }
    if (dto.type === 'FIXED' && (!dto.value || dto.value <= 0)) {
      throw new BadRequestException('Informe o valor do desconto em centavos');
    }
    const existing = await this.prisma.storeCoupon.findUnique({ where: { coachId_code: { coachId, code } } });
    if (existing) throw new BadRequestException('Código já existe para este coach');

    return this.prisma.storeCoupon.create({
      data: {
        coachId,
        code,
        type: dto.type,
        value: dto.type === 'COURTESY' ? 0 : (dto.value ?? 0),
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async listStoreCoupons(actorOrCoachId: string | Actor) {
    const actor: Actor = typeof actorOrCoachId === 'string' ? { id: actorOrCoachId } : actorOrCoachId;
    return this.prisma.storeCoupon.findMany({
      where: await this.productScope(actor),
      orderBy: { createdAt: 'desc' },
      include: { coach: { select: { id: true, name: true } } },
    });
  }

  async updateStoreCoupon(couponId: string, actor: Actor, dto: UpdateStoreCouponDto) {
    const coupon = await this.prisma.storeCoupon.findFirst({
      where: { id: couponId, ...(await this.productScope(actor)) },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    let value: number | undefined;
    if (dto.value !== undefined && coupon.type !== 'COURTESY') {
      if (coupon.type === 'PERCENT' && (dto.value <= 0 || dto.value > 100)) throw new BadRequestException('Percentual deve estar entre 1 e 100');
      if (coupon.type === 'FIXED' && dto.value <= 0) throw new BadRequestException('Informe um valor de desconto maior que zero');
      value = Math.round(dto.value);
    }
    if (dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('A validade do cupom precisa ser uma data futura');
    }
    return this.prisma.storeCoupon.update({
      where: { id: couponId },
      data: {
        ...(value !== undefined ? { value } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
      },
    });
  }

  /** Prévia do desconto (o valor final é sempre recalculado na criação do pedido). */
  async validateStoreCoupon(dto: ValidateStoreCouponDto, userId?: string | null) {
    let coachIds: string[];
    let product: { priceInCents: number; athleteDiscountPercent: number; coachId: string } | null = null;
    if (dto.productId) {
      product = await this.prisma.product.findFirst({
        where: { id: dto.productId, active: true },
        select: { priceInCents: true, athleteDiscountPercent: true, coachId: true },
      });
      if (!product) throw new NotFoundException('Produto não encontrado');
      coachIds = (await this.teamCoachIdsOf(product.coachId)).coachIds;
    } else {
      coachIds = await this.resolvePublicCoachIds(dto.coachId);
    }
    const coupon = await this.findTeamCoupon(this.prisma, coachIds, dto.code, product?.coachId);
    const problem = FulfillmentService.couponProblem(coupon);
    if (problem) throw (problem.startsWith('Cupom inválido') ? new NotFoundException(problem) : new BadRequestException(problem));

    let base = dto.priceInCents ?? 0;
    if (product) {
      // mesma base da criação do pedido (já com desconto de aluno)
      base = (await this.unitPriceFor(product, userId)) * (dto.quantity ?? 1);
    }
    const discount = FulfillmentService.couponDiscount(coupon!.type, coupon!.value, base);
    return {
      id: coupon!.id,
      code: coupon!.code,
      type: coupon!.type,
      value: coupon!.value,
      discountInCents: discount,
      finalInCents: Math.max(0, base - discount),
      valid: true,
    };
  }

}
