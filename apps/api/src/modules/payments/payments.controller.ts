import {
  Controller, Get, Post, Put, Body, Query, Param, Req, UseGuards,
  RawBodyRequest, UnauthorizedException, Headers, HttpCode, HttpStatus,
  Logger, NotFoundException, ServiceUnavailableException, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { PagarmeService } from './pagarme/pagarme.service';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { CreatePixDto } from './dto/pix.dto';
import { CreatePixPaymentDto, CreateCardPaymentDto } from './dto/create-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentProvider, PaymentStatus, PaymentPurpose, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutService } from './checkout/checkout.service';
import { PlanPricingService } from './plan-pricing.service';

/** Express pode ter consumido o corpo com express.raw (main.ts) — recupera Buffer e JSON. */
function rawAndJson(req: RawBodyRequest<Request>): { raw?: Buffer; json: any } {
  const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined);
  let json: any = req.body;
  if (Buffer.isBuffer(json)) {
    try {
      json = JSON.parse(json.toString('utf8'));
    } catch {
      throw new BadRequestException('Corpo do webhook inválido');
    }
  }
  return { raw, json };
}

@ApiTags('Pagamentos')
@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    private stripeService: StripeService,
    private mercadoPagoService: MercadoPagoService,
    private pagarmeService: PagarmeService,
    private prisma: PrismaService,
    private checkoutService: CheckoutService,
    private planPricing: PlanPricingService,
  ) {}

  @Post('subscriptions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar assinatura' })
  async createSubscription(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.paymentsService.createSubscription(userId, dto);
  }

  @Get('subscriptions/current')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Assinatura atual' })
  async getCurrentSubscription(@CurrentUser('id') userId: string) {
    return this.paymentsService.getCurrentSubscription(userId);
  }

  @Post('subscriptions/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Cancelar assinatura' })
  async cancelSubscription(@CurrentUser('id') userId: string) {
    return this.paymentsService.cancelSubscription(userId);
  }

  // ─── Per-coach payment gateway settings ────────────────────────────────────

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Configurações do gateway de pagamento do coach (OWNER/ADMIN da equipe)' })
  async getPaymentSettings(@CurrentUser() user: { id: string; role: string }) {
    await this.paymentsService.assertCanManagePaymentSettings(user);
    return this.paymentsService.getPaymentSettings(user.id);
  }

  @Put('settings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Atualizar configurações do gateway de pagamento (OWNER/ADMIN da equipe)' })
  async updatePaymentSettings(@CurrentUser() user: { id: string; role: string }, @Body() body: UpdatePaymentSettingsDto) {
    await this.paymentsService.assertCanManagePaymentSettings(user);
    return this.paymentsService.updatePaymentSettings(user.id, body);
  }

  @Post('settings/test')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Testar conexão com o gateway configurado' })
  async testPaymentConnection(@CurrentUser() user: { id: string; role: string }) {
    await this.paymentsService.assertCanManagePaymentSettings(user);
    return this.paymentsService.testPaymentConnection(user.id);
  }

  @Get('payments/history')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Histórico de pagamentos' })
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.getPaymentHistory(userId, page, limit);
  }

  @Post('pix')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Gerar cobrança PIX (QR Code)' })
  async createPix(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') userEmail: string,
    @Body() dto: CreatePixDto,
  ) {
    const email = dto.payerEmail || userEmail;
    // valor SEMPRE derivado do plano no servidor (dto.amount em reais é só conferência)
    const plan = await this.planPricing.resolveAndCheck(
      dto.planId,
      dto.amount !== undefined && dto.amount !== null ? Math.round(dto.amount * 100) : undefined,
    );
    return this.mercadoPagoService.createPixPayment(
      userId,
      email,
      plan.amountInCents / 100,
      dto.description || `Plano ${plan.name} - RR Rafinha Running`,
    );
  }

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Webhook Stripe' })
  async stripeWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) throw new UnauthorizedException('Assinatura do webhook Stripe ausente');
    if (!req.rawBody) throw new UnauthorizedException('Raw body ausente');
    const event = this.stripeService.verifyWebhook(req.rawBody, signature); // 503 se secret ausente
    if (event.type.startsWith('checkout.session.')) {
      return this.checkoutService.handleStripeCheckoutEvent(event);
    }
    if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.')) {
      return this.checkoutService.handleStripeChargeEvent(event);
    }
    await this.stripeService.handleSubscriptionEvent(event);
    return { received: true };
  }

  @Post('webhooks/mercadopago')
  @ApiOperation({ summary: 'Webhook Mercado Pago' })
  async mercadoPagoWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Query('data.id') queryDataId: string,
    @Body() body: any,
  ) {
    if (this.mercadoPagoService.hasWebhookSecret) {
      // Fail-closed: com secret configurado, assinatura é obrigatória
      if (!xSignature) throw new UnauthorizedException('Assinatura do webhook Mercado Pago ausente');
      const dataId = String(queryDataId ?? body?.data?.id ?? '');
      const valid = this.mercadoPagoService.validateWebhookSignature(xSignature, xRequestId, dataId);
      if (!valid) throw new UnauthorizedException('Assinatura do webhook inválida');
    } else {
      // Sem secret: o handler NUNCA usa o corpo — só o id, re-consultando a API do MP com nosso token.
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET ausente — webhook MP processado apenas via re-consulta à API');
    }
    return this.mercadoPagoService.handleWebhook(body);
  }

  // ============================================================
  // Pagar.me v5 routes
  // ============================================================

  @Post('payments/pix')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar cobrança PIX via Pagar.me v5' })
  async createPixPayment(
    @CurrentUser() user: { id: string; name: string; email: string },
    @Body() dto: CreatePixPaymentDto,
  ) {
    // Valor derivado do plano no servidor; valor divergente enviado pelo cliente → 400
    const plan = await this.planPricing.resolveAndCheck(dto.planId, dto.amount);
    const amount = plan.amountInCents;
    const description = dto.description || `Plano ${plan.name} - RR Rafinha Running`;
    const purpose = plan.kind === 'COACH' ? PaymentPurpose.PLATFORM_PLAN : PaymentPurpose.SUBSCRIPTION;

    // Idempotency: return existing PENDING PIX if one was created in the last 30 minutes
    const existingPending = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        planId: plan.planId,
        amount,
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      this.logger.log(`Returning existing PENDING PIX ${existingPending.id} for user ${user.id}`);
      return {
        paymentId: existingPending.id,
        orderId: existingPending.externalPaymentId,
        status: 'pending',
        pixQrCode: (existingPending as any).pixQrCode ?? null,
        pixQrCodeUrl: (existingPending as any).pixQrCodeUrl ?? null,
        pixExpiresAt: (existingPending as any).pixExpiresAt ?? null,
        amount: existingPending.amount,
      };
    }

    // Create customer on Pagar.me
    const customerId = await this.pagarmeService.createCustomer({
      name: user.name,
      email: user.email,
    });

    // Create the PIX order
    const order = await this.pagarmeService.createPixOrder(customerId, amount, description);

    // Persist payment record in DB (subscriptionId is optional for Pagar.me one-off payments)
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        subscriptionId: null,
        amount,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        purpose,
        method: 'PIX',
        externalPaymentId: order.orderId,
        pixQrCode: order.pixQrCode,
        pixQrCodeUrl: order.pixQrCodeUrl,
        pixExpiresAt: new Date(order.pixExpiresAt),
        planId: plan.planId,
      },
    });

    return {
      paymentId: payment.id,
      orderId: order.orderId,
      status: order.status,
      pixQrCode: order.pixQrCode,
      pixQrCodeUrl: order.pixQrCodeUrl,
      pixExpiresAt: order.pixExpiresAt,
      amount: order.amount,
    };
  }

  @Post('payments/card')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar cobrança com cartão de crédito via Pagar.me v5' })
  async createCardPayment(
    @CurrentUser() user: { id: string; name: string; email: string },
    @Body() dto: CreateCardPaymentDto,
  ) {
    const plan = await this.planPricing.resolveAndCheck(dto.planId, dto.amount);
    const amount = plan.amountInCents;
    const description = dto.description || `Plano ${plan.name} - RR Rafinha Running`;

    // Create customer on Pagar.me
    const customerId = await this.pagarmeService.createCustomer({
      name: user.name,
      email: user.email,
    });

    // Create the card order
    const order = await this.pagarmeService.createCardOrder(customerId, amount, dto.cardToken, description);

    // Persist payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        subscriptionId: null,
        amount,
        currency: 'BRL',
        // nasce PENDING; a ativação acontece pelo webhook assinado (order.paid) — idempotente
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        purpose: plan.kind === 'COACH' ? PaymentPurpose.PLATFORM_PLAN : PaymentPurpose.SUBSCRIPTION,
        method: 'CREDIT_CARD',
        externalPaymentId: order.orderId,
        planId: plan.planId,
      },
    });
    if (order.status === 'paid') {
      await this.pagarmeService.confirmOrderPaid(order.orderId, { status: 'paid', amount: order.amount }).catch((e) =>
        this.logger.warn(`Confirmação imediata Pagar.me ${order.orderId}: ${e?.message}`),
      );
    }

    return {
      paymentId: payment.id,
      orderId: order.orderId,
      status: order.status,
      amount: order.amount,
    };
  }

  @Get('payments/order/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Consultar status de um pedido Pagar.me' })
  @ApiParam({ name: 'id', description: 'ID do pedido no Pagar.me (order_xxxx) ou ID local do pagamento' })
  async getOrderStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    // Try to find the payment record first (by local DB id or by externalPaymentId)
    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        OR: [
          { id },
          { externalPaymentId: id },
        ],
      },
    });

    if (!payment) throw new NotFoundException('Pagamento não encontrado');

    // Pagar.me: consulta a API e aplica pelo MESMO caminho do webhook (ativa plano/assinatura).
    // O polling nunca grava status diretamente nem rebaixa um pagamento já confirmado.
    if (payment.provider === PaymentProvider.PAGARME && payment.externalPaymentId && payment.status === PaymentStatus.PENDING) {
      try {
        const order = await this.pagarmeService.syncOrderStatus(payment);
        const fresh = await this.prisma.payment.findUnique({ where: { id: payment.id } });
        return {
          paymentId: payment.id,
          orderId: payment.externalPaymentId,
          status: order?.status ?? null,
          dbStatus: fresh?.status ?? payment.status,
          amount: payment.amount,
          pixQrCode: payment.pixQrCode ?? null,
          pixQrCodeUrl: payment.pixQrCodeUrl ?? null,
          pixExpiresAt: payment.pixExpiresAt ?? null,
          createdAt: payment.createdAt,
          paidAt: fresh?.paidAt ?? null,
        };
      } catch (err: any) {
        this.logger.warn(`Erro ao consultar Pagar.me para payment ${payment.id}: ${err.message}`);
      }
    }

    return {
      paymentId: payment.id,
      orderId: payment.externalPaymentId,
      status: payment.status,
      amount: payment.amount,
      pixQrCode: (payment as any).pixQrCode ?? null,
      pixQrCodeUrl: (payment as any).pixQrCodeUrl ?? null,
      pixExpiresAt: (payment as any).pixExpiresAt ?? null,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    };
  }

  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ short: true, medium: true })
  @ApiOperation({ summary: 'Webhook Pagar.me v5 (sem autenticação JWT, verificação HMAC-SHA256)' })
  async pagarmeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature') xHubSignature: string,
  ) {
    // Fail-closed: sem secret configurado, nenhum webhook é aceito
    if (!process.env.PAGARME_WEBHOOK_SECRET) {
      this.logger.error('PAGARME_WEBHOOK_SECRET não configurado — webhook Pagar.me rejeitado');
      throw new ServiceUnavailableException('Webhook Pagar.me não configurado');
    }
    // main.ts aplica express.raw nesta rota: o corpo bruto chega em req.body (Buffer)
    const { raw, json } = rawAndJson(req);
    if (!xHubSignature) throw new UnauthorizedException('Assinatura do webhook Pagar.me ausente');
    if (!raw || !this.pagarmeService.handleWebhook(raw, xHubSignature)) {
      this.logger.warn('Pagar.me webhook: assinatura inválida');
      throw new UnauthorizedException('Assinatura do webhook Pagar.me inválida');
    }
    return this.pagarmeService.processWebhookEvent(json);
  }
}
