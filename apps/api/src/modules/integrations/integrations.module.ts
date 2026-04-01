import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { WebhooksController } from './webhooks.controller';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';

@Module({
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService, GarminService, StravaService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
