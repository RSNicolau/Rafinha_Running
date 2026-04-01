import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionStatus, PaymentProvider, PaymentStatus, SubscriptionPlanType } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(private prisma: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-01-27.acacia' as any,
    });
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
  ) {
    const customerId = await this.createCustomer(userId, email, name);

    const priceId = planType === SubscriptionPlanType.ANNUAL
      ? process.env.STRIPE_ANNUAL_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      trial_period_days: 7,
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId },
    });

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

  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || '',
    );

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

    return { received: true };
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const subId = invoice.subscription as string;
    const sub = await this.prisma.subscription.findFirst({
      where: { externalSubscriptionId: subId },
    });

    if (!sub) return;

    await this.prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        userId: sub.userId,
        amount: invoice.amount_paid,
        currency: 'BRL',
        status: PaymentStatus.SUCCEEDED,
        provider: PaymentProvider.STRIPE,
        externalPaymentId: invoice.id,
        paidAt: new Date(),
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
    });
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
