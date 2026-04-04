/**
 * Unit tests for PaymentsService
 *
 * Critical paths:
 *  - getCurrentSubscription: active sub returned, NONE shape when absent
 *  - cancelSubscription: throws when no active sub, delegates to Stripe / MP
 *  - getPaymentHistory: paginates correctly
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../payments.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn() },
  subscription: { findFirst: jest.fn() },
  payment: {
    findMany: jest.fn(),
    count:    jest.fn(),
  },
};

// ── External service mocks ─────────────────────────────────────────────────────

const mockStripe = {
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
};

const mockMercadoPago = {
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService,       useValue: mockPrisma       },
        { provide: StripeService,       useValue: mockStripe       },
        { provide: MercadoPagoService,  useValue: mockMercadoPago  },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  // ── getCurrentSubscription ─────────────────────────────────────────────────

  describe('getCurrentSubscription', () => {
    it('retorna assinatura ativa quando existe', async () => {
      const mockSub = {
        id: 'sub-1', userId: 'u1', status: 'ACTIVE', planType: 'MONTHLY',
        provider: 'PAGARME', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false,
      };
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSub);

      const result = await service.getCurrentSubscription('u1');
      expect(result.status).toBe('ACTIVE');
      expect(result.id).toBe('sub-1');
    });

    it('retorna objeto NONE quando não há assinatura ativa', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentSubscription('u1');
      expect(result.status).toBe('NONE');
      expect(result.id).toBeNull();
      expect(result.planType).toBeNull();
    });

    it('retorna status NONE com campos consistentes (não quebra ao acessar planType)', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentSubscription('u1');
      expect(result).toMatchObject({
        id:                null,
        userId:            'u1',
        status:            'NONE',
        planType:          null,
        provider:          null,
        currentPeriodEnd:  null,
        cancelAtPeriodEnd: false,
      });
    });
  });

  // ── cancelSubscription ─────────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('lança NotFoundException quando não há assinatura ativa', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      await expect(service.cancelSubscription('u1')).rejects.toThrow(NotFoundException);
    });

    it('delega para StripeService quando provider é STRIPE', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({ id: 'sub-1', provider: 'STRIPE' });
      mockStripe.cancelSubscription.mockResolvedValue({ canceled: true });

      await service.cancelSubscription('u1');
      expect(mockStripe.cancelSubscription).toHaveBeenCalledWith('u1');
      expect(mockMercadoPago.cancelSubscription).not.toHaveBeenCalled();
    });

    it('delega para MercadoPagoService quando provider é MERCADO_PAGO', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue({ id: 'sub-2', provider: 'MERCADO_PAGO' });
      mockMercadoPago.cancelSubscription.mockResolvedValue({ canceled: true });

      await service.cancelSubscription('u1');
      expect(mockMercadoPago.cancelSubscription).toHaveBeenCalledWith('u1');
      expect(mockStripe.cancelSubscription).not.toHaveBeenCalled();
    });
  });

  // ── getPaymentHistory ──────────────────────────────────────────────────────

  describe('getPaymentHistory', () => {
    it('retorna pagamentos paginados', async () => {
      const payments = [
        { id: 'p1', userId: 'u1', amount: 4900, status: 'SUCCEEDED' },
        { id: 'p2', userId: 'u1', amount: 4900, status: 'SUCCEEDED' },
      ];
      mockPrisma.payment.findMany.mockResolvedValue(payments);
      mockPrisma.payment.count.mockResolvedValue(2);

      const result = await service.getPaymentHistory('u1', 1, 20);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('calcula totalPages corretamente para múltiplas páginas', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(45);

      const result = await service.getPaymentHistory('u1', 1, 20);
      expect(result.totalPages).toBe(3);
    });

    it('retorna lista vazia quando usuário não tem pagamentos', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      const result = await service.getPaymentHistory('u1');
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });
});
