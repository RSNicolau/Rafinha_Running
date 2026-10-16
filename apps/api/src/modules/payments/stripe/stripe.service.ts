import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionStatus, PaymentProvider, PaymentStatus, SubscriptionPlanType } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private _stripe: Stripe | null = null;

  constructor(private prisma: PrismaService) {}

  // Lazy: só instancia o cliente Stripe quando um pagamento é processado, e
  // falha com erro claro em vez de derrubar o boot da API se a env não existir.
  private get stripe(): Stripe {
    if (!this._stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new ServiceUnavailableException('Pagamento com cartão internacional indisponível no momento');
      }
      this._stripe = new Stripe(key, {
        apiVersion: '2025-01-27.acacia' as any,
      });
    }
    return this._stripe;
  }

  async createCustomer(userId: string, email: string, name: string) {
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });
    return customer.id;
  }

  async createSubscription(
    userId: string,
    email: string,
    name: string,
    planType: SubscriptionPlanType,
    idempotencyKey?: string,
  ) {
    const customerId = await this.createCustomer(userId, email, name);

    const priceId = planType === SubscriptionPlanType.ANNUAL
      ? process.env.STRIPE_ANNUAL_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    const subscription = await this.stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        trial_period_days: 7,
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    await this.prisma.subscription.create({
      data: {
        userId,
        planType,
        status: SubscriptionStatus.TRIALING,
        provider: PaymentProvider.STRIPE,
        externalSubscriptionId: subscription.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
      },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret,
    };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
    });

    if (!subscription?.externalSubscriptionId) return;

    await this.stripe.subscriptions.update(subscription.externalSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    return { message: 'Assinatura será cancelada no fim do período' };
  }

  get isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Stripe Checkout Session (pagamento único, BRL) — backup do Asaas / "cartão internacional".
   * O valor vem SEMPRE do servidor (Payment.amount).
   */
  async createCheckoutSession(input: {
    paymentId: string;
    purpose: string;
    refId: string;
    amountInCents: number;
    description: string;
    customerEmail?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string | null }> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        currency: 'brl',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: input.amountInCents,
              product_data: { name: input.description.slice(0, 250) },
            },
          },
        ],
        client_reference_id: input.paymentId,
        customer_email: input.customerEmail || undefined,
        metadata: { paymentId: input.paymentId, purpose: input.purpose, refId: input.refId },
        payment_intent_data: {
          metadata: { paymentId: input.paymentId, purpose: input.purpose, refId: input.refId },
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // mínimo aceito pela Stripe é 30 min
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      },
      { idempotencyKey: `checkout_${input.paymentId}` },
    );
    return { id: session.id, url: session.url };
  }

  async retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(id);
  }

  async retrievePaymentIntentMetadata(id: string): Promise<Record<string, string> | null> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(id);
      return (pi.metadata as Record<string, string>) ?? null;
    } catch (err: any) {
      this.logger.warn(`PaymentIntent ${id} indisponível: ${err?.message}`);
      return null;
    }
  }

  async expireCheckoutSession(id: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(id);
    } catch (err: any) {
      this.logger.warn(`Não foi possível expirar sessão Stripe ${id}: ${err?.message}`);
    }
  }

  /** Verifica a assinatura do webhook. Fail-closed: sem STRIPE_WEBHOOK_SECRET → 503. */
  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET não configurado — rejeitando webhook Stripe');
      throw new ServiceUnavailableException('Webhook Stripe não configurado');
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.verifyWebhook(rawBody, signature);
    await this.handleSubscriptionEvent(event);
    return { received: true };
  }

  /** Eventos de assinatura recorrente (Stripe Billing). */
  async handleSubscriptionEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const subId = invoice.subscription as string;
    const sub = await this.prisma.subscription.findFirst({
      where: { externalSubscriptionId: subId },
    });

    if (!sub) return;

    // upsert: a mesma fatura pode ter gerado antes um registro FAILED (invoice.payment_failed)
    await this.prisma.payment.upsert({
      where: { externalPaymentId: invoice.id },
      create: {
        subscriptionId: sub.id,
        userId: sub.userId,
        amount: invoice.amount_paid,
        currency: 'BRL',
        status: PaymentStatus.SUCCEEDED,
        provider: PaymentProvider.STRIPE,
        externalPaymentId: invoice.id,
        paidAt: new Date(),
      },
      update: {
        amount: invoice.amount_paid,
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
        failureReason: null,
      },
    });

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEnd: null,
      },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const subId = invoice.subscription as string;
    const sub = await this.prisma.subscription.findFirst({
      where: { externalSubscriptionId: subId },
    });

    if (!sub) return;

    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEnd,
      },
    });

    // upsert por externalPaymentId (falhas repetidas da mesma fatura não geram P2002);
    // nunca rebaixa uma fatura que já consta como paga
    const existing = await this.prisma.payment.findUnique({ where: { externalPaymentId: invoice.id } });
    if (!existing) {
      await this.prisma.payment.create({
        data: {
          subscriptionId: sub.id,
          userId: sub.userId,
          amount: invoice.amount_due,
          currency: 'BRL',
          status: PaymentStatus.FAILED,
          provider: PaymentProvider.STRIPE,
          externalPaymentId: invoice.id,
        },
      }).catch((e: any) => {
        if (e?.code !== 'P2002') throw e; // corrida com outra entrega do mesmo evento
      });
    } else if (existing.status !== PaymentStatus.SUCCEEDED) {
      await this.prisma.payment.update({ where: { id: existing.id }, data: { status: PaymentStatus.FAILED, amount: invoice.amount_due } });
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const sub = await this.prisma.subscription.findFirst({
      where: { externalSubscriptionId: subscription.id },
    });

    if (!sub) return;

    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      trialing: SubscriptionStatus.TRIALING,
      incomplete: SubscriptionStatus.INCOMPLETE,
    };

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: statusMap[subscription.status] || sub.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { externalSubscriptionId: subscription.id },
      data: { status: SubscriptionStatus.CANCELED },
    });
  }
}
