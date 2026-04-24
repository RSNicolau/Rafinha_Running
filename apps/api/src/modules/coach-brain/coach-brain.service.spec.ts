/**
 * Unit tests for CoachBrainService.
 *
 * Focuses on pure-logic methods that don't require a real DB or LLM call.
 * SSE streaming methods are tested at the e2e level.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoachBrainService } from './coach-brain.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    coachProfile: { findUnique: jest.fn() },
    athleteProfile: { findMany: jest.fn() },
    workout: { findMany: jest.fn() },
    onboardingProfile: { findMany: jest.fn() },
    physicalAssessment: { findMany: jest.fn() },
    garminHealthSnapshot: { findMany: jest.fn() },
    coachBrainSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    // Prisma generates `aIJob` (not `aiJob`) from model name `AIJob`
    aIJob: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notification: { create: jest.fn() },
  };
}

describe('CoachBrainService', () => {
  let service: CoachBrainService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachBrainService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CoachBrainService>(CoachBrainService);
  });

  // ── getSessions ───────────────────────────────────────────────────────────

  describe('getSessions()', () => {
    it('should return sessions list for coach', async () => {
      const mockSessions = [
        { id: 's-1', coachId: 'coach-1', messages: [], createdAt: new Date() },
      ];
      prisma.coachBrainSession.findMany.mockResolvedValue(mockSessions);

      const result = await service.getSessions('coach-1');

      expect(prisma.coachBrainSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-1' } }),
      );
      expect(result).toEqual(mockSessions);
    });
  });

  // ── getSession ────────────────────────────────────────────────────────────

  describe('getSession()', () => {
    it('should throw NotFoundException for unknown session', async () => {
      prisma.coachBrainSession.findFirst.mockResolvedValue(null);

      await expect(service.getSession('coach-1', 'unknown-session')).rejects.toThrow(NotFoundException);
    });

    it('should return session when found', async () => {
      const mockSession = { id: 's-1', coachId: 'coach-1', messages: [] };
      prisma.coachBrainSession.findFirst.mockResolvedValue(mockSession);

      const result = await service.getSession('coach-1', 's-1');
      expect(result).toEqual(mockSession);
    });
  });

  // ── deleteSession ─────────────────────────────────────────────────────────

  describe('deleteSession()', () => {
    it('should delete session via deleteMany and return { deleted: true }', async () => {
      prisma.coachBrainSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteSession('coach-1', 's-1');

      expect(prisma.coachBrainSession.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 's-1', coachId: 'coach-1' }) }),
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── getJobs ───────────────────────────────────────────────────────────────

  describe('getJobs()', () => {
    it('should return AI jobs for the coach', async () => {
      const mockJobs = [{ id: 'j-1', status: 'SUCCESS', type: 'ONBOARDING_ANALYSIS' }];
      prisma.aIJob.findMany.mockResolvedValue(mockJobs);

      const result = await service.getJobs('coach-1');
      expect(result).toEqual(mockJobs);
    });
  });

  // ── getAISettings ──────────────────────────────────────────────────────────

  describe('getAISettings()', () => {
    it('should return default settings when user has no AI settings', async () => {
      prisma.user.findUnique.mockResolvedValue({
        aiProvider: null,
        aiModel: null,
        aiByok: false,
        aiApiKey: null,
      });

      const result = await service.getAISettings('coach-1');

      // model may be null when no custom model is configured
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('byok');
      // API key must never be exposed in plaintext
      expect(result).not.toHaveProperty('aiApiKey');
    });

    it('should return configured provider/model without exposing raw API key', async () => {
      prisma.user.findUnique.mockResolvedValue({
        aiProvider: 'openai',
        aiModel: 'gpt-4o',
        aiByok: false,
        aiApiKey: null,
      });

      const result = await service.getAISettings('coach-1');

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.byok).toBe(false);
    });
  });

  // ── processFailedJobs ────────────────────────────────────────────────────

  describe('processFailedJobs()', () => {
    it('should do nothing when no failed jobs exist', async () => {
      prisma.aIJob.findMany.mockResolvedValue([]);

      await service.processFailedJobs();

      expect(prisma.aIJob.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should attempt to retry failed jobs by updating status and retries', async () => {
      const failedJob = {
        id: 'job-1',
        type: 'ONBOARDING_ANALYSIS',
        status: 'FAILED',
        retries: 0,
        maxRetries: 3,
        payload: { profileId: 'p-1' },
        coachId: 'coach-1',
        athleteId: null,
      };

      prisma.aIJob.findMany.mockResolvedValue([failedJob]);
      // update gets called with RETRYING first, then either SUCCESS or FAILED
      prisma.aIJob.update.mockResolvedValue({ ...failedJob, status: 'RETRYING', retries: 1 });
      // any nested prisma calls in job handler will get undefined — that's fine, we just verify the RUNNING update

      try {
        await service.processFailedJobs();
      } catch {
        // errors from nested job handlers are acceptable in unit tests
      }

      // Service sets status to RUNNING with retries: { increment: 1 }
      expect(prisma.aIJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
    });
  });
});
