import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  // Authenticated — athlete sees own dashboard
  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Dashboard de indicações do atleta autenticado' })
  getMyStats(@CurrentUser('id') userId: string) {
    return this.referralsService.getMyStats(userId);
  }

  // Public — validate code during onboarding
  @Get('public/validate/:code')
  @ApiOperation({ summary: 'Validar código de indicação (público)' })
  validateCode(@Param('code') code: string) {
    return this.referralsService.validateCode(code);
  }
}
