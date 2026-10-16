import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const prisma = {
    workout: { findUnique: jest.fn() },
    trainingPlan: { findUnique: jest.fn() },
    athleteProfile: { findUnique: jest.fn() },
    fitnessIntegration: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
  };
  const garmin = {
    pushWorkoutToGarmin: jest.fn().mockResolvedValue({ success: true }),
    pushPlanToGarmin: jest.fn().mockResolvedValue({ pushed: 1 }),
    getAuthUrl: jest.fn(),
  };
  const strava = { getAuthUrl: jest.fn().mockResolvedValue({ url: 'u', provider: 'STRAVA', state: 's' }), deauthorize: jest.fn() };
  let svc: IntegrationsService;
  const ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV, GARMIN_CLIENT_ID: 'g', GARMIN_CLIENT_SECRET: 's', STRAVA_CLIENT_ID: 'c', STRAVA_CLIENT_SECRET: 's' };
    delete process.env.COROS_CLIENT_ID;
    delete process.env.GOOGLE_FIT_CLIENT_ID;
    svc = new IntegrationsService(prisma as any, garmin as any, strava as any, {} as any, {} as any);
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', athleteId: 'ath1' });
    prisma.trainingPlan.findUnique.mockResolvedValue({ id: 'p1', athleteId: 'ath1', deletedAt: null });
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach1' });
  });

  afterAll(() => { process.env = ENV; });

  describe('Garmin push ownership', () => {
    it('athlete can push own workout', async () => {
      await svc.pushWorkoutToGarmin({ id: 'ath1', role: 'ATHLETE' }, 'w1');
      expect(garmin.pushWorkoutToGarmin).toHaveBeenCalledWith('w1');
    });

    it('the athlete coach can push', async () => {
      await svc.pushWorkoutToGarmin({ id: 'coach1', role: 'COACH' }, 'w1');
      expect(garmin.pushWorkoutToGarmin).toHaveBeenCalled();
    });

    it('another athlete gets 404', async () => {
      await expect(svc.pushWorkoutToGarmin({ id: 'ath2', role: 'ATHLETE' }, 'w1')).rejects.toThrow(NotFoundException);
      expect(garmin.pushWorkoutToGarmin).not.toHaveBeenCalled();
    });

    it('another coach gets 404', async () => {
      await expect(svc.pushWorkoutToGarmin({ id: 'coach2', role: 'COACH' }, 'w1')).rejects.toThrow(NotFoundException);
    });

    it('admin can push', async () => {
      await svc.pushPlanToGarmin({ id: 'adm', role: 'ADMIN' }, 'p1');
      expect(garmin.pushPlanToGarmin).toHaveBeenCalledWith('p1');
    });

    it('plan of another coach athlete → 404', async () => {
      await expect(svc.pushPlanToGarmin({ id: 'coach2', role: 'COACH' }, 'p1')).rejects.toThrow(NotFoundException);
      expect(garmin.pushPlanToGarmin).not.toHaveBeenCalled();
    });

    it('deleted plan → 404', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({ id: 'p1', athleteId: 'ath1', deletedAt: new Date() });
      await expect(svc.pushPlanToGarmin({ id: 'ath1', role: 'ATHLETE' }, 'p1')).rejects.toThrow(NotFoundException);
    });

    it('Garmin disabled in env → 400 before touching data', async () => {
      delete process.env.GARMIN_CLIENT_ID;
      await expect(svc.pushWorkoutToGarmin({ id: 'ath1', role: 'ATHLETE' }, 'w1')).rejects.toThrow(BadRequestException);
      expect(prisma.workout.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('providers / connect', () => {
    it('reports availability from env, Strava primary', () => {
      delete process.env.GARMIN_CLIENT_ID;
      const list = svc.getProviders();
      const by = Object.fromEntries(list.map((p) => [p.provider, p]));
      expect(by.STRAVA).toMatchObject({ available: true, primary: true });
      expect(by.GARMIN.available).toBe(false);
      expect(by.GARMIN.reason).toMatch(/Strava/);
      expect(by.COROS.available).toBe(false);
      expect(by.POLAR.available).toBe(false);
      expect(by.APPLE_HEALTH.platforms).toEqual(['ios']);
    });

    it('refuses to start OAuth for an unavailable provider', async () => {
      delete process.env.GARMIN_CLIENT_ID;
      await expect(svc.getConnectUrl('u1', 'GARMIN' as any)).rejects.toThrow(BadRequestException);
      expect(garmin.getAuthUrl).not.toHaveBeenCalled();
    });

    it('passes the client mode to Strava', async () => {
      await svc.getConnectUrl('u1', 'STRAVA' as any, 'mobile');
      expect(strava.getAuthUrl).toHaveBeenCalledWith('u1', 'mobile');
    });
  });

  describe('disconnect', () => {
    it('only disconnects the caller own integration, revokes at Strava and wipes tokens', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue({ id: 'fi1', userId: 'u1', provider: 'STRAVA', isActive: true });
      await svc.disconnect('u1', 'fi1');
      expect(prisma.fitnessIntegration.findFirst).toHaveBeenCalledWith({ where: { id: 'fi1', userId: 'u1' } });
      expect(strava.deauthorize).toHaveBeenCalled();
      expect(prisma.fitnessIntegration.update).toHaveBeenCalledWith({
        where: { id: 'fi1' },
        data: { isActive: false, accessToken: '', refreshToken: null, expiresAt: null },
      });
    });

    it('404 for someone else integration', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(null);
      await expect(svc.disconnect('u2', 'fi1')).rejects.toThrow(NotFoundException);
    });
  });

  it('manual sync has a per-user cooldown', async () => {
    await svc.syncActivities('u1');
    await expect(svc.syncActivities('u1')).rejects.toThrow(/Aguarde/);
  });
});
