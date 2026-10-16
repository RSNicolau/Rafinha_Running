import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard, isRoleAllowed } from './roles.guard';
import { CustomThrottlerGuard } from './custom-throttler.guard';
import { MetricsAccessGuard } from './metrics-access.guard';

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function ctxFor(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const run = (required: UserRole[] | undefined, role?: string) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
    return new RolesGuard(reflector).canActivate(ctxFor({ user: role ? { role } : undefined }));
  };

  it('sem @Roles libera', () => {
    expect(run(undefined, 'ATHLETE')).toBe(true);
  });

  it('SUPER_ADMIN passa em tudo', () => {
    expect(run([UserRole.SUPER_ADMIN], 'SUPER_ADMIN')).toBe(true);
    expect(run([UserRole.COACH], 'SUPER_ADMIN')).toBe(true);
  });

  it('ADMIN passa em rotas não exclusivas de SUPER_ADMIN', () => {
    expect(run([UserRole.ADMIN], 'ADMIN')).toBe(true);
    expect(run([UserRole.COACH], 'ADMIN')).toBe(true);
    expect(run([UserRole.COACH, UserRole.SUPER_ADMIN], 'ADMIN')).toBe(true);
  });

  it('ADMIN é negado em rotas exclusivamente SUPER_ADMIN', () => {
    expect(run([UserRole.SUPER_ADMIN], 'ADMIN')).toBe(false);
    expect(isRoleAllowed('ADMIN', [UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN])).toBe(false);
  });

  it('demais papéis precisam estar listados', () => {
    expect(run([UserRole.COACH], 'COACH')).toBe(true);
    expect(run([UserRole.COACH], 'ATHLETE')).toBe(false);
    expect(run([UserRole.SUPER_ADMIN], 'COACH')).toBe(false);
  });

  it('sem usuário nega', () => {
    expect(run([UserRole.COACH], undefined)).toBe(false);
  });
});

describe('CustomThrottlerGuard.getTracker', () => {
  const guard = Object.create(CustomThrottlerGuard.prototype) as CustomThrottlerGuard;
  const tracker = (req: any) => (guard as any).getTracker(req) as Promise<string>;
  const OLD = process.env.PROXY_SHARED_SECRET;

  afterEach(() => {
    restore('PROXY_SHARED_SECRET', OLD);
  });

  it('ignora X-Forwarded-For enviado pelo cliente (usa req.ip)', async () => {
    delete process.env.PROXY_SHARED_SECRET;
    const a = await tracker({ ip: '10.0.0.1', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const b = await tracker({ ip: '10.0.0.1', headers: { 'x-forwarded-for': '2.2.2.2' } });
    expect(a).toBe('ip:10.0.0.1');
    expect(b).toBe(a);
  });

  it('ignora x-rr-client-ip sem o segredo do proxy', async () => {
    process.env.PROXY_SHARED_SECRET = 's3cret';
    const t = await tracker({ ip: '10.0.0.1', headers: { 'x-rr-client-ip': '9.9.9.9', 'x-rr-proxy-secret': 'errado' } });
    expect(t).toBe('ip:10.0.0.1');
  });

  it('confia em x-rr-client-ip com o segredo correto', async () => {
    process.env.PROXY_SHARED_SECRET = 's3cret';
    const t = await tracker({ ip: '10.0.0.1', headers: { 'x-rr-client-ip': '9.9.9.9', 'x-rr-proxy-secret': 's3cret' } });
    expect(t).toBe('ip:9.9.9.9');
  });

  it('prefere o id do usuário autenticado', async () => {
    expect(await tracker({ ip: '10.0.0.1', headers: {}, user: { id: 'u1' } })).toBe('user:u1');
  });
});

describe('MetricsAccessGuard', () => {
  const OLD = process.env.METRICS_TOKEN;
  afterEach(() => {
    restore('METRICS_TOKEN', OLD);
  });

  const guardWithJwt = (impl: (req: any) => boolean | Promise<boolean>) => {
    const g = new MetricsAccessGuard();
    (g as any).jwtGuard = { canActivate: (ctx: ExecutionContext) => impl(ctx.switchToHttp().getRequest()) };
    return g;
  };

  it('aceita x-metrics-token correto', async () => {
    process.env.METRICS_TOKEN = 'metrics-tok';
    const g = guardWithJwt(() => false);
    await expect(g.canActivate(ctxFor({ headers: { 'x-metrics-token': 'metrics-tok' } }))).resolves.toBe(true);
  });

  it('nega sem token e sem JWT', async () => {
    process.env.METRICS_TOKEN = 'metrics-tok';
    const g = guardWithJwt(() => true);
    await expect(g.canActivate(ctxFor({ headers: { 'x-metrics-token': 'errado' } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('nega quando METRICS_TOKEN não está configurado e o header vem vazio', async () => {
    delete process.env.METRICS_TOKEN;
    const g = guardWithJwt(() => true);
    await expect(g.canActivate(ctxFor({ headers: { 'x-metrics-token': '' } }))).rejects.toThrow(UnauthorizedException);
  });

  it('aceita JWT de SUPER_ADMIN e nega ADMIN', async () => {
    const ok = guardWithJwt((req) => {
      req.user = { role: 'SUPER_ADMIN' };
      return true;
    });
    await expect(ok.canActivate(ctxFor({ headers: { authorization: 'Bearer x' } }))).resolves.toBe(true);

    const admin = guardWithJwt((req) => {
      req.user = { role: 'ADMIN' };
      return true;
    });
    await expect(admin.canActivate(ctxFor({ headers: { authorization: 'Bearer x' } }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('JWT inválido → 401', async () => {
    const g = guardWithJwt(() => {
      throw new UnauthorizedException();
    });
    await expect(g.canActivate(ctxFor({ headers: { authorization: 'Bearer x' } }))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
