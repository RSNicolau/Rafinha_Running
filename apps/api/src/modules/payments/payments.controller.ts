import {
  Controller, Get, Post, Body, Query, Param, Req, UseGuards,
  RawBodyRequest, UnauthorizedException, Headers, HttpCode, HttpStatus,
  Logger, NotFoundException,
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
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
    return this.mercadoPagoService.createPixPayment(userId, email, dto.amount, dto.description);
  }

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Webhook Stripe' })
  async stripeWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'] as string;
    return this.stripeService.handleWebhook(req.rawBody!, signature);
  }

  @Post('webhooks/mercadopago')
  @ApiOperation({ summary: 'Webhook Mercado Pago' })
  async mercadoPagoWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody;
    if (rawBody && xSignature) {
      const valid = this.mercadoPagoService.validateWebhookSignature(xSignature, xRequestId, rawBody);
      if (!valid) throw new UnauthorizedException('Assinatura do webhook inválida');
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
    // Idempotency: return existing PENDING PIX if one was created in the last 30 minutes
    const existingPending = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        planId: dto.planId ?? null,
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
    const order = await this.pagarmeService.createPixOrder(
      customerId,
      dto.amount,
      dto.description,
    );

    // Persist payment record in DB (subscriptionId is optional for Pagar.me one-off payments)
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        subscriptionId: null,
        amount: dto.amount,
        currency: 'BRL',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        externalPaymentId: order.orderId,
        pixQrCode: order.pixQrCode,
        pixQrCodeUrl: order.pixQrCodeUrl,
        pixExpiresAt: new Date(order.pixExpiresAt),
        planId: dto.planId ?? null,
      } as any,
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
    // Create customer on Pagar.me
    const customerId = await this.pagarmeService.createCustomer({
      name: user.name,
      email: user.email,
    });

    // Create the card order
    const order = await this.pagarmeService.createCardOrder(
      customerId,
      dto.amount,
      dto.cardToken,
      dto.description,
    );

    // Persist payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        subscriptionId: null,
        amount: dto.amount,
        currency: 'BRL',
        status: order.status === 'paid' ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
        provider: PaymentProvider.PAGARME,
        externalPaymentId: order.orderId,
        planId: dto.planId ?? null,
        paidAt: order.status === 'paid' ? new Date() : null,
      } as any,
    });

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

    // If it's a Pagar.me payment, fetch live status
    if (payment.provider === PaymentProvider.PAGARME && payment.externalPaymentId) {
      try {
        const order = await this.pagarmeService.getOrder(payment.externalPaymentId);
        const newStatus = order.status === 'paid' ? PaymentStatus.SUCCEEDED
          : order.status === 'failed' || order.status === 'canceled' ? PaymentStatus.FAILED
          : PaymentStatus.PENDING;

        // Update DB if status changed
        if (newStatus !== payment.status) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: newStatus,
              paidAt: newStatus === PaymentStatus.SUCCEEDED ? new Date() : payment.paidAt,
            },
          });
        }

        return {
          paymentId: payment.id,
          orderId: payment.externalPaymentId,
          status: order.status,
          dbStatus: newStatus,
          amount: payment.amount,
          pixQrCode: (payment as any).pixQrCode ?? null,
          pixQrCodeUrl: (payment as any).pixQrCodeUrl ?? null,
          pixExpiresAt: (payment as any).pixExpiresAt ?? null,
          createdAt: payment.createdAt,
          paidAt: newStatus === PaymentStatus.SUCCEEDED ? new Date() : payment.paidAt,
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
  @SkipThrottle()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Webhook Pagar.me v5 (sem autenticação JWT, verificação HMAC-SHA256)' })
  async pagarmeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature') xHubSignature: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody;

    // Verify HMAC-SHA256 signature if header present
    if (xHubSignature && rawBody) {
      const valid = this.pagarmeService.handleWebhook(rawBody, xHubSignature);
      if (!valid) {
        this.logger.warn('Pagar.me webhook: assinatura inválida');
        throw new UnauthorizedException('Assinatura do webhook Pagar.me inválida');
      }
    } else if (process.env.PAGARME_WEBHOOK_SECRET) {
      // If secret is configured but no signature header, reject
      throw new UnauthorizedException('Assinatura do webhook Pagar.me ausente');
    }

    return this.pagarmeService.processWebhookEvent(body);
  }
}
