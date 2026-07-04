/**
 * Seed DEMO — popula o banco com uma assessoria "em operação" para
 * apresentação/homologação: atletas com semanas de treinos reais, eventos com
 * inscrições (bib sequencial), loja com pedidos, parceiros, nutrição,
 * suplementos, depoimentos, conversas e notificações.
 *
 * - Idempotente: reexecutar não duplica (chaves naturais + verificações).
 * - Determinístico: RNG com semente fixa (sem Math.random).
 * - NÃO usar em produção real — é conteúdo de demonstração criado pelos
 *   modelos reais (nenhum dado chumbado em tela).
 *
 * Uso:  DATABASE_URL=... npx tsx prisma/seed-demo.ts
 * Login demo: rafinha@rafinharunning.com.br / rafinha123
 *             atleta01@demo.rafinharunning.com .. atleta24@... / Atleta2026!
 */

import { PrismaClient, UserRole, AthleteLevel, PlanStatus, WorkoutType, WorkoutStatus, EventStatus, EventRegistrationStatus, PaymentStatus, KitType, NotificationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// RNG determinístico (LCG) — reprodutível a cada execução
let rngState = 20260704;
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function daysAgo(n: number, hour = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function daysAhead(n: number, hour = 7): Date {
  return daysAgo(-n, hour);
}
function pace(secPerKm: number): string {
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
}

const ATHLETES = [
  ['Ana Souza', 'INTERMEDIATE'], ['Bruno Lima', 'BEGINNER'], ['Carla Mendes', 'ADVANCED'],
  ['Diego Ferreira', 'INTERMEDIATE'], ['Elisa Rocha', 'BEGINNER'], ['Fábio Martins', 'ADVANCED'],
  ['Gabriela Nunes', 'INTERMEDIATE'], ['Henrique Alves', 'ELITE'], ['Isabela Cardoso', 'BEGINNER'],
  ['João Pedro Santos', 'INTERMEDIATE'], ['Karen Oliveira', 'ADVANCED'], ['Leonardo Costa', 'BEGINNER'],
  ['Larissa Ribeiro', 'INTERMEDIATE'], ['Marcos Barbosa', 'ADVANCED'], ['Natália Gomes', 'BEGINNER'],
  ['Otávio Pereira', 'INTERMEDIATE'], ['Paula Carvalho', 'ELITE'], ['Rodrigo Araújo', 'BEGINNER'],
  ['Sabrina Melo', 'INTERMEDIATE'], ['Thiago Nascimento', 'ADVANCED'], ['Vanessa Almeida', 'BEGINNER'],
  ['Eduardo Rodrigues', 'INTERMEDIATE'], ['Beatriz Silva', 'ADVANCED'], ['Gustavo Moraes', 'INTERMEDIATE'],
] as const;

// Pace base (seg/km) por nível — resultados derivam disso com variação
const LEVEL_PACE: Record<string, number> = {
  BEGINNER: 420, INTERMEDIATE: 350, ADVANCED: 300, ELITE: 255,
};

async function main() {
  console.log('🌱 Seed DEMO — assessoria em operação\n');

  // ── Coach Rafinha (mesmo do seed base; garante existência) ────────────────
  const coachPassword = await bcrypt.hash('rafinha123', 12);
  const coach = await prisma.user.upsert({
    where: { email: 'rafinha@rafinharunning.com.br' },
    update: {},
    create: {
      email: 'rafinha@rafinharunning.com.br',
      passwordHash: coachPassword,
      name: 'Rafinha Silva',
      role: UserRole.ADMIN,
      coachProfile: {
        create: {
          slug: 'rafinha',
          bio: 'Treinador de corrida com 10 anos de experiência. Especialista em maratonas.',
          specializations: ['Maratona', 'Meia Maratona', '10km'],
          maxAthletes: 50,
        },
      },
    },
  });
  await prisma.coachProfile.updateMany({ where: { userId: coach.id, slug: null }, data: { slug: 'rafinha' } });
  console.log(`✅ Coach: ${coach.email}`);

  // ── Atletas ────────────────────────────────────────────────────────────────
  const athletePassword = await bcrypt.hash('Atleta2026!', 12);
  const athletes: { id: string; name: string; email: string; level: string }[] = [];
  for (let i = 0; i < ATHLETES.length; i++) {
    const [name, level] = ATHLETES[i];
    const email = `atleta${String(i + 1).padStart(2, '0')}@demo.rafinharunning.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: athletePassword, name, role: UserRole.ATHLETE },
    });
    const existingProfile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
    if (!existingProfile) {
      await prisma.athleteProfile.create({
        data: {
          userId: user.id,
          coachId: coach.id,
          level: level as AthleteLevel,
          weight: 55 + randInt(0, 35),
          height: 158 + randInt(0, 32),
          restingHR: 44 + randInt(0, 18),
          maxHR: 178 + randInt(0, 20),
          weeklyGoalKm: 25 + randInt(0, 45),
        },
      });
    } else if (!existingProfile.coachId) {
      await prisma.athleteProfile.update({ where: { userId: user.id }, data: { coachId: coach.id } });
    }
    athletes.push({ id: user.id, name, email, level });
  }
  console.log(`✅ Atletas: ${athletes.length}`);

  // ── Planos de treino + treinos (6 semanas passadas + 10 dias futuros) ─────
  let plansCreated = 0;
  for (const ath of athletes) {
    const planName = `Plano Base — ${ath.name.split(' ')[0]}`;
    const existing = await prisma.trainingPlan.findFirst({ where: { athleteId: ath.id, name: planName } });
    if (existing) continue;

    const plan = await prisma.trainingPlan.create({
      data: {
        coachId: coach.id,
        athleteId: ath.id,
        name: planName,
        description: 'Bloco de base aeróbica com progressão de volume.',
        startDate: daysAgo(42),
        endDate: daysAhead(42),
        status: PlanStatus.ACTIVE,
        weeklyFrequency: 3 + (randInt(0, 1)),
      },
    });
    plansCreated++;

    const basePace = LEVEL_PACE[ath.level];
    const weeklyKm = ath.level === 'BEGINNER' ? 22 : ath.level === 'INTERMEDIATE' ? 38 : 55;

    // Padrão semanal: ter(EASY) qui(INTERVAL/TEMPO) sab(LONG) [+dom RECOVERY p/ 4x]
    for (let week = 6; week >= -1; week--) {
      const types: Array<[number, WorkoutType, number]> = [
        [2, WorkoutType.EASY_RUN, Math.round(weeklyKm * 0.25)],
        [4, week % 2 === 0 ? WorkoutType.INTERVAL : WorkoutType.TEMPO, Math.round(weeklyKm * 0.25)],
        [6, WorkoutType.LONG_RUN, Math.round(weeklyKm * 0.5)],
      ];
      for (const [dow, type, km] of types) {
        const offset = week * 7 - dow; // dias atrás
        if (offset < -10) continue;
        const scheduled = daysAgo(offset, 6);
        const isPast = offset > 0;
        const missed = isPast && rand() < 0.12; // ~12% de treinos perdidos

        const workout = await prisma.workout.create({
          data: {
            planId: plan.id,
            athleteId: ath.id,
            scheduledDate: scheduled,
            type,
            title: type === WorkoutType.LONG_RUN ? `Longão ${km}km` : type === WorkoutType.INTERVAL ? `Intervalado 6x800m` : type === WorkoutType.TEMPO ? `Tempo run ${km}km` : `Rodagem leve ${km}km`,
            description: 'Manter FC na zona alvo. Hidratar a cada 20min.',
            targetDistanceMeters: km * 1000,
            targetPace: pace(basePace + (type === WorkoutType.LONG_RUN ? 20 : type === WorkoutType.EASY_RUN ? 30 : -15)),
            status: isPast ? (missed ? WorkoutStatus.MISSED : WorkoutStatus.COMPLETED) : WorkoutStatus.SCHEDULED,
            completedAt: isPast && !missed ? scheduled : null,
          },
        });

        if (isPast && !missed) {
          const actualPaceSec = basePace + randInt(-20, 25) + (type === WorkoutType.LONG_RUN ? 15 : 0);
          const distance = Math.round(km * 1000 * (0.92 + rand() * 0.16));
          await prisma.workoutResult.create({
            data: {
              workoutId: workout.id,
              distanceMeters: distance,
              durationSeconds: Math.round((distance / 1000) * actualPaceSec),
              avgPace: pace(actualPaceSec),
              avgHeartRate: 132 + randInt(0, 30),
              maxHeartRate: 165 + randInt(0, 25),
              calories: Math.round(distance / 1000 * 62),
              elevationGain: randInt(20, 180),
              rpe: randInt(4, 9),
            },
          });
        }
      }
    }
  }
  console.log(`✅ Planos criados: ${plansCreated} (com ~7 semanas de treinos/resultados cada)`);

  // ── Avaliações físicas (2 por atleta: inicial + recente com evolução) ─────
  let assessments = 0;
  for (const ath of athletes) {
    const has = await prisma.physicalAssessment.findFirst({ where: { athleteId: ath.id } });
    if (has) continue;
    const w = 55 + randInt(0, 35);
    const vo2 = ath.level === 'ELITE' ? 62 : ath.level === 'ADVANCED' ? 54 : ath.level === 'INTERMEDIATE' ? 47 : 40;
    for (const [monthsAgo, delta] of [[3, 0], [0, 1]] as const) {
      await prisma.physicalAssessment.create({
        data: {
          athleteId: ath.id,
          coachId: coach.id,
          assessedAt: daysAgo(monthsAgo * 30 + 3),
          weightKg: w - delta * randInt(1, 3),
          heightCm: 158 + randInt(0, 32),
          bodyFatPct: 24 - delta * 2 + randInt(0, 8),
          restingHR: 58 - delta * 3 - randInt(0, 8),
          maxHR: 182 + randInt(0, 14),
          vo2max: vo2 + delta * randInt(1, 3),
        },
      });
      assessments++;
    }
  }
  console.log(`✅ Avaliações físicas: ${assessments}`);

  // ── Eventos (oficial + kids + externa) com distâncias ─────────────────────
  async function ensureEvent(data: {
    title: string; daysAheadN: number; location: string; modality: string; price: number;
    maxParticipants: number; tags?: string[]; kids?: boolean; premium?: number | null;
  }) {
    const found = await prisma.event.findFirst({ where: { title: data.title, createdById: coach.id } });
    if (found) return found;
    const ev = await prisma.event.create({
      data: {
        createdById: coach.id,
        title: data.title,
        description: data.kids
          ? 'Especial para os filhos dos nossos atletas! Uma experiência divertida para os pequenos.'
          : data.tags?.includes('externa')
            ? 'Corrida externa — o grupo RR participa em equipe. Bora fechar o pelotão!'
            : 'A maior confraternização da assessoria! Corra com o grupo e comemore as conquistas.',
        eventDate: daysAhead(data.daysAheadN, 10),
        location: data.location,
        city: 'São Paulo',
        state: 'SP',
        modality: data.modality,
        maxParticipants: data.maxParticipants,
        price: data.price,
        status: EventStatus.PUBLISHED,
        tags: data.tags ?? [],
        kitDescription: data.tags?.includes('externa') ? null : 'Camiseta exclusiva, medalha finisher e café da manhã',
        kitCompletePrice: data.tags?.includes('externa') ? null : 0,
        kitPremiumPrice: data.premium ?? null,
        kitPickupLocation: data.tags?.includes('externa') ? null : 'Assessoria RR — Vila Olímpia, SP',
        kitPickupDate: data.tags?.includes('externa') ? null : daysAhead(data.daysAheadN - 1, 13),
      },
    });
    const distances = data.kids
      ? [['200m', 0.2, data.price, '2 a 4 anos'], ['500m', 0.5, data.price, '5 a 7 anos'], ['1K', 1, data.price, '8 a 12 anos']]
      : data.modality.includes('21')
        ? [['21K', 21, data.price, 'Meia maratona']]
        : [['5K', 5, data.price, 'Para todos os níveis'], ['10K', 10, data.price + 1000, 'Ritmo moderado a rápido']];
    for (let i = 0; i < distances.length; i++) {
      const [name, km, price, desc] = distances[i] as [string, number, number, string];
      await prisma.eventDistance.create({
        data: { eventId: ev.id, name, distanceKm: km, price, description: desc, sortOrder: i },
      });
    }
    return ev;
  }

  const evMain = await ensureEvent({ title: 'São Garrafa 2026', daysAheadN: 45, location: 'Parque Estadual das Nações', modality: '5K / 10K', price: 8500, maxParticipants: 500, premium: 4500 });
  const evKids = await ensureEvent({ title: 'São Garrafa Kids 2026', daysAheadN: 75, location: 'Parque Villa-Lobos', modality: 'Kids', price: 4500, maxParticipants: 300, kids: true });
  const evExt = await ensureEvent({ title: 'Meia Maratona de São Paulo', daysAheadN: 100, location: 'Ibirapuera', modality: '21K', price: 18900, maxParticipants: 30, tags: ['externa'] });
  console.log('✅ Eventos: São Garrafa 2026, Kids, Meia SP (externa)');

  // ── Inscrições (bib sequencial real por evento) ────────────────────────────
  for (const [ev, ratio] of [[evMain, 0.65], [evExt, 0.3]] as const) {
    const distances = await prisma.eventDistance.findMany({ where: { eventId: ev.id }, orderBy: { sortOrder: 'asc' } });
    let bibCount = await prisma.eventRegistration.count({ where: { eventId: ev.id, status: { not: EventRegistrationStatus.CANCELED } } });
    for (const ath of athletes) {
      if (rand() > ratio) continue;
      const exists = await prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId: ev.id, userId: ath.id } } });
      if (exists) continue;
      bibCount++;
      const dist = pick(distances);
      await prisma.eventRegistration.create({
        data: {
          eventId: ev.id,
          userId: ath.id,
          status: EventRegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
          bibNumber: String(bibCount).padStart(4, '0'),
          shirtSize: pick(['P', 'M', 'M', 'G', 'GG']),
          kitType: ev.id === evMain.id ? (rand() < 0.3 ? KitType.PREMIUM : KitType.COMPLETO) : null,
          kitPickupScheduledAt: ev.kitPickupDate,
          distanceId: dist?.id,
          confirmedAt: daysAgo(randInt(1, 20)),
          finalPrice: dist?.price ?? ev.price,
        },
      });
      await prisma.eventDistance.update({ where: { id: dist.id }, data: { registeredCount: { increment: 1 } } }).catch(() => {});
    }
    const total = await prisma.eventRegistration.count({ where: { eventId: ev.id } });
    console.log(`   → ${ev.title}: ${total} inscritos`);
  }

  // ── Loja: produtos + pedidos ───────────────────────────────────────────────
  const PRODUCTS: Array<[string, string, string, number, string[], number, boolean, number]> = [
    ['Camisa Oficial RR 2026', 'Azul Cobalto — tecido dry-fit', 'CAMISA', 8990, ['PP', 'P', 'M', 'G', 'GG', 'XGG'], 150, true, 10],
    ['Casaco RR Corta-Vento', 'Preto/Vermelho — impermeável', 'CORTA_VENTO', 14990, ['P', 'M', 'G', 'GG'], 100, true, 10],
    ['Viseira RR 2026', 'Vermelha — ajuste em velcro', 'VISEIRA', 3990, ['Único'], 80, false, 10],
    ['Meias de Corrida RR', 'Branco/Vermelho — anatômicas', 'MEIA', 2490, ['35-38', '39-42', '43-46'], 120, false, 0],
  ];
  const productIds: string[] = [];
  for (const [name, description, category, priceInCents, sizes, totalStock, featured, discount] of PRODUCTS) {
    let p = await prisma.product.findFirst({ where: { coachId: coach.id, name } });
    if (!p) {
      p = await prisma.product.create({
        data: { coachId: coach.id, name, description, category: category as any, priceInCents, sizes, totalStock, featured, athleteDiscountPercent: discount, active: true },
      });
    }
    productIds.push(p.id);
  }
  const existingOrders = await prisma.storeOrder.count({ where: { product: { coachId: coach.id } } });
  if (existingOrders < 10) {
    for (let i = 0; i < 15; i++) {
      const ath = pick(athletes);
      const pid = pick(productIds);
      const product = await prisma.product.findUnique({ where: { id: pid } });
      if (!product) continue;
      const qty = 1;
      await prisma.storeOrder.create({
        data: {
          productId: pid,
          customerName: ath.name,
          customerEmail: ath.email,
          size: product.sizes.length ? pick(product.sizes) : null,
          quantity: qty,
          totalInCents: product.priceInCents * qty,
          finalInCents: product.priceInCents * qty,
          status: pick(['PAID', 'PAID', 'CONFIRMED', 'PENDING_PAYMENT', 'DELIVERED'] as any),
          createdAt: daysAgo(randInt(0, 30), randInt(8, 20)),
        },
      });
      await prisma.product.update({ where: { id: pid }, data: { reserved: { increment: qty } } });
    }
  }
  console.log(`✅ Loja: ${productIds.length} produtos, pedidos: ${await prisma.storeOrder.count({ where: { product: { coachId: coach.id } } })}`);

  // ── Parceiros ──────────────────────────────────────────────────────────────
  const PARTNERS: Array<[string, string, string, string, string]> = [
    ['Garmin Brasil', 'Tecnologia', '⌚', '#007CC3', 'Tecnologia GPS oficial da assessoria'],
    ['Gatorade', 'Hidratação', '💧', '#F97316', 'Hidratação nos postos de água dos eventos'],
    ['On Running', 'Calçados', '👟', '#111827', 'Calçados e acessórios oficiais'],
    ['Açaí Naboah', 'Alimentação', '🍇', '#7C3AED', 'Açaí oficial pós-treino'],
    ['Cervejaria Malteca', 'Bebidas', '🍺', '#F59E0B', 'Parceiro oficial da confraternização'],
    ['Physio Sports', 'Saúde', '🏥', '#10B981', 'Fisioterapia e prevenção de lesões'],
  ];
  for (let i = 0; i < PARTNERS.length; i++) {
    const [name, category, emoji, color, description] = PARTNERS[i];
    const exists = await prisma.partner.findFirst({ where: { coachId: coach.id, name } });
    if (!exists) {
      await prisma.partner.create({ data: { coachId: coach.id, name, category, emoji, color, description, sortOrder: i } });
    }
  }
  console.log('✅ Parceiros: 6');

  // ── Suplementos + ingestão de hoje ────────────────────────────────────────
  const SUPS: Array<[string, string, string, string, string]> = [
    ['Whey Protein', '30g', 'Pós-treino', '#3B82F6', 'flask-outline'],
    ['Creatina', '5g', 'Qualquer hora', '#8B5CF6', 'nutrition-outline'],
    ['Vitamina D3', '2.000 UI', 'Com refeição', '#F59E0B', 'sunny-outline'],
    ['Ômega 3', '2 cápsulas', 'Com refeição', '#10B981', 'water-outline'],
  ];
  for (const ath of athletes.slice(0, 12)) {
    for (const [name, dose, timeOfDay, color, icon] of SUPS.slice(0, randInt(2, 4))) {
      const exists = await prisma.athleteSupplement.findFirst({ where: { userId: ath.id, name } });
      if (exists) continue;
      const sup = await prisma.athleteSupplement.create({ data: { userId: ath.id, name, dose, timeOfDay, color, icon } });
      if (rand() < 0.6) {
        const today = new Date(new Date().toISOString().slice(0, 10));
        await prisma.supplementIntake.create({ data: { supplementId: sup.id, date: today } }).catch(() => {});
      }
    }
  }
  console.log('✅ Suplementos: 12 atletas com 2-4 cada');

  // ── Nutrição de hoje (refeições + água) p/ 10 atletas ─────────────────────
  const MEALS: Array<[string, string, number, number, number, number, string[]]> = [
    ['Café da manhã', '06:30', 420, 28, 45, 12, ['Ovos mexidos', 'Pão integral', 'Banana', 'Café']],
    ['Lanche pré-treino', '09:00', 180, 8, 32, 3, ['Batata-doce', 'Whey']],
    ['Almoço', '12:30', 650, 45, 68, 18, ['Frango grelhado', 'Arroz integral', 'Brócolis']],
  ];
  const todayDate = new Date(new Date().toISOString().slice(0, 10));
  for (const ath of athletes.slice(0, 10)) {
    const has = await prisma.nutritionLog.findFirst({ where: { userId: ath.id, date: todayDate } });
    if (has) continue;
    for (const [mealName, mealTime, calories, protein, carbs, fat, items] of MEALS.slice(0, randInt(2, 3))) {
      await prisma.nutritionLog.create({
        data: { userId: ath.id, date: todayDate, mealName, mealTime, calories, protein, carbs, fat, items },
      });
    }
    await prisma.waterLog.upsert({
      where: { userId_date: { userId: ath.id, date: todayDate } },
      update: {},
      create: { userId: ath.id, date: todayDate, amount: randInt(3, 10) * 250, goal: 3000 },
    });
  }
  console.log('✅ Nutrição: 10 atletas com refeições + água de hoje');

  // ── Depoimentos (6, sendo 4 em destaque) ──────────────────────────────────
  const QUOTES = [
    'Treinar com a assessoria mudou minha corrida. Baixei 8 minutos na meia maratona em 6 meses!',
    'O acompanhamento pelo app é incrível — o Rafinha vê tudo e ajusta o treino na hora.',
    'Saí do sedentarismo para os meus primeiros 10K em 4 meses. Equipe sensacional!',
    'Os treinos em grupo às terças são o ponto alto da semana. Virou família!',
    'Planilha na medida certa: desafiadora sem virar sofrimento. Recomendo demais.',
    'A análise pós-treino com IA é surreal — parece que o coach correu do meu lado.',
  ];
  for (let i = 0; i < QUOTES.length; i++) {
    const ath = athletes[i * 3];
    await prisma.testimonial.upsert({
      where: { athleteId_coachId: { athleteId: ath.id, coachId: coach.id } },
      update: { isFeatured: i < 4 },
      create: { athleteId: ath.id, coachId: coach.id, rating: i === 4 ? 4 : 5, text: QUOTES[i], isFeatured: i < 4 },
    });
  }
  console.log('✅ Depoimentos: 6 (4 em destaque na landing)');

  // ── Conversas de chat (5 atletas) ─────────────────────────────────────────
  const CHATS: Array<[string, string]> = [
    ['Coach, consegui fechar o longão de ontem no pace! 🎉', 'Sensacional! Vi aqui no painel — pace redondo. Semana que vem subimos 2km.'],
    ['Tô sentindo a panturrilha um pouco carregada hoje.', 'Troca o intervalado de amanhã por rodagem leve de 5km e me avisa como acordou.'],
    ['Qual tênis você recomenda pra prova de dezembro?', 'Pro seu tipo de pisada, algo com placa de nylon já resolve. Passa na On com desconto de aluno!'],
    ['Posso correr no calor de meio-dia?', 'Evita! Se não der de manhã, corre depois das 18h e hidrata em dobro.'],
    ['Fechei minha inscrição no São Garrafa! 🏁', 'Boa!! Bora fechar o pelotão da equipe. Kit premium tá valendo a pena.'],
  ];
  for (let i = 0; i < CHATS.length; i++) {
    const ath = athletes[i * 2 + 1];
    let conv = await prisma.conversation.findFirst({ where: { athleteId: ath.id, coachId: coach.id } });
    if (conv) continue;
    conv = await prisma.conversation.create({
      data: { athleteId: ath.id, coachId: coach.id, lastMessageAt: daysAgo(i, 18) },
    });
    const [q, a] = CHATS[i];
    await prisma.message.create({ data: { conversationId: conv.id, senderId: ath.id, content: q, createdAt: daysAgo(i, 17) } });
    await prisma.message.create({ data: { conversationId: conv.id, senderId: coach.id, content: a, createdAt: daysAgo(i, 18), readAt: daysAgo(i, 18) } });
  }
  console.log('✅ Conversas: 5 threads coach↔atleta');

  // ── Notificações para o coach ─────────────────────────────────────────────
  const existingNotifs = await prisma.notification.count({ where: { userId: coach.id } });
  if (existingNotifs < 5) {
    const NOTIFS: Array<[NotificationType, string, string]> = [
      [NotificationType.SYSTEM, 'Novo atleta inscrito', `${athletes[3].name} concluiu o onboarding e aguarda plano.`],
      [NotificationType.SYSTEM, 'Treino perdido', `${athletes[7].name} não registrou o treino de ontem.`],
      [NotificationType.SYSTEM, 'Novo pedido na loja', 'Camisa Oficial RR 2026 (M) — aguardando pagamento.'],
      [NotificationType.SYSTEM, 'Inscrição em evento', `${athletes[11].name} se inscreveu no São Garrafa 2026.`],
      [NotificationType.SYSTEM, 'Novo depoimento', `${athletes[0].name} enviou um depoimento 5 estrelas!`],
    ];
    for (let i = 0; i < NOTIFS.length; i++) {
      const [type, title, body] = NOTIFS[i];
      await prisma.notification.create({
        data: { userId: coach.id, type, title, body, readAt: i > 2 ? daysAgo(i, 10) : null, createdAt: daysAgo(i, 9) },
      });
    }
  }
  console.log('✅ Notificações do coach: 5');

  console.log('\n🎉 Seed demo concluído!');
  console.log('   Coach:  rafinha@rafinharunning.com.br (senha do seed base; rafinha123 se criado agora)');
  console.log('   Atleta: atleta01@demo.rafinharunning.com / Atleta2026! (01..24)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
