export enum SubscriptionPlanType {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
  TRIAL = 'TRIAL',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  TRIALING = 'TRIALING',
  INCOMPLETE = 'INCOMPLETE',
}

export enum PaymentProvider {
  STRIPE = 'STRIPE',
  MERCADO_PAGO = 'MERCADO_PAGO',
}

export enum PaymentStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  REFUNDED = 'REFUNDED',
}

export interface Subscription {
  id: string;
  userId: string;
  planType: SubscriptionPlanType;
  status: SubscriptionStatus;
  provider: PaymentProvider;
  externalSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  subscriptionId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  externalPaymentId?: string;
  paidAt?: string;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: SubscriptionPlanType;
  priceInCents: number;
  currency: string;
  intervalMonths: number;
  trialDays: number;
  features: string[];
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    type: SubscriptionPlanType.MONTHLY,
    priceInCents: 4990,
    currency: 'BRL',
    intervalMonths: 1,
    trialDays: 7,
    features: [
      'Plano de treino personalizado',
      'Acompanhamento com treinador',
      'Sincronização Garmin/Strava',
      'Gráficos de desempenho',
      'Chat com treinador',
    ],
  },
  {
    id: 'annual',
    name: 'Plano Anual',
    type: SubscriptionPlanType.ANNUAL,
    priceInCents: 47990,
    currency: 'BRL',
    intervalMonths: 12,
    trialDays: 7,
    features: [
      'Tudo do plano mensal',
      '20% de desconto',
      'Relatórios avançados em PDF',
      'Prioridade no suporte',
    ],
  },
];
