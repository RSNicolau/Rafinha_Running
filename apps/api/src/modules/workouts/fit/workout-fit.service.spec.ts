import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WorkoutFitService } from './workout-fit.service';
import { signFitDownloadToken, verifyFitDownloadToken } from './fit-token';
import { WorkoutFitController } from '../workout-fit.controller';

const W1 = {
  id: 'w1',
  athleteId: 'ath-1',
  title: 'Tempo run',
  type: 'TEMPO',
  description: null,
  scheduledDate: new Date('2026-10-21T12:00:00Z'),
  targetDistanceMeters: 8000,
  targetDurationSeconds: 2700,
  targetPace: '4:50',
  heartRateZone: null,
  athlete: { isActive: true, deletedAt: null },
};

function setup(opts: { workout?: any; profile?: any; teamMember?: any } = {}) {
  const workout = opts.workout === undefined ? W1 : opts.workout;
  const prisma: any = {
    workout: { findUnique: jest.fn().mockResolvedValue(workout) },
    athleteProfile: { findUnique: jest.fn().mockResolvedValue(opts.profile ?? { coachId: 'coach-1', teamId: null }) },
    teamMember: { findFirst: jest.fn().mockResolvedValue(opts.teamMember ?? null) },
  };
  const jwt = new JwtService({});
  return { prisma, jwt, svc: new WorkoutFitService(prisma, jwt) };
}

describe('FIT download token', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret-fit'));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('vale só para o treino assinado e com o propósito correto', async () => {
    const jwt = new JwtService({});
    const t = await signFitDownloadToken(jwt, { workoutId: 'w1', athleteId: 'ath-1' });
    await expect(verifyFitDownloadToken(jwt, t, 'w1')).resolves.toMatchObject({ wid: 'w1', sub: 'ath-1' });
    await expect(verifyFitDownloadToken(jwt, t, 'w2')).resolves.toBeNull();
    // access token comum (segredo base) não serve como token de download
    const access = await jwt.signAsync({ sub: 'ath-1', wid: 'w1', purpose: 'fit-download' }, { secret: 'test-secret-fit' });
    await expect(verifyFitDownloadToken(jwt, access, 'w1')).resolves.toBeNull();
    // propósito errado com o segredo derivado
    const other = await jwt.signAsync({ sub: 'ath-1', wid: 'w1', purpose: 'mfa' }, { secret: 'test-secret-fit:fit-download' });
    await expect(verifyFitDownloadToken(jwt, other, 'w1')).resolves.toBeNull();
  });

  it('expira em 14 dias', async () => {
    const jwt = new JwtService({});
    const t = await signFitDownloadToken(jwt, { workoutId: 'w1', athleteId: 'ath-1' });
    const decoded: any = jwt.decode(t);
    expect(decoded.exp - decoded.iat).toBe(14 * 24 * 3600);
  });

  it('token expirado é recusado', async () => {
    const jwt = new JwtService({});
    const t = await jwt.signAsync(
      { purpose: 'fit-download', wid: 'w1', sub: 'ath-1', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: 'test-secret-fit:fit-download' },
    );
    await expect(verifyFitDownloadToken(jwt, t, 'w1')).resolves.toBeNull();
  });
});

describe('WorkoutFitService.authorize', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret-fit'));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('atleta dono baixa o próprio treino', async () => {
    const { svc } = setup();
    await expect(svc.authorize('w1', { id: 'ath-1', role: 'ATHLETE' })).resolves.toMatchObject({ id: 'w1' });
  });

  it('outro atleta recebe 404 (não vaza treino alheio)', async () => {
    const { svc } = setup();
    await expect(svc.authorize('w1', { id: 'ath-2', role: 'ATHLETE' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treinador responsável pelo atleta baixa; treinador de fora recebe 404', async () => {
    const { svc } = setup();
    await expect(svc.authorize('w1', { id: 'coach-1', role: 'COACH' })).resolves.toBeTruthy();
    await expect(svc.authorize('w1', { id: 'coach-9', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gestão/staff da equipe do atleta baixa', async () => {
    const { svc } = setup({ profile: { coachId: 'coach-1', teamId: 'team-1' }, teamMember: { role: 'STAFF' } });
    await expect(svc.authorize('w1', { id: 'staff-1', role: 'COACH' })).resolves.toBeTruthy();
  });

  it('sem login e sem token → 401', async () => {
    const { svc } = setup();
    await expect(svc.authorize('w1', null)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token do e-mail válido baixa sem login', async () => {
    const { svc, jwt } = setup();
    const t = await signFitDownloadToken(jwt, { workoutId: 'w1', athleteId: 'ath-1' });
    await expect(svc.authorize('w1', null, t)).resolves.toMatchObject({ id: 'w1' });
  });

  it('token de outro treino não abre este (404)', async () => {
    const { svc, jwt } = setup();
    const t = await signFitDownloadToken(jwt, { workoutId: 'w2', athleteId: 'ath-1' });
    await expect(svc.authorize('w1', null, t)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('token cujo atleta não é o dono do treino → 404', async () => {
    const { svc, jwt } = setup();
    const t = await signFitDownloadToken(jwt, { workoutId: 'w1', athleteId: 'ath-2' });
    await expect(svc.authorize('w1', null, t)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('token de atleta desativado → 404', async () => {
    const { svc, jwt } = setup({ workout: { ...W1, athlete: { isActive: false, deletedAt: null } } });
    const t = await signFitDownloadToken(jwt, { workoutId: 'w1', athleteId: 'ath-1' });
    await expect(svc.authorize('w1', null, t)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('token inválido + usuário logado com acesso → segue pelo login', async () => {
    const { svc } = setup();
    await expect(svc.authorize('w1', { id: 'ath-1', role: 'ATHLETE' }, 'lixo')).resolves.toBeTruthy();
  });

  it('treino inexistente → 404', async () => {
    const { svc } = setup({ workout: null });
    await expect(svc.authorize('nope', { id: 'ath-1', role: 'ATHLETE' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WorkoutFitController', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret-fit'));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('responde binário FIT com Content-Type e Content-Disposition de anexo', async () => {
    const { svc } = setup();
    const ctrl = new WorkoutFitController(svc);
    const headers: Record<string, string> = {};
    let body: Buffer | undefined;
    const res: any = {
      setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
      end: (b: Buffer) => (body = b),
    };
    await ctrl.download('w1', undefined, { user: { id: 'ath-1', role: 'ATHLETE' } } as any, res);
    expect(headers['content-type']).toBe('application/vnd.ant.fit');
    expect(headers['content-disposition']).toBe('attachment; filename="2026-10-21-tempo-run.fit"');
    expect(body!.subarray(8, 12).toString('ascii')).toBe('.FIT');
    expect(headers['content-length']).toBe(String(body!.length));
  });
});
