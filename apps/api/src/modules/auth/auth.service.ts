import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findUserByEmail, normalizeEmail } from '../../common/utils/email';
import { EmailService } from '../email/email.service';
import { LegalService } from '../legal/legal.service';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/legal.constants';
import { TwoFactorService } from '../users/two-factor.service';
import { RegisterDto, LoginDto, ResetPasswordDto, SELF_REGISTER_ROLES } from './dto/auth.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { assertPasswordPolicy } from '../../common/validators/password-policy';
import {
  activeTeamSummary,
  createTeamForOwner,
  upsertTeamMember,
  verifyTeamInvite,
  TeamInvitePayload,
} from '../teams/team-scope';

/**
 * Hash bcrypt (custo 12) de uma string aleatória descartada. Usado para que o login de um
 * e-mail inexistente gaste o mesmo tempo que o de um e-mail existente (evita enumeração por tempo).
 */
const DUMMY_PASSWORD_HASH = '$2b$12$AMm6326sfjaspf.KrZJRKuGVI/ZIK8xmnYfEaOGDCWUdj56Wb/F1y';

export const MFA_TOKEN_PURPOSE = 'mfa';
const MFA_TOKEN_TTL = '5m';

/** Prefixo (AppConfig) da lista de refresh tokens revogados por logout — chave = jti. */
export const REVOKED_REFRESH_PREFIX = 'revoked_refresh:';
/** Vida máxima de um refresh token (para limpar a lista de revogados). Espelha JWT_REFRESH_EXPIRES_IN. */
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Janela em que reusar um refresh recém-rotacionado é tratado como corrida benigna (não derruba a família). */
const REFRESH_REUSE_GRACE_MS = 10 * 1000;

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface JwtUserPayload {
  sub: string;
  role: UserRole;
  tv: number;
}

type UserLike = {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  termsVersion?: string | null;
  privacyVersion?: string | null;
};

/** true quando o usuário ainda não aceitou a versão vigente dos Termos/Política (front exibe modal bloqueante). */
export function needsConsent(user: { termsVersion?: string | null; privacyVersion?: string | null }): boolean {
  return user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION;
}

