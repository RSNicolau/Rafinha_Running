import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController, WhatsappWebhookController } from './whatsapp.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
