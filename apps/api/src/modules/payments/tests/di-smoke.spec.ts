import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailModule } from '../../email/email.module';
import { CacheModule } from '../../cache/cache.module';
import { PaymentsModule } from '../payments.module';
import { StoreModule } from '../../store/store.module';
import { EventsModule } from '../../events/events.module';
import { PlatformModule } from '../../platform/platform.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';
import { TeamsModule } from '../../teams/teams.module';
import { CheckoutService } from '../checkout/checkout.service';
import { SchedulerService } from '../../scheduler/scheduler.service';

describe('DI smoke', () => {
  it('resolves the payment/store/events/platform/scheduler graph', async () => {
    const mod = await Test.createTestingModule({
      imports: [PrismaModule, EmailModule, CacheModule, TeamsModule, PaymentsModule, StoreModule, EventsModule, PlatformModule, SchedulerModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(mod.get(CheckoutService)).toBeDefined();
    expect((mod.get(SchedulerService) as any).checkout).toBeDefined();
    expect((mod.get(SchedulerService) as any).memberships).toBeDefined();
    await mod.close();
  }, 30000);
});
