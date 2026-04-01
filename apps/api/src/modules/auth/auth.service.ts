import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role || UserRole.ATHLETE;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role,
        ...(role === UserRole.ATHLETE && {
          athleteProfile: { create: {} },
        }),
        ...(role === UserRole.COACH && {
          coachProfile: { create: {} },
        }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      ...tokens,
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada');
    }

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Token inválido');
      }

      return this.generateTokens(user.id, user.role);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  async googleLogin(idToken: string) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token Google inválido');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Token Google inválido');
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (user) {
      // Existing user - update avatar if not set
      if (!user.avatarUrl && payload.picture) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: payload.picture },
        });
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Conta desativada');
      }
    } else {
      // New user - create account
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 12);
      user = await this.prisma.user.create({
        data: {
          email: payload.email,
          passwordHash: randomPassword,
          name: payload.name || payload.email.split('@')[0],
          role: 'ATHLETE' as any,
          avatarUrl: payload.picture || null,
          athleteProfile: { create: {} },
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Initiate password reset: generates a reset token, stores it in AppConfig with TTL.
   * In production, send this token via email. For now, returns it in the response
   * (acceptable since the frontend shows a "check your email" UI — email integration is separate).
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return { message: 'Se o e-mail existir, você receberá um link de redefinição.' };

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.appConfig.upsert({
      where: { key: `password_reset:${user.id}` },
      create: { key: `password_reset:${user.id}`, value: { token, expiresAt } },
      update: { value: { token, expiresAt } },
    });

    this.logger.log(`Password reset token generated for ${email}`);

    // In production: send email with reset link containing `token`
    // For now return token so client can show a deep link
    const resetUrl = `${process.env.APP_URL || 'http://localhost:8081'}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    return {
      message: 'Se o e-mail existir, você receberá um link de redefinição.',
      // Only exposed in non-production for testing. Remove before going live.
      ...(process.env.NODE_ENV !== 'production' && { resetUrl, token }),
    };
  }

  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Token inválido ou expirado');

    const record = await this.prisma.appConfig.findUnique({
      where: { key: `password_reset:${user.id}` },
    });
    if (!record) throw new BadRequestException('Token inválido ou expirado');

    const { token: storedToken, expiresAt } = record.value as any;
    if (storedToken !== token || new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `password_reset:${user.id}` } }).catch(() => {});
      throw new BadRequestException('Token inválido ou expirado');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await Promise.all([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.appConfig.delete({ where: { key: `password_reset:${user.id}` } }),
    ]);

    return { message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
  }

  private async generateTokens(userId: string, role: UserRole) {
    const payload = { sub: userId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET!,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
