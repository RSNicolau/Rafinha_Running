import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';

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
    if (!code) throw new Error('Falha ao gerar código de indicação único');

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
   * Called when a referee makes their FIRST payment (subscription becomes ACTIVE).
   * Marks referral as PAID and credits both users.
   */
  async creditOnFirstPayment(refereeId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { refereeId },
    });
    if (!referral || referral.status !== 'PENDING') return null;

    const updated = await this.prisma.$transaction([
      this.prisma.referral.update({
        where: { id: referral.id },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: referral.referrerId },
        data: { referralCreditCents: { increment: referral.rewardCents } },
      }),
      this.prisma.user.update({
        where: { id: refereeId },
        data: { referralCreditCents: { increment: referral.refereeRewardCents } },
      }),
    ]);
    this.logger.log(`Referral ${referral.id} PAID — referrer +${referral.rewardCents} cents, referee +${referral.refereeRewardCents} cents`);
    return updated[0];
  }
}
