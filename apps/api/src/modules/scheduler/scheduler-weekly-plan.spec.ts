import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { WorkoutsController } from '../workouts/workouts.controller';

const CRON_META = 'SCHEDULE_CRON_OPTIONS';

function cronOf(method: string) {
  return Reflect.getMetadata(CRON_META, (SchedulerService.prototype as any)[method]);
}

describe('SchedulerService — e-mails semanais do atleta', () => {
  it('cron do plano semanal: domingo 19h America/Sao_Paulo', () => {
    expect(cronOf('sendWeeklyPlanEmails')).toMatchObject({
      cronTime: '0 19 * * 0',
      name: 'athlete-weekly-plan-email',
      timeZone: 'America/Sao_Paulo',
    });
  });

  it('só existe UM resumo semanal do atleta (duplicado removido)', () => {
    expect((SchedulerService.prototype as any).sendWeeklySummary).toBeUndefined();
    const names = Object.getOwnPropertyNames(SchedulerService.prototype)
      .map((m) => cronOf(m)?.name)
      .filter(Boolean);
    expect(names).toContain('athlete-weekly-summary-v2');
    expect(names).not.toContain('weekly-athlete-summary');
  });

  it('delega ao WeeklyPlanEmailService e não propaga erro', async () => {
    const weeklyPlan: any = { sendAllForUpcomingWeek: jest.fn().mockRejectedValue(new Error('db')) };
    const svc = new SchedulerService({} as any, {} as any, {} as any, {} as any, {} as any, undefined, undefined, weeklyPlan);
    await expect(svc.sendWeeklyPlanEmails()).resolves.toBeUndefined();
    expect(weeklyPlan.sendAllForUpcomingWeek).toHaveBeenCalledTimes(1);
  });

  it('sem o serviço injetado, o cron é no-op', async () => {
    const svc = new SchedulerService({} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(svc.sendWeeklyPlanEmails()).resolves.toBeUndefined();
  });
});

describe('POST /workouts/athlete/:athleteId/weekly-plan-email', () => {
  function ctrl(profile: any, result: any) {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const weekly: any = { sendForAthlete: jest.fn().mockResolvedValue(result) };
    return { weekly, c: new WorkoutsController({} as any, {} as any, prisma, {} as any, weekly) };
  }
  const coach = { id: 'coach-1', role: 'COACH' };

  it('treinador do atleta reenvia', async () => {
    const { c, weekly } = ctrl({ coachId: 'coach-1', teamId: null }, { status: 'sent', workouts: 3 });
    await expect(c.resendWeeklyPlanEmail('ath-1', coach)).resolves.toMatchObject({ sent: true, workouts: 3 });
    expect(weekly.sendForAthlete).toHaveBeenCalledWith('ath-1', expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) }));
  });

  it('treinador sem vínculo com o atleta → 404 e nada é enviado', async () => {
    const { c, weekly } = ctrl({ coachId: 'other', teamId: null }, { status: 'sent', workouts: 1 });
    await expect(c.resendWeeklyPlanEmail('ath-1', coach)).rejects.toBeInstanceOf(NotFoundException);
    expect(weekly.sendForAthlete).not.toHaveBeenCalled();
  });

  it('sem treinos na semana → 400 com mensagem em PT', async () => {
    const { c } = ctrl({ coachId: 'coach-1', teamId: null }, { status: 'skipped', reason: 'no-workouts', workouts: 0 });
    await expect(c.resendWeeklyPlanEmail('ath-1', coach)).rejects.toBeInstanceOf(BadRequestException);
  });
});
