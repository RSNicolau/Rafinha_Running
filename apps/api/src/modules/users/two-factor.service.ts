import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'fallback-32-char-key-for-dev-only';

function encryptSecret(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'totp-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'totp-salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

@Injectable()
export class TwoFactorService {
  constructor(private prisma: PrismaService) {}

  /** Step 1: Generate secret + QR code (does NOT enable 2FA yet) */
  async generateSetup(userId: string, userEmail: string) {
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
      throw new BadRequestException('Configure o 2FA antes de ativar. Chame POST /users/me/2fa/setup primeiro.');
    }

    const secret = decryptSecret(user.totpSecret);
    const isValid = authenticator.verify({ token, secret });

    if (!isValid) {
      throw new UnauthorizedException('Código TOTP inválido');
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
      throw new UnauthorizedException('Código TOTP inválido');
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
