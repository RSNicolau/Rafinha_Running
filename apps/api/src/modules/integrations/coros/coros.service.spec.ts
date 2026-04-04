/**
 * Unit tests for CorosService
 *
 * Critical paths:
 *  - getAuthUrl: throws if credentials missing, stores state nonce
 *  - handleCallback: validates state, exchanges code, upserts integration
 *  - syncActivities: fetches COROS activities, matches workouts, saves results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CorosService } from './coros.service';
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

describe('CorosService', () => {
  let service: CorosService;

  beforeEach(async () => {
    process.env.COROS_CLIENT_ID     = 'test-client-id';
    process.env.COROS_CLIENT_SECRET = 'test-client-secret';
    process.env.COROS_REDIRECT_URI  = 'http://localhost:3000/api/integrations/COROS/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CorosService>(CorosService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.COROS_CLIENT_ID;
    delete process.env.COROS_CLIENT_SECRET;
  });

  // ── getAuthUrl ─────────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('throws BadRequestException if credentials are not configured', async () => {
      delete process.env.COROS_CLIENT_ID;
      delete process.env.COROS_CLIENT_SECRET;
      const svc = new CorosService(mockPrisma as any);
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

    it('returns a URL containing the COROS authorization endpoint', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({});
      const result = await service.getAuthUrl('u1');
      expect(result.url).toContain('open.coros.com');
      expect(result.provider).toBe('COROS');
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
        key: 'oauth_state:coros:abc',
        value: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      };
      mockPrisma.appConfig.findUnique.mockResolvedValue(stateRecord);
      mockPrisma.appConfig.delete.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token:  'at_test',
          refresh_token: 'rt_test',
          expires_in:    3600,
          openId:        'coros_user_1',
        }),
      });
      mockPrisma.fitnessIntegration.upsert.mockResolvedValue({ id: 'fi_1' });

      const result = await service.handleCallback('auth_code', 'abc');
      expect(mockPrisma.fitnessIntegration.upsert).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.provider).toBe('COROS');
    });
  });

  // ── syncActivities ─────────────────────────────────────────────────────────

  describe('syncActivities', () => {
    const mockIntegration = {
      id:             'fi_1',
      userId:         'u1',
      provider:       'COROS',
      accessToken:    'at_test',
      refreshToken:   'rt_test',
      externalUserId: 'coros_user_1',
      expiresAt:      new Date(Date.now() + 3_600_000), // valid token
      isActive:       true,
    };

    it('returns synced = 0 when no COROS activities returned', async () => {
      // Token is valid, no refresh needed
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ({ result: { activityList: [] } }),
      });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
    });

    it('saves a WorkoutResult when activity matches a scheduled workout', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockFetch.mockResolvedValue({
        ok:   true,
        json: async () => ({
          result: {
            activityList: [{
              activityId: 'coros_act_1',
              mode:       100, // running
              startTime:  now - 3600,
              endTime:    now,
              totalTime:  3600,
              distance:   10000, // 10 km
            }],
          },
        }),
      });

      // No duplicate
      mockPrisma.workoutResult.findFirst.mockResolvedValue(null);
      // A matching workout
      mockPrisma.workout.findFirst.mockResolvedValue({
        id:            'w_1',
        scheduledDate: new Date(),
        targetDistanceMeters: 10000,
        status: 'SCHEDULED',
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
        json: async () => ({
          result: {
            activityList: [{
              activityId: 'coros_already_synced',
              mode:       100,
              startTime:  now - 3600,
              endTime:    now,
              totalTime:  3600,
              distance:   5000,
            }],
          },
        }),
      });

      // Already exists
      mockPrisma.workoutResult.findFirst.mockResolvedValue({ id: 'wr_existing' });
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
      expect(mockPrisma.workoutResult.upsert).not.toHaveBeenCalled();
    });
  });
});
