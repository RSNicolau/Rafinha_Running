import { JwtService } from '@nestjs/jwt';
import {
  WeeklyPlanEmailService,
  currentOrUpcomingWeekRange,
  dayLabelPt,
  formatDistancePt,
  formatDurationPt,
  nextWeekRange,
} from './weekly-plan-email.service';
import { EmailService } from '../email/email.service';
import { verifyFitDownloadToken } from './fit/fit-token';

const ATHLETE = {
  id: 'ath-1',
  name: 'Ana',
  email: 'ana@t.com',
  role: 'ATHLETE',
  isActive: true,
  deletedAt: null,
  athleteProfile: { team: { name: 'Equipe Trote', status: 'ACTIVE' }, coach: { name: 'Rafa', tenantBranding: null } },
};

const WORKOUTS = [
  {
    id: 'w1', athleteId: 'ath-1', scheduledDate: new Date('2026-10-19T12:00:00Z'), type: 'INTERVAL', title: '5x1000',
    description: 'Aquecer 15min\n5x1000 forte', coachNotes: 'Hidrate-se', targetDistanceMeters: 8000,
    targetDurationSeconds: 3000, targetPace: '4:30', heartRateZone: 'Z4_THRESHOLD',
  },
  {
    id: 'w2', athleteId: 'ath-1', scheduledDate: new Date('2026-10-25T12:00:00Z'), type: 'REST', title: 'Descanso',
    description: null, coachNotes: null, targetDistanceMeters: null, targetDurationSeconds: null, targetPace: null, heartRateZone: null,
  },
];

function setup(over: { athlete?: any; workouts?: any[] } = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(over.athlete === undefined ? ATHLETE : over.athlete), findMany: jest.fn() },
    workout: { findMany: jest.fn().mockResolvedValue(over.workouts ?? WORKOUTS) },
  };
  const email: any = { sendWeeklyPlan: jest.fn().mockResolvedValue(undefined) };
  const jwt = new JwtService({});
  return { prisma, email, jwt, svc: new WeeklyPlanEmailService(prisma, email, jwt) };
}

