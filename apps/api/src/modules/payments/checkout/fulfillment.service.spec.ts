import { FulfillmentService } from './fulfillment.service';

function txMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    product: { update: jest.fn(), findUnique: jest.fn() },
    storeOrder: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), aggregate: jest.fn() },
    storeCoupon: { update: jest.fn(), updateMany: jest.fn() },
    payment: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    event: { findUnique: jest.fn(), update: jest.fn() },
    eventRegistration: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn() },
    eventDistance: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    eventCoupon: { updateMany: jest.fn() },
    eventCouponUse: { deleteMany: jest.fn() },
    platformPlan: { findUnique: jest.fn() },
    coachSubscription: { findUnique: jest.fn(), upsert: jest.fn() },
  } as any;
}

describe('FulfillmentService', () => {
  const svc = new FulfillmentService({} as any);
  const now = new Date('2026-10-14T12:00:00Z');

  describe('coupon helpers', () => {
    it('computes discounts and caps at base', () => {
      expect(FulfillmentService.couponDiscount('PERCENT', 10, 10000)).toBe(1000);
      expect(FulfillmentService.couponDiscount('FIXED', 2500, 10000)).toBe(2500);
      expect(FulfillmentService.couponDiscount('FIXED', 99999, 10000)).toBe(10000);
      expect(FulfillmentService.couponDiscount('COURTESY', 0, 10000)).toBe(10000);
      expect(FulfillmentService.couponDiscount('PERCENT', 150, 10000)).toBe(10000);
    });
    it('rejects expired / exhausted / inactive coupons (expiresAt is no longer ignored)', () => {
      const base = { id: 'c', type: 'PERCENT', value: 10, maxUses: 2, usedCount: 0, expiresAt: null, isActive: true };
      expect(FulfillmentService.couponProblem(base, now)).toBeNull();
      expect(FulfillmentService.couponProblem({ ...base, expiresAt: new Date('2026-10-13') }, now)).toBe('Cupom expirado');
      expect(FulfillmentService.couponProblem({ ...base, usedCount: 2 }, now)).toBe('Cupom atingiu o limite de usos');
      expect(FulfillmentService.couponProblem({ ...base, isActive: false }, now)).toBe('Cupom inválido ou inativo');
      expect(FulfillmentService.couponProblem(null, now)).toBe('Cupom inválido ou inativo');
    });
    it('redeems atomically with usedCount < maxUses in the WHERE', async () => {
      const tx = txMock();
      tx.storeCoupon.updateMany.mockResolvedValue({ count: 0 });
      const ok = await svc.redeemStoreCoupon(tx, { id: 'c1', type: 'PERCENT', value: 10, maxUses: 3, usedCount: 2, expiresAt: null, isActive: true }, now);
      expect(ok).toBe(false);
      expect(tx.storeCoupon.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'c1', isActive: true, usedCount: { lt: 3 } }),
          data: { usedCount: { increment: 1 } },
        }),
      );
    });
  });

  describe('storeOrderPaid', () => {
    const pending = { id: 'o1', productId: 'p1', quantity: 2, status: 'PENDING_PAYMENT', isPreOrder: false, finalInCents: 5000, totalInCents: 5000, discountInCents: 0 };

    it('in-stock order: locks the order row, conditional PENDING→PAID, reserved → sold', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue(pending);
      tx.storeOrder.updateMany.mockResolvedValue({ count: 1 });
      const r = await svc.storeOrderPaid(tx, 'o1', now, { amount: 5000 });
      expect(r.outcome).toBe('FULFILLED');
      expect(tx.$queryRaw).toHaveBeenCalled(); // SELECT ... FOR UPDATE no pedido
      expect(tx.storeOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', status: 'PENDING_PAYMENT' } }));
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { totalStock: { decrement: 2 }, reserved: { decrement: 2 } },
      });
    });

    it('pre-order: no stock movement', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue({ ...pending, isPreOrder: true });
      tx.storeOrder.updateMany.mockResolvedValue({ count: 1 });
      expect((await svc.storeOrderPaid(tx, 'o1', now)).outcome).toBe('FULFILLED');
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('already paid order → ALREADY (no double stock decrement)', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue({ ...pending, status: 'PAID' });
      tx.storeOrder.updateMany.mockResolvedValue({ count: 0 });
      expect((await svc.storeOrderPaid(tx, 'o1', now)).outcome).toBe('ALREADY');
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('payment amount different from the order total → NEEDS_REFUND, nothing touched', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue(pending);
      expect((await svc.storeOrderPaid(tx, 'o1', now, { amount: 4000 })).outcome).toBe('NEEDS_REFUND');
      expect(tx.storeOrder.updateMany).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('late payment after expiry without stock → NEEDS_REFUND', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue({ ...pending, status: 'CANCELLED', cancelReason: 'EXPIRED' });
      tx.storeOrder.updateMany.mockResolvedValue({ count: 0 });
      tx.$executeRaw.mockResolvedValue(0);
      expect((await svc.storeOrderPaid(tx, 'o1', now)).outcome).toBe('NEEDS_REFUND');
      expect(tx.storeOrder.update).not.toHaveBeenCalled();
    });

    it('late payment after expiry with stock → LATE_FULFILLED and coupon re-counted', async () => {
      const tx = txMock();
      tx.storeOrder.findUnique.mockResolvedValue({ ...pending, quantity: 1, status: 'CANCELLED', cancelReason: 'EXPIRED', couponId: 'c1' });
      tx.storeOrder.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
      tx.$executeRaw.mockResolvedValue(1);
      expect((await svc.storeOrderPaid(tx, 'o1', now)).outcome).toBe('LATE_FULFILLED');
      expect(tx.storeCoupon.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { usedCount: { increment: 1 } } });
    });
  });

  describe('releaseStoreOrder', () => {
    it('releases reservation + coupon and fails pending payments (idempotent)', async () => {
      const tx = txMock();
      tx.storeOrder.updateMany.mockResolvedValue({ count: 1 });
      tx.storeOrder.findUnique.mockResolvedValue({ id: 'o1', productId: 'p1', quantity: 3, isPreOrder: false, couponId: 'c1' });
      tx.payment.findMany.mockResolvedValue([
        { id: 'pay1', provider: 'ASAAS', externalPaymentId: 'ext1', status: 'PENDING' },
        { id: 'pay0', provider: 'ASAAS', externalPaymentId: 'ext0', status: 'FAILED' }, // vencida (OVERDUE) — também cancelar no gateway
      ]);
      const r = await svc.releaseStoreOrder(tx, 'o1', 'EXPIRED', now);
      expect(r.released).toBe(true);
      expect(tx.storeOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', status: 'PENDING_PAYMENT' } }));
      expect(tx.$executeRaw).toHaveBeenCalled(); // reserved = GREATEST(reserved - q, 0)
      expect(tx.storeCoupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      expect(tx.payment.findMany.mock.calls[0][0].where).toEqual({ storeOrderId: 'o1', status: { in: ['PENDING', 'FAILED'] } });
      expect(tx.payment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['pay1'] }, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'EXPIRED' } });
      expect(r.closedPayments).toEqual([
        { id: 'pay1', provider: 'ASAAS', externalPaymentId: 'ext1' },
        { id: 'pay0', provider: 'ASAAS', externalPaymentId: 'ext0' },
      ]);
    });

    it('does nothing when the order is no longer pending', async () => {
      const tx = txMock();
      tx.storeOrder.updateMany.mockResolvedValue({ count: 0 });
      const r = await svc.releaseStoreOrder(tx, 'o1', 'EXPIRED', now);
      expect(r.released).toBe(false);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('assignBib increments bibSeq atomically and keeps padStart(4)', async () => {
      const tx = txMock();
      tx.event.update.mockResolvedValueOnce({ bibSeq: 8 });
      tx.eventRegistration.findFirst.mockResolvedValueOnce(null);
      const bib = await svc.assignBib(tx, 'e1');
      expect(bib).toBe('0008');
      expect(tx.event.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { bibSeq: { increment: 1 } }, select: { bibSeq: true } });
    });

    it('assignBib resyncs to the max legacy bib on the first clash (legacy events)', async () => {
      const tx = txMock();
      tx.event.update
        .mockResolvedValueOnce({ bibSeq: 1 }) // 0001 já existe (legado)
        .mockResolvedValueOnce({}) // bibSeq = 300 (resync)
        .mockResolvedValueOnce({ bibSeq: 301 });
      tx.eventRegistration.findFirst.mockResolvedValueOnce({ id: 'legacy' }).mockResolvedValueOnce(null);
      tx.$queryRaw.mockResolvedValueOnce([{ max: 300 }]);
      expect(await svc.assignBib(tx, 'e1')).toBe('0301');
      expect(tx.event.update).toHaveBeenNthCalledWith(2, { where: { id: 'e1' }, data: { bibSeq: 300 } });
    });

    const regAt = new Date('2026-10-14T11:50:00Z');
    const pendingReg = { id: 'r1', eventId: 'e1', status: 'PENDING', paymentStatus: 'PENDING', bibNumber: null, finalPrice: 9000, registeredAt: regAt };
    const pay = { amount: 9000, createdAt: new Date('2026-10-14T11:51:00Z') };

    it('paid registration: locks event + registration, re-reads, PENDING → CONFIRMED with bib', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique.mockResolvedValueOnce({ eventId: 'e1' }).mockResolvedValueOnce(pendingReg);
      tx.event.update.mockResolvedValue({ bibSeq: 1 });
      tx.eventRegistration.findFirst.mockResolvedValue(null);
      const r = await svc.eventRegistrationPaid(tx, 'r1', now, 'ext_1', pay);
      expect(r).toEqual({ outcome: 'FULFILLED', registrationId: 'r1', bibNumber: '0001' });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // FOR UPDATE: evento e inscrição
      expect(tx.eventRegistration.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', bibNumber: '0001', confirmedAt: now, externalPaymentId: 'ext_1' }),
      });
    });

    it('H2: a second payment for an already-confirmed registration → ALREADY, no second bib', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique
        .mockResolvedValueOnce({ eventId: 'e1' })
        .mockResolvedValueOnce({ ...pendingReg, status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', bibNumber: '0001' });
      const r = await svc.eventRegistrationPaid(tx, 'r1', now, 'ext_2', pay);
      expect(r.outcome).toBe('ALREADY');
      expect(tx.event.update).not.toHaveBeenCalled(); // bibSeq intocado
      expect(tx.eventRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('H3: an old charge (created before the current attempt) cannot pay the new registration', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique.mockResolvedValueOnce({ eventId: 'e1' }).mockResolvedValueOnce(pendingReg);
      const old = { amount: 9000, createdAt: new Date('2026-10-14T10:00:00Z') };
      expect((await svc.eventRegistrationPaid(tx, 'r1', now, 'ext_old', old)).outcome).toBe('NEEDS_REFUND');
      expect(tx.eventRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('H3: a cheaper charge cannot pay a registration whose price changed', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique.mockResolvedValueOnce({ eventId: 'e1' }).mockResolvedValueOnce(pendingReg);
      const cheaper = { amount: 5000, createdAt: new Date('2026-10-14T11:55:00Z') };
      expect((await svc.eventRegistrationPaid(tx, 'r1', now, 'x', cheaper)).outcome).toBe('NEEDS_REFUND');
    });

    it.each(['CANCELED', 'WAITLIST'])('M2: payment for a %s registration → NEEDS_REFUND, never reactivated', async (status) => {
      const tx = txMock();
      tx.eventRegistration.findUnique
        .mockResolvedValueOnce({ eventId: 'e1' })
        .mockResolvedValueOnce({ ...pendingReg, status, paymentStatus: status === 'CANCELED' ? 'REFUNDED' : 'PENDING' });
      expect((await svc.eventRegistrationPaid(tx, 'r1', now, 'x', pay)).outcome).toBe('NEEDS_REFUND');
      expect(tx.eventRegistration.update).not.toHaveBeenCalled();
      expect(tx.eventRegistration.updateMany).not.toHaveBeenCalled();
    });

    it('legacy CONFIRMED with pending payment → payment status settled (no new bib)', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique
        .mockResolvedValueOnce({ eventId: 'e1' })
        .mockResolvedValueOnce({ ...pendingReg, status: 'CONFIRMED', paymentStatus: 'PENDING', bibNumber: '0007' });
      const r = await svc.eventRegistrationPaid(tx, 'r1', now, 'x', pay);
      expect(r).toEqual({ outcome: 'FULFILLED', registrationId: 'r1', bibNumber: '0007' });
      expect(tx.event.update).not.toHaveBeenCalled();
    });

    it('countOccupying counts confirmed + non-expired pending', async () => {
      const tx = txMock();
      tx.eventRegistration.count.mockResolvedValue(4);
      await svc.countOccupying(tx, 'e1', now);
      const where = tx.eventRegistration.count.mock.calls[0][0].where;
      expect(where.eventId).toBe('e1');
      expect(where.OR[1]).toEqual({ status: 'PENDING', OR: [{ paymentExpiresAt: null }, { paymentExpiresAt: { gt: now } }] });
    });

    it('releaseEventRegistration frees distance spot and coupon use', async () => {
      const tx = txMock();
      tx.eventRegistration.findUnique.mockResolvedValue({ id: 'r1', eventId: 'e1', status: 'PENDING', paymentStatus: 'PENDING', distanceId: 'd1', couponId: 'c1' });
      await svc.releaseEventRegistration(tx, 'r1', { paymentStatus: 'FAILED' as any, failureReason: 'EXPIRED' });
      expect(tx.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'CANCELED', paymentStatus: 'FAILED', paymentExpiresAt: null, couponId: null },
      });
      expect(tx.eventDistance.updateMany).toHaveBeenCalledWith({ where: { id: 'd1', registeredCount: { gt: 0 } }, data: { registeredCount: { decrement: 1 } } });
      expect(tx.eventCoupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      expect(tx.eventCouponUse.deleteMany).toHaveBeenCalledWith({ where: { registrationId: 'r1' } });
    });

    it('promoteWaitlist: paid event → PENDING with 24h to pay', async () => {
      const tx = txMock();
      tx.event.findUnique.mockResolvedValue({ id: 'e1', status: 'SOLD_OUT', maxParticipants: 2, price: 5000 });
      tx.eventRegistration.count.mockResolvedValue(1);
      tx.eventRegistration.findFirst.mockResolvedValue({ id: 'w1', finalPrice: 5000, distanceId: null });
      tx.eventRegistration.update.mockImplementation(({ data }: any) => ({ id: 'w1', ...data }));
      const r = await svc.promoteWaitlist(tx, 'e1', now);
      expect(r?.requiresPayment).toBe(true);
      expect(r?.registration.status).toBe('PENDING');
      expect(r?.registration.paymentExpiresAt!.getTime()).toBe(now.getTime() + 24 * 3600 * 1000);
    });
  });

  describe('platformPlanPaid', () => {
    it('activates the paid plan for one month', async () => {
      const tx = txMock();
      tx.platformPlan.findUnique.mockResolvedValue({ id: 'plan_pro', type: 'PRO' });
      tx.coachSubscription.findUnique.mockResolvedValue(null);
      const r = await svc.platformPlanPaid(tx, { userId: 'coach1', planId: 'PRO', externalPaymentId: 'ext' }, now);
      expect(r.outcome).toBe('FULFILLED');
      const arg = tx.coachSubscription.upsert.mock.calls[0][0];
      expect(arg.create).toMatchObject({ coachId: 'coach1', planId: 'plan_pro', status: 'ACTIVE', externalId: 'ext' });
      expect(arg.create.currentPeriodEnd.getUTCMonth()).toBe(10);
    });
    it('rejects unknown plan ids', async () => {
      const tx = txMock();
      expect((await svc.platformPlanPaid(tx, { userId: 'c', planId: 'MONTHLY', externalPaymentId: null }, now)).outcome).toBe('NEEDS_REFUND');
      expect(tx.coachSubscription.upsert).not.toHaveBeenCalled();
    });
  });
});
