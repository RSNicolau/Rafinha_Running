import { Controller, Get, Put, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NicheService } from './niche.service';
import { SportNiche } from '@prisma/client';
import { PowerZonesDto, SwimZonesDto, UpdateNicheDto } from './dto/niche.dto';

@Controller('niche')
export class NicheController {
  constructor(private nicheService: NicheService) {}

  /** Public: list all niches */
  @Get()
  listNiches() {
    return this.nicheService.listNiches();
  }

  /** Public: get niche details */
  @Get(':niche')
  getNicheDetails(@Param('niche') niche: string) {
    return this.nicheService.getNicheDetails(niche.toUpperCase() as SportNiche);
  }

  /** Public: get question templates for a niche */
  @Get(':niche/questions')
  getQuestionTemplates(@Param('niche') niche: string) {
    return this.nicheService.getQuestionTemplates(niche.toUpperCase() as SportNiche);
  }

  /** Public: get pricing for a niche */
  @Get(':niche/pricing')
  getNichePricing(@Param('niche') niche: string) {
    return this.nicheService.getNichePricing(niche.toUpperCase() as SportNiche);
  }

  /** Coach: get current niche */
  @Get('coach/me')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COACH')
  async getMyNiche(@CurrentUser() user: any) {
    const niche = await this.nicheService.getCoachNiche(user.id);
    return { niche, config: this.nicheService.getNicheDetails(niche) };
  }

  /** Coach: update niche */
  @Put('coach/me')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COACH')
  async updateMyNiche(
    @CurrentUser() user: any,
    @Body() body: UpdateNicheDto,
  ) {
    return this.nicheService.updateCoachNiche(user.id, body.niche, body.seedQuestions ?? true);
  }

  /** Coach: calculate power zones from FTP */
  @Post('calculate/power-zones')
  @UseGuards(AuthGuard('jwt'))
  calculatePowerZones(@Body() body: PowerZonesDto) {
    const zones = this.nicheService.calculatePowerZones(body.ftp);
    if (body.weightKg) {
      return { ...zones, wPerKg: Math.round((body.ftp / body.weightKg) * 100) / 100 };
    }
    return zones;
  }

  /** Coach: calculate swimming CSS zones */
  @Post('calculate/swim-zones')
  @UseGuards(AuthGuard('jwt'))
  calculateSwimZones(@Body() body: SwimZonesDto) {
    return this.nicheService.calculateSwimmingZones(body.best100mSeconds, body.best400mSeconds);
  }
}