describe('weekly plan e-mail — datas e formatos', () => {
  it('domingo 19h (SP) → semana seguinte, segunda 00:00 a segunda 00:00 (SP)', () => {
    const sundayEvening = new Date('2026-10-18T22:00:00Z'); // dom 18/10 19h BRT
    const r = nextWeekRange(sundayEvening);
    expect(r.start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-26T03:00:00.000Z');
  });

  it('reenvio pelo coach: no meio da semana usa a semana atual; no domingo, a próxima', () => {
    const wed = currentOrUpcomingWeekRange(new Date('2026-10-14T15:00:00Z'));
    expect(wed.start.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    const sun = currentOrUpcomingWeekRange(new Date('2026-10-18T15:00:00Z'));
    expect(sun.start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('formata dia/distância/duração em pt-BR', () => {
    expect(dayLabelPt(new Date('2026-10-20T12:00:00Z'))).toBe('Ter 20/10');
    expect(dayLabelPt(new Date('2026-10-19T12:00:00Z'))).toBe('Seg 19/10');
    expect(formatDistancePt(8000)).toBe('8 km');
    expect(formatDistancePt(10500)).toBe('10,5 km');
    expect(formatDistancePt(800)).toBe('800 m');
    expect(formatDurationPt(2700)).toBe('45 min');
    expect(formatDurationPt(4200)).toBe('1h10');
    expect(formatDistancePt(null)).toBeNull();
  });
});

describe('WeeklyPlanEmailService.sendForAthlete', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret-wp'));
  afterAll(() => (process.env.JWT_SECRET = OLD));
  const range = nextWeekRange(new Date('2026-10-18T22:00:00Z'));

  it('envia um e-mail com cada dia, alvos, instruções e link .FIT assinado', async () => {
    const { svc, email, prisma, jwt } = setup();
    const r = await svc.sendForAthlete('ath-1', range);
    expect(r).toEqual({ status: 'sent', workouts: 2 });

    // filtro: só SCHEDULED, planilha ativa não excluída, dentro da semana
    const where = prisma.workout.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      athleteId: 'ath-1',
      status: 'SCHEDULED',
      plan: { status: 'ACTIVE', deletedAt: null },
      scheduledDate: { gte: range.start, lt: range.end },
    });

    expect(email.sendWeeklyPlan).toHaveBeenCalledTimes(1);
    const [to, data] = email.sendWeeklyPlan.mock.calls[0];
    expect(to).toBe('ana@t.com');
    expect(data.brandName).toBe('Equipe Trote');
    expect(data.weekLabel).toBe('Semana de 19/10 a 25/10');
    const [w1, w2] = data.workouts;
    expect(w1).toMatchObject({
      workoutId: 'w1',
      dayLabel: 'Seg 19/10',
      title: '5x1000',
      typeLabel: 'Intervalado',
      targets: ['8 km', '50 min', 'pace 4:30/km', 'FC Z4 (limiar)'],
      description: 'Aquecer 15min\n5x1000 forte',
      coachNotes: 'Hidrate-se',
    });
    await expect(verifyFitDownloadToken(jwt, w1.fitToken, 'w1')).resolves.toMatchObject({ sub: 'ath-1' });
    // descanso: sem arquivo .FIT; rótulo do tipo igual ao título não é repetido
    expect(w2).toMatchObject({ dayLabel: 'Dom 25/10', fitToken: null, typeLabel: null });
  });

  it.each([
    ['not-found', null],
    ['inactive', { ...ATHLETE, isActive: false }],
    ['inactive', { ...ATHLETE, deletedAt: new Date() }],
    ['no-email', { ...ATHLETE, email: null }],
    ['not-found', { ...ATHLETE, role: 'COACH' }],
  ])('não envia: %s', async (reason, athlete) => {
    const { svc, email } = setup({ athlete });
    await expect(svc.sendForAthlete('ath-1', range)).resolves.toMatchObject({ status: 'skipped', reason });
    expect(email.sendWeeklyPlan).not.toHaveBeenCalled();
  });

  it('não envia quando não há treinos programados', async () => {
    const { svc, email } = setup({ workouts: [] });
    await expect(svc.sendForAthlete('ath-1', range)).resolves.toMatchObject({ status: 'skipped', reason: 'no-workouts' });
    expect(email.sendWeeklyPlan).not.toHaveBeenCalled();
  });

  it('marca: equipe → branding do treinador → PLATFORM_NAME', async () => {
    const { svc, email } = setup({
      athlete: { ...ATHLETE, athleteProfile: { team: null, coach: { tenantBranding: { tenantName: 'RR Elite', isActive: true } } } },
    });
    await svc.sendForAthlete('ath-1', range);
    expect(email.sendWeeklyPlan.mock.calls[0][1].brandName).toBe('RR Elite');
  });
});

describe('WeeklyPlanEmailService.sendAllForUpcomingWeek', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = 'test-secret-wp'));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('busca atletas ativos com e-mail e treinos na semana, em lotes, isolando erros por atleta', async () => {
    const { svc, prisma } = setup();
    const page1 = Array.from({ length: 50 }, (_, i) => ({ id: `a${String(i).padStart(2, '0')}` }));
    prisma.user.findMany.mockResolvedValueOnce(page1).mockResolvedValueOnce([{ id: 'b1' }]);
    const spy = jest.spyOn(svc, 'sendForAthlete').mockImplementation(async (id: string) => {
      if (id === 'a03') throw new Error('boom');
      if (id === 'a04') return { status: 'skipped', reason: 'no-email', workouts: 0 } as any;
      return { status: 'sent', workouts: 1 } as any;
    });

    const r = await svc.sendAllForUpcomingWeek(new Date('2026-10-18T22:00:00Z'));
    expect(r).toMatchObject({ candidates: 51, sent: 49, skipped: 1, failed: 1 });
    expect(spy).toHaveBeenCalledTimes(51);

    const q1 = prisma.user.findMany.mock.calls[0][0];
    expect(q1.where).toMatchObject({ role: 'ATHLETE', isActive: true, deletedAt: null });
    expect(q1.where.athleteWorkouts.some).toMatchObject({ status: 'SCHEDULED', plan: { status: 'ACTIVE', deletedAt: null } });
    expect(q1.take).toBe(50);
    expect(prisma.user.findMany.mock.calls[1][0]).toMatchObject({ skip: 1, cursor: { id: 'a49' } });
  });
});

describe('EmailService.sendWeeklyPlan — HTML', () => {
  it('escapa todo texto do usuário e monta links do app e do .FIT', async () => {
    const OLD_URL = process.env.APP_URL;
    process.env.APP_URL = 'https://app.rr.test';
    const svc = new EmailService();
    const send = jest.spyOn(svc as any, 'send').mockResolvedValue(undefined);
    await svc.sendWeeklyPlan('ana@t.com', {
      name: '<b>Ana</b>',
      brandName: 'Equipe "X" <script>',
      weekLabel: 'Semana de 19/10 a 25/10',
      workouts: [
        {
          workoutId: 'w1',
          dayLabel: 'Seg 19/10',
          title: '<img src=x onerror=alert(1)>',
          typeLabel: 'Intervalado',
          targets: ['8 km', '<i>x</i>'],
          description: 'linha 1\nlinha <2>',
          coachNotes: 'Beba & coma',
          fitToken: 'abc.def',
        },
      ],
    });
    process.env.APP_URL = OLD_URL;
    const [to, subject, html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe('ana@t.com');
    expect(subject).toBe('Seus treinos da semana — Equipe "X" <script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('linha 1<br/>linha &lt;2&gt;');
    expect(html).toContain('Beba &amp; coma');
    expect(html).toContain('Seg 19/10');
    expect(html).toContain('https://app.rr.test/athlete?tab=treinos');
    expect(html).toContain('https://app.rr.test/api/v1/workouts/w1/fit?t=abc.def');
    expect(html).toContain('Baixar para o relógio (.FIT)');
  });
});
