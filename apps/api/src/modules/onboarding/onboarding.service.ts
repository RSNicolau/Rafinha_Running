import {
  Injectable, NotFoundException, Logger,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';
import { OnboardingStatus, QuestionType, PaymentProvider, SubscriptionPlanType } from '@prisma/client';

const DEFAULT_QUESTIONS = [
  { order: 1, question: 'Costuma fazer atividade física? Com que frequência por semana?', type: QuestionType.SELECT, options: ['Nunca', '1-2x por semana', '3-4x por semana', '5x ou mais'], required: true },
  { order: 2, question: 'Pratica algum esporte além de corrida?', type: QuestionType.TEXT, required: false },
  { order: 3, question: 'Já corre? Se sim, há quanto tempo?', type: QuestionType.SELECT, options: ['Não corro', 'Menos de 6 meses', '6 meses a 1 ano', '1 a 3 anos', 'Mais de 3 anos'], required: true },
  { order: 4, question: 'Objetivo principal', type: QuestionType.SELECT, options: ['5K', '10K', '21K (Meia Maratona)', '42K (Maratona)', 'Perder peso', 'Saúde geral', 'Condicionamento físico'], required: true },
  { order: 5, question: 'Tem outro objetivo específico?', type: QuestionType.TEXT, required: false },
  { order: 6, question: 'Já teve alguma lesão correndo? Se sim, qual e quando?', type: QuestionType.TEXTAREA, required: false },
  { order: 7, question: 'Quando foi seu último teste de esforço?', type: QuestionType.SELECT, options: ['Nunca fiz', 'Mais de 2 anos atrás', '1 a 2 anos atrás', 'Menos de 1 ano'], required: false },
  { order: 8, question: 'Possui algum problema cardíaco ou restrição médica?', type: QuestionType.TEXTAREA, placeholder: 'Se não possui, escreva "Não"', required: true },
  { order: 9, question: 'Quantos dias por semana você tem disponível para treinar?', type: QuestionType.SELECT, options: ['2 dias', '3 dias', '4 dias', '5 dias', '6 dias'], required: true },
  { order: 10, question: 'Qual horário você prefere treinar?', type: QuestionType.SELECT, options: ['Manhã (antes das 8h)', 'Manhã (8h-12h)', 'Tarde', 'Noite', 'Flexível'], required: true },
  { order: 11, question: 'Prefere esteira ou rua?', type: QuestionType.SELECT, options: ['Esteira', 'Rua', 'Indiferente'], required: true },
  { order: 12, question: 'Possui relógio GPS?', type: QuestionType.SELECT, options: ['Garmin', 'Polar', 'Apple Watch', 'Coros', 'Outro', 'Não tenho'], required: false },
  { order: 13, question: 'Usa algum aplicativo de corrida?', type: QuestionType.SELECT, options: ['Strava', 'Garmin Connect', 'Nike Run Club', 'Nenhum', 'Outro'], required: false },
  { order: 14, question: 'Qual seu melhor tempo nos 5km? (ex: 25:30)', type: QuestionType.TIME, placeholder: '00:00', required: false },
  { order: 15, question: 'Qual seu melhor tempo nos 10km? (ex: 52:00)', type: QuestionType.TIME, placeholder: '00:00', required: false },
  { order: 16, question: 'Costuma participar de provas de rua?', type: QuestionType.SELECT, options: ['Nunca', 'Raramente', '1-3 provas por ano', '4 ou mais provas por ano'], required: false },
  { order: 17, question: 'Tem corrido ultimamente? Com que frequência?', type: QuestionType.SELECT, options: ['Não corro', '1x por semana', '2-3x por semana', '4x ou mais por semana'], required: true },
  { order: 18, question: 'Tem alguma prova planejada? Qual e quando?', type: QuestionType.TEXT, required: false },
  { order: 19, question: 'Peso atual (kg)', type: QuestionType.NUMBER, placeholder: 'ex: 70', required: true },
  { order: 20, question: 'Altura (cm)', type: QuestionType.NUMBER, placeholder: 'ex: 175', required: true },
  { order: 21, question: 'Data de nascimento', type: QuestionType.DATE, required: true },
  { order: 22, question: 'Quantas horas de sono você dorme em média?', type: QuestionType.SELECT, options: ['Menos de 5h', '5-6h', '6-7h', '7-8h', 'Mais de 8h'], required: true },
  { order: 23, question: 'Como avalia seu nível de estresse no dia a dia? (1 = mínimo, 10 = máximo)', type: QuestionType.SCALE, required: true },
  { order: 24, question: 'Já usou assessoria de corrida antes? O que funcionou / não funcionou?', type: QuestionType.TEXTAREA, required: false },
  { order: 25, question: 'Qual sua principal dificuldade para manter a regularidade?', type: QuestionType.SELECT, options: ['Falta de tempo', 'Falta de motivação', 'Lesões frequentes', 'Trabalho', 'Família', 'Outro'], required: false },
  { order: 26, question: 'Meta de tempo para seu objetivo? (ex: 5K em 30 minutos)', type: QuestionType.TEXT, required: false },
  { order: 27, question: 'Como soube da assessoria?', type: QuestionType.SELECT, options: ['Indicação de amigo', 'Instagram', 'Facebook', 'Google', 'Outro'], required: false },
];

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private paymentsService: PaymentsService,
  ) {}

  // ──────────────────────────────────────
  // Coach: get or create their onboarding form
  // ──────────────────────────────────────

  async getOrCreateForm(coachId: string) {
    let form = await this.prisma.onboardingForm.findUnique({
      where: { coachId },
      include: { questions: { where: { isActive: true }, orderBy: { order: 'asc' } } },
    });

    if (!form) {
      form = await this.prisma.onboardingForm.create({
        data: {
          coachId,
          questions: {
            create: DEFAULT_QUESTIONS,
          },
        },
        include: { questions: { where: { isActive: true }, orderBy: { order: 'asc' } } },
      });
    }

    return form;
  }

  async updateForm(coachId: string, data: { title?: string; description?: string; isActive?: boolean }) {
    return this.prisma.onboardingForm.update({
      where: { coachId },
      data,
    });
  }

  async addQuestion(coachId: string, data: {
    question: string;
    type: QuestionType;
    options?: string[];
    required?: boolean;
    placeholder?: string;
    aiHint?: string;
  }) {
    const form = await this.prisma.onboardingForm.findUnique({ where: { coachId } });
    if (!form) throw new NotFoundException('Formulário não encontrado');

    const lastQuestion = await this.prisma.onboardingQuestion.findFirst({
      where: { formId: form.id },
      orderBy: { order: 'desc' },
    });

    return this.prisma.onboardingQuestion.create({
      data: {
        formId: form.id,
        order: (lastQuestion?.order ?? 0) + 1,
        question: data.question,
        type: data.type,
        options: data.options ? data.options : undefined,
        required: data.required ?? true,
        placeholder: data.placeholder,
        aiHint: data.aiHint,
      },
    });
  }

  async updateQuestion(coachId: string, questionId: string, data: {
    question?: string;
    type?: QuestionType;
    options?: string[];
    required?: boolean;
    placeholder?: string;
    aiHint?: string;
    isActive?: boolean;
    order?: number;
  }) {
    const form = await this.prisma.onboardingForm.findUnique({ where: { coachId } });
    if (!form) throw new NotFoundException('Formulário não encontrado');

    return this.prisma.onboardingQuestion.update({
      where: { id: questionId, formId: form.id },
      data: {
        question: data.question,
        type: data.type,
        options: data.options ?? undefined,
        required: data.required,
        placeholder: data.placeholder,
        aiHint: data.aiHint,
        isActive: data.isActive,
        order: data.order,
      },
    });
  }

  async reorderQuestions(coachId: string, orders: { id: string; order: number }[]) {
    const form = await this.prisma.onboardingForm.findUnique({ where: { coachId } });
    if (!form) throw new NotFoundException('Formulário não encontrado');

    await this.prisma.$transaction(
      orders.map(({ id, order }) =>
        this.prisma.onboardingQuestion.update({
          where: { id, formId: form.id },
          data: { order },
        }),
      ),
    );

    return { updated: orders.length };
  }

  async deleteQuestion(coachId: string, questionId: string) {
    const form = await this.prisma.onboardingForm.findUnique({ where: { coachId } });
    if (!form) throw new NotFoundException('Formulário não encontrado');

    await this.prisma.onboardingQuestion.update({
      where: { id: questionId, formId: form.id },
      data: { isActive: false },
    });

    return { deleted: true };
  }

  // ──────────────────────────────────────
  // Public: get form by coach slug
  // ──────────────────────────────────────

  async getPublicForm(slug: string): Promise<any> {
    // slug can be: coachProfile.slug, or coach userId directly
    const coach = await this.prisma.user.findFirst({
      where: {
        role: { in: ['COACH', 'ADMIN', 'SUPER_ADMIN'] as any },
        coachProfile: { isNot: null },
        OR: [
          { coachProfile: { slug } },
          { id: slug },
        ],
      },
      include: {
        coachProfile: true,
        tenantBranding: true,
        onboardingForm: {
          include: {
            questions: { where: { isActive: true }, orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!coach) {
      throw new NotFoundException('Formulário de onboarding não encontrado');
    }

    // Auto-create form if it doesn't exist yet
    if (!coach.onboardingForm) {
      await this.getOrCreateForm(coach.id);
      return this.getPublicForm(slug);
    }

    if (!coach.onboardingForm.isActive) {
      throw new NotFoundException('Formulário de onboarding não encontrado');
    }

    return {
      coachId: coach.id,
      coachName: coach.name,
      brandName: coach.tenantBranding?.tenantName ?? coach.name,
      primaryColor: coach.tenantBranding?.primaryColor ?? '#DC2626',
      logoUrl: coach.tenantBranding?.logoUrl,
      form: {
        id: coach.onboardingForm.id,
        title: coach.onboardingForm.title,
        description: coach.onboardingForm.description,
        questions: coach.onboardingForm.questions,
      },
    };
  }

  // ──────────────────────────────────────
  // Public: submit form answers
  // ──────────────────────────────────────

  /** Resolve coachId from slug first, then delegate to submitForm */
  async submitFormBySlug(slug: string, data: {
    athleteName: string;
    athleteEmail: string;
    athletePhone?: string;
    answers: Record<string, any>;
  }) {
    const coach = await this.prisma.user.findFirst({
      where: {
        role: { in: ['COACH', 'ADMIN', 'SUPER_ADMIN'] as any },
        coachProfile: { isNot: null },
        OR: [{ coachProfile: { slug } }, { id: slug }],
      },
      select: { id: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');
    return this.submitForm(coach.id, data);
  }

  async submitForm(coachId: string, data: {
    athleteName: string;
    athleteEmail: string;
    athletePhone?: string;
    answers: Record<string, any>;
  }) {
    // Create or find athlete user
    let athlete = await this.prisma.user.findUnique({ where: { email: data.athleteEmail } });
    let isNewAthlete = false;
    let tempPassword: string | undefined;

    if (!athlete) {
      isNewAthlete = true;
      tempPassword = Math.random().toString(36).slice(-10);
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      athlete = await this.prisma.user.create({
        data: {
          email: data.athleteEmail,
          passwordHash,
          name: data.athleteName,
          role: 'ATHLETE',
          phone: data.athletePhone,
          athleteProfile: {
            create: { coachId },
          },
        },
      });
    }

    // Send welcome email with credentials to new athletes
    if (isNewAthlete && tempPassword) {
      this.emailService.sendAthleteCredentials(athlete.email ?? '', athlete.name, tempPassword).catch(err =>
        this.logger.error(`Failed to send athlete credentials email: ${err.message}`),
      );
    }

    // Create or update onboarding profile
    const profile = await this.prisma.onboardingProfile.upsert({
      where: { athleteId: athlete.id },
      create: {
        athleteId: athlete.id,
        coachId,
        answers: data.answers,
        status: OnboardingStatus.PENDING_REVIEW,
        completedAt: new Date(),
      },
      update: {
        answers: data.answers,
        status: OnboardingStatus.PENDING_REVIEW,
        completedAt: new Date(),
        parsedProfile: undefined,
        aiSummary: undefined,
        reviewedAt: undefined,
      },
    });

    // Immediate coach notification (don't wait for AI analysis)
    this.prisma.notification.create({
      data: {
        userId: coachId,
        type: 'SYSTEM',
        title: 'Novo aluno cadastrado',
        body: `${data.athleteName} preencheu o questionário de anamnese e está aguardando revisão.`,
        data: { profileId: profile.id, athleteId: athlete.id },
      },
    }).catch(err => this.logger.error(`Failed to create coach notification: ${err.message}`));

    // Kick off async AI analysis (fire-and-forget)
    this.analyzeWithAI(profile.id, coachId).catch(err =>
      this.logger.error(`AI onboarding analysis failed: ${err.message}`),
    );

    return { profileId: profile.id, athleteId: athlete.id };
  }

  // ──────────────────────────────────────
  // AI: analyze answers asynchronously
  // ──────────────────────────────────────

  private async analyzeWithAI(profileId: string, coachId: string) {
    const profile = await this.prisma.onboardingProfile.findUnique({
      where: { id: profileId },
      include: { athlete: { select: { name: true } } },
    });
    if (!profile) return;

    const form = await this.prisma.onboardingForm.findUnique({
      where: { coachId },
      include: { questions: { where: { isActive: true }, orderBy: { order: 'asc' } } },
    });

    // Build structured Q&A text
    const answers = profile.answers as Record<string, any>;
    const qaPairs = form?.questions.map(q => {
      const answer = answers[q.id] ?? answers[String(q.order)] ?? '(não respondido)';
      return `${q.order}. ${q.question}\nResposta: ${answer}`;
    }).join('\n\n') ?? JSON.stringify(answers, null, 2);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Você é um especialista em treinamento de corrida. Analise o questionário de anamnese abaixo e gere:
1. Um resumo do perfil do atleta (2-3 parágrafos)
2. Nível sugerido: BEGINNER, INTERMEDIATE, ADVANCED ou ELITE
3. Alertas de atenção para o coach (lesões recentes, problemas cardíacos, etc.)
4. Sugestão inicial de frequência semanal e tipo de treino

Atleta: ${profile.athlete.name}

Respostas do questionário:
${qaPairs}

Responda APENAS em JSON válido com a estrutura: { "summary": "...", "level": "...", "alerts": ["..."], "suggestion": "..." }`,
        }],
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : null;
      if (!content) return;

      let parsed: any = {};
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {
        parsed = { summary: content };
      }

      await this.prisma.onboardingProfile.update({
        where: { id: profileId },
        data: {
          aiSummary: parsed.summary,
          parsedProfile: parsed,
        },
      });

      // Notify coach
      await this.prisma.notification.create({
        data: {
          userId: coachId,
          type: 'SYSTEM',
          title: '📋 Novo questionário recebido',
          body: `${profile.athlete.name} preencheu o questionário de anamnese. Revise e aprove.`,
          data: { profileId, athleteId: profile.athleteId },
        },
      });
    } catch (err: any) {
      this.logger.error(`Claude analysis error: ${err.message}`);
    }
  }

  // ──────────────────────────────────────
  // Coach: list pending onboardings
  // ──────────────────────────────────────

  async getPendingOnboardings(coachId: string) {
    return this.prisma.onboardingProfile.findMany({
      where: {
        coachId,
        status: { in: [OnboardingStatus.PENDING_REVIEW, OnboardingStatus.IN_PROGRESS] },
      },
      include: {
        athlete: { select: { id: true, name: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOnboardingDetail(coachId: string, profileId: string) {
    const profile = await this.prisma.onboardingProfile.findFirst({
      where: { id: profileId, coachId },
      include: {
        athlete: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!profile) throw new NotFoundException('Questionário não encontrado');

    const form = await this.prisma.onboardingForm.findUnique({
      where: { coachId },
      include: { questions: { where: { isActive: true }, orderBy: { order: 'asc' } } },
    });

    return { profile, form };
  }

  async approveOnboarding(coachId: string, profileId: string) {
    const profile = await this.prisma.onboardingProfile.findFirst({
      where: { id: profileId, coachId },
    });
    if (!profile) throw new NotFoundException('Questionário não encontrado');

    return this.prisma.onboardingProfile.update({
      where: { id: profileId },
      data: {
        status: OnboardingStatus.APPROVED,
        reviewedAt: new Date(),
      },
    });
  }

  // ──────────────────────────────────────
  // Public: create checkout for athlete
  // ──────────────────────────────────────

  async createAthleteCheckout(athleteId: string, planType?: string) {
    const athlete = await this.prisma.user.findUnique({ where: { id: athleteId } });
    if (!athlete) throw new NotFoundException('Atleta não encontrado');

    // Map frontend plan IDs to SubscriptionPlanType enum values
    const planTypeMap: Record<string, SubscriptionPlanType> = {
      mensal:     SubscriptionPlanType.MONTHLY,
      trimestral: SubscriptionPlanType.QUARTERLY,
      semestral:  SubscriptionPlanType.SEMIANNUAL,
      MONTHLY:    SubscriptionPlanType.MONTHLY,
      QUARTERLY:  SubscriptionPlanType.QUARTERLY,
      SEMIANNUAL: SubscriptionPlanType.SEMIANNUAL,
    };
    const resolvedPlanType = planType ? (planTypeMap[planType] ?? SubscriptionPlanType.MONTHLY) : SubscriptionPlanType.MONTHLY;

    const result = await this.paymentsService.createSubscription(athleteId, {
      provider: PaymentProvider.MERCADO_PAGO,
      planType: resolvedPlanType,
    });

    return result;
  }

  // ──────────────────────────────────────
  // Athlete: get own onboarding status
  // ──────────────────────────────────────

  async getMyOnboarding(athleteId: string) {
    return this.prisma.onboardingProfile.findUnique({
      where: { athleteId },
    });
  }
}
