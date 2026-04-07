import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { PaymentProvider, SubscriptionStatus } from '@prisma/client';
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'fallback-32-char-key-for-dev-only';

function encryptKey(plaintext: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

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
      return this.mercadoPagoService.createSubscription(userId, user.email ?? '', user.name, dto.planType);
    }

    return this.stripeService.createSubscription(userId, user.email ?? '', user.name, dto.planType);
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

  // ─── Per-coach payment gateway settings ──────────────────────────────────

  async getPaymentSettings(coachId: string) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { userId: coachId } });
    if (!profile) throw new NotFoundException('Perfil de coach não encontrado');

    return {
      provider: profile.paymentProvider ?? 'pagarme',
      paymentEnabled: profile.paymentEnabled,
      hasPagarmeKey: !!profile.pagarmeApiKey,
      hasPagarmeWebhook: !!profile.pagarmeWebhookSecret,
      hasStripeKey: !!profile.stripeSecretKey,
      hasStripeWebhook: !!profile.stripeWebhookSecret,
    };
  }

  async updatePaymentSettings(
    coachId: string,
    dto: {
      provider: string;
      paymentEnabled: boolean;
      pagarmeApiKey?: string;
      pagarmeWebhookSecret?: string;
      stripeSecretKey?: string;
      stripeWebhookSecret?: string;
    },
  ) {
    const data: any = {
      paymentProvider: dto.provider,
      paymentEnabled: dto.paymentEnabled,
    };

    if (dto.pagarmeApiKey) data.pagarmeApiKey = encryptKey(dto.pagarmeApiKey);
    if (dto.pagarmeWebhookSecret) data.pagarmeWebhookSecret = encryptKey(dto.pagarmeWebhookSecret);
    if (dto.stripeSecretKey) data.stripeSecretKey = encryptKey(dto.stripeSecretKey);
    if (dto.stripeWebhookSecret) data.stripeWebhookSecret = encryptKey(dto.stripeWebhookSecret);

    await this.prisma.coachProfile.upsert({
      where: { userId: coachId },
      update: data,
      create: { userId: coachId, ...data },
    });

    return { updated: true };
  }

  async testPaymentConnection(coachId: string): Promise<{ ok: boolean; provider: string; latencyMs: number }> {
    const profile = await this.prisma.coachProfile.findUnique({ where: { userId: coachId } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');

    const provider = profile.paymentProvider ?? 'pagarme';
    const start = Date.now();

    if (provider === 'pagarme') {
      if (!profile.pagarmeApiKey) throw new Error('API Key do Pagar.me não configurada');
      const apiKey = decryptKey(profile.pagarmeApiKey);
      const res = await fetch('https://api.pagar.me/core/v5/merchants', {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
      });
      if (!res.ok) throw new Error(`Pagar.me retornou ${res.status}`);
    } else {
      if (!profile.stripeSecretKey) throw new Error('Secret Key do Stripe não configurada');
      const apiKey = decryptKey(profile.stripeSecretKey);
      const res = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Stripe retornou ${res.status}`);
    }

    return { ok: true, provider, latencyMs: Date.now() - start };
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
