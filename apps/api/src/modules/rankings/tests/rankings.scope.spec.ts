import { ForbiddenException } from '@nestjs/common';
import { RankingsService, computeStreaks, maskName, periodStart } from '../rankings.service';

function makeService(overrides: any = {}) {
  const prisma: any = {
    athleteProfile: { findUnique: jest.fn() },
    team: { findUnique: jest.fn() },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    ...overrides.prisma,
  };
  const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  const teamContext: any = { resolve: jest.fn().mockResolvedValue(null), ...overrides.teamContext };
  return { service: new RankingsService(prisma, cache, teamContext), prisma, cache, teamContext };
}

describe('RankingsService — escopo por equipe (A4)', () => {
  it('atleta → equipe do perfil', async () => {
    const { service, prisma } = makeService();
    prisma.athleteProfile.findUnique.mockResolvedValue({ teamId: 't1', coachId: 'c1' });
    await expect(service.resolveScope({ id: 'a1', role: 'ATHLETE' })).resolves.toEqual({ kind: 'team', teamId: 't1' });
  });

  it('atleta sem equipe com treinador → atletas do treinador; sem nada → vazio', async () => {
    const { service, prisma } = makeService();
    prisma.athleteProfile.findUnique.mockResolvedValueOnce({ teamId: null, coachId: 'c1' });
    await expect(service.resolveScope({ id: 'a1', role: 'ATHLETE' })).resolves.toEqual({ kind: 'coach', coachId: 'c1' });
    prisma.athleteProfile.findUnique.mockResolvedValueOnce(null);
    const scope = await service.resolveScope({ id: 'a1', role: 'ATHLETE' });
    expect(scope).toEqual({ kind: 'none' });
    await expect(service.getTopByKm('all', 20, scope)).resolves.toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('atleta não escolhe outra equipe via ?teamId', async () => {
    const { service, prisma } = makeService();
    prisma.athleteProfile.findUnique.mockResolvedValue({ teamId: 't1', coachId: null });
    await expect(service.resolveScope({ id: 'a1', role: 'ATHLETE' }, undefined, 't-other')).resolves.toEqual({ kind: 'team', teamId: 't1' });
  });

  it('treinador → equipe ativa; sem equipe → só os atletas dele', async () => {
    const { service, teamContext } = makeService();
    teamContext.resolve.mockResolvedValueOnce({ teamId: 't9', role: 'OWNER' });
    await expect(service.resolveScope({ id: 'k1', role: 'COACH' }, {})).resolves.toEqual({ kind: 'team', teamId: 't9' });
    teamContext.resolve.mockResolvedValueOnce(null);
    await expect(service.resolveScope({ id: 'k1', role: 'COACH' }, {})).resolves.toEqual({ kind: 'coach', coachId: 'k1' });
  });

  it('treinador com ?teamId de equipe alheia → erro do TeamContext (403)', async () => {
    const { service, teamContext } = makeService();
    teamContext.resolve.mockRejectedValue(new ForbiddenException());
    await expect(service.resolveScope({ id: 'k1', role: 'COACH' }, {}, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(teamContext.resolve).toHaveBeenCalledWith({ id: 'k1', role: 'COACH' }, { headers: { 'x-team-id': 'x' } });
  });

  it('admin da plataforma → tudo, ou ?teamId', async () => {
    const { service, prisma } = makeService();
    await expect(service.resolveScope({ id: 'adm', role: 'SUPER_ADMIN' })).resolves.toEqual({ kind: 'all' });
    prisma.team.findUnique.mockResolvedValue({ id: 't2' });
    await expect(service.resolveScope({ id: 'adm', role: 'ADMIN' }, undefined, 't2')).resolves.toEqual({ kind: 'team', teamId: 't2' });
  });

  it('SQL filtra por equipe e período (parametrizado) e o cache é por escopo', async () => {
    const { service, prisma, cache } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ user_id: 'u1', name: 'Ana Costa', avatar_url: null, total_meters: BigInt(12345) }]);
    const res = await service.getTopByKm('week', 20, { kind: 'team', teamId: 't1' });
    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('ap.team_id = $2');
    expect(sql).toContain('COALESCE(w.completed_at, w.scheduled_date) >= $1');
    expect(params[0]).toBeInstanceOf(Date);
    expect(params[1]).toBe('t1');
    expect(res[0].value).toBe(12.35); // km, uma única conversão
    expect(cache.set.mock.calls[0][0]).toBe('rankings:km:team:t1:week:20');
  });

  it('período "all" não aplica filtro de data', async () => {
    const { service, prisma } = makeService();
    await service.getTopByWorkouts('all', 20, { kind: 'coach', coachId: 'k1' });
    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain('COALESCE(w.completed_at, w.scheduled_date) >=');
    expect(sql).toContain('ap.coach_id = $1');
    expect(params).toEqual(['k1']);
  });

  it('visão de atleta mascara os nomes dos colegas e marca isMe', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValue([
      { user_id: 'u1', name: 'Ana Maria Costa', avatar_url: null, total_workouts: BigInt(5) },
      { user_id: 'me', name: 'Beatriz Silva', avatar_url: null, total_workouts: BigInt(3) },
    ]);
    const res = await service.getTopByWorkouts('month', 20, { kind: 'team', teamId: 't1' }, { id: 'me', maskNames: true });
    expect(res[0].name).toBe('Ana C.');
    expect(res[0].isMe).toBe(false);
    expect(res[1].name).toBe('Beatriz Silva');
    expect(res[1].isMe).toBe(true);
  });
});

describe('helpers de ranking', () => {
  it('maskName', () => {
    expect(maskName('Beatriz Silva')).toBe('Beatriz S.');
    expect(maskName('Ana')).toBe('Ana');
    expect(maskName('')).toBe('Atleta');
  });

  it('semana começa na segunda (America/Sao_Paulo)', () => {
    // Quarta 15/10/2026 12:00 UTC → segunda 12/10/2026 00:00 em SP = 03:00 UTC
    expect(periodStart('week', new Date('2026-10-15T12:00:00Z'))!.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    // Segunda 02:00 UTC ainda é domingo em SP → semana anterior
    expect(periodStart('week', new Date('2026-10-12T02:00:00Z'))!.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(periodStart('month', new Date('2026-10-15T12:00:00Z'))!.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(periodStart('year', new Date('2026-10-15T12:00:00Z'))!.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(periodStart('all')).toBeNull();
  });

  it('computeStreaks conta só sequências que chegam a hoje/ontem', () => {
    const now = new Date('2026-10-15T15:00:00Z');
    const rows = [
      { user_id: 'a', name: 'A', avatar_url: null, workout_day: '2026-10-15' },
      { user_id: 'a', name: 'A', avatar_url: null, workout_day: '2026-10-14' },
      { user_id: 'a', name: 'A', avatar_url: null, workout_day: '2026-10-13' },
      { user_id: 'a', name: 'A', avatar_url: null, workout_day: '2026-10-10' },
      { user_id: 'b', name: 'B', avatar_url: null, workout_day: '2026-10-14' },
      { user_id: 'c', name: 'C', avatar_url: null, workout_day: '2026-10-12' },
    ];
    const res = computeStreaks(rows, now);
    expect(res.map((r) => [r.userId, r.value])).toEqual([['a', 3], ['b', 1]]);
  });
});
