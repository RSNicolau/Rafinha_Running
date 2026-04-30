import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('WhatsApp')
@Controller('settings/whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obter configuração do WhatsApp do coach' })
  getConfig(@CurrentUser('id') coachId: string) {
    return this.whatsappService.getConfig(coachId);
  }

  @Put()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Salvar configuração do WhatsApp' })
  saveConfig(
    @CurrentUser('id') coachId: string,
    @Body() body: {
      provider?: string;
      phone?: string;
      apiToken?: string;
      instanceId?: string;
      welcomeMessage?: string;
    },
  ) {
    return this.whatsappService.saveConfig(coachId, body);
  }

  @Post('test')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Testar conexão do WhatsApp' })
  testConnection(@CurrentUser('id') coachId: string) {
    return this.whatsappService.testConnection(coachId);
  }

  @Post('send')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar mensagem WhatsApp manualmente' })
  sendMessage(
    @CurrentUser('id') coachId: string,
    @Body() body: { phone: string; message: string },
  ) {
    return this.whatsappService.sendMessage(coachId, body.phone, body.message);
  }
}

// ── PUBLIC WEBHOOK ──
@ApiTags('Webhooks')
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private whatsappService: WhatsappService) {}

  @Post(':coachId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de mensagens recebidas (Z-API / Twilio)' })
  @ApiParam({ name: 'coachId', description: 'ID do coach' })
  handleWebhook(
    @Param('coachId') coachId: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.whatsappService.handleIncomingMessage(coachId, payload);
  }
}
