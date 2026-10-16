import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { TeamContextResolver } from './team-context.resolver';

@Module({
  imports: [PaymentsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, TeamContextResolver],
  exports: [MembershipsService],
})
export class MembershipsModule {}
