import { BadRequestException, Injectable } from '@nestjs/common';
import { PlatformPlanType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_PLANS } from '../platform/platform-plans';
import { PLAN_FULL_AMOUNTS } from './mercadopago/mercadopago.service';

const ATHLETE_PLAN_IDS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export interface ResolvedPlanPrice {
  planId: string;
  kind: 'COACH' | 'ATHLETE';
  amountInCents: number;
  name: string;
}

/**
 * Preço de planos derivado SEMPRE no servidor.
 * Ordem: configuração editável pelo admin (AppConfig "plans", a mesma exibida nas telas) →
 * tabela platform_plans → constantes padrão.
 */
@Injectable()
export class PlanPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(planIdRaw: string | null | undefined): Promise<ResolvedPlanPrice> {
    const planId = String(planIdRaw ?? '').trim().toUpperCase();
    if (!planId) throw new BadRequestException('Plano não informado');

    const cfg = await this.prisma.appConfig.findUnique({ where: { key: 'plans' } }).catch(() => null);
    const value = (cfg?.value ?? {}) as any;
    const fromList = (list: unknown) =>
      Array.isArray(list) ? list.find((p: any) => String(p?.id ?? '').toUpperCase() === planId) : undefined;
    const validPrice = (n: unknown) => Number.isInteger(n) && (n as number) > 0;

    if ((Object.values(PlatformPlanType) as string[]).includes(planId)) {
      const c = fromList(value.coach);
      if (c && validPrice(c.price)) return { planId, kind: 'COACH', amountInCents: c.price, name: String(c.name ?? planId) };
      const db = await this.prisma.platformPlan.findUnique({ where: { type: planId as PlatformPlanType } });
      if (db && db.priceInCents > 0) return { planId, kind: 'COACH', amountInCents: db.priceInCents, name: db.name };
      const k = PLATFORM_PLANS.find((p) => p.type === planId);
      if (k) return { planId, kind: 'COACH', amountInCents: k.priceInCents, name: k.name };
    }

    if (ATHLETE_PLAN_IDS.includes(planId)) {
      const a = fromList(value.athlete);
      if (a && validPrice(a.price)) return { planId, kind: 'ATHLETE', amountInCents: a.price, name: String(a.name ?? planId) };
      const reais = PLAN_FULL_AMOUNTS[planId];
      if (reais > 0) return { planId, kind: 'ATHLETE', amountInCents: Math.round(reais * 100), name: planId };
    }

    throw new BadRequestException('Plano inválido');
  }

  /** Rejeita valor enviado pelo cliente que não bate com o preço do plano. */
  async resolveAndCheck(planId: string | null | undefined, clientAmount?: number | null): Promise<ResolvedPlanPrice> {
    const r = await this.resolve(planId);
    if (clientAmount !== undefined && clientAmount !== null && Math.round(clientAmount) !== r.amountInCents) {
      throw new BadRequestException('Valor não confere com o plano selecionado');
    }
    return r;
  }
}
