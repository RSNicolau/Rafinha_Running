import { PlatformPlanType } from '@prisma/client';

// ─── Plan definitions (source of truth) ───────────────────────────────────────

export const PLATFORM_PLANS = [
  {
    type: PlatformPlanType.STARTER,
    name: 'Starter',
    description: 'Perfeito para coaches iniciando sua assessoria.',
    priceInCents: 19700,
    maxAthletes: 30,
    maxCoaches: null,
    features: [
      'Até 30 atletas',
      'Questionário de anamnese',
      'Planos de treino',
      'App para atletas',
      'Loja virtual',
    ],
  },
  {
    type: PlatformPlanType.PRO,
    name: 'Pro',
    description: 'Para assessorias em crescimento com equipe estruturada.',
    priceInCents: 39700,
    maxAthletes: 100,
    maxCoaches: null,
    features: [
      'Até 100 atletas',
      'Tudo do Starter',
      'Coach Brain IA',
      'Gestão de eventos',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
  },
  {
    type: PlatformPlanType.SCALE,
    name: 'Scale',
    description: 'Para times consolidados com grande base de atletas.',
    priceInCents: 69700,
    maxAthletes: 300,
    maxCoaches: null,
    features: [
      'Até 300 atletas',
      'Tudo do Pro',
      'Múltiplos coaches',
      'Dashboard analítico',
      'API access',
    ],
  },
  {
    type: PlatformPlanType.ELITE,
    name: 'Elite',
    description: 'Sem limites para as maiores assessorias do Brasil.',
    priceInCents: 99700,
    maxAthletes: null,
    maxCoaches: null,
    features: [
      'Atletas ilimitados',
      'Tudo do Scale',
      'SLA garantido',
      'Onboarding dedicado',
      'Integração Garmin/Strava',
    ],
  },
  {
    type: PlatformPlanType.WHITE_LABEL,
    name: 'White Label',
    description: 'Venda o app com sua própria marca para outros coaches.',
    priceInCents: 149700,
    maxAthletes: null,
    maxCoaches: 10,
    features: [
      'Atletas ilimitados',
      'Tudo do Elite',
      'Domínio próprio',
      'Sua marca (logo, cores)',
      'Gerenciar até 10 coaches',
      'Coaches pagam licença para você',
      'Suporte White Glove',
    ],
  },
];

/**
 * Cria TODOS os tipos de PLATFORM_PLANS que faltam na tabela (idempotente; skipDuplicates para corrida).
 * Nunca sobrescreve linhas existentes (preço/nome editados ficam como estão). Retorna quantos criou.
 * Usado no boot da API (PlatformService) e nos seeds.
 */
export async function ensureMissingPlatformPlans(prisma: any): Promise<number> {
  const existing: { type: string }[] = await prisma.platformPlan.findMany({ select: { type: true } });
  const have = new Set(existing.map((p) => p.type));
  const missing = PLATFORM_PLANS.filter((p) => !have.has(p.type));
  if (!missing.length) return 0;
  await prisma.platformPlan.createMany({
    data: missing.map((p) => ({ ...p, features: p.features as any })),
    skipDuplicates: true,
  });
  return missing.length;
}
