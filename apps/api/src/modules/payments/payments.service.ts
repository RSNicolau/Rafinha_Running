import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { PaymentProvider, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private mercadoPagoService: MercadoPagoService,
  ) {}

  async createSubscription(userId: string, dto: CreateSubscriptionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (dto.provider === PaymentProvider.MERCADO_PAGO) {
      return this.mercadoPagoService.createSubscription(userId, user.email, user.name, dto.planType);
    }

    return this.stripeService.createSubscription(userId, user.email, user.name, dto.planType);
  }

  async getCurrentSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sub || {
      id: null,
      userId,
      status: 'NONE',
      planType: null,
      provider: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: null,
      updatedAt: null,
    };
  }

  async cancelSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
    });

    if (!sub) throw new NotFoundException('Nenhuma assinatura ativa encontrada');

    if (sub.provider === PaymentProvider.STRIPE) {
      return this.stripeService.cancelSubscription(userId);
    }

    return this.mercadoPagoService.cancelSubscription(userId);
  }

  async getPaymentHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    return { data: payments, total, page, totalPages: Math.ceil(total / limit) };
  }
}
