import { HttpException } from '@nestjs/common';
import { LoginAttemptsService, LOGIN_LOCK_MS, LOGIN_WINDOW_MS } from '../login-attempts.service';

describe('LoginAttemptsService', () => {
  it('bloqueia após 5 falhas dentro de 15 min (fallback em memória)', async () => {
    const svc = new LoginAttemptsService();
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) {
      expect(await svc.registerFailure('a@b.com', t0 + i)).toBe(false);
    }
    expect(await svc.isLocked('a@b.com', t0 + 10)).toBe(false);
    expect(await svc.registerFailure('A@B.com ', t0 + 10)).toBe(true); // normaliza e-mail
    expect(await svc.isLocked('a@b.com', t0 + 11)).toBe(true);
    await expect(svc.assertNotLocked('a@b.com', t0 + 12)).rejects.toThrow(HttpException);
    // expira após 15 min
    expect(await svc.isLocked('a@b.com', t0 + 10 + LOGIN_LOCK_MS + 1)).toBe(false);
  });

  it('falhas fora da janela não acumulam', async () => {
    const svc = new LoginAttemptsService();
    const t0 = 5_000_000;
    for (let i = 0; i < 4; i++) await svc.registerFailure('x@y.com', t0);
    const later = t0 + LOGIN_WINDOW_MS + 1;
    expect(await svc.registerFailure('x@y.com', later)).toBe(false);
    expect(await svc.isLocked('x@y.com', later)).toBe(false);
  });

  it('reset limpa as falhas', async () => {
    const svc = new LoginAttemptsService();
    for (let i = 0; i < 5; i++) await svc.registerFailure('r@y.com');
    expect(await svc.isLocked('r@y.com')).toBe(true);
    await svc.reset('r@y.com');
    expect(await svc.isLocked('r@y.com')).toBe(false);
  });

  it('usa o cache (Redis) quando disponível e não guarda o e-mail em claro na chave', async () => {
    const store = new Map<string, any>();
    const cache: any = {
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: any) => void store.set(k, v)),
      del: jest.fn(async (k: string) => void store.delete(k)),
    };
    const a = new LoginAttemptsService(cache);
    for (let i = 0; i < 5; i++) await a.registerFailure('shared@y.com');
    const key = [...store.keys()][0];
    expect(key).toMatch(/^login_fail:[0-9a-f]{64}$/);
    expect(key).not.toContain('shared');
    // outra instância (sem memória local) enxerga o bloqueio via Redis
    const b = new LoginAttemptsService(cache);
    expect(await b.isLocked('shared@y.com')).toBe(true);
  });
});
