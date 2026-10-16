import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from '../cache/cache.service';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  firstAt: number;
  lockedUntil?: number;
}

export const LOGIN_LOCKED_MESSAGE =
  'Muitas tentativas de login sem sucesso. Por segurança, a conta foi bloqueada temporariamente. Tente novamente em 15 minutos.';

/**
 * Bloqueio por conta (e-mail) contra força bruta: após 5 falhas em 15 min a conta fica
 * bloqueada por 15 min. Usa Redis (CacheService) quando disponível — compartilhado entre
 * instâncias — e sempre mantém uma cópia em memória como fallback.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly memory = new Map<string, AttemptRecord>();

  constructor(@Optional() private readonly cache?: CacheService) {}

  private key(email: string): string {
    const normalized = (email || '').trim().toLowerCase();
    return `login_fail:${createHash('sha256').update(normalized).digest('hex')}`;
  }

  private async read(key: string, now: number): Promise<AttemptRecord | null> {
    let mem = this.memory.get(key) ?? null;
    let remote: AttemptRecord | null = null;
    if (this.cache) {
      try {
        remote = await this.cache.get<AttemptRecord>(key);
      } catch {
        remote = null;
      }
    }
    // Usa o registro "mais severo" entre Redis e memória
    let rec = mem;
    if (remote && (!rec || remote.count > rec.count || (remote.lockedUntil ?? 0) > (rec.lockedUntil ?? 0))) {
      rec = remote;
    }
    if (!rec) return null;
    const lockActive = rec.lockedUntil && rec.lockedUntil > now;
    const windowActive = now - rec.firstAt < LOGIN_WINDOW_MS;
    if (!lockActive && !windowActive) {
      this.memory.delete(key);
      return null;
    }
    if (!lockActive && rec.lockedUntil) {
      // bloqueio expirou: zera contagem
      this.memory.delete(key);
      return null;
    }
    return rec;
  }

  private async write(key: string, rec: AttemptRecord, now: number): Promise<void> {
    this.memory.set(key, rec);
    const expiresAt = Math.max(rec.lockedUntil ?? 0, rec.firstAt + LOGIN_WINDOW_MS);
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    if (this.cache) {
      try {
        await this.cache.set(key, rec, ttlSeconds);
      } catch {
        // fallback em memória já gravado
      }
    }
    // Evita crescimento ilimitado do Map
    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory) {
        if ((v.lockedUntil ?? 0) < now && now - v.firstAt >= LOGIN_WINDOW_MS) this.memory.delete(k);
      }
    }
  }

  async isLocked(email: string, now = Date.now()): Promise<boolean> {
    const rec = await this.read(this.key(email), now);
    return !!(rec?.lockedUntil && rec.lockedUntil > now);
  }

  /** Lança 429 se a conta estiver bloqueada. */
  async assertNotLocked(email: string, now = Date.now()): Promise<void> {
    if (await this.isLocked(email, now)) {
      throw new HttpException(LOGIN_LOCKED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Registra uma falha; retorna true se a conta acabou de ser bloqueada. */
  async registerFailure(email: string, now = Date.now()): Promise<boolean> {
    const key = this.key(email);
    const current = await this.read(key, now);
    const rec: AttemptRecord = current ? { ...current } : { count: 0, firstAt: now };
    rec.count += 1;
    let lockedNow = false;
    if (rec.count >= LOGIN_MAX_FAILURES && !(rec.lockedUntil && rec.lockedUntil > now)) {
      rec.lockedUntil = now + LOGIN_LOCK_MS;
      lockedNow = true;
    }
    await this.write(key, rec, now);
    return lockedNow;
  }

  async reset(email: string): Promise<void> {
    const key = this.key(email);
    this.memory.delete(key);
    if (this.cache) {
      try {
        await this.cache.del(key);
      } catch {
        // ignore
      }
    }
  }
}
