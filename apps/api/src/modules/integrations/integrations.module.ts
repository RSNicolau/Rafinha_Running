import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { WebhooksController } from './webhooks.controller';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { PolarService } from './polar/polar.service';
import { GoogleFitService } from './google-fit/google-fit.service';

@Module({
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService, GarminService, StravaService, CorosService, PolarService, GoogleFitService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
