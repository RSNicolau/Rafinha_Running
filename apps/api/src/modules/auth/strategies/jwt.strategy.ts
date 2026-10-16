import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  role: string;
  tv?: number;
  purpose?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens de propósito específico (ex.: mfa) nunca valem como access token
    if (!payload?.sub || payload.purpose) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Usuário não encontrado ou desativado');
    }

    // Sessão revogada (logout-all, troca/redefinição de senha) — tokens antigos sem `tv` também são recusados
    if (payload.tv !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const { deletedAt: _deletedAt, tokenVersion: _tv, ...rest } = user;
    return rest;
  }
}
