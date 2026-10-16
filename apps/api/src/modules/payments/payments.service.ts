import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { isPlatformAdmin, teamIdsWithRoles, TEAM_MANAGER_ROLES } from '../../common/utils/ownership';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { PaymentProvider, SubscriptionStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { createHash } from 'crypto';

// ITEM 2 — No fallback key; throws at call-time if env var is missing
function getEncryptionKey(): Buffer {
  const encKey = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!encKey) throw new ServiceUnavailableException('Criptografia de chaves não configurada no servidor — fale com o suporte');
  return crypto.scryptSync(encKey, 'salt', 32);
}

function encryptKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private mercadoPagoService: MercadoPagoService,
  ) {}

  async createSubscription(userId: string, dto: CreateSubscriptionDto & { discountCents?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // ITEM 10 — Validate email before creating subscription
    if (!user.email || !user.email.includes('@')) {
      throw new BadRequestException('User must have a valid email to create a subscription');
    }

    // ITEM 4 — Idempotency key based on userId + planType + date (day)
    const idempotencyKey = createHash('sha256')
      .update(`${userId}-${dto.planType}-${new Date().toISOString().slice(0, 10)}`)
      .digest('hex');

    if (dto.provider === PaymentProvider.MERCADO_PAGO) {
      return this.mercadoPagoService.createSubscription(userId, user.email, user.name, dto.planType, idempotencyKey, dto.discountCents ?? 0);
    }

    return this.stripeService.createSubscription(userId, user.email, user.name, dto.planType, idempotencyKey);
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

  /** Só ADMIN da plataforma ou OWNER/ADMIN ativo de uma equipe gerencia o gateway próprio (o RolesGuard já exige COACH). */
  async assertCanManagePaymentSettings(user: { id: string; role?: string | null }) {
    if (isPlatformAdmin(user)) return;
    if (user.role !== 'COACH') throw new ForbiddenException('Acesso negado');
    const teams = await teamIdsWithRoles(this.prisma, user.id, TEAM_MANAGER_ROLES);
    if (!teams.length) {
      throw new ForbiddenException('Somente o dono ou um gestor da equipe altera as configurações de pagamento');
    }
  }

  async getPaymentSettings(coachId: string) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { userId: coachId } });
    // Sem perfil ainda: devolve os padrões (nada é criado num GET)
    return {
      provider: profile?.paymentProvider ?? 'pagarme',
      paymentEnabled: profile?.paymentEnabled ?? false,
      hasPagarmeKey: !!profile?.pagarmeApiKey,
      hasPagarmeWebhook: !!profile?.pagarmeWebhookSecret,
      hasStripeKey: !!profile?.stripeSecretKey,
      hasStripeWebhook: !!profile?.stripeWebhookSecret,
    };
  }

  async updatePaymentSettings(coachId: string, dto: UpdatePaymentSettingsDto) {
    const data: any = {
      paymentProvider: dto.provider,
      paymentEnabled: dto.paymentEnabled,
    };

    if (dto.pagarmeApiKey) data.pagarmeApiKey = encryptKey(dto.pagarmeApiKey.trim());
    if (dto.pagarmeWebhookSecret) data.pagarmeWebhookSecret = encryptKey(dto.pagarmeWebhookSecret.trim());
    if (dto.stripeSecretKey) data.stripeSecretKey = encryptKey(dto.stripeSecretKey.trim());
    if (dto.stripeWebhookSecret) data.stripeWebhookSecret = encryptKey(dto.stripeWebhookSecret.trim());

    // Só treinadores chegam aqui (RolesGuard + assertCanManagePaymentSettings); conta sem perfil de coach → 404
    const user = await this.prisma.user.findUnique({ where: { id: coachId }, select: { role: true } });
    if (!user || (user.role !== 'COACH' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      throw new NotFoundException('Perfil de treinador não encontrado');
    }
    await this.prisma.coachProfile.upsert({
      where: { userId: coachId },
      update: data,
      create: { userId: coachId, ...data },
    });

    return { updated: true };
  }

  /** Testa a chave do gateway. Erros do usuário → 400; gateway fora/recusou → 503. Nunca 500. */
  async testPaymentConnection(coachId: string): Promise<{ ok: boolean; provider: string; latencyMs: number }> {
    const profile = await this.prisma.coachProfile.findUnique({ where: { userId: coachId } });
    const provider = profile?.paymentProvider ?? 'pagarme';
    const label = provider === 'stripe' ? 'Stripe' : 'Pagar.me';
    const start = Date.now();

    const encrypted = provider === 'stripe' ? profile?.stripeSecretKey : profile?.pagarmeApiKey;
    if (!encrypted) {
      throw new BadRequestException(
        provider === 'stripe' ? 'Secret Key do Stripe não configurada' : 'API Key do Pagar.me não configurada',
      );
    }

    let apiKey: string;
    try {
      apiKey = decryptKey(encrypted);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(`Não foi possível ler a chave salva do ${label}. Salve a chave novamente.`);
    }

    let res: { ok: boolean; status: number };
    try {
      res =
        provider === 'stripe'
          ? await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${apiKey}` } })
          : await fetch('https://api.pagar.me/core/v5/merchants', {
              headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
            });
    } catch (e: any) {
      this.logger.warn(`Teste de conexão ${label} (coach ${coachId}) falhou: ${e?.message ?? e}`);
      throw new ServiceUnavailableException(`Não foi possível conectar ao ${label} agora. Tente novamente em instantes.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestException(`O ${label} recusou a chave (HTTP ${res.status}). Confira se a chave está correta.`);
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`O ${label} respondeu com erro (HTTP ${res.status}). Tente novamente em instantes.`);
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
