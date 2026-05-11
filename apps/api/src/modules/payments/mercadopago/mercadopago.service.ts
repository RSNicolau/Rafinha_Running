import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReferralsService } from '../../referrals/referrals.service';
import {
  SubscriptionStatus, PaymentProvider, PaymentStatus,
  SubscriptionPlanType,
} from '@prisma/client';

// Plan amounts (full price) used by both createSubscription and webhook restore
const PLAN_FULL_AMOUNTS: Record<string, number> = {
  MONTHLY:    174.00,
  QUARTERLY:  495.00,
  SEMIANNUAL: 960.00,
  ANNUAL:     960.00,
  TRIAL:      0,
};
const PLAN_FULL_FREQUENCY: Record<string, number> = {
  MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12, TRIAL: 1,
};

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  private readonly webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';

  constructor(
    private prisma: PrismaService,
    private referralsService: ReferralsService,
  ) {}

  async createSubscription(
    userId: string,
    email: string,
    name: string,
    planType: SubscriptionPlanType,
    idempotencyKey?: string,
    discountCents: number = 0,
  ) {
    const fullAmount = PLAN_FULL_AMOUNTS[planType]   ?? 174.00;
    const frequency  = PLAN_FULL_FREQUENCY[planType] ?? 1;
    // Apply one-time referral discount on first cycle (revert on first paid webhook)
    const discount = Math.min(Math.max(discountCents, 0) / 100, fullAmount - 1); // never zero
    const amount   = Number((fullAmount - discount).toFixed(2));
    const hasDiscount = discount > 0;

    if (!this.accessToken) {
      this.logger.warn('MERCADO_PAGO_ACCESS_TOKEN não configurado');
      throw new Error('Gateway de pagamento não configurado');
    }

    const res = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({
        reason: `RR Rafinha Running - Plano ${planType}`,
        auto_recurring: {
          frequency,
          frequency_type: 'months',
          transaction_amount: amount,
          currency_id: 'BRL',
        },
        back_url: process.env.APP_URL || 'http://localhost:8081',
        payer_email: email,
        status: 'pending',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`MercadoPago subscription error: ${res.status} ${err}`);
      throw new Error('Falha ao criar assinatura no Mercado Pago');
    }

    const preapprovalData: any = await res.json();

    if (hasDiscount) {
      this.logger.log(`Preapproval ${preapprovalData.id}: first-cycle discount R$${discount.toFixed(2)} applied (will revert to R$${fullAmount.toFixed(2)} after first payment)`);
    }

    await this.prisma.subscription.create({
      data: {
        userId,
        planType,
        status: SubscriptionStatus.INCOMPLETE,
        provider: PaymentProvider.MERCADO_PAGO,
        externalSubscriptionId: preapprovalData.id,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + frequency * 30 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      provider: PaymentProvider.MERCADO_PAGO,
      checkoutUrl: preapprovalData.init_point,
      subscriptionId: preapprovalData.id,
    };
  }

  async createPixPayment(userId: string, email: string, amount: number, description: string) {
    if (!this.accessToken) {
      throw new Error('Gateway de pagamento PIX não configurado (MERCADO_PAGO_ACCESS_TOKEN)');
    }

    const idempotencyKey = `pix_${userId}_${Date.now()}`;

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description,
        payment_method_id: 'pix',
        payer: { email },
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        metadata: { userId },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Mercado Pago PIX error: ${res.status} ${err}`);
      throw new Error('Falha ao gerar cobrança PIX');
    }

    const data: any = await res.json();
    this.logger.log(`PIX payment created: ${data.id} for user ${userId}`);

    return {
      paymentId: data.id,
      qrCode: data.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      amount,
      description,
      expiresAt: data.date_of_expiration,
      status: data.status,
    };
  }

  async cancelSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: PaymentProvider.MERCADO_PAGO,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
    });

    if (!sub?.externalSubscriptionId) return;

    if (this.accessToken) {
      await fetch(`https://api.mercadopago.com/preapproval/${sub.externalSubscriptionId}`, {
        method: 'PUT',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    return { message: 'Assinatura será cancelada no fim do período' };
  }

  /**
   * Validate MercadoPago webhook signature.
   * Header: x-signature contains ts=...v1=<hmac>
   */
  validateWebhookSignature(xSignature: string, xRequestId: string, rawBody: Buffer): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET não configurado — ignorando validação de assinatura');
      return true; // Permissivo em dev sem secret configurado
    }

    try {
      const parts = xSignature.split(',');
      const tsMatch = parts.find(p => p.startsWith('ts='))?.split('=')[1];
      const v1Match = parts.find(p => p.startsWith('v1='))?.split('=')[1];

      if (!tsMatch || !v1Match) return false;

      const signedTemplate = `id:${xRequestId};request-id:${xRequestId};ts:${tsMatch};`;
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(signedTemplate)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(v1Match), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(body: any) {
    this.logger.log(`Mercado Pago webhook: ${body.type} id=${body.data?.id}`);

    if (body.type === 'payment') {
      await this.handlePaymentNotification(body.data?.id);
    }

    if (body.type === 'subscription_preapproval') {
      await this.handlePreapprovalNotification(body.data?.id);
    }

    return { received: true };
  }

  private async handlePaymentNotification(paymentId: string) {
    if (!paymentId || !this.accessToken) return;

    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!res.ok) return;
      const payment: any = await res.json();

      this.logger.log(`MP Payment ${paymentId} status: ${payment.status}`);

      // Find subscription via metadata or external ID
      const preapprovalId = payment.metadata?.preapproval_id || payment.subscription_id;
      if (!preapprovalId) return;

      const subscription = await this.prisma.subscription.findFirst({
        where: { externalSubscriptionId: String(preapprovalId) },
      });
      if (!subscription) return;

      const status = payment.status === 'approved' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;

      // Record payment
      await this.prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          amount: Math.round(payment.transaction_amount * 100),
          currency: payment.currency_id || 'BRL',
          status,
          provider: PaymentProvider.MERCADO_PAGO,
          externalPaymentId: String(paymentId),
          paidAt: status === PaymentStatus.SUCCEEDED ? new Date() : null,
        },
      }).catch(() => {}); // Ignore duplicate

      // Activate subscription on successful payment
      const wasInactive = subscription.status !== SubscriptionStatus.ACTIVE;
      if (status === PaymentStatus.SUCCEEDED && wasInactive) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.ACTIVE },
        });

        // (A) Auto-credit referral on first successful payment
        try {
          await this.referralsService.creditOnFirstPayment(subscription.userId);
        } catch (e: any) {
          this.logger.warn(`Falha ao creditar referral: ${e.message}`);
        }

        // (C) Restore preapproval price to full plan amount (in case first cycle had referral discount)
        try {
          const fullAmount = PLAN_FULL_AMOUNTS[subscription.planType] ?? 0;
          const currentAmount = Number(payment.transaction_amount);
          if (fullAmount > 0 && currentAmount + 0.01 < fullAmount) {
            await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
              method: 'PUT',
              signal: AbortSignal.timeout(10000),
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                auto_recurring: {
                  transaction_amount: fullAmount,
                  currency_id: 'BRL',
                },
              }),
            });
            this.logger.log(`Preapproval ${preapprovalId}: price restored to R$${fullAmount.toFixed(2)} after first payment`);
          }
        } catch (e: any) {
          this.logger.warn(`Falha ao restaurar preço cheio do preapproval: ${e.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar pagamento MP ${paymentId}: ${err.message}`);
    }
  }

  private async handlePreapprovalNotification(preapprovalId: string) {
    if (!preapprovalId || !this.accessToken) return;

    try {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!res.ok) return;
      const preapproval: any = await res.json();

      this.logger.log(`MP Preapproval ${preapprovalId} status: ${preapproval.status}`);

      const subscription = await this.prisma.subscription.findFirst({
        where: { externalSubscriptionId: String(preapprovalId) },
      });
      if (!subscription) return;

      const statusMap: Record<string, SubscriptionStatus> = {
        authorized: SubscriptionStatus.ACTIVE,
        pending: SubscriptionStatus.INCOMPLETE,
        cancelled: SubscriptionStatus.CANCELED,
        paused: SubscriptionStatus.PAST_DUE,
      };

      const newStatus = statusMap[preapproval.status];
      if (newStatus && newStatus !== subscription.status) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: newStatus },
        });
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar preapproval MP ${preapprovalId}: ${err.message}`);
    }
  }
}
