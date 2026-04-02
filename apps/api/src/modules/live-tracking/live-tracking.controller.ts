import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { LiveTrackingService } from './live-tracking.service';

@ApiTags('Live Tracking')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('live-tracking')
export class LiveTrackingController {
  constructor(private readonly liveTrackingService: LiveTrackingService) {}

  @Get('active')
  getActiveAthletes() {
    return this.liveTrackingService.getLiveAthletes();
  }

  @Get(':athleteId/position')
  getAthletePosition(@Param('athleteId') athleteId: string) {
    const position = this.liveTrackingService.getCurrentPosition(athleteId);
    return { athleteId, position, isLive: !!position };
  }

  @Get(':athleteId/route')
  getAthleteRoute(@Param('athleteId') athleteId: string) {
    const route = this.liveTrackingService.getSessionRoute(athleteId);
    return { athleteId, route, pointCount: route.length };
  }
}
