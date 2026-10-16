import { SchedulerService } from './scheduler.service';

describe('SchedulerService — checkout expiration job', () => {
  it('delegates to CheckoutService.expireStale and never overlaps runs', async () => {
    let resolve!: () => void;
    const checkout: any = {
      expireStale: jest.fn().mockImplementationOnce(() => new Promise<void>((r) => (resolve = r))).mockResolvedValue(undefined),
    };
    const svc = new SchedulerService({} as any, {} as any, {} as any, {} as any, {} as any, checkout);
    const first = svc.handleCheckoutExpiration();
    await svc.handleCheckoutExpiration(); // ignorada enquanto a primeira roda
    expect(checkout.expireStale).toHaveBeenCalledTimes(1);
    resolve();
    await first;
    await svc.handleCheckoutExpiration();
    expect(checkout.expireStale).toHaveBeenCalledTimes(2);
  });

  it('swallows errors (cron must keep running)', async () => {
    const checkout: any = { expireStale: jest.fn().mockRejectedValue(new Error('db down')) };
    const svc = new SchedulerService({} as any, {} as any, {} as any, {} as any, {} as any, checkout);
    await expect(svc.handleCheckoutExpiration()).resolves.toBeUndefined();
  });
});
