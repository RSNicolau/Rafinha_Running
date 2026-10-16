import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LegalService } from './legal.service';
import { AcceptLegalDto, DeletionRequestDto, HealthDataConsentDto, MarketingConsentDto } from './legal.dto';
import { clientIp } from '../../common/utils/client-ip';

function ctxOf(req: any) {
  return { ip: clientIp(req), userAgent: req.headers?.['user-agent'] };
}

@ApiTags('Legal / LGPD')
@Controller('legal')
export class LegalController {
  constructor(private legal: LegalService) {}

  @Get('versions')
  @ApiOperation({ summary: 'Versões vigentes dos Termos e da Política de Privacidade (público)' })
  versions() {
    return this.legal.getVersions();
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Status do aceite do usuário logado' })
  me(@CurrentUser('id') userId: string) {
    return this.legal.getStatus(userId);
  }

  @Get('me/history')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  history(@CurrentUser('id') userId: string) {
    return this.legal.getHistory(userId);
  }

  @Get('me/export')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ medium: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Exporta os dados pessoais do usuário em JSON (LGPD art. 18, II e V) — 3 por hora' })
  async export(@CurrentUser('id') userId: string, @Res({ passthrough: true }) res: any) {
    const data = await this.legal.exportMyData(userId);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meus-dados-rr-${date}.json"`);
    return data;
  }

  @Post('me/deletion-request')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ medium: { ttl: 60 * 60 * 1000, limit: 5 } })
  @ApiOperation({ summary: 'Solicita a exclusão da conta (atendimento manual em até 15 dias)' })
  deletionRequest(@CurrentUser('id') userId: string, @Body() dto: DeletionRequestDto, @Req() req: any) {
    return this.legal.requestDeletion(userId, dto.reason, ctxOf(req));
  }

  @Post('accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Registra aceite (usuários criados por convite, Google/Apple ou após atualização dos termos)' })
  async accept(@CurrentUser('id') userId: string, @Body() dto: AcceptLegalDto, @Req() req: any) {
    await this.legal.recordConsent(userId, dto, ctxOf(req));
    return this.legal.getStatus(userId);
  }

  @Post('marketing')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  marketing(@CurrentUser('id') userId: string, @Body() dto: MarketingConsentDto, @Req() req: any) {
    return this.legal.setMarketing(userId, dto.granted, ctxOf(req));
  }

  @Post('health-data')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Concede ou revoga o consentimento para tratamento de dados de saúde (art. 11, I)' })
  healthData(@CurrentUser('id') userId: string, @Body() dto: HealthDataConsentDto, @Req() req: any) {
    return this.legal.setHealthDataConsent(userId, dto.granted, ctxOf(req));
  }
}
