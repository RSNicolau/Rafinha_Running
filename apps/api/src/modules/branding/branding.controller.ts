import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/branding.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('config/branding')
export class BrandingController {
  constructor(private brandingService: BrandingService) {}

  // Public — used by app on startup (no auth required)
  @Get('public')
  getPublic(@Query('domain') domain?: string) {
    return this.brandingService.getPublicBranding(domain);
  }

  // Coach — get own branding
  @Get()
  @UseGuards(AuthGuard('jwt'))
  getBranding(@CurrentUser('id') coachId: string) {
    return this.brandingService.getBranding(coachId);
  }

  // Coach — update own branding
  @Put()
  @UseGuards(AuthGuard('jwt'))
  updateBranding(@CurrentUser('id') coachId: string, @Body() dto: UpdateBrandingDto) {
    return this.brandingService.updateBranding(coachId, dto);
  }
}
