import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { WebhooksController } from './webhooks.controller';
import { GarminSyncModule } from './garmin/garmin-sync.module';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { GoogleFitService } from './google-fit/google-fit.service';

@Module({
  imports: [GarminSyncModule],
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService, StravaService, CorosService, GoogleFitService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
