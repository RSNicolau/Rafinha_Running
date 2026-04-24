/**
 * Unit tests for OnboardingService.
 *
 * Uses mocked PrismaService, EmailService, and PaymentsService so no database
 * connection is required — safe to run in CI.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    coachProfile: {
      findFirst: jest.fn(),
    },
    onboardingForm: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    onboardingQuestion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    onboardingProfile: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    aiJob: {
      create: jest.fn(),
    },
    athleteProfile: {
      create: jest.fn(),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let emailService: { sendAthleteCredentials: jest.Mock; sendAthleteWelcome: jest.Mock };
  let paymentsService: { createSubscription: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    emailService = {
      sendAthleteCredentials: jest.fn().mockResolvedValue(undefined),
      sendAthleteWelcome: jest.fn().mockResolvedValue(undefined),
    };
    paymentsService = {
      createSubscription: jest.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.example.com' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  // ── getOrCreateForm ─────────────────────────────────────────────────────

  describe('getOrCreateForm()', () => {
    it('should return existing form for the coach', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1', questions: [] };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);

      const result = await service.getOrCreateForm('coach-1');

      expect(prisma.onboardingForm.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-1' } }),
      );
      expect(result).toEqual(mockForm);
      expect(prisma.onboardingForm.create).not.toHaveBeenCalled();
    });

    it('should create a new form with default questions when none exists', async () => {
      const mockForm = { id: 'form-2', coachId: 'coach-2', questions: [] };
      prisma.onboardingForm.findUnique.mockResolvedValue(null);
      prisma.onboardingForm.create.mockResolvedValue(mockForm);

      const result = await service.getOrCreateForm('coach-2');

      expect(prisma.onboardingForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coachId: 'coach-2',
            questions: expect.objectContaining({ create: expect.any(Array) }),
          }),
        }),
      );
      expect(result).toEqual(mockForm);
    });
  });

  // ── addQuestion ─────────────────────────────────────────────────────────

  describe('addQuestion()', () => {
    it('should throw NotFoundException when form does not exist', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValue(null);

      await expect(
        service.addQuestion('coach-x', { question: 'Test?', type: 'TEXT' as any }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create question with incremented order', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      const lastQuestion = { order: 5 };
      const newQuestion = { id: 'q-new', formId: 'form-1', order: 6, question: 'New Q?' };

      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.findFirst.mockResolvedValue(lastQuestion);
      prisma.onboardingQuestion.create.mockResolvedValue(newQuestion);

      const result = await service.addQuestion('coach-1', {
        question: 'New Q?',
        type: 'TEXT' as any,
      });

      expect(prisma.onboardingQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 6, question: 'New Q?' }),
        }),
      );
      expect(result).toEqual(newQuestion);
    });

    it('should use order 1 when no questions exist yet', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.findFirst.mockResolvedValue(null);
      prisma.onboardingQuestion.create.mockResolvedValue({ id: 'q-1', order: 1 });

      await service.addQuestion('coach-1', { question: 'First?', type: 'TEXT' as any });

      expect(prisma.onboardingQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 1 }),
        }),
      );
    });
  });

  // ── deleteQuestion ─────────────────────────────────────────────────────

  describe('deleteQuestion()', () => {
    it('should soft-delete (set isActive: false)', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.update.mockResolvedValue({ id: 'q-1', isActive: false });

      const result = await service.deleteQuestion('coach-1', 'q-1');

      expect(prisma.onboardingQuestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q-1', formId: 'form-1' },
          data: { isActive: false },
        }),
      );
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when form does not exist', async () => {
      prisma.onboardingForm.findUnique.mockResolvedValue(null);

      await expect(service.deleteQuestion('coach-x', 'q-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPendingOnboardings ──────────────────────────────────────────────

  describe('getPendingOnboardings()', () => {
    it('should return onboarding profiles for the coach', async () => {
      const mockProfiles = [
        { id: 'p-1', status: 'PENDING_REVIEW', athlete: { name: 'João', email: 'joao@test.com' } },
      ];
      prisma.onboardingProfile.findMany.mockResolvedValue(mockProfiles);

      const result = await service.getPendingOnboardings('coach-1');

      expect(prisma.onboardingProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ coachId: 'coach-1' }),
        }),
      );
      expect(result).toEqual(mockProfiles);
    });
  });

  // ── reorderQuestions ───────────────────────────────────────────────────

  describe('reorderQuestions()', () => {
    it('should update order for all provided questions', async () => {
      const mockForm = { id: 'form-1', coachId: 'coach-1' };
      prisma.onboardingForm.findUnique.mockResolvedValue(mockForm);
      prisma.onboardingQuestion.update.mockResolvedValue({});

      const orders = [
        { id: 'q-1', order: 3 },
        { id: 'q-2', order: 1 },
      ];

      const result = await service.reorderQuestions('coach-1', orders);

      expect(prisma.onboardingQuestion.update).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ updated: 2 });
    });
  });
});
