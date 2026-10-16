import { SchedulerService } from './scheduler.service';

describe('SchedulerService — membership jobs', () => {
  function make(memberships: any) {
    return new SchedulerService({} as any, {} as any, {} as any, {} as any, {} as any, undefined, memberships);
  }

  it('daily job: generates FAKE renewals then marks PAST_DUE (same "now")', async () => {
    const order: string[] = [];
    const memberships: any = {
      generateFakeRenewals: jest.fn(async () => order.push('renew')),
      markPastDue: jest.fn(async () => order.push('pastDue')),
    };
    await make(memberships).handleMembershipsDaily();
    expect(order).toEqual(['renew', 'pastDue']);
    expect(memberships.markPastDue.mock.calls[0][0]).toBe(memberships.generateFakeRenewals.mock.calls[0][0]);
  });

  it('daily job never overlaps and swallows errors', async () => {
    let resolve!: () => void;
    const memberships: any = {
      generateFakeRenewals: jest.fn().mockImplementationOnce(() => new Promise<void>((r) => (resolve = r))).mockRejectedValue(new Error('db down')),
      markPastDue: jest.fn().mockResolvedValue({ marked: 0 }),
    };
    const svc = make(memberships);
    const first = svc.handleMembershipsDaily();
    await svc.handleMembershipsDaily();
    expect(memberships.generateFakeRenewals).toHaveBeenCalledTimes(1);
    resolve();
    await first;
    await expect(svc.handleMembershipsDaily()).resolves.toBeUndefined();
  });

  it('reconcile job delegates to reconcileOpen; no-op without the module', async () => {
    const memberships: any = { reconcileOpen: jest.fn().mockResolvedValue({ checked: 0 }) };
    await make(memberships).handleMembershipsReconcile();
    expect(memberships.reconcileOpen).toHaveBeenCalledTimes(1);
    await expect(make(undefined).handleMembershipsReconcile()).resolves.toBeUndefined();
  });
});
