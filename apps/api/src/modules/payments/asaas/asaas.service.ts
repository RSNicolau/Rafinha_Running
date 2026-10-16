import { Injectable, Logger, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

export type AsaasBillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  billingType?: string;
  customer?: string;
  /** id da assinatura quando a cobrança foi gerada por uma assinatura recorrente */
  subscription?: string | null;
  dueDate?: string | null; // YYYY-MM-DD
}

export type AsaasCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';

/** Divisão do valor recebido (split): percentual do valor líquido que vai para a carteira. */
export interface AsaasSplit {
  walletId: string;
  percentualValue: number;
}

export interface AsaasSubscription {
  id: string;
  status: string;
  value?: number;
  nextDueDate?: string;
  cycle?: string;
  externalReference?: string | null;
  deleted?: boolean;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

/** Status Asaas que significam "pago" (dinheiro recebido ou cartão confirmado). */
export const ASAAS_PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
/** Status Asaas que encerram a cobrança sem pagamento. */
export const ASAAS_FAILED_STATUSES = new Set(['OVERDUE', 'DELETED']);
/** Status Asaas de estorno concluído. */
export const ASAAS_REFUNDED_STATUSES = new Set(['REFUNDED']);

/**
 * Cliente REST mínimo da API v3 do Asaas (sem SDK — usa fetch nativo).
 * Docs: https://docs.asaas.com/reference
 */
@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  get isConfigured(): boolean {
    return !!process.env.ASAAS_API_KEY;
  }

  private get baseUrl(): string {
    return (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
  }

  /** Caminho seguro para log: nunca registra CPF/CNPJ nem e-mail da query string. */
  private logPath(path: string): string {
    return path.replace(/([?&](?:cpfCnpj|email)=)[^&]*/gi, '$1***');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('Gateway Asaas não configurado (ASAAS_API_KEY)');

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
          access_token: apiKey,
          'User-Agent': 'rr-rafinha-running',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err: any) {
      this.logger.error(`Asaas ${method} ${this.logPath(path)} falhou: ${err?.message}`);
      throw new BadGatewayException('Falha de comunicação com o gateway de pagamento');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Asaas ${method} ${this.logPath(path)} → ${res.status}: ${text.slice(0, 500).replace(/\d{11,14}/g, '***')}`);
      let description = '';
      try {
        description = JSON.parse(text)?.errors?.[0]?.description ?? '';
      } catch { /* corpo não-JSON */ }
      throw new BadGatewayException(description ? `Asaas: ${description}` : `Gateway de pagamento retornou ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Reaproveita o cliente pelo CPF/CNPJ **somente se o e-mail também bater** — um visitante que
   * digita o CPF de outra pessoa não herda o cadastro dela (o Asaas aceita clientes duplicados).
   * Cria um novo cliente caso contrário. Retorna o id do cliente Asaas.
   */
  async findOrCreateCustomer(input: {
    name: string;
    cpfCnpj: string;
    email: string;
    mobilePhone?: string | null;
    externalReference?: string | null;
  }): Promise<string> {
    const cpfCnpj = input.cpfCnpj.replace(/\D/g, '');
    const existing = await this.request<{ data?: Array<{ id: string; deleted?: boolean; email?: string | null }> }>(
      'GET',
      `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
    );
    const email = input.email.trim().toLowerCase();
    const found = existing?.data?.find((c) => !c.deleted && (c.email ?? '').trim().toLowerCase() === email);
    if (found?.id) return found.id;

    const created = await this.request<{ id: string }>('POST', '/customers', {
      name: input.name,
      cpfCnpj,
      email: input.email,
      ...(input.mobilePhone ? { mobilePhone: input.mobilePhone.replace(/\D/g, '') } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      notificationDisabled: false,
    });
    return created.id;
  }

  async createPayment(input: {
    customer: string;
    billingType: AsaasBillingType;
    valueInCents: number;
    dueDate: string; // YYYY-MM-DD
    description: string;
    externalReference: string;
    split?: AsaasSplit[] | null;
  }): Promise<AsaasPayment> {
    return this.request<AsaasPayment>('POST', '/payments', {
      customer: input.customer,
      billingType: input.billingType,
      value: Number((input.valueInCents / 100).toFixed(2)),
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
      ...(input.split?.length ? { split: input.split } : {}),
    });
  }

  // ── Assinaturas (mensalidade recorrente) ────────────────────────────────

  async createSubscription(input: {
    customer: string;
    billingType: AsaasBillingType;
    valueInCents: number;
    nextDueDate: string; // YYYY-MM-DD
    cycle: AsaasCycle;
    description: string;
    externalReference: string;
    split?: AsaasSplit[] | null;
  }): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('POST', '/subscriptions', {
      customer: input.customer,
      billingType: input.billingType,
      value: Number((input.valueInCents / 100).toFixed(2)),
      nextDueDate: input.nextDueDate,
      cycle: input.cycle,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
      ...(input.split?.length ? { split: input.split } : {}),
    });
  }

  async getSubscription(id: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);
  }

  async listSubscriptionPayments(id: string): Promise<AsaasPayment[]> {
    const res = await this.request<{ data?: AsaasPayment[] }>('GET', `/subscriptions/${encodeURIComponent(id)}/payments`);
    return res?.data ?? [];
  }

  /** Altera valor/ciclo da assinatura. `updatePendingPayments` também atualiza cobranças em aberto. */
  async updateSubscription(
    id: string,
    input: { valueInCents?: number; cycle?: AsaasCycle; nextDueDate?: string; description?: string; updatePendingPayments?: boolean },
  ): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('PUT', `/subscriptions/${encodeURIComponent(id)}`, {
      ...(input.valueInCents !== undefined ? { value: Number((input.valueInCents / 100).toFixed(2)) } : {}),
      ...(input.cycle ? { cycle: input.cycle } : {}),
      ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
      ...(input.description ? { description: input.description.slice(0, 500) } : {}),
      updatePendingPayments: input.updatePendingPayments ?? false,
    });
  }

  /** Cancela a assinatura (o Asaas remove as cobranças pendentes dela). Lança em erro de gateway. */
  async cancelSubscription(id: string): Promise<void> {
    await this.request('DELETE', `/subscriptions/${encodeURIComponent(id)}`);
  }

  async getPayment(id: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>('GET', `/payments/${encodeURIComponent(id)}`);
  }

  async getPixQrCode(id: string): Promise<AsaasPixQrCode> {
    return this.request<AsaasPixQrCode>('GET', `/payments/${encodeURIComponent(id)}/pixQrCode`);
  }

  /** Cancela (remove) uma cobrança ainda não paga. Best-effort: nunca lança. */
  async cancelPayment(id: string): Promise<boolean> {
    try {
      await this.request('DELETE', `/payments/${encodeURIComponent(id)}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Não foi possível cancelar cobrança Asaas ${id}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Valida o header `asaas-access-token` do webhook contra ASAAS_WEBHOOK_TOKEN.
   * Fail-closed: sem token configurado, rejeita tudo.
   */
  verifyWebhookToken(received: string | undefined | null): boolean {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected || !received) return false;
    const a = Buffer.from(String(received));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
