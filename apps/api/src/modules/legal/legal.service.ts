import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsentType, NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { emailEquals } from '../../common/utils/email';
import { EmailService } from '../email/email.service';
import { CacheService } from '../cache/cache.service';
import {
  DATA_REQUEST_RESPONSE_DAYS,
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from './legal.constants';

export interface ConsentInput {
  termsVersion: string;
  privacyVersion: string;
  marketingOptIn?: boolean;
  healthDataConsent?: boolean;
}

export interface ConsentContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Chaves nunca incluídas na exportação de dados (defesa em profundidade — as consultas
 * já usam `select` explícito). Comparação case-insensitive.
 */
export const EXPORT_SECRET_KEYS = [
  'passwordHash',
  'totpSecret',
  'aiApiKey',
  'accessToken',
  'refreshToken',
  'tokenVersion',
  'token',
  'tokenHash',
  'resetToken',
  'pixQrCode',
  'pixQrCodeUrl',
  'checkoutUrl',
  'paymentUrl',
  'apiKey',
  'secret',
];
const SECRET_KEY_SET = new Set(EXPORT_SECRET_KEYS.map((k) => k.toLowerCase()));

/** Remove recursivamente qualquer chave sensível (senhas, tokens, segredos). */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as unknown as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_SET.has(k.toLowerCase())) continue;
    out[k] = stripSecrets(v);
  }
  return out as T;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);
  /** Fallback em memória do rate-limit da exportação (quando Redis não está configurado). */
  private readonly exportHits = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private cache: CacheService,
  ) {}

  getVersions() {
    return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
  }

  /** Lança 400 se as versões enviadas não forem as vigentes (cliente com página desatualizada). */
  assertCurrentVersions(input: Pick<ConsentInput, 'termsVersion' | 'privacyVersion'>) {
    if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION) {
      throw new BadRequestException(
        'Os Termos de Uso ou a Política de Privacidade foram atualizados. Recarregue a página e aceite a versão atual.',
      );
    }
  }

  /**
   * Registra o aceite (usuário + trilha de auditoria). Pode receber um client de transação.
   */
  async recordConsent(userId: string, input: ConsentInput, ctx: ConsentContext = {}, tx: any = this.prisma) {
    this.assertCurrentVersions(input);
    const now = new Date();
    const ip = ctx.ip?.slice(0, 64);
    const userAgent = ctx.userAgent?.slice(0, 300);
    const rows: { type: ConsentType; version: string; granted: boolean }[] = [
      { type: ConsentType.TERMS, version: input.termsVersion, granted: true },
      { type: ConsentType.PRIVACY, version: input.privacyVersion, granted: true },
      { type: ConsentType.MARKETING, version: input.privacyVersion, granted: !!input.marketingOptIn },
    ];
    if (input.healthDataConsent !== undefined) {
      rows.push({ type: ConsentType.HEALTH_DATA, version: input.privacyVersion, granted: !!input.healthDataConsent });
    }
    await tx.consentLog.createMany({
      data: rows.map((r) => ({ ...r, userId, ip, userAgent, createdAt: now })),
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: now,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
        marketingOptIn: !!input.marketingOptIn,
      },
    });
  }

  async getStatus(userId: string) {
    const [user, lastHealth] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { termsVersion: true, privacyVersion: true, termsAcceptedAt: true, marketingOptIn: true },
      }),
      this.prisma.consentLog.findFirst({
        where: { userId, type: ConsentType.HEALTH_DATA },
        orderBy: { createdAt: 'desc' },
        select: { granted: true, createdAt: true },
      }),
    ]);
    const needsConsent =
      !user || user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION;
    return {
      ...this.getVersions(),
      accepted: user,
      needsConsent,
      /** null = nunca respondeu; true/false = último registro */
      healthDataConsent: lastHealth ? lastHealth.granted : null,
    };
  }

  async getHistory(userId: string) {
    return this.prisma.consentLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { type: true, version: true, granted: true, createdAt: true },
    });
  }

  /** Revogação do consentimento de marketing (LGPD art. 8º §5º). */
  async setMarketing(userId: string, granted: boolean, ctx: ConsentContext = {}) {
    await this.prisma.$transaction([
      this.prisma.consentLog.create({
        data: {
          userId,
          type: ConsentType.MARKETING,
          version: PRIVACY_VERSION,
          granted,
          ip: ctx.ip?.slice(0, 64),
          userAgent: ctx.userAgent?.slice(0, 300),
        },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { marketingOptIn: granted } }),
    ]);
    return { marketingOptIn: granted };
  }

  /**
   * Concessão/revogação do consentimento específico para dados de saúde (LGPD art. 11, I e art. 8º §5º).
   * Usado logo após o cadastro do atleta e na página "Meus dados".
   */
  async setHealthDataConsent(userId: string, granted: boolean, ctx: ConsentContext = {}) {
    await this.prisma.consentLog.create({
      data: {
        userId,
        type: ConsentType.HEALTH_DATA,
        version: PRIVACY_VERSION,
        granted,
        ip: ctx.ip?.slice(0, 64),
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    return { healthDataConsent: granted };
  }

  // ─── Portabilidade / acesso (art. 18, II e V) ─────────────────────────────

  /** Rate limit: no máximo EXPORT_RATE_LIMIT_MAX exportações por janela por usuário. */
  async assertExportRateLimit(userId: string) {
    const key = `lgpd:export:${userId}`;
    const now = Date.now();
    const cached = await this.cache.get<number[]>(key);
    const previous = (cached ?? this.exportHits.get(userId) ?? []).filter(
      (t) => now - t < EXPORT_RATE_LIMIT_WINDOW_MS,
    );
    if (previous.length >= EXPORT_RATE_LIMIT_MAX) {
      throw new HttpException(
        'Limite de exportações atingido (3 por hora). Tente novamente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const hits = [...previous, now];
    this.exportHits.set(userId, hits);
    await this.cache.set(key, hits, Math.ceil(EXPORT_RATE_LIMIT_WINDOW_MS / 1000));
  }

  /**
   * Monta a cópia dos dados pessoais do titular em formato estruturado (JSON).
   * Nunca inclui hash de senha, segredo TOTP, chave de IA, tokens de integração ou de pagamento.
   */
  async exportMyData(userId: string) {
    await this.assertExportRateLimit(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        phone: true,
        dateOfBirth: true,
        isActive: true,
        timezone: true,
        appleId: true,
        aiProvider: true,
        aiModel: true,
        aiByok: true,
        totpEnabled: true,
        referralCode: true,
        referredByCode: true,
        referralCreditCents: true,
        termsAcceptedAt: true,
        termsVersion: true,
        privacyVersion: true,
        marketingOptIn: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const { appleId, ...profile } = user as typeof user & { appleId: string | null };

    const p = this.prisma;
    const [
      athleteProfile,
      coachProfile,
      workouts,
      healthSnapshots,
      nutritionLogs,
      waterLogs,
      supplements,
      assessments,
      onboarding,
      documents,
      eventRegistrations,
      storeOrders,
      payments,
      subscriptions,
      integrations,
      sentMessages,
      consentLogs,
      notifications,
    ] = await Promise.all([
      p.athleteProfile.findUnique({ where: { userId } }),
      p.coachProfile.findUnique({ where: { userId } }),
      p.workout.findMany({
        where: { athleteId: userId },
        orderBy: { scheduledDate: 'desc' },
        include: { result: true },
      }),
      p.garminHealthSnapshot.findMany({ where: { athleteId: userId }, orderBy: { date: 'desc' } }),
      p.nutritionLog.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      p.waterLog.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      p.athleteSupplement.findMany({ where: { userId }, include: { intakes: true } }),
      p.physicalAssessment.findMany({ where: { athleteId: userId }, orderBy: { assessedAt: 'desc' } }),
      p.onboardingProfile.findUnique({ where: { athleteId: userId } }),
      p.athleteDocument.findMany({
        where: { athleteId: userId },
        select: {
          id: true, fileName: true, fileUrl: true, fileType: true, category: true,
          description: true, aiAnalysis: true, createdAt: true,
        },
      }),
      p.eventRegistration.findMany({
        where: { userId },
        include: { event: { select: { id: true, title: true, eventDate: true, city: true, state: true } } },
      }),
      user.email
        ? p.storeOrder.findMany({
            where: { customerEmail: emailEquals(user.email) },
            select: {
              id: true, productId: true, customerName: true, customerEmail: true, customerPhone: true,
              size: true, color: true, quantity: true, totalInCents: true, discountInCents: true,
              finalInCents: true, status: true, paidAt: true, shippingAddress: true, notes: true,
              createdAt: true, product: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      p.payment.findMany({
        where: { userId },
        select: {
          id: true, purpose: true, method: true, amount: true, currency: true, status: true,
          provider: true, paidAt: true, storeOrderId: true, eventRegistrationId: true, createdAt: true,
        },
      }),
      p.subscription.findMany({
        where: { userId },
        select: {
          id: true, planType: true, status: true, provider: true, currentPeriodStart: true,
          currentPeriodEnd: true, cancelAtPeriodEnd: true, trialEnd: true, createdAt: true,
        },
      }),
      p.fitnessIntegration.findMany({
        where: { userId },
        select: { provider: true, isActive: true, lastSyncAt: true, createdAt: true },
      }),
      p.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, conversationId: true, content: true, createdAt: true },
      }),
      p.consentLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { type: true, version: true, granted: true, ip: true, createdAt: true },
      }),
      p.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
    ]);

    return stripSecrets({
      exportFormat: 'rr-lgpd-export',
      exportVersion: 1,
      generatedAt: new Date().toISOString(),
      legalBasis: 'LGPD (Lei 13.709/2018), art. 18, II e V — acesso e portabilidade',
      notes: [
        'Este arquivo contém os dados pessoais vinculados à sua conta na plataforma.',
        'Senhas, segredos de autenticação e tokens de integração/pagamento não são exportados por segurança.',
        'Dados de cartão e CPF informados no pagamento ficam com os gateways (Asaas/Stripe) e não são armazenados pela plataforma.',
      ],
      user: { ...profile, appleLinked: !!appleId },
      athleteProfile,
      coachProfile,
      onboarding,
      workouts,
      healthSnapshots,
      physicalAssessments: assessments,
      nutritionLogs,
      waterLogs,
      supplements,
      documents,
      eventRegistrations,
      storeOrders,
      payments,
      subscriptions,
      integrations,
      chatMessagesSent: sentMessages,
      consentLogs,
      notifications,
    });
  }

  // ─── Eliminação (art. 18, VI) ─────────────────────────────────────────────

  /**
   * Registra uma solicitação de exclusão de conta. NÃO apaga nada automaticamente:
   * avisa o encarregado (e-mail LEGAL_DPO_EMAIL + notificação aos SUPER_ADMIN), registra em
   * audit_logs e confirma o recebimento ao titular. O atendimento é manual, em até 15 dias.
   */
  async requestDeletion(userId: string, reason: string | undefined, ctx: ConsentContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const now = new Date();
    const deadline = new Date(now.getTime() + DATA_REQUEST_RESPONSE_DAYS * 24 * 60 * 60 * 1000);

    // Evita duplicidade (cliques repetidos): uma solicitação por 24h
    const recent = await this.prisma.auditLog.findFirst({
      where: {
        action: 'LGPD_DELETION_REQUEST',
        entityType: 'User',
        entityId: userId,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const recentDeadline = new Date(recent.createdAt.getTime() + DATA_REQUEST_RESPONSE_DAYS * 86_400_000);
      return { ok: true, alreadyRequested: true, requestedAt: recent.createdAt, deadline: recentDeadline };
    }

    const cleanReason = reason?.trim().slice(0, 1000) || undefined;

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LGPD_DELETION_REQUEST',
        entityType: 'User',
        entityId: userId,
        metadata: {
          email: user.email,
          role: user.role,
          reason: cleanReason ?? null,
          ip: ctx.ip?.slice(0, 64) ?? null,
          deadline: deadline.toISOString(),
        },
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN, isActive: true },
      select: { id: true },
    });
    if (admins.length) {
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: NotificationType.SYSTEM,
          title: 'Solicitação de exclusão LGPD',
          body: `${user.name} (${user.email ?? 'sem e-mail'}) solicitou a exclusão da conta. Prazo de resposta: ${deadline.toLocaleDateString('pt-BR')}.`,
          data: {
            kind: 'LGPD_DELETION_REQUEST',
            userId: user.id,
            email: user.email,
            role: user.role,
            reason: cleanReason ?? null,
            requestedAt: now.toISOString(),
            deadline: deadline.toISOString(),
          },
        })),
      });
    }

    const dpo = process.env.LEGAL_DPO_EMAIL;
    const safeName = escapeHtml(user.name);
    const safeEmail = escapeHtml(user.email ?? '—');
    const safeReason = cleanReason ? escapeHtml(cleanReason) : '—';
    const deadlineStr = deadline.toLocaleDateString('pt-BR');

    if (dpo) {
      await this.email.sendTransactional(
        dpo,
        `[LGPD] Solicitação de exclusão de conta — ${user.email ?? user.id}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px">
          <h2 style="color:#DC2626">Solicitação de exclusão de conta (LGPD art. 18, VI)</h2>
          <p><strong>Titular:</strong> ${safeName}<br/>
          <strong>E-mail:</strong> ${safeEmail}<br/>
          <strong>ID:</strong> ${user.id}<br/>
          <strong>Perfil:</strong> ${user.role}<br/>
          <strong>Recebida em:</strong> ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br/>
          <strong>Prazo de resposta:</strong> ${deadlineStr}</p>
          <p><strong>Motivo informado:</strong> ${safeReason}</p>
          <p style="color:#6b7280;font-size:13px">Atendimento manual: verifique obrigações de retenção (registros fiscais/pagamentos — 5 anos; logs de acesso — 6 meses, Marco Civil art. 15), anonimize/elimine os demais dados e responda ao titular.</p>
        </div>`,
      );
    } else {
      this.logger.warn(`LEGAL_DPO_EMAIL não configurado — solicitação de exclusão de ${user.id} registrada apenas em audit_logs/notificações`);
    }

    if (user.email) {
      await this.email.sendTransactional(
        user.email,
        'Recebemos sua solicitação de exclusão de conta',
        `<div style="font-family:Arial,sans-serif;max-width:600px;color:#111827">
          <h2 style="color:#DC2626">Solicitação recebida</h2>
          <p>Olá, ${safeName}.</p>
          <p>Recebemos sua solicitação de exclusão da conta e dos dados pessoais associados, nos termos do art. 18 da LGPD.</p>
          <p>Ela será analisada e respondida em até <strong>${DATA_REQUEST_RESPONSE_DAYS} dias</strong> (até ${deadlineStr}). Alguns dados podem ser mantidos pelo prazo exigido em lei (por exemplo, registros fiscais e de pagamento), e informaremos quais na resposta.</p>
          <p>Se você não fez esta solicitação, responda a este e-mail imediatamente${dpo ? ` ou escreva para ${escapeHtml(dpo)}` : ''}.</p>
          <p style="color:#6b7280;font-size:12px">RR — Rafinha Running</p>
        </div>`,
      );
    }

    return { ok: true, alreadyRequested: false, requestedAt: now, deadline };
  }
}
