import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentStatus, SubscriptionStatus, PaymentPurpose } from '@prisma/client';
import { FulfillmentService } from '../checkout/fulfillment.service';

export interface PagarmePixOrderResult {
  orderId: string;
  paymentId: string;
  status: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  amount: number;
}

export interface PagarmeCardOrderResult {
  orderId: string;
  paymentId: string;
  status: string;
  amount: number;
}

@Injectable()
export class PagarmeService {
  private readonly logger = new Logger(PagarmeService.name);
  private readonly baseUrl = 'https://api.pagar.me/core/v5';

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly fulfillment?: FulfillmentService,
  ) {}

  /**
   * Confirmação a partir de dados obtidos DIRETO da API do Pagar.me (resposta da criação do
   * pedido com cartão, ou GET /orders/:id no polling). Mesmo caminho do webhook: transição
   * condicional + ativação, idempotente.
   */
  async confirmOrderPaid(orderId: string, verifiedOrder?: { status?: string; amount?: number } | null) {
    const order = verifiedOrder ?? (await this.getOrder(orderId));
    if (order?.status !== 'paid') return { processed: false };
    return this.applyPaid({ ...order, id: orderId }, true);
  }

  /** Polling do cliente: nunca escreve status diretamente; só transições condicionais. */
  async syncOrderStatus(payment: { id: string; externalPaymentId: string | null; status: PaymentStatus }) {
    if (!payment.externalPaymentId) return null;
    const order = await this.getOrder(payment.externalPaymentId);
    if (order?.status === 'paid') {
      await this.applyPaid({ ...order, id: payment.externalPaymentId }, true);
    } else if (order?.status === 'failed' || order?.status === 'canceled') {
      // só PENDING → FAILED (nunca rebaixa SUCCEEDED/REFUNDED)
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
    }
    return order;
  }

  private get apiKey(): string {
    return process.env.PAGARME_API_KEY || '';
  }

  private get webhookSecret(): string {
    return process.env.PAGARME_WEBHOOK_SECRET || '';
  }

  private getAuthHeader(): string {
    if (!this.apiKey) {
      this.logger.warn('PAGARME_API_KEY não configurado');
      throw new BadRequestException('Gateway de pagamento Pagar.me não configurado');
    }
    // Pagar.me v5: Basic auth with "api_key:" (colon at end, no password)
    const encoded = Buffer.from(`${this.apiKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown error');
      this.logger.error(`Pagar.me API error ${res.status} ${method} ${path}: ${errorText}`);
      throw new BadRequestException(`Pagar.me: ${res.status} - ${errorText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Create a customer on Pagar.me v5.
   * Pagar.me doesn't do strict upsert by email, so we create on each transaction.
   */
  async createCustomer(user: { name: string; email: string }): Promise<string> {
    const data = await this.request<{ id: string }>('POST', '/customers', {
      name: user.name,
      email: user.email,
      type: 'individual',
      country: 'BR',
      code: user.email, // external reference — deduplicated by Pagar.me
    });
    return data.id;
  }

  /**
   * Create a PIX order on Pagar.me v5.
   * Amount must be in centavos (e.g. 4900 = R$49).
   */
  async createPixOrder(
    customerId: string,
    amount: number,
    description: string,
  ): Promise<PagarmePixOrderResult> {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const data = await this.request<any>('POST', '/orders', {
      customer_id: customerId,
      items: [
        {
          amount,
          description,
          quantity: 1,
          code: `item_${Date.now()}`,
        },
      ],
      payments: [
        {
          payment_method: 'pix',
          pix: {
            expires_at: expiresAt.toISOString(),
            additional_information: [
              { name: 'Descrição', value: description },
            ],
          },
          amount,
        },
      ],
    });

    const charge = data.charges?.[0];
    const lastTransaction = charge?.last_transaction;

    return {
      orderId: data.id,
      paymentId: charge?.id ?? data.id,
      status: data.status,
      pixQrCode: lastTransaction?.qr_code ?? '',
      pixQrCodeUrl: lastTransaction?.qr_code_url ?? '',
      pixExpiresAt: expiresAt.toISOString(),
      amount,
    };
  }

  /**
   * Create a credit card order on Pagar.me v5.
   * cardToken must be generated by Pagar.me.js on the frontend.
   */
  async createCardOrder(
    customerId: string,
    amount: number,
    cardToken: string,
    description: string,
  ): Promise<PagarmeCardOrderResult> {
    const data = await this.request<any>('POST', '/orders', {
      customer_id: customerId,
      items: [
        {
          amount,
          description,
          quantity: 1,
          code: `item_${Date.now()}`,
        },
      ],
      payments: [
        {
          payment_method: 'credit_card',
          credit_card: {
            recurrence: false,
            installments: 1,
            statement_descriptor: 'RR RAFINHA',
            card_token: cardToken,
          },
          amount,
        },
      ],
    });

    const charge = data.charges?.[0];

    return {
      orderId: data.id,
      paymentId: charge?.id ?? data.id,
      status: data.status,
      amount,
    };
  }

  /**
   * Retrieve a Pagar.me order by ID.
   */
  async getOrder(orderId: string): Promise<any> {
    return this.request<any>('GET', `/orders/${orderId}`);
  }

  /**
   * Verify Pagar.me webhook HMAC-SHA256 signature.
   * Pagar.me sends: X-Hub-Signature header = "sha256=<hex>"
   */
  handleWebhook(payload: Buffer | string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.error('PAGARME_WEBHOOK_SECRET não configurado — REJEITANDO webhook por segurança');
      return false; // Reject all webhooks when secret is not configured
    }

    try {
      const rawBody = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      // Header format: "sha256=<hex>"
      const received = signature.startsWith('sha256=')
        ? signature.slice(7)
        : signature;

      if (received.length !== expected.length) return false;

      return crypto.timingSafeEqual(
        Buffer.from(received, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Process a Pagar.me webhook event and update the DB.
   * Supported events: order.paid, order.payment_failed, charge.paid
   */
  async processWebhookEvent(body: any): Promise<{ received: boolean }> {
    this.logger.log(`Pagar.me webhook event: ${body.type} id=${body.data?.id}`);

    switch (body.type) {
      case 'order.paid':
        await this.handleOrderPaid(body.data);
        break;
      case 'order.payment_failed':
        await this.handleOrderFailed(body.data);
        break;
      case 'charge.paid':
        await this.handleChargePaid(body.data);
        break;
      default:
        this.logger.log(`Evento Pagar.me ignorado: ${body.type}`);
    }

    return { received: true };
  }

  // ── Private webhook handlers ──────────────────────────────────

  /** order.paid do webhook (assinado). */
  private async handleOrderPaid(order: any) {
    if (!order?.id) return;
    await this.applyPaid(order, false);
  }

  /**
   * Efetiva um pedido pago. Regras:
   *  - PENDING → SUCCEEDED pela transição condicional (só a primeira entrega tem efeito);
   *  - FAILED só vira SUCCEEDED com confirmação da API do Pagar.me (replay de webhook não basta);
   *  - REFUNDED nunca volta a SUCCEEDED;
   *  - valor diferente do cobrado → sinaliza AMOUNT_MISMATCH e não ativa nada;
   *  - erro na ativação → exceção (rollback) → o webhook responde 5xx e o Pagar.me reenvia.
   */
  private async applyPaid(order: any, verifiedWithApi: boolean): Promise<{ processed: boolean }> {
    const payment = await this.prisma.payment.findFirst({ where: { externalPaymentId: order.id } });
    if (!payment) {
      this.logger.warn(`Pagamento Pagar.me não encontrado para order: ${order.id}`);
      return { processed: false };
    }
    if (payment.status === PaymentStatus.SUCCEEDED) return { processed: false };
    if (payment.status === PaymentStatus.REFUNDED) {
      this.logger.warn(`Pagar.me order.paid para pagamento estornado ${payment.id} — ignorado`);
      return { processed: false };
    }

    let source = order;
    if (payment.status === PaymentStatus.FAILED && !verifiedWithApi) {
      source = await this.getOrder(order.id); // falha de rede → exceção → 5xx → retry
      if (source?.status !== 'paid') {
        this.logger.warn(`Pagar.me: replay de order.paid para ${payment.id} não confirmado pela API (${source?.status})`);
        return { processed: false };
      }
    }
    const amount = typeof source?.amount === 'number' ? source.amount : null;
    if (amount !== null && amount !== payment.amount) {
      this.logger.error(`[REVISAR PAGAMENTO ${payment.id}] AMOUNT_MISMATCH: Pagar.me ${amount} ≠ ${payment.amount}`);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { failureReason: 'AMOUNT_MISMATCH' } });
      return { processed: false };
    }

    const allowedFrom = payment.status === PaymentStatus.FAILED ? [PaymentStatus.FAILED] : [PaymentStatus.PENDING];
    try {
      const processed = await this.prisma.$transaction(async (tx) => {
        const res = await tx.payment.updateMany({
          where: { id: payment.id, status: { in: allowedFrom } },
          data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date() },
        });
        if (res.count === 0) return false;

        if (payment.subscriptionId) {
          await tx.subscription.update({
            where: { id: payment.subscriptionId },
            data: { status: SubscriptionStatus.ACTIVE },
          });
        }
        // Plano da plataforma (coach) pago via Pagar.me → ativa a CoachSubscription
        if (payment.purpose === PaymentPurpose.PLATFORM_PLAN && this.fulfillment) {
          const r = await this.fulfillment.platformPlanPaid(tx as any, payment);
          if (r.outcome === 'NEEDS_REFUND') {
            await tx.payment.update({ where: { id: payment.id }, data: { failureReason: 'NEEDS_REFUND' } });
          }
        }
        return true;
      });
      if (processed) this.logger.log(`Pagamento Pagar.me confirmado: ${payment.id} (order: ${order.id})`);
      return { processed };
    } catch (err: any) {
      Sentry.captureException(err, { extra: { orderId: order?.id } });
      this.logger.error(`Erro ao processar order.paid Pagar.me: ${err.message}`);
      throw err; // 5xx → Pagar.me reenvia
    }
  }

  private async handleOrderFailed(order: any) {
    if (!order?.id) return;

    try {
      const payment = await this.prisma.payment.findFirst({
        where: { externalPaymentId: order.id },
      });

      // nunca rebaixa SUCCEEDED/REFUNDED
      await this.prisma.payment.updateMany({
        where: { externalPaymentId: order.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });

      if (payment) {
        Sentry.captureMessage(`Pagamento falhou: order=${order.id} user=${payment.userId}`, 'warning');
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar order.payment_failed Pagar.me: ${err.message}`);
    }
  }

  /** charge.paid: encaminha para o mesmo caminho do order.paid (com verificação na API). */
  private async handleChargePaid(charge: any) {
    const orderId: string | undefined = charge?.order?.id ?? charge?.order_id;
    if (!orderId) return;
    const order = await this.getOrder(orderId);
    if (order?.status === 'paid') await this.applyPaid({ ...order, id: orderId }, true);
  }
}
