/**
 * Unit tests for IntegrationsService
 *
 * Verifies routing to each provider and deauth/webhook handlers.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { PolarService } from './polar/polar.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationProvider } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGarmin = {
  getAuthUrl:           jest.fn().mockResolvedValue({ url: 'https://garmin.com/auth', provider: 'GARMIN' }),
  handleCallback:       jest.fn().mockResolvedValue({ success: true, provider: 'GARMIN' }),
  syncActivities:       jest.fn().mockResolvedValue({ provider: 'GARMIN', synced: 2 }),
  pushWorkoutToGarmin:  jest.fn().mockResolvedValue({ success: true }),
  pushPlanToGarmin:     jest.fn().mockResolvedValue({ pushed: 3, failed: 0 }),
  processWebhookActivity: jest.fn().mockResolvedValue(undefined),
};

const mockStrava = {
  getAuthUrl:         jest.fn().mockResolvedValue({ url: 'https://strava.com/auth', provider: 'STRAVA' }),
  handleCallback:     jest.fn().mockResolvedValue({ success: true, provider: 'STRAVA' }),
  syncActivities:     jest.fn().mockResolvedValue({ provider: 'STRAVA', synced: 1 }),
  registerWebhook:    jest.fn().mockResolvedValue({ status: 'registered', subscriptionId: 99 }),
  syncSingleActivity: jest.fn().mockResolvedValue(undefined),
};

const mockCoros = {
  getAuthUrl:     jest.fn().mockResolvedValue({ url: 'https://coros.com/auth', provider: 'COROS' }),
  handleCallback: jest.fn().mockResolvedValue({ success: true, provider: 'COROS' }),
  syncActivities: jest.fn().mockResolvedValue({ provider: 'COROS', synced: 5 }),
};

const mockPolar = {
  getAuthUrl:           jest.fn().mockResolvedValue({ url: 'https://polar.com/auth', provider: 'POLAR' }),
  handleCallback:       jest.fn().mockResolvedValue({ success: true, provider: 'POLAR' }),
  syncActivities:       jest.fn().mockResolvedValue({ provider: 'POLAR', synced: 3 }),
  registerWebhook:      jest.fn().mockResolvedValue({ status: 'registered', webhookId: 'wh_abc' }),
  handleWebhookExercise: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  fitnessIntegration: {
    findMany:   jest.fn().mockResolvedValue([]),
    findFirst:  jest.fn().mockResolvedValue(null),
    update:     jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  workoutResult: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  athleteProfile: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('IntegrationsService', () => {
  let service: IntegrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: GarminService, useValue: mockGarmin },
        { provide: StravaService, useValue: mockStrava },
        { provide: CorosService,  useValue: mockCoros  },
        { provide: PolarService,  useValue: mockPolar  },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
    jest.clearAllMocks();
  });

  // ── getConnectUrl routing ─────────────────────────────────────────────────

  describe('getConnectUrl', () => {
    it('routes GARMIN to GarminService', async () => {
      const result = await service.getConnectUrl('u1', IntegrationProvider.GARMIN);
      expect(mockGarmin.getAuthUrl).toHaveBeenCalledWith('u1');
      expect(result.provider).toBe('GARMIN');
    });

    it('routes STRAVA to StravaService', async () => {
      const result = await service.getConnectUrl('u1', IntegrationProvider.STRAVA);
      expect(mockStrava.getAuthUrl).toHaveBeenCalledWith('u1');
      expect(result.provider).toBe('STRAVA');
    });

    it('routes COROS to CorosService', async () => {
      const result = await service.getConnectUrl('u1', IntegrationProvider.COROS);
      expect(mockCoros.getAuthUrl).toHaveBeenCalledWith('u1');
      expect(result.provider).toBe('COROS');
    });

    it('routes POLAR to PolarService', async () => {
      const result = await service.getConnectUrl('u1', IntegrationProvider.POLAR);
      expect(mockPolar.getAuthUrl).toHaveBeenCalledWith('u1');
      expect(result.provider).toBe('POLAR');
    });

    it('throws NotFoundException for unsupported provider', async () => {
      await expect(
        service.getConnectUrl('u1', 'UNKNOWN' as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── handleCallback routing ────────────────────────────────────────────────

  describe('handleCallback', () => {
    it('routes GARMIN callback to GarminService', async () => {
      await service.handleCallback(IntegrationProvider.GARMIN, 'code', 'state');
      expect(mockGarmin.handleCallback).toHaveBeenCalledWith('code', 'state');
    });

    it('routes STRAVA callback to StravaService', async () => {
      await service.handleCallback(IntegrationProvider.STRAVA, 'code', 'state');
      expect(mockStrava.handleCallback).toHaveBeenCalledWith('code', 'state');
    });

    it('routes COROS callback to CorosService', async () => {
      await service.handleCallback(IntegrationProvider.COROS, 'code', 'state');
      expect(mockCoros.handleCallback).toHaveBeenCalledWith('code', 'state');
    });

    it('routes POLAR callback to PolarService', async () => {
      await service.handleCallback(IntegrationProvider.POLAR, 'code', 'state');
      expect(mockPolar.handleCallback).toHaveBeenCalledWith('code', 'state');
    });
  });

  // ── syncActivities routing ────────────────────────────────────────────────

  describe('syncActivities', () => {
    it('syncs all active integrations and returns aggregated results', async () => {
      const activeIntegrations = [
        { id: 'i1', provider: IntegrationProvider.GARMIN, userId: 'u1', isActive: true },
        { id: 'i2', provider: IntegrationProvider.STRAVA, userId: 'u1', isActive: true },
        { id: 'i3', provider: IntegrationProvider.COROS,  userId: 'u1', isActive: true },
        { id: 'i4', provider: IntegrationProvider.POLAR,  userId: 'u1', isActive: true },
      ];
      mockPrisma.fitnessIntegration.findMany.mockResolvedValue(activeIntegrations);
      mockGarmin.syncActivities.mockResolvedValue({ provider: 'GARMIN', synced: 2 });
      mockStrava.syncActivities.mockResolvedValue({ provider: 'STRAVA', synced: 1 });
      mockCoros.syncActivities.mockResolvedValue({ provider: 'COROS',  synced: 5 });
      mockPolar.syncActivities.mockResolvedValue({ provider: 'POLAR',  synced: 3 });

      const result = await service.syncActivities('u1');

      expect(result.synced).toHaveLength(4);
      expect(result.synced.find((r: any) => r.provider === 'GARMIN')?.synced).toBe(2);
      expect(result.synced.find((r: any) => r.provider === 'COROS')?.synced).toBe(5);
      expect(result.synced.find((r: any) => r.provider === 'POLAR')?.synced).toBe(3);

      expect(mockGarmin.syncActivities).toHaveBeenCalledWith('u1', activeIntegrations[0]);
      expect(mockCoros.syncActivities).toHaveBeenCalledWith('u1', activeIntegrations[2]);
      expect(mockPolar.syncActivities).toHaveBeenCalledWith('u1', activeIntegrations[3]);
    });

    it('returns empty synced array when no active integrations', async () => {
      mockPrisma.fitnessIntegration.findMany.mockResolvedValue([]);
      const result = await service.syncActivities('u1');
      expect(result.synced).toHaveLength(0);
    });

    it('skips APPLE_HEALTH and GOOGLE_FIT providers (no sync handler)', async () => {
      mockPrisma.fitnessIntegration.findMany.mockResolvedValue([
        { id: 'i1', provider: IntegrationProvider.APPLE_HEALTH, userId: 'u1', isActive: true },
        { id: 'i2', provider: IntegrationProvider.GOOGLE_FIT,   userId: 'u1', isActive: true },
      ]);

      const result = await service.syncActivities('u1');
      // No service syncs were called, result array is empty (switch falls through)
      expect(result.synced).toHaveLength(0);
    });
  });

  // ── Webhook setup ─────────────────────────────────────────────────────────

  describe('setupStravaWebhook', () => {
    it('passes the correct callback URL to StravaService', async () => {
      mockStrava.registerWebhook.mockResolvedValue({ status: 'registered', subscriptionId: 99 });
      const result = await service.setupStravaWebhook('https://api.example.com/api');
      expect(mockStrava.registerWebhook).toHaveBeenCalledWith('https://api.example.com/api/webhooks/strava');
      expect(result.status).toBe('registered');
    });
  });

  describe('setupPolarWebhook', () => {
    it('passes the correct callback URL to PolarService', async () => {
      mockPolar.registerWebhook.mockResolvedValue({ status: 'registered', webhookId: 'wh_1' });
      const result = await service.setupPolarWebhook('https://api.example.com/api');
      expect(mockPolar.registerWebhook).toHaveBeenCalledWith('https://api.example.com/api/webhooks/polar');
      expect(result.status).toBe('registered');
    });
  });

  // ── Strava deauth ─────────────────────────────────────────────────────────

  describe('handleStravaDeauth', () => {
    it('marks Strava integration as inactive', async () => {
      await service.handleStravaDeauth('strava_athlete_123');
      expect(mockPrisma.fitnessIntegration.updateMany).toHaveBeenCalledWith({
        where: {
          externalUserId: 'strava_athlete_123',
          provider: IntegrationProvider.STRAVA,
        },
        data: { isActive: false },
      });
    });
  });

  // ── Garmin deauth ─────────────────────────────────────────────────────────

  describe('handleGarminDeauth', () => {
    it('marks Garmin integration as inactive', async () => {
      await service.handleGarminDeauth('garmin_user_456');
      expect(mockPrisma.fitnessIntegration.updateMany).toHaveBeenCalledWith({
        where: {
          externalUserId: 'garmin_user_456',
          provider: IntegrationProvider.GARMIN,
        },
        data: { isActive: false },
      });
    });
  });

  // ── Polar webhook exercise ────────────────────────────────────────────────

  describe('handlePolarExercise', () => {
    it('delegates to PolarService.handleWebhookExercise', async () => {
      const data = {
        userId:     'polar_user_789',
        entity_id:  'https://www.polaraccesslink.com/v3/exercises/ex1',
        event_type: 'EXERCISE',
        timestamp:  new Date().toISOString(),
      };

      await service.handlePolarExercise(data);
      expect(mockPolar.handleWebhookExercise).toHaveBeenCalledWith(data);
    });
  });

  // ── Garmin push workout ───────────────────────────────────────────────────

  describe('pushWorkoutToGarmin', () => {
    it('delegates to GarminService', async () => {
      await service.pushWorkoutToGarmin('workout_1');
      expect(mockGarmin.pushWorkoutToGarmin).toHaveBeenCalledWith('workout_1');
    });
  });

  describe('pushPlanToGarmin', () => {
    it('delegates to GarminService', async () => {
      await service.pushPlanToGarmin('plan_1');
      expect(mockGarmin.pushPlanToGarmin).toHaveBeenCalledWith('plan_1');
    });
  });
});
