/**
 * Helpers de seed para EQUIPES (assessorias). Idempotentes — usados por seed.ts e seed-demo.ts.
 *
 * Rafinha = UserRole.COACH (menor privilégio) e OWNER da equipe "Rafinha Running" (slug "rafinha").
 * A administração da plataforma é a conta SUPER_ADMIN master — nunca a conta do treinador.
 */
import { PrismaClient, UserRole, BillingInterval, TeamRole, PlatformPlanType, CoachSubscriptionStatus } from '@prisma/client';
import { ensureMissingPlatformPlans } from '../src/modules/platform/platform-plans';

/** Preços públicos reais da assessoria (centavos). */
export const RAFINHA_TEAM_PLANS: Array<{
  name: string; interval: BillingInterval; priceInCents: number; sortOrder: number; description: string; benefits: string[];
}> = [
  {
    name: 'Mensal', interval: BillingInterval.MONTHLY, priceInCents: 17400, sortOrder: 1,
    description: 'Assessoria completa com renovação mensal.',
    benefits: ['Planilha personalizada', 'Acompanhamento pelo app', 'Treinos em grupo'],
  },
  {
    name: 'Trimestral', interval: BillingInterval.QUARTERLY, priceInCents: 49500, sortOrder: 2,
    description: 'Três meses de assessoria com desconto.',
    benefits: ['Planilha personalizada', 'Acompanhamento pelo app', 'Treinos em grupo'],
  },
  {
    name: 'Semestral', interval: BillingInterval.SEMIANNUAL, priceInCents: 96000, sortOrder: 3,
    description: 'Seis meses de assessoria com o melhor preço.',
    benefits: ['Planilha personalizada', 'Acompanhamento pelo app', 'Treinos em grupo'],
  },
];

/**
 * Garante: conta do Rafinha com papel global COACH (rebaixa ADMIN legado e revoga sessões antigas),
 * equipe "Rafinha Running" (slug rafinha) com ele como OWNER, planos de mensalidade e atletas dele na equipe.
 */
export async function ensureRafinhaTeam(prisma: PrismaClient, coachId: string) {
  const user = await prisma.user.findUnique({ where: { id: coachId }, select: { role: true } });
  if (user && user.role !== UserRole.COACH) {
    await prisma.user.update({
      where: { id: coachId },
      data: { role: UserRole.COACH, tokenVersion: { increment: 1 } }, // tokens antigos (ADMIN) deixam de valer
    });
    console.log('🔒 Rafinha: papel global ajustado para COACH (gestão via equipe, não via ADMIN da plataforma)');
  }
  await prisma.coachProfile.upsert({
    where: { userId: coachId },
    create: { userId: coachId, slug: 'rafinha' },
    update: {},
  });

  // Slug "rafinha" pode já existir (backfill da migração) — reaproveita e garante o dono
  const team = await prisma.team.upsert({
    where: { slug: 'rafinha' },
    create: { name: 'Rafinha Running', slug: 'rafinha', ownerId: coachId, city: 'Rio de Janeiro - RJ', primaryColor: '#DC2626' },
    update: { name: 'Rafinha Running', ownerId: coachId, status: 'ACTIVE' },
  });
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: coachId } },
    create: { teamId: team.id, userId: coachId, role: TeamRole.OWNER },
    update: { role: TeamRole.OWNER, isActive: true },
  });

  for (const plan of RAFINHA_TEAM_PLANS) {
    const existing = await prisma.teamPlan.findFirst({ where: { teamId: team.id, name: plan.name } });
    if (existing) {
      await prisma.teamPlan.update({
        where: { id: existing.id },
        data: { interval: plan.interval, priceInCents: plan.priceInCents, sortOrder: plan.sortOrder, isActive: true },
      });
    } else {
      await prisma.teamPlan.create({ data: { ...plan, teamId: team.id } });
    }
  }

  await ensureActivePlatformPlan(prisma, coachId, PlatformPlanType.ELITE);

  // Atletas do Rafinha sem equipe entram na equipe dele
  await prisma.athleteProfile.updateMany({ where: { coachId, teamId: null }, data: { teamId: team.id } });
  console.log(`✅ Equipe ${team.name} (slug ${team.slug}) — OWNER Rafinha, planos Mensal R$174 / Trimestral R$495 / Semestral R$960`);
  return team;
}

/** Adiciona (ou reativa) um membro na equipe. */
export async function ensureTeamMember(prisma: PrismaClient, teamId: string, userId: string, role: TeamRole) {
  return prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role },
    update: { role, isActive: true },
  });
}

/**
 * Garante assinatura ATIVA da plataforma para o dono da equipe (seed): sem ela o painel mostra
 * "Período de teste (até 5 atletas)". Idempotente: cria o plano se faltar; só (re)ativa se a assinatura
 * não existir, não estiver ACTIVE ou o período tiver acabado — nunca troca um plano ativo escolhido depois.
 */
export async function ensureActivePlatformPlan(prisma: PrismaClient, coachId: string, type: PlatformPlanType) {
  // Todos os planos (Starter/Pro/Scale/Elite/White Label) precisam existir para /platform/subscribe
  await ensureMissingPlatformPlans(prisma);
  const plan = await prisma.platformPlan.findUnique({ where: { type } });
  if (!plan) {
    console.warn(`⚠️  Plano da plataforma ${type} não encontrado — assinatura do seed não criada`);
    return null;
  }
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const current = await prisma.coachSubscription.findUnique({ where: { coachId } });
  if (current && current.status === CoachSubscriptionStatus.ACTIVE && current.currentPeriodEnd > now) {
    return current;
  }
  const sub = await prisma.coachSubscription.upsert({
    where: { coachId },
    create: { coachId, planId: plan.id, status: CoachSubscriptionStatus.ACTIVE, currentPeriodStart: now, currentPeriodEnd: periodEnd, externalId: 'seed' },
    update: { planId: plan.id, status: CoachSubscriptionStatus.ACTIVE, currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: null },
  });
  console.log(`✅ Plano da plataforma ${plan.name} ATIVO para o dono da equipe (até ${periodEnd.toISOString().slice(0, 10)})`);
  return sub;
}
