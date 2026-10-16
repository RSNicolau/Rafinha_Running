import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptTotpSecret, decryptTotpSecret } from '../coach-brain/byok-crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

// Sem chave de fallback — lança se API_KEY_ENCRYPTION_SECRET não estiver configurada.
const encryptSecret = encryptTotpSecret;
const decryptSecret = decryptTotpSecret;

@Injectable()
export class TwoFactorService {
  constructor(private prisma: PrismaService) {}

  /** Step 1: Generate secret + QR code (does NOT enable 2FA yet) */
  async generateSetup(userId: string, userEmail: string) {
    const current = await (this.prisma.user as any).findUnique({ where: { id: userId }, select: { totpEnabled: true } });
    // Não sobrescreve o segredo de um 2FA já ativo (quebraria o login do usuário)
    if (current?.totpEnabled) throw new BadRequestException('O 2FA já está ativado. Desative-o antes de configurar novamente.');
    const secret = authenticator.generateSecret(32);
    const otpAuthUrl = authenticator.keyuri(userEmail, 'RR Rafinha Running', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Store encrypted secret temporarily (not enabled yet)
    await (this.prisma.user as any).update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret) },
    });

    return { secret, qrCodeDataUrl, otpAuthUrl };
  }

  /** Step 2: Verify code and enable 2FA */
  async enableTotp(userId: string, token: string) {
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });

    if (!user?.totpSecret) {
      throw new BadRequestException('Gere o QR Code do 2FA antes de ativar.');
    }

    const secret = decryptSecret(user.totpSecret);
    const isValid = authenticator.verify({ token, secret });

    if (!isValid) {
      // 400 (e não 401): um código errado não pode encerrar a sessão do usuário no front
      throw new BadRequestException('Código inválido. Confira o código de 6 dígitos no seu app autenticador.');
    }

    await (this.prisma.user as any).update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    return { enabled: true };
  }

  /** Disable 2FA */
  async disableTotp(userId: string, token: string) {
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!user?.totpEnabled) {
      throw new BadRequestException('2FA não está ativado');
    }

    const secret = decryptSecret(user.totpSecret!);
    const isValid = authenticator.verify({ token, secret });

    if (!isValid) {
      // 400 (e não 401): um código errado não pode encerrar a sessão do usuário no front
      throw new BadRequestException('Código inválido. Confira o código de 6 dígitos no seu app autenticador.');
    }

    await (this.prisma.user as any).update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });

    return { disabled: true };
  }

  /** Verify code (used during login when 2FA is enabled) */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!user?.totpEnabled || !user?.totpSecret) return false;

    const secret = decryptSecret(user.totpSecret);
    return authenticator.verify({ token, secret });
  }

  /** Get 2FA status */
  async getStatus(userId: string) {
    const user = await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    return { enabled: user?.totpEnabled ?? false };
  }
}
