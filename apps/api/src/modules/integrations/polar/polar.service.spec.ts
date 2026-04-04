/**
 * Unit tests for PolarService
 *
 * Critical paths:
 *  - getAuthUrl: throws if credentials missing, stores state nonce
 *  - handleCallback: validates state, exchanges code, registers user
 *  - syncActivities: transaction-based sync (204 = no data, 201 = exercises)
 *  - parseDuration: ISO8601 PT duration → seconds
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PolarService } from './polar.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  appConfig: {
    upsert:     jest.fn(),
    findUnique: jest.fn(),
    delete:     jest.fn(),
  },
  fitnessIntegration: {
    upsert:    jest.fn(),
    findFirst: jest.fn(),
    update:    jest.fn(),
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

describe('PolarService', () => {
  let service: PolarService;

  beforeEach(async () => {
    process.env.POLAR_CLIENT_ID     = 'polar-client-id';
    process.env.POLAR_CLIENT_SECRET = 'polar-client-secret';
    process.env.POLAR_REDIRECT_URI  = 'http://localhost:3000/api/integrations/POLAR/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolarService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PolarService>(PolarService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.POLAR_CLIENT_ID;
    delete process.env.POLAR_CLIENT_SECRET;
  });

  // ── getAuthUrl ─────────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('throws BadRequestException if credentials are not configured', async () => {
      delete process.env.POLAR_CLIENT_ID;
      delete process.env.POLAR_CLIENT_SECRET;
      const svc = new PolarService(mockPrisma as any);
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

    it('returns a URL with the Polar authorization endpoint', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({});
      const result = await service.getAuthUrl('u1');
      expect(result.url).toContain('polar.com');
      expect(result.provider).toBe('POLAR');
    });
  });

  // ── handleCallback ─────────────────────────────────────────────────────────

  describe('handleCallback', () => {
    it('throws BadRequestException for invalid or expired state', async () => {
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);
      await expect(service.handleCallback('code', 'bad-state')).rejects.toThrow(BadRequestException);
    });

    it('upserts fitnessIntegration after successful token exchange + user registration', async () => {
      const stateRecord = {
        key: 'oauth_state:polar:abc',
        value: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      };
      mockPrisma.appConfig.findUnique.mockResolvedValue(stateRecord);
      mockPrisma.appConfig.delete.mockResolvedValue({});

      // Token exchange (uses Basic auth)
      mockFetch
        .mockResolvedValueOnce({
          ok:     true,
          json:   async () => ({
            access_token: 'polar_at_test',
            token_type:   'bearer',
            x_user_id:    12345,
          }),
        })
        // User registration — 200 OK
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

      mockPrisma.fitnessIntegration.upsert.mockResolvedValue({ id: 'fi_1' });

      const result = await service.handleCallback('polar_auth_code', 'abc');
      expect(mockPrisma.fitnessIntegration.upsert).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.provider).toBe('POLAR');
    });
  });

  // ── syncActivities ─────────────────────────────────────────────────────────

  describe('syncActivities', () => {
    const mockIntegration = {
      id:             'fi_1',
      userId:         'u1',
      provider:       'POLAR',
      accessToken:    'polar_at_test',
      externalUserId: '12345',
      expiresAt:      null, // Polar tokens don't expire for user grants
      isActive:       true,
    };

    it('returns synced = 0 when no new data (204 from transaction endpoint)', async () => {
      // POST create transaction → 204 = no new data
      mockFetch.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
    });

    it('commits transaction and saves WorkoutResult for a running exercise', async () => {
      const exUrl = 'https://www.polaraccesslink.com/v3/users/12345/exercise-transactions/tx_1/exercises/ex_1';

      mockFetch
        // Step 1: POST create transaction → 201
        .mockResolvedValueOnce({
          ok:     true,
          status: 201,
          json:   async () => ({ 'transaction-id': 'tx_1' }),
        })
        // Step 2: GET transaction list → exercises array
        .mockResolvedValueOnce({
          ok:   true,
          json: async () => ({ exercises: [exUrl] }),
        })
        // Step 3: GET exercise detail
        .mockResolvedValueOnce({
          ok:   true,
          json: async () => ({
            id:         'ex_1',
            sport:      'RUNNING',
            start_time: new Date().toISOString(),
            duration:   'PT1H2M3S',
            distance:   10000,
            calories:   600,
            heart_rate: { average: 155, maximum: 175 },
          }),
        })
        // Step 4: PUT commit transaction
        .mockResolvedValueOnce({ ok: true, status: 200 });

      mockPrisma.workoutResult.findFirst.mockResolvedValue(null);
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

    it('skips non-running sports (CYCLING)', async () => {
      const exUrl = 'https://www.polaraccesslink.com/v3/users/12345/exercise-transactions/tx_2/exercises/ex_2';
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ 'transaction-id': 'tx_2' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ exercises: [exUrl] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'ex_2', sport: 'CYCLING', duration: 'PT2H0M0S', distance: 50000 }) })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      mockPrisma.workoutResult.findFirst.mockResolvedValue(null);
      mockPrisma.fitnessIntegration.update.mockResolvedValue({});

      const result = await service.syncActivities('u1', mockIntegration as any);
      expect(result.synced).toBe(0);
      expect(mockPrisma.workoutResult.upsert).not.toHaveBeenCalled();
    });
  });

  // ── parseDuration ──────────────────────────────────────────────────────────

  describe('parseDuration (ISO8601 PT → seconds)', () => {
    it('parses PT1H32M12S correctly', () => {
      expect((service as any).parseDuration('PT1H32M12S')).toBe(5532);
    });

    it('parses PT45M0S correctly', () => {
      expect((service as any).parseDuration('PT45M0S')).toBe(2700);
    });

    it('parses PT30S correctly', () => {
      expect((service as any).parseDuration('PT30S')).toBe(30);
    });

    it('returns 0 for empty or invalid input', () => {
      expect((service as any).parseDuration('')).toBe(0);
      expect((service as any).parseDuration('invalid')).toBe(0);
    });
  });
});
