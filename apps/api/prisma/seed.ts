import { PrismaClient, UserRole, AthleteLevel, PlanStatus, WorkoutType, WorkoutStatus, HeartRateZone } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PRIVACY_VERSION, TERMS_VERSION } from '../src/modules/legal/legal.constants';
import { ensureRafinhaTeam } from './seed-team';

const prisma = new PrismaClient();

/**
 * Senhas do seed: NUNCA fixas no código.
 *  - Se a env correspondente existir, é usada (e aplicada também a contas existentes).
 *  - Senão, para contas NOVAS gera uma senha aleatória de 20 caracteres e imprime UMA vez;
 *    contas já existentes mantêm a senha atual.
 */
function randomPassword(): string {
  return randomBytes(30).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).padEnd(20, 'x');
}

const generatedCredentials: string[] = [];

/** Retorna o hash a gravar, ou null para manter a senha atual da conta existente. */
async function resolvePasswordHash(email: string, envVar: string): Promise<{ create: string; update: string | null }> {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    if (fromEnv.length < 8) throw new Error(`${envVar} deve ter no mínimo 8 caracteres`);
    const hash = await bcrypt.hash(fromEnv, 12);
    return { create: hash, update: hash };
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Mantém a senha atual; o hash de "create" nunca será usado
    return { create: await bcrypt.hash(randomPassword(), 12), update: null };
  }
  const plain = randomPassword();
  generatedCredentials.push(`  ${email} / ${plain}   (defina ${envVar} para escolher a senha)`);
  return { create: await bcrypt.hash(plain, 12), update: null };
}

