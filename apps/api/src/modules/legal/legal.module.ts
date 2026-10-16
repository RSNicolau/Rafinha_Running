import { Global, Module } from '@nestjs/common';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';

@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
