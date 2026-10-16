import {
  Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OptionalJwtGuard } from '../guards/optional-jwt.guard';
import { CheckoutService, fakeProviderAllowed } from './checkout.service';
import { NotFoundException } from '@nestjs/common';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@ApiTags('Checkout')
@Controller()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('checkout/methods')
  @ApiOperation({ summary: 'Métodos de pagamento disponíveis (público)' })
  methods() {
    return this.checkout.availableMethods();
  }

  @Post('checkout')
  @UseGuards(OptionalJwtGuard)
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Cria a cobrança de um pedido da loja, inscrição em evento ou plano da plataforma',
    description:
      'O valor é SEMPRE calculado no servidor. Loja: visitante informa refToken (retornado na criação do pedido). ' +
      'Eventos e planos exigem login. Retorna accessToken para consultar o status sem login.',
  })
  create(@Body() dto: CreateCheckoutDto, @CurrentUser('id') userId?: string) {
    return this.checkout.createCheckout({ ...dto, userId: userId ?? null });
  }

  @Get('checkout/:paymentId/status')
  @UseGuards(OptionalJwtGuard)
  @ApiQuery({ name: 'token', required: false, description: 'accessToken retornado na criação (se não estiver logado como dono)' })
  @ApiOperation({ summary: 'Status do pagamento (dono via JWT ou token público)' })
  status(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query('token') token?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.checkout.getStatus(paymentId, { userId, token });
  }

  @Post('checkout/:paymentId/fake-pay')
  @UseGuards(OptionalJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[DEV] Simula pagamento (somente PAYMENTS_FAKE_PROVIDER=true e NODE_ENV≠production)' })
  fakePay(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query('token') token?: string,
    @CurrentUser('id') userId?: string,
  ) {
    // rota inexistente fora de development/test (mesmo gate do serviço)
    if (!fakeProviderAllowed()) throw new NotFoundException();
    return this.checkout.fakePay(paymentId, { userId, token });
  }

  @Post('webhooks/asaas')
  @SkipThrottle({ short: true, medium: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Asaas (header asaas-access-token = ASAAS_WEBHOOK_TOKEN)' })
  asaasWebhook(@Headers('asaas-access-token') token: string, @Body() body: any) {
    return this.checkout.handleAsaasWebhook(token, body);
  }
}
