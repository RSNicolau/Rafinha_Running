/**
 * Unit tests for GarminService
 *
 * Critical paths:
 *  - getAuthUrl: throws if credentials missing, stores state nonce
 *  - handleCallback: validates state, exchanges code, upserts integration
 *  - syncActivities: fetches activities, skips non-running, matches workouts, saves results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GarminService } from './garmin.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  appConfig: {
    upsert:     jest.fn(),
    findUnique: jest.fn(),
    delete:     jest.fn(),
  },
  fitnessIntegration: {
    upsert:  jest.fn(),
    update:  jest.fn(),
  },
  workout: {
    findFirst: jest.fn(),
    update:    jest.fn(),
  },
  workoutResult: {
    findFirst: jest.fn(),
    upsert:    jest.fn(),
  },
};

// ── Fetch mock ─────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('GarminService', () => {
  let service: GarminService;

  beforeEach(async () => {
    process.env.GARMIN_CLIENT_ID     = 'test-garmin-id';
    process.env.GARMIN_CLIENT_SECRET = 'test-garmin-secret';
    process.env.GARMIN_REDIRECT_URI  = 'http://localhost:3000/api/integrations/GARMIN/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GarminService>(GarminService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GARMIN_CLIENT_ID;
    delete process.env.GARMIN_CLIENT_SECRET;
  });

  // ── getAuthUrl ─────────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('throws BadRequestException if credentials are not configured', async () => {
      delete process.env.GARMIN_CLIENT_ID;
      delete process.env.GARMIN_CLIENT_SECRET;
      const svc = new GarminService(mockPrisma as any);
      await expect(svc.getAuthUrl('u1')).rejects.toThrow(BadRequestException);
    });

    it('stores a state nonce in appConfig', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({});
      await service.getAuthUrl('u1');
      expect(mockPrisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ value: expect.objectContaining({ userId: 'u1' }) }),
        }),
      );
    });

    it('returns a URL containing the Garmin authorization endpoint', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({});
      const result = await service.getAuthUrl('u1');
      expect(result.url).toContain('garmin.com');
      expect(result.provider).toBe('GARMIN');
    });
  });

  // ── handleCallback ─────────────────────────────────────────────────────────

  describe('handleCallback', () => {
    it('throws BadRequestException for invalid or expired state', async () => {
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);
      await expect(service.handleCallback('code', 'bad-state')).rejects.toThrow(BadRequestException);
    });

    it('upserts fitnessIntegration on successful token exchange', async () => {
      const stateRecord = {
        key: 'oauth_state:garmin:abc',
        value: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      };
      mockPrisma.appConfig.findUnique.mockResolvedValue(stateRecord);
      mockPrisma.appConfig.delete.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token:  'garmin_at_test',
          refresh_token: 'garmin_rt_test',
          expires_in:    3600,
        }),
      });

      mockPrisma.fitnessIntegration.upsert.mockResolvedValue({ id: 'fi_1' });

      const result = await service.handleCallback('garmin_auth_code', 'abc');
      expect(mockPrisma.fitnessIntegration.upsert).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.provider).toBe('GARMIN');
    });
  });

  // ── syncActivities ─────────────────────────────────────────────────────────

  describe('syncActivities', () => {
    const mockIntegration = {
      id:             'fi_1',
      userId:         'u1',
      provider:       'GARMIN',
      accessToken:    'garmin_at_test',
      refreshToken:   'garmin_rt_test',
      externalUserId: 'garmin_user_1',
      expiresAt:      new Date(Date.now() + 3_600_000), // valid token
      isActive:       true,
    };

    it('returns synced = 0 when no running activities returned', async () => {
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([]), // empty activities
      });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
    });

    it('saves WorkoutResult for a RUNNING activity matching a scheduled workout', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          activityId:                       'garmin_act_1',
          activityType:                     'RUNNING',
          startTimeInSeconds:               now - 3600,
          startTimeOffsetInSeconds:         0,
          durationInSeconds:                3600,
          distanceInMeters:                 10000,
          averageHeartRateInBeatsPerMinute: 155,
          maxHeartRateInBeatsPerMinute:     175,
          activeKilocalories:               600,
          elevationGainInMeters:            50,
        }]),
      });

      mockPrisma.workoutResult.findFirst.mockResolvedValue(null);
      mockPrisma.workout.findFirst.mockResolvedValue({
        id:                   'w_1',
        scheduledDate:        new Date(),
        targetDistanceMeters: 10000,
        status:               'SCHEDULED',
      });
      mockPrisma.workoutResult.upsert.mockResolvedValue({ id: 'wr_1' });
      mockPrisma.workout.update.mockResolvedValue({});
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(1);
      expect(mockPrisma.workoutResult.upsert).toHaveBeenCalledTimes(1);
    });

    it('skips duplicate activities already synced', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          activityId:          'garmin_already_synced',
          activityType:        'RUNNING',
          startTimeInSeconds:  now - 3600,
          durationInSeconds:   3600,
          distanceInMeters:    5000,
        }]),
      });

      mockPrisma.workoutResult.findFirst.mockResolvedValue({ id: 'wr_existing' });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
      expect(mockPrisma.workoutResult.upsert).not.toHaveBeenCalled();
    });

    it('skips non-running activity types', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          activityId:          'garmin_cycling_1',
          activityType:        'CYCLING',
          startTimeInSeconds:  now - 7200,
          durationInSeconds:   7200,
          distanceInMeters:    50000,
        }]),
      });

      mockPrisma.workoutResult.findFirst.mockResolvedValue(null);
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
      expect(mockPrisma.workoutResult.upsert).not.toHaveBeenCalled();
    });
  });
});
