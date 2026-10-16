import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WhatsappService } from './whatsapp.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

export class SaveWhatsappConfigDto {
  @IsOptional() @IsIn(['zapi', 'twilio', 'evolution'])
  provider?: string;

  @IsOptional() @IsString() @MaxLength(32)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(512)
  apiToken?: string;

  @IsOptional() @IsString() @MaxLength(128)
  instanceId?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  welcomeMessage?: string;
}

export class SendWhatsappMessageDto {
  @IsString() @MinLength(8) @MaxLength(32)
  phone!: string;

  @IsString() @MinLength(1) @MaxLength(4096)
  message!: string;
}

@ApiTags('WhatsApp')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('settings/whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get()
  @ApiOperation({ summary: 'Obter configuração do WhatsApp do coach (token mascarado)' })
  getConfig(@CurrentUser('id') coachId: string) {
    return this.whatsappService.getConfig(coachId);
  }

  @Put()
  @ApiOperation({ summary: 'Salvar configuração do WhatsApp (gera o segredo do webhook se ausente)' })
  saveConfig(@CurrentUser('id') coachId: string, @Body() body: SaveWhatsappConfigDto) {
    return this.whatsappService.saveConfig(coachId, body);
  }

  @Post('rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gerar novo segredo do webhook (invalida a URL anterior)' })
  rotateSecret(@CurrentUser('id') coachId: string) {
    return this.whatsappService.rotateWebhookSecret(coachId);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Testar conexão do WhatsApp' })
  testConnection(@CurrentUser('id') coachId: string) {
    return this.whatsappService.testConnection(coachId);
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar mensagem WhatsApp manualmente' })
  sendMessage(@CurrentUser('id') coachId: string, @Body() body: SendWhatsappMessageDto) {
    return this.whatsappService.sendMessage(coachId, body.phone, body.message);
  }
}

// ── PUBLIC WEBHOOK (autenticado por segredo por coach) ──
@ApiTags('Webhooks')
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private whatsappService: WhatsappService) {}

  @Post(':coachId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook de mensagens recebidas (Z-API)',
    description: 'Exige o segredo do coach em `x-rr-webhook-secret`, `?secret=` ou `Client-Token`. Limite: 30 msg/min por coach.',
  })
  @ApiParam({ name: 'coachId', description: 'ID do coach' })
  handleWebhook(
    @Param('coachId') coachId: string,
    @Headers('x-rr-webhook-secret') headerSecret: string | undefined,
    @Headers('client-token') clientToken: string | undefined,
    @Query('secret') querySecret: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.whatsappService.handleIncomingMessage(coachId, payload, [headerSecret, querySecret, clientToken]);
  }
}