/** Mascara e-mail para logs: jo***@ex***.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(sem e-mail)';
  const [local, domain = ''] = email.split('@');
  const [host, ...tld] = domain.split('.');
  const m = (s: string) => (s ? `${s.slice(0, 2)}***` : '***');
  return `${m(local)}@${m(host)}${tld.length ? '.' + tld.join('.') : ''}`;
}

function mfaSecret(): string {
  // Segredo derivado: um mfaToken nunca é aceito como access token (e vice-versa)
  return `${process.env.JWT_SECRET}:mfa`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private legalService: LegalService,
    private loginAttempts: LoginAttemptsService,
    private twoFactor: TwoFactorService,
  ) {}

  private toUserPayload(user: UserLike) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      needsConsent: needsConsent(user),
    };
  }

  private async issueSession(user: UserLike & { tokenVersion?: number | null }) {
    const tokens = await this.generateTokens(user.id, user.role, user.tokenVersion ?? 0);
    const team = await this.teamFor(user);
    return { ...tokens, user: { ...this.toUserPayload(user), team }, team };
  }

  /** Equipe ativa resumida {id, name, slug, role} — o front usa para rotear e montar o menu. */
  private async teamFor(user: { id: string; role: UserRole }) {
    try {
      const t = await activeTeamSummary(this.prisma, user);
      return t ? { id: t.id, name: t.name, slug: t.slug, role: t.role, logoUrl: t.logoUrl, primaryColor: t.primaryColor } : null;
    } catch (err: any) {
      this.logger.warn(`Falha ao resolver equipe ativa: ${err?.message ?? err}`);
      return null;
    }
  }

  async register(dto: RegisterDto, ctx: RequestContext = {}) {
    // Defesa em profundidade: o DTO já restringe, mas nunca permitir ADMIN/SUPER_ADMIN aqui
    const role: UserRole = dto.role ?? UserRole.ATHLETE;
    if (!SELF_REGISTER_ROLES.includes(role)) {
      throw new BadRequestException('Papel inválido');
    }
    if (dto.acceptTerms !== true) {
      throw new BadRequestException('É necessário aceitar os Termos de Uso e a Política de Privacidade');
    }
    const consent = {
      termsVersion: dto.termsVersion,
      privacyVersion: dto.privacyVersion,
      marketingOptIn: !!dto.marketingOptIn,
    };
    this.legalService.assertCurrentVersions(consent);

    const email = normalizeEmail(dto.email);
    const existing = await findUserByEmail(this.prisma, email, { select: { id: true } });

    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    // Convite de equipe: a conta nasce como treinador já membro da equipe que convidou
    let teamInvite: TeamInvitePayload | null = null;
    if (dto.teamInviteToken) {
      teamInvite = await verifyTeamInvite(this.jwtService, dto.teamInviteToken);
      if (normalizeEmail(teamInvite.email) !== email) {
        throw new BadRequestException('Este convite foi enviado para outro e-mail.');
      }
      if (role !== UserRole.COACH) {
        throw new BadRequestException('Convites da equipe técnica criam conta de treinador.');
      }
      const team = await this.prisma.team.findUnique({ where: { id: teamInvite.teamId }, select: { status: true } });
      if (!team || team.status !== 'ACTIVE') throw new BadRequestException('Convite inválido ou expirado');
    }

    assertPasswordPolicy(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.user.create({
        data: {
          email,
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
          tokenVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await this.legalService.recordConsent(created.id, consent, ctx, tx);
      if (role === UserRole.COACH) {
        if (teamInvite) {
          await upsertTeamMember(tx, teamInvite.teamId, created.id, teamInvite.role);
        } else {
          // Treinador solo = equipe de 1 (ele é o OWNER)
          await createTeamForOwner(tx, { id: created.id, name: created.name }, dto.teamName);
        }
      }
      return {
        ...created,
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
      };
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto) {
    // Chave do bloqueio e busca SEMPRE pelo e-mail normalizado (Ana@X.com e ana@x.com são a mesma conta)
    const email = normalizeEmail(dto.email);
    await this.loginAttempts.assertNotLocked(email);

    const user: any = await findUserByEmail(this.prisma, email);

    // Sempre executa bcrypt.compare (hash fictício se o usuário não existir) para tempo uniforme
    const isPasswordValid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !isPasswordValid) {
      const lockedNow = await this.loginAttempts.registerFailure(email);
      if (lockedNow) {
        this.logger.warn(`Conta bloqueada temporariamente por excesso de falhas de login: ${maskEmail(email)}`);
      }
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Conta desativada');
    }

    await this.loginAttempts.reset(email);

    if (user.totpEnabled) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: MFA_TOKEN_PURPOSE, tv: user.tokenVersion ?? 0 },
        { secret: mfaSecret(), expiresIn: MFA_TOKEN_TTL as any },
      );
      return { mfaRequired: true as const, mfaToken };
    }

    return this.issueSession(user);
  }

  /** Segunda etapa do login quando o usuário tem 2FA (TOTP) ativado. */
  async loginWithMfa(mfaToken: string, code: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(mfaToken, { secret: mfaSecret() });
    } catch {
      throw new UnauthorizedException('Sessão de verificação expirada. Faça login novamente.');
    }
    if (!payload || payload.purpose !== MFA_TOKEN_PURPOSE || !payload.sub) {
      throw new UnauthorizedException('Sessão de verificação inválida. Faça login novamente.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt || (user.tokenVersion ?? 0) !== payload.tv) {
      throw new UnauthorizedException('Sessão de verificação inválida. Faça login novamente.');
    }

    const lockKey = user.email ? normalizeEmail(user.email) : user.id;
    await this.loginAttempts.assertNotLocked(lockKey);

    const ok = await this.twoFactor.verifyToken(user.id, code);
    if (!ok) {
      await this.loginAttempts.registerFailure(lockKey);
      // 400 (não 401) para o front manter a etapa do código sem disparar o fluxo de refresh/logout
      throw new BadRequestException('Código de verificação inválido');
    }
    await this.loginAttempts.reset(lockKey);

    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload?.sub },
      select: { id: true, role: true, isActive: true, deletedAt: true, tokenVersion: true },
    });

    if (!user || !user.isActive || user.deletedAt || payload.tv !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (payload.jti) {
      // Rotação: cada refresh token vale UMA vez. O jti usado é revogado (claim atômico) e um novo par é emitido.
      const revoked = await this.revokedRefreshRow(payload.jti);
      if (revoked) await this.onRefreshReuse(user.id, payload.jti, revoked);
      const claimed = await this.claimRefreshJti(user.id, payload);
      if (!claimed) {
        // outra requisição usou este mesmo refresh ao mesmo tempo (corrida benigna) → 401 sem derrubar a família
        throw new UnauthorizedException('Refresh token inválido ou expirado');
      }
    }

    return this.generateTokens(user.id, user.role, user.tokenVersion ?? 0);
  }

  private async revokedRefreshRow(jti: string): Promise<{ value?: any; createdAt?: Date | string } | null> {
    return this.prisma.appConfig.findUnique({ where: { key: `${REVOKED_REFRESH_PREFIX}${jti}` } });
  }

  /**
   * Reuso de refresh já revogado (rotacionado ou encerrado no logout): possível roubo do token →
   * revoga TODA a família (tokenVersion++) e responde 401. Exceção: o mesmo token rotacionado há
   * poucos segundos (duas abas/requests renovando juntas) → só 401, sem derrubar as sessões.
   */
  private async onRefreshReuse(userId: string, jti: string, row: { value?: any; createdAt?: Date | string }): Promise<never> {
    const rotatedAt = row?.value?.rotatedAt ? new Date(row.value.rotatedAt).getTime() : NaN;
    const benignRace = row?.value?.reason === 'ROTATED' && Number.isFinite(rotatedAt) && Date.now() - rotatedAt < REFRESH_REUSE_GRACE_MS;
    if (!benignRace) {
      this.logger.warn(`Reuso de refresh token revogado (jti ${jti.slice(0, 8)}…) — encerrando todas as sessões do usuário ${userId}`);
      await this.revokeSessions(userId);
    }
    throw new UnauthorizedException('Refresh token inválido ou expirado');
  }

  /** Marca o jti como usado (create = atômico pela chave única). false se outro processo já o marcou. */
  private async claimRefreshJti(userId: string, payload: { jti: string; exp?: number }): Promise<boolean> {
    const key = `${REVOKED_REFRESH_PREFIX}${payload.jti}`;
    const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + REFRESH_MAX_AGE_MS;
    try {
      await this.prisma.appConfig.create({
        data: { key, value: { userId, exp: new Date(expMs).toISOString(), reason: 'ROTATED', rotatedAt: new Date().toISOString() } },
      });
      return true;
    } catch (e: any) {
      if (e?.code === 'P2002') return false;
      throw e;
    }
  }

  /**
   * Logout: revoga no servidor o refresh token desta sessão (lista de jti revogados até expirar).
   * Com allDevices=true encerra todas as sessões (tokenVersion++). Idempotente: token ausente,
   * inválido ou expirado → 200 (não há sessão a revogar e nada é revelado).
   * Tokens antigos, emitidos antes do jti, não podem ser revogados individualmente → revoga todas.
   */
  async logout(refreshToken: string | undefined, opts: { allDevices?: boolean; userId?: string } = {}) {
    const done = { message: 'Sessão encerrada.' };
    let payload: any = null;
    if (refreshToken) {
      try {
        payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET! });
      } catch {
        payload = null;
      }
    }

    // Sem refresh válido: só dá para encerrar tudo se o chamador estiver autenticado (access token)
    const userId: string | undefined = payload?.sub ?? opts.userId;
    if (!userId) return done;

    if (payload) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
      // Refresh de uma geração já revogada: nada a fazer
      if (!user || payload.tv !== (user.tokenVersion ?? 0)) return done;
    }

    if (opts.allDevices || (payload && !payload.jti)) {
      await this.revokeSessions(userId);
      return { message: 'Todas as sessões foram encerradas.' };
    }
    if (!payload) return done;

    const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + REFRESH_MAX_AGE_MS;
    const key = `${REVOKED_REFRESH_PREFIX}${payload.jti}`;
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: { userId, exp: new Date(expMs).toISOString(), reason: 'LOGOUT' } },
      update: {},
    });
    // Limpeza oportunista: entradas mais antigas que a vida máxima de um refresh já expiraram
    Promise.resolve(
      this.prisma.appConfig.deleteMany({
        where: { key: { startsWith: REVOKED_REFRESH_PREFIX }, createdAt: { lt: new Date(Date.now() - REFRESH_MAX_AGE_MS) } },
      }),
    ).catch(() => {});
    return done;
  }

  /** Revoga todas as sessões (access + refresh tokens) do usuário. */
  async revokeSessions(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { message: 'Todas as sessões foram encerradas.' };
  }

  async googleLogin(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ServiceUnavailableException('Login com Google não está disponível no momento');
    }
    const client = new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token Google inválido');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Token Google inválido');
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('O e-mail da conta Google não foi verificado');
    }

    // Check if user exists
    const googleEmail = normalizeEmail(payload.email);
    let user: any = await findUserByEmail(this.prisma, googleEmail);

    if (user) {
      if (!user.isActive || user.deletedAt) {
        throw new UnauthorizedException('Conta desativada');
      }
      // Existing user - update avatar if not set
      if (!user.avatarUrl && payload.picture) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: payload.picture },
        });
      }
    } else {
      // New user - create account (sem aceite LGPD: needsConsent = true força o modal no front)
      const randomPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
      user = await this.prisma.user.create({
        data: {
          email: googleEmail,
          passwordHash: randomPassword,
          name: payload.name || payload.email.split('@')[0],
          role: UserRole.ATHLETE,
          avatarUrl: payload.picture || null,
          athleteProfile: { create: {} },
        },
      });
    }

    return this.issueSession(user);
  }

  async appleLogin(identityToken: string, fullName?: string) {
    const clientId = process.env.APPLE_CLIENT_ID;
    if (!clientId) {
      throw new ServiceUnavailableException('Login com Apple não está disponível no momento');
    }

    let applePayload: any;
    try {
      applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: clientId,
        ignoreExpiration: false,
      });
    } catch {
      throw new UnauthorizedException('Token Apple inválido');
    }

    const { sub: appleUserId, email } = applePayload ?? {};
    const emailVerified = applePayload?.email_verified === true || applePayload?.email_verified === 'true';

    if (!appleUserId) {
      throw new UnauthorizedException('Token Apple inválido');
    }

    // Try to find by appleId first, then fall back to (verified) email
    let user = await this.prisma.user.findFirst({
      where: { appleId: appleUserId },
    });

    if (!user && email && emailVerified) {
      user = await findUserByEmail(this.prisma, email);
      if (user && !user.appleId) {
        // Link existing account to Apple ID
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { appleId: appleUserId },
        });
      } else if (user && user.appleId !== appleUserId) {
        throw new UnauthorizedException('Este e-mail já está vinculado a outra conta Apple');
      }
    }

    if (!user) {
      // Apple doesn't always return email (user can hide it). Generate a unique placeholder to avoid NULL unique constraint violations.
      const resolvedEmail = email && emailVerified ? normalizeEmail(email) : `apple_${appleUserId}@privaterelay.appleid.com`;
      const randomPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
      const name = fullName?.trim() || (email ? email.split('@')[0] : `Atleta_${appleUserId.slice(0, 6)}`);
      user = await this.prisma.user.create({
        data: {
          email: resolvedEmail,
          passwordHash: randomPassword,
          name,
          role: UserRole.ATHLETE,
          appleId: appleUserId,
          athleteProfile: { create: {} },
        },
      });
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Conta desativada');
    }

    return this.issueSession(user);
  }

  /**
   * Inicia a redefinição de senha: gera token aleatório (guardado como hash bcrypt em AppConfig, 1h de validade)
   * e envia por e-mail. O token só volta na resposta em NODE_ENV=test.
   */
  async forgotPassword(rawEmail: string) {
    const genericResponse = { message: 'Se o e-mail existir, você receberá um link de redefinição.' };
    const email = normalizeEmail(rawEmail);
    const user: any = await findUserByEmail(this.prisma, email);
    // Always return success to prevent email enumeration
    if (!user || !user.isActive || user.deletedAt) return genericResponse;

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const tokenHash = await bcrypt.hash(token, 10);

    await this.prisma.appConfig.upsert({
      where: { key: `password_reset:${user.id}` },
      create: { key: `password_reset:${user.id}`, value: { tokenHash, expiresAt } },
      update: { value: { tokenHash, expiresAt } },
    });

    this.logger.log(`Token de redefinição de senha gerado para ${maskEmail(email)}`);

    try {
      await this.emailService.sendPasswordReset(email, user.name, token);
    } catch (err: any) {
      this.logger.error(`Falha ao enviar e-mail de redefinição para ${maskEmail(email)}: ${err?.message ?? err}`);
    }

    return {
      ...genericResponse,
      ...(process.env.NODE_ENV === 'test' && { token }),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;
    const email = normalizeEmail(dto.email);
    assertPasswordPolicy(newPassword);

    const invalid = () => new BadRequestException('Token inválido ou expirado');
    const user: any = await findUserByEmail(this.prisma, email);
    if (!user) throw invalid();

    const key = `password_reset:${user.id}`;
    const record = await this.prisma.appConfig.findUnique({ where: { key } });
    if (!record) throw invalid();

    const { tokenHash, expiresAt } = (record.value ?? {}) as any;
    if (!tokenHash || !expiresAt || Number.isNaN(new Date(expiresAt).getTime()) || new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.deleteMany({ where: { key } }).catch(() => {});
      throw invalid();
    }
    const isValid = await bcrypt.compare(token, tokenHash);
    if (!isValid) throw invalid();

    // Uso único: consome o token atomicamente — se outra requisição já consumiu, falha
    const consumed = await this.prisma.appConfig.deleteMany({ where: { key } });
    if (!consumed || consumed.count !== 1) throw invalid();

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Troca a senha e revoga todas as sessões existentes
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.loginAttempts.reset(email);

    return { message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
  }

  private async generateTokens(userId: string, role: UserRole, tokenVersion: number) {
    const payload: JwtUserPayload = { sub: userId, role, tv: tokenVersion };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      // jti: identificador único do refresh — permite revogar ESTA sessão no logout
      this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
        secret: process.env.JWT_REFRESH_SECRET!,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