// Usuários do seed já aceitam a versão vigente dos Termos/Política (evita o modal de consentimento na demo)
const consentFields = () => ({
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  termsAcceptedAt: new Date(),
});

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // ── MASTER SUPER_ADMIN ──
  const masterEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'master@rafinharunning.com';
  const masterPw = await resolvePasswordHash(masterEmail, 'SEED_SUPER_ADMIN_PASSWORD');
  const master = await prisma.user.upsert({
    where: { email: masterEmail },
    update: {
      role: UserRole.SUPER_ADMIN,
      ...(masterPw.update ? { passwordHash: masterPw.update, tokenVersion: { increment: 1 } } : {}),
      ...consentFields(),
    },
    create: {
      email: masterEmail,
      passwordHash: masterPw.create,
      name: 'Master Admin',
      role: UserRole.SUPER_ADMIN,
      ...consentFields(),
    },
  });
  console.log(`✅ Master SUPER_ADMIN: ${master.email}`);

  // ── RAFINHA (COACH + OWNER da equipe "Rafinha Running") ──
  // Menor privilégio: gerencia a assessoria pelo papel de equipe (OWNER), não como ADMIN da plataforma.
  // O papel é ajustado em ensureRafinhaTeam (revoga sessões antigas se era ADMIN).
  const coachEmail = 'rafinha@rafinharunning.com.br';
  const coachPw = await resolvePasswordHash(coachEmail, 'SEED_COACH_PASSWORD');
  const coach = await prisma.user.upsert({
    where: { email: coachEmail },
    update: {
      ...(coachPw.update ? { passwordHash: coachPw.update, tokenVersion: { increment: 1 } } : {}),
      ...consentFields(),
    },
    create: {
      email: coachEmail,
      passwordHash: coachPw.create,
      name: 'Rafinha Silva',
      role: UserRole.COACH,
      ...consentFields(),
      coachProfile: {
        create: {
          slug: 'rafinha',
          bio: 'Treinador de corrida com 10 anos de experiência. Especialista em maratonas.',
          specializations: ['Maratona', 'Meia Maratona', '10km'],
          certifications: ['CREF', 'USATF Level 2'],
          maxAthletes: 50,
        },
      },
    },
  });

  // Ensure slug is set if coachProfile already exists
  await prisma.coachProfile.updateMany({
    where: { userId: coach.id, slug: null },
    data: { slug: 'rafinha' },
  });

  console.log(`✅ Rafinha (COACH) atualizado: ${coach.email}`);

  // ── ADMIN legado (manter compatibilidade) ──
  const adminEmail = 'admin@rafinharunning.com.br';
  const adminPw = await resolvePasswordHash(adminEmail, 'SEED_ADMIN_PASSWORD');
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      ...(adminPw.update ? { passwordHash: adminPw.update, tokenVersion: { increment: 1 } } : {}),
      ...consentFields(),
    },
    create: {
      email: adminEmail,
      passwordHash: adminPw.create,
      name: 'Administrador RR',
      role: UserRole.ADMIN,
      ...consentFields(),
    },
  });
  console.log(`✅ Admin legado: ${admin.email}`);

  // Create Athletes
  const athlete1Pw = await resolvePasswordHash('joao@email.com', 'SEED_ATHLETE_PASSWORD');
  const athlete1 = await prisma.user.upsert({
    where: { email: 'joao@email.com' },
    update: {
      ...(athlete1Pw.update ? { passwordHash: athlete1Pw.update } : {}),
      ...consentFields(),
    },
    create: {
      email: 'joao@email.com',
      passwordHash: athlete1Pw.create,
      name: 'João Santos',
      role: UserRole.ATHLETE,
      ...consentFields(),
      athleteProfile: {
        create: {
          coachId: coach.id,
          weight: 75,
          height: 178,
          vo2max: 45.2,
          restingHR: 58,
          maxHR: 190,
          weeklyGoalKm: 40,
          level: AthleteLevel.INTERMEDIATE,
        },
      },
    },
  });

  const athlete2Pw = await resolvePasswordHash('maria@email.com', 'SEED_ATHLETE_PASSWORD');
  const athlete2 = await prisma.user.upsert({
    where: { email: 'maria@email.com' },
    update: {
      ...(athlete2Pw.update ? { passwordHash: athlete2Pw.update } : {}),
      ...consentFields(),
    },
    create: {
      email: 'maria@email.com',
      passwordHash: athlete2Pw.create,
      name: 'Maria Oliveira',
      role: UserRole.ATHLETE,
      ...consentFields(),
      athleteProfile: {
        create: {
          coachId: coach.id,
          weight: 58,
          height: 165,
          vo2max: 42.0,
          restingHR: 62,
          maxHR: 185,
          weeklyGoalKm: 30,
          level: AthleteLevel.BEGINNER,
        },
      },
    },
  });
  console.log(`✅ Atletas criados: ${athlete1.email}, ${athlete2.email}`);

  // ── Equipe Rafinha Running (OWNER Rafinha) + planos de mensalidade + atletas na equipe ──
  await ensureRafinhaTeam(prisma, coach.id);

  // Create Training Plan for athlete1 (idempotente: pula se já existir)
  const planName = 'Preparação Meia Maratona SP 2026';
  const existingPlan = await prisma.trainingPlan.findFirst({ where: { athleteId: athlete1.id, name: planName } });
  if (!existingPlan) {
    const plan = await prisma.trainingPlan.create({
      data: {
        coachId: coach.id,
        athleteId: athlete1.id,
        name: 'Preparação Meia Maratona SP 2026',
        description: 'Plano de 12 semanas para meia maratona. Foco em construção de base aeróbica e resistência.',
        startDate: new Date('2026-03-02'),
        endDate: new Date('2026-05-24'),
        status: PlanStatus.ACTIVE,
        weeklyFrequency: 4,
      },
    });

    // Create workouts for the first 2 weeks
    const workouts = [
      // Week 1
      { date: '2026-03-02', type: WorkoutType.EASY_RUN, title: 'Corrida leve 5km', dist: 5000, dur: 1800, pace: '6:00', zone: HeartRateZone.Z2_EASY },
      { date: '2026-03-04', type: WorkoutType.INTERVAL, title: '6x400m', dist: 6000, dur: 2400, pace: '4:30', zone: HeartRateZone.Z4_THRESHOLD },
      { date: '2026-03-06', type: WorkoutType.TEMPO, title: 'Tempo run 6km', dist: 6000, dur: 1920, pace: '5:20', zone: HeartRateZone.Z3_AEROBIC },
      { date: '2026-03-08', type: WorkoutType.LONG_RUN, title: 'Longão 12km', dist: 12000, dur: 4320, pace: '6:00', zone: HeartRateZone.Z2_EASY },
      // Week 2
      { date: '2026-03-09', type: WorkoutType.RECOVERY, title: 'Recuperação 3km', dist: 3000, dur: 1200, pace: '6:40', zone: HeartRateZone.Z1_RECOVERY },
      { date: '2026-03-11', type: WorkoutType.EASY_RUN, title: 'Corrida leve 6km', dist: 6000, dur: 2160, pace: '6:00', zone: HeartRateZone.Z2_EASY },
      { date: '2026-03-13', type: WorkoutType.INTERVAL, title: '8x200m', dist: 5000, dur: 2100, pace: '4:15', zone: HeartRateZone.Z5_MAXIMUM },
      { date: '2026-03-15', type: WorkoutType.LONG_RUN, title: 'Longão 14km', dist: 14000, dur: 5040, pace: '6:00', zone: HeartRateZone.Z2_EASY },
    ];

    for (const w of workouts) {
      await prisma.workout.create({
        data: {
          planId: plan.id,
          athleteId: athlete1.id,
          scheduledDate: new Date(w.date),
          type: w.type,
          title: w.title,
          targetDistanceMeters: w.dist,
          targetDurationSeconds: w.dur,
          targetPace: w.pace,
          heartRateZone: w.zone,
          status: WorkoutStatus.SCHEDULED,
        },
      });
    }
    console.log(`✅ Plano de treino criado com ${workouts.length} treinos`);

  }

  // Create Conversation (idempotente: única por atleta+coach)
  const existingConversation = await prisma.conversation.findFirst({ where: { athleteId: athlete1.id, coachId: coach.id } });
  if (!existingConversation) {
    const conversation = await prisma.conversation.create({
      data: {
        athleteId: athlete1.id,
        coachId: coach.id,
        lastMessageAt: new Date(),
      },
    });

    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          senderId: coach.id,
          content: 'Fala João! Preparei seu plano para a meia maratona de SP. Dá uma olhada e me diz o que achou!',
          createdAt: new Date(Date.now() - 86400000),
        },
        {
          conversationId: conversation.id,
          senderId: athlete1.id,
          content: 'Opa Rafinha! Curti muito, vou começar na segunda. Os intervalados estão bons!',
          createdAt: new Date(Date.now() - 3600000),
        },
        {
          conversationId: conversation.id,
          senderId: coach.id,
          content: 'Fechou! Lembra de manter o pace leve nos dias de recuperação. Qualquer dúvida me chama! 🏃‍♂️',
          createdAt: new Date(),
        },
      ],
    });
  }
  console.log('✅ Conversa criada com mensagens de exemplo');

  // ── LOJA VIRTUAL — Produtos RR 2026 ──
  const storeProducts = [
    {
      name: 'Camisa RR 2026',
      description: 'Camisa oficial da coleção Rafinha Running 2026. Tecido dry-fit de alta performance, ideal para treinos e provas.',
      category: 'CAMISA' as const,
      priceInCents: 12990,
      images: ['/produtos/camisa_rr_26_v3.jpg'],
      sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      colors: ['Vermelho', 'Branco'],
      totalStock: 100,
      featured: true,
    },
    {
      name: 'Casaco RR 2026',
      description: 'Casaco oficial RR 2026. Conforto e estilo para o dia a dia e treinos em dias mais frios.',
      category: 'CASACO' as const,
      priceInCents: 18990,
      images: ['/produtos/casaco_rr_26_v2.jpg'],
      sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      colors: ['Preto', 'Vermelho'],
      totalStock: 60,
      featured: true,
    },
    {
      name: 'Corta-vento RR 2026',
      description: 'Corta-vento leve e impermeável da coleção RR 2026. Perfeito para treinos em dias de vento e garoa.',
      category: 'CORTA_VENTO' as const,
      priceInCents: 15990,
      images: ['/produtos/corta_vento_rr_26_v2.jpg'],
      sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      colors: ['Preto'],
      totalStock: 50,
      featured: false,
    },
    {
      name: 'Viseira RR 2026',
      description: 'Viseira RR 2026 com proteção UV. Leve, regulável e ideal para corridas ao sol.',
      category: 'VISEIRA' as const,
      priceInCents: 6990,
      images: ['/produtos/viseira_rr_26_v2.jpg'],
      sizes: ['Único'],
      colors: ['Vermelho', 'Preto'],
      totalStock: 80,
      featured: false,
    },
    {
      name: 'Camisa São Garrafa',
      description: 'Camisa especial edição São Garrafa. Exclusiva e limitada para os atletas RR.',
      category: 'CAMISA' as const,
      priceInCents: 12990,
      images: ['/produtos/camisa_sao_garrafa_v4.jpg'],
      sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      colors: ['Branco'],
      totalStock: 40,
      featured: false,
    },
  ];

  for (const p of storeProducts) {
    const exists = await prisma.product.findFirst({
      where: { coachId: coach.id, name: p.name },
    });
    if (!exists) {
      await prisma.product.create({
        data: { ...p, coachId: coach.id, active: true },
      });
      console.log(`✅ Produto criado: ${p.name}`);
    } else {
      await prisma.product.update({
        where: { id: exists.id },
        data: {
          images: p.images,
          priceInCents: p.priceInCents,
          description: p.description,
          sizes: p.sizes,
          colors: p.colors,
          totalStock: p.totalStock,
          featured: p.featured,
          active: true,
        },
      });
      console.log(`🔄 Produto atualizado: ${p.name}`);
    }
  }
  console.log('✅ Loja virtual configurada com 5 produtos RR 2026');

  // Create App Config (theme)
  await prisma.appConfig.upsert({
    where: { key: 'theme' },
    update: {},
    create: {
      key: 'theme',
      value: {
        primaryColor: '#DC2626',
        secondaryColor: '#FFFFFF',
        logoUrl: null,
        fontFamily: 'Inter',
        appName: 'RR - Rafinha Running',
      },
    },
  });
  console.log('✅ Configuração de tema criada');

  console.log('\n🎉 Seed concluído com sucesso!');
  if (generatedCredentials.length) {
    console.log('\n🔐 Senhas geradas para contas criadas agora (exibidas apenas uma vez — guarde-as):');
    generatedCredentials.forEach((line) => console.log(line));
  } else {
    console.log('\n🔐 Nenhuma senha nova gerada (contas existentes mantiveram a senha atual ou usaram as envs SEED_*_PASSWORD).');
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
