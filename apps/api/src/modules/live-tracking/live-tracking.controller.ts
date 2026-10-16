import { Controller, ForbiddenException, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { LiveTrackingService } from './live-tracking.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCoachOwnsAthlete, isPlatformAdmin } from '../../common/utils/ownership';

@ApiTags('Live Tracking')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('live-tracking')
export class LiveTrackingController {
  constructor(
    private readonly liveTrackingService: LiveTrackingService,
    private readonly prisma: PrismaService,
  ) {}

  /** Coach: somente atletas dele ao vivo. ADMIN/SUPER_ADMIN: todos. Atleta: 403. */
  @Get('active')
  async getActiveAthletes(@CurrentUser() user: any) {
    if (isPlatformAdmin(user)) return this.liveTrackingService.getLiveAthletes();
    if (user?.role !== 'COACH') throw new ForbiddenException('Acesso negado');
    return this.liveTrackingService.getLiveAthletesForCoach(this.prisma, user.id);
  }

  @Get(':athleteId/position')
  async getAthletePosition(@Param('athleteId') athleteId: string, @CurrentUser() user: any) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId);
    const position = await this.liveTrackingService.getCurrentPosition(athleteId);
    return { athleteId, position, isLive: !!position };
  }

  @Get(':athleteId/route')
  async getAthleteRoute(@Param('athleteId') athleteId: string, @CurrentUser() user: any) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId);
    const route = await this.liveTrackingService.getSessionRoute(athleteId);
    return { athleteId, route, pointCount: route.length };
  }
}
