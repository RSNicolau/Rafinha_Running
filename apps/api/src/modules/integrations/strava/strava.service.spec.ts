/**
 * Unit tests for StravaService
 *
 * Critical paths:
 *  - getAuthUrl: throws if credentials missing, stores state nonce
 *  - handleCallback: validates state, exchanges code, upserts integration
 *  - syncActivities: fetches activities, skips non-running, matches workouts, saves results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StravaService } from './strava.service';
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

describe('StravaService', () => {
  let service: StravaService;

  beforeEach(async () => {
    process.env.STRAVA_CLIENT_ID     = 'test-strava-id';
    process.env.STRAVA_CLIENT_SECRET = 'test-strava-secret';
    process.env.STRAVA_REDIRECT_URI  = 'http://localhost:3000/api/integrations/STRAVA/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StravaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StravaService>(StravaService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
  });

  // ── getAuthUrl ─────────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('throws BadRequestException if credentials are not configured', async () => {
      delete process.env.STRAVA_CLIENT_ID;
      delete process.env.STRAVA_CLIENT_SECRET;
      const svc = new StravaService(mockPrisma as any);
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

    it('returns a URL containing the Strava authorization endpoint', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({});
      const result = await service.getAuthUrl('u1');
      expect(result.url).toContain('strava.com');
      expect(result.provider).toBe('STRAVA');
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
        key: 'oauth_state:strava:abc',
        value: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      };
      mockPrisma.appConfig.findUnique.mockResolvedValue(stateRecord);
      mockPrisma.appConfig.delete.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token:  'strava_at_test',
          refresh_token: 'strava_rt_test',
          expires_at:    Math.floor(Date.now() / 1000) + 3600,
          athlete:       { id: 99999 },
        }),
      });

      mockPrisma.fitnessIntegration.upsert.mockResolvedValue({ id: 'fi_1' });

      const result = await service.handleCallback('strava_auth_code', 'abc');
      expect(mockPrisma.fitnessIntegration.upsert).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.provider).toBe('STRAVA');
    });
  });

  // ── syncActivities ─────────────────────────────────────────────────────────

  describe('syncActivities', () => {
    const mockIntegration = {
      id:             'fi_1',
      userId:         'u1',
      provider:       'STRAVA',
      accessToken:    'strava_at_test',
      refreshToken:   'strava_rt_test',
      externalUserId: '99999',
      expiresAt:      new Date(Date.now() + 3_600_000), // valid token
      isActive:       true,
    };

    it('returns synced = 0 when no running activities returned', async () => {
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([]), // empty
      });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
    });

    it('saves WorkoutResult for a Run activity matching a scheduled workout', async () => {
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          id:                   12345,
          type:                 'Run',
          start_date:           new Date().toISOString(),
          moving_time:          3600,
          distance:             10000,
          average_heartrate:    155,
          max_heartrate:        175,
          calories:             600,
          total_elevation_gain: 50,
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
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          id:          99999,
          type:        'Run',
          start_date:  new Date().toISOString(),
          moving_time: 1800,
          distance:    5000,
        }]),
      });

      mockPrisma.workoutResult.findFirst.mockResolvedValue({ id: 'wr_existing' });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
      expect(mockPrisma.workoutResult.upsert).not.toHaveBeenCalled();
    });

    it('skips non-running activity types (Ride)', async () => {
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ([{
          id:          77777,
          type:        'Ride',
          start_date:  new Date().toISOString(),
          moving_time: 7200,
          distance:    50000,
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
