import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { settleCreditReservations } from './referral-credit';

const REFERRER_REWARD_CENTS = 5000; // R$50
const REFEREE_REWARD_CENTS = 3000;  // R$30

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generate a unique short referral code (8 chars, alphanumeric, uppercase)
   */
  private generateCode(): string {
    return randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  }

  /**
   * Ensure user has a referralCode. Generates one if missing.
   */
  async ensureReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.referralCode) return user.referralCode;

    // Generate unique code (retry on collision)
    let code = '';
    for (let i = 0; i < 5; i++) {
      const candidate = this.generateCode();
      const exists = await this.prisma.user.findFirst({ where: { referralCode: candidate } });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new ServiceUnavailableException('Não foi possível gerar seu código de indicação agora. Tente novamente.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
    return code;
  }

  /**
   * GET /referrals/me — athlete's referral dashboard data
   */
  async getMyStats(userId: string) {
    const code = await this.ensureReferralCode(userId);
    // devolve ao saldo o crédito preso em cobranças que falharam/expiraram antes de exibir
    const pendingCredit = await settleCreditReservations(this.prisma, userId).catch(() => []);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCreditCents: true, name: true },
    });

    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        referee: { select: { name: true, email: true, createdAt: true } },
      },
    });

    const totalEarnedCents = referrals
      .filter(r => r.status === 'PAID' || r.status === 'CREDITED')
      .reduce((sum, r) => sum + r.rewardCents, 0);

    const pendingCount = referrals.filter(r => r.status === 'PENDING').length;
    const paidCount = referrals.filter(r => r.status === 'PAID' || r.status === 'CREDITED').length;

    return {
      code,
      shareLink: `https://rr-rafinha-running.vercel.app/onboarding/rafinha?ref=${code}`,
      referrerRewardCents: REFERRER_REWARD_CENTS,
      refereeRewardCents: REFEREE_REWARD_CENTS,
      currentCreditCents: user?.referralCreditCents ?? 0,
      /** Crédito reservado em cobranças aguardando pagamento (volta ao saldo se não forem pagas). */
      reservedCreditCents: pendingCredit.reduce((sum, r) => sum + r.cents, 0),
      totalEarnedCents,
      stats: {
        total: referrals.length,
        pending: pendingCount,
        paid: paidCount,
      },
      referrals: referrals.map(r => ({
        id: r.id,
        status: r.status,
        refereeName: r.referee?.name ?? r.refereeEmail ?? 'Pendente',
        refereeEmail: r.refereeEmail,
        rewardCents: r.rewardCents,
        createdAt: r.createdAt,
        paidAt: r.paidAt,
      })),
    };
  }

  /**
   * Validate a referral code (public endpoint, used in onboarding)
   * Returns referrer info if valid (so referee sees who's inviting them).
   */
  async validateCode(code: string) {
    if (!code) return { valid: false };
    const referrer = await this.prisma.user.findFirst({
      where: { referralCode: code, role: 'ATHLETE', isActive: true },
      select: { id: true, name: true },
    });
    if (!referrer) return { valid: false };
    return {
      valid: true,
      referrerName: referrer.name,
      refereeRewardCents: REFEREE_REWARD_CENTS,
    };
  }

  /**
   * Called from onboarding submit — links the new athlete to their referrer.
   * Creates a PENDING referral row.
   */
  async linkRefereeOnSignup(refereeId: string, refereeEmail: string, code: string) {
    if (!code) return null;
    const referrer = await this.prisma.user.findFirst({
      where: { referralCode: code, role: 'ATHLETE' },
      select: { id: true },
    });
    if (!referrer) {
      this.logger.warn(`Referral code not found: ${code}`);
      return null;
    }
    if (referrer.id === refereeId) {
      this.logger.warn(`User cannot refer themselves: ${refereeId}`);
      return null;
    }

    // Check if referee already has a referral
    const existing = await this.prisma.referral.findUnique({ where: { refereeId } });
    if (existing) return existing;

    // Save referredByCode on the referee user
    await this.prisma.user.update({
      where: { id: refereeId },
      data: { referredByCode: code },
    });

    return this.prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId,
        refereeEmail,
        code,
        status: 'PENDING',
        rewardCents: REFERRER_REWARD_CENTS,
        refereeRewardCents: REFEREE_REWARD_CENTS,
      },
    });
  }

  /**
   * Chamado no 1º pagamento confirmado do indicado (mensalidade ACTIVE — CheckoutService.markPaid,
   * Mercado Pago legado). Marca a indicação como PAID e credita o indicador (R$50 em referralCreditCents).
   * O indicado recebe R$30:
   *  - como DESCONTO na 1ª mensalidade quando o checkout conseguiu aplicá-lo (`refereeDiscountApplied`);
   *  - senão, como saldo em referralCreditCents (fallback, ex.: plano barato demais para o desconto).
   * Idempotente e seguro sob concorrência: só a transição PENDING → PAID (updateMany condicional) credita.
   * Aceita `tx` para rodar na MESMA transação do pagamento.
   */
  async creditOnFirstPayment(
    refereeId: string,
    opts: { tx?: any; refereeDiscountApplied?: boolean } = {},
  ) {
    if (!refereeId) return null;
    const run = async (tx: any) => {
      const referral = await tx.referral.findUnique({ where: { refereeId } });
      if (!referral || referral.status !== 'PENDING') return null;
      const now = new Date();
      const upd = await tx.referral.updateMany({
        where: { id: referral.id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: now },
      });
      if (upd.count !== 1) return null; // outro processo já creditou
      await tx.user.update({
        where: { id: referral.referrerId },
        data: { referralCreditCents: { increment: referral.rewardCents } },
      });
      const refereeCredit = opts.refereeDiscountApplied ? 0 : referral.refereeRewardCents;
      if (refereeCredit > 0) {
        await tx.user.update({
          where: { id: refereeId },
          data: { referralCreditCents: { increment: refereeCredit } },
        });
      }
      this.logger.log(
        `Referral ${referral.id} PAID — indicador +${referral.rewardCents} centavos, indicado ` +
          (opts.refereeDiscountApplied ? `desconto de ${referral.refereeRewardCents} na 1ª cobrança` : `+${refereeCredit} centavos de crédito`),
      );
      return { ...referral, status: 'PAID', paidAt: now };
    };
    if (opts.tx) return run(opts.tx);
    return this.prisma.$transaction((tx) => run(tx));
  }

  /**
   * Desconto do indicado na 1ª mensalidade: indicação PENDING e nenhuma mensalidade paga antes.
   * Mantém a cobrança ≥ R$5 (mínimo do Asaas). Retorna 0 quando não se aplica.
   */
  async firstMembershipDiscountCents(refereeId: string, priceInCents: number): Promise<number> {
    return firstMembershipDiscountCents(this.prisma, refereeId, priceInCents);
  }
}

/** Valor mínimo de uma cobrança no Asaas (centavos). */
export const MIN_CHARGE_CENTS = 500;

/** Versão sem DI (usada também pela MembershipsService). */
export async function firstMembershipDiscountCents(prisma: any, refereeId: string, priceInCents: number): Promise<number> {
  if (!refereeId || !(priceInCents > 0) || !prisma?.referral?.findUnique) return 0;
  const referral = await prisma.referral.findUnique({
    where: { refereeId },
    select: { status: true, refereeRewardCents: true },
  });
  if (!referral || referral.status !== 'PENDING') return 0;
  const paidBefore = await prisma.payment.count({
    where: { userId: refereeId, purpose: 'MEMBERSHIP', status: { in: ['SUCCEEDED', 'REFUNDED'] } },
  });
  if (paidBefore > 0) return 0;
  const discount = Math.min(referral.refereeRewardCents ?? REFEREE_REWARD_CENTS, priceInCents - MIN_CHARGE_CENTS);
  return discount > 0 ? discount : 0;
}
