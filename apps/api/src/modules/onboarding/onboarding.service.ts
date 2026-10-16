import {
  Injectable, NotFoundException, Logger, BadRequestException, Optional,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { LegalService, ConsentContext } from '../legal/legal.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { OnboardingStatus, QuestionType, PaymentProvider, SubscriptionPlanType } from '@prisma/client';
import { defaultTeamIdForUser, resolveTeamBySlugOrCoach } from '../teams/team-scope';
import { MembershipsService } from '../memberships/memberships.service';

export interface OnboardingCheckoutOptions {
  planId?: string;
  billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  buyer?: { name?: string; email?: string; cpf?: string; phone?: string };
}

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
  { order: 12, question: 'Possui relógio GPS?', type: QuestionType.SELECT, options: ['Garmin', 'Apple Watch', 'Coros', 'Outro', 'Não tenho'], required: false },
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
    private referralsService: ReferralsService,
    private legal: LegalService,
    @Optional() private memberships?: MembershipsService,
  ) {}

  // ──────────────────────────────────────
  // Onboarding token (opaco, AES-256-GCM, 24h) — substitui o athleteId na resposta pública
  // ──────────────────────────────────────

  private static readonly TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

  private tokenKey(): Buffer {
    const secret = process.env.ONBOARDING_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado');
    return createHash('sha256').update(`onboarding-token:${secret}`).digest();
  }

  issueOnboardingToken(athleteId: string, coachId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.tokenKey(), iv);
    const payload = JSON.stringify({ a: athleteId, c: coachId, e: Date.now() + OnboardingService.TOKEN_TTL_MS });
    const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
  }

  verifyOnboardingToken(token: string): { athleteId: string; coachId: string } {
    try {
      const raw = Buffer.from(token, 'base64url');
      if (raw.length < 29) throw new Error('short');
      const decipher = createDecipheriv('aes-256-gcm', this.tokenKey(), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      const p = JSON.parse(json);
      if (typeof p?.a !== 'string' || typeof p?.c !== 'string' || typeof p?.e !== 'number' || p.e < Date.now()) {
        throw new Error('expired');
      }
      return { athleteId: p.a, coachId: p.c };
    } catch {
      throw new BadRequestException('Sessão de cadastro inválida ou expirada. Faça login para concluir o pagamento.');
    }
  }

  /**
   * slug pode ser o slug da EQUIPE (→ dono da equipe), o slug legado do treinador ou o id do treinador.
   */
  async resolveSlugTarget(slug: string): Promise<{ coachId: string; teamId: string | null }> {
    const target = await resolveTeamBySlugOrCoach(this.prisma, slug);
    if (!target) throw new NotFoundException('Coach não encontrado');
    return { coachId: target.coachId, teamId: target.teamId };
  }

  async resolveCoachIdBySlug(slug: string): Promise<string> {
    return (await this.resolveSlugTarget(slug)).coachId;
  }

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
    const update: Record<string, any> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    return this.prisma.onboardingForm.update({
      where: { coachId },
      data: update,
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

    // Pergunta nunca respondida → exclusão definitiva; já respondida → desativa (preserva o histórico das respostas)
    let answered = true;
    const raw = (this.prisma as any).$queryRaw;
    if (typeof raw === 'function') {
      try {
        const rows: Array<{ c: number }> = await (this.prisma as any).$queryRaw`
          SELECT COUNT(*)::int AS c FROM onboarding_profiles WHERE coach_id = ${coachId} AND answers ? ${questionId}`;
        answered = Number(rows?.[0]?.c ?? 1) > 0;
      } catch {
        answered = true;
      }
    }
    if (!answered) {
      await this.prisma.onboardingQuestion.delete({ where: { id: questionId, formId: form.id } });
      return { deleted: true, removed: true };
    }

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
    // slug: slug da equipe (→ formulário do dono), coachProfile.slug ou id do treinador
    const target = await resolveTeamBySlugOrCoach(this.prisma, slug).catch(() => null);
    const team = target?.teamId && (this.prisma as any).team?.findUnique
      ? await this.prisma.team.findUnique({ where: { id: target.teamId }, select: { name: true, slug: true, logoUrl: true, primaryColor: true } })
      : null;
    const coach = await this.prisma.user.findFirst({
      where: {
        role: { in: ['COACH', 'ADMIN', 'SUPER_ADMIN'] as any },
        coachProfile: { isNot: null },
        ...(target ? { id: target.coachId } : { OR: [{ coachProfile: { slug } }, { id: slug }] }),
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
      teamName: team?.name ?? null,
      teamSlug: team?.slug ?? null,
      brandName: coach.tenantBranding?.tenantName ?? team?.name ?? coach.name,
      primaryColor: coach.tenantBranding?.primaryColor ?? team?.primaryColor ?? '#DC2626',
      logoUrl: coach.tenantBranding?.logoUrl ?? team?.logoUrl ?? null,
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

  /** Perguntas obrigatórias (ativas) do formulário do treinador precisam de resposta não vazia. */
  private async assertRequiredAnswers(coachId: string, answers: Record<string, any> | undefined) {
    const form = await (this.prisma as any).onboardingForm?.findUnique?.({
      where: { coachId },
      select: { questions: { where: { isActive: true, required: true }, select: { id: true } } },
    });
    const required: Array<{ id: string }> = Array.isArray(form?.questions) ? form.questions : [];
    if (!required.length) return;
    const a = answers && typeof answers === 'object' ? answers : {};
    const blank = (v: unknown) =>
      v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
    const missing = required.filter((q) => blank(a[q.id]));
    if (missing.length) {
      throw new BadRequestException(
        missing.length === 1
          ? 'Responda a pergunta obrigatória do questionário.'
          : `Responda todas as perguntas obrigatórias do questionário (${missing.length} sem resposta).`,
      );
    }
  }

  /** Resolve coachId from slug first, then delegate to submitForm */
  async submitFormBySlug(slug: string, data: SubmitOnboardingInput, ctx: ConsentContext = {}) {
    const { coachId, teamId } = await this.resolveSlugTarget(slug);
    return this.submitForm(coachId, data, ctx, teamId);
  }

  /**
   * Público (sem autenticação). Regras de segurança:
   *  - Se o e-mail já pertence a uma conta: NADA é alterado (respostas/status/vínculo); resposta genérica
   *    { ok: true, existingAccount: true } e e-mail com link de login para o dono da conta.
   *  - Conta nova: cria atleta + anamnese + registro de consentimento LGPD (inclui dados de saúde, art. 11).
   *  - Nunca retorna athleteId; retorna onboardingToken opaco (24h) para o checkout público.
   */
  async submitForm(coachId: string, data: SubmitOnboardingInput, ctx: ConsentContext = {}, teamIdArg?: string | null) {
    this.legal.assertCurrentVersions(data);
    if (data.acceptTerms !== true || data.healthDataConsent !== true) {
      throw new BadRequestException('É necessário aceitar os termos e consentir com o tratamento dos dados de saúde');
    }
    await this.assertRequiredAnswers(coachId, data.answers);
    const email = data.athleteEmail.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, email: true },
    });
    if (existing) {
      this.sendExistingAccountEmail(existing.email ?? email, existing.name).catch(err =>
        this.logger.error(`Failed to send existing-account email: ${err.message}`),
      );
      return { ok: true as const, existingAccount: true, requiresPayment: false };
    }

    // Atleta entra na equipe (slug da equipe ou equipe padrão do treinador); responsável = treinador/dono
    const teamId = teamIdArg !== undefined && teamIdArg !== null ? teamIdArg : await defaultTeamIdForUser(this.prisma, coachId);

    // Senha temporária criptograficamente segura
    const tempPassword = randomBytes(12).toString('base64url');
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { athlete, profile } = await this.prisma.$transaction(async (tx) => {
      const athlete = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: data.athleteName,
          role: 'ATHLETE',
          phone: data.athletePhone,
          athleteProfile: {
            create: { coachId, teamId },
          },
        },
      });
      const profile = await tx.onboardingProfile.create({
        data: {
          athleteId: athlete.id,
          coachId,
          answers: data.answers,
          status: OnboardingStatus.PENDING_REVIEW,
          completedAt: new Date(),
        },
      });
      await this.legal.recordConsent(
        athlete.id,
        {
          termsVersion: data.termsVersion,
          privacyVersion: data.privacyVersion,
          marketingOptIn: !!data.marketingOptIn,
          healthDataConsent: true,
        },
        ctx,
        tx,
      );
      return { athlete, profile };
    });

    // Send welcome email with credentials to new athletes
    this.emailService.sendAthleteCredentials(athlete.email ?? '', athlete.name, tempPassword).catch(err =>
      this.logger.error(`Failed to send athlete credentials email: ${err.message}`),
    );

    // Link referral if code provided (PENDING — credit on first payment)
    if (data.referralCode) {
      this.referralsService.linkRefereeOnSignup(athlete.id, email, data.referralCode).catch(err =>
        this.logger.error(`Failed to link referral: ${err.message}`),
      );
    }

    // Immediate coach in-app notification (don't wait for AI analysis)
    this.prisma.notification.create({
      data: {
        userId: coachId,
        type: 'SYSTEM',
        title: 'Novo aluno cadastrado',
        body: `${data.athleteName} preencheu o questionário de anamnese e está aguardando revisão.`,
        data: { profileId: profile.id, athleteId: athlete.id },
      },
    }).catch(err => this.logger.error(`Failed to create coach notification: ${err.message}`));

    // Send coach email alert (fire-and-forget)
    this.prisma.user.findUnique({ where: { id: coachId }, select: { email: true, name: true } })
      .then(coachUser => {
        if (coachUser?.email) {
          const dashboardUrl = `${process.env.FRONTEND_URL || 'https://rr-rafinha-running.vercel.app'}/dashboard/onboarding`;
          this.emailService.sendCoachNewAthleteAlert(
            coachUser.email,
            coachUser.name,
            data.athleteName,
            email,
            dashboardUrl,
          ).catch(err => this.logger.error(`Failed to send coach alert email: ${err.message}`));
        }
      })
      .catch(err => this.logger.error(`Failed to fetch coach for email: ${err.message}`));

    // Kick off async AI analysis (fire-and-forget)
    this.analyzeWithAI(profile.id, coachId).catch(err =>
      this.logger.error(`AI onboarding analysis failed: ${err.message}`),
    );

    return {
      ok: true as const,
      existingAccount: false,
      onboardingToken: this.issueOnboardingToken(athlete.id, coachId),
      requiresPayment: true,
    };
  }

  private async sendExistingAccountEmail(to: string, name: string) {
    const loginUrl = `${process.env.FRONTEND_URL || 'https://rr-rafinha-running.vercel.app'}/athlete-login`;
    const safeName = String(name ?? '').replace(/[<>&"']/g, '');
    await this.emailService.sendTransactional(
      to,
      'Você já tem uma conta — faça login',
      `<p>Olá, ${safeName}!</p>
       <p>Recebemos um questionário de cadastro com este e-mail, mas você já possui uma conta. Nenhum dado foi alterado.</p>
       <p>Para continuar, faça login: <a href="${loginUrl}">${loginUrl}</a></p>
       <p>Se não foi você, ignore este e-mail.</p>`,
    );
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

  /**
   * Checkout público do onboarding: identificado pelo onboardingToken (emitido no submit), validado contra o slug.
   * Cria a MENSALIDADE (AthleteMembership) no plano da equipe via MembershipsService (Asaas/FAKE — o mesmo
   * fluxo de /athlete-subscribe) e devolve o caminho /pedido/<id> para pagar. Também devolve o link
   * "Defina sua senha" (token do reset-password) — a conta criada no onboarding não tem senha conhecida.
   */
  async createCheckoutWithToken(slug: string, onboardingToken: string, planType?: string, opts: OnboardingCheckoutOptions = {}) {
    const { athleteId, coachId } = this.verifyOnboardingToken(onboardingToken);
    const target = await this.resolveSlugTarget(slug);
    if (target.coachId !== coachId) throw new BadRequestException('Sessão de cadastro inválida para este treinador');
    return this.createAthleteCheckout(athleteId, planType, opts, true);
  }

  /** Interno — NÃO exposto com athleteId vindo do cliente. Use createCheckoutWithToken ou a rota autenticada. */
  async createAthleteCheckout(athleteId: string, planType?: string, opts: OnboardingCheckoutOptions = {}, issueSetPassword = false) {
    const athlete = await this.prisma.user.findUnique({ where: { id: athleteId } });
    if (!athlete || athlete.role !== 'ATHLETE') throw new NotFoundException('Atleta não encontrado');
    if (!this.memberships) throw new BadRequestException('Mensalidades indisponíveis no momento');

    const team = await this.memberships.teamForAthlete(athleteId);
    if (!team) throw new BadRequestException('Seu cadastro ainda não está vinculado a uma equipe — fale com o treinador');
    const plan = await this.pickTeamPlan(team.id, opts.planId, planType);
    if (!plan) throw new BadRequestException('Esta equipe ainda não tem planos de mensalidade ativos — fale com o treinador');

    // Indicação: o desconto de R$30 do indicado entra na 1ª cobrança (MembershipsService.subscribe →
    // 1ª cobrança avulsa com desconto + assinatura a partir do ciclo seguinte). Saldo de crédito é só exibido.
    const referralCreditCents = athlete.referralCreditCents ?? 0;

    const checkout = await this.memberships.subscribe(
      { id: athleteId },
      {
        planId: plan.id,
        billingType: opts.billingType,
        buyer: {
          name: opts.buyer?.name || athlete.name,
          email: opts.buyer?.email || athlete.email || '',
          cpf: opts.buyer?.cpf ?? '',
          phone: opts.buyer?.phone ?? athlete.phone ?? undefined,
        },
      } as any,
    );

    const setPassword = issueSetPassword ? await this.issueSetPasswordLink(athlete).catch((e) => {
      this.logger.warn(`Falha ao gerar link de definição de senha: ${e?.message ?? e}`);
      return null;
    }) : null;

    return {
      ...checkout,
      plan: { id: plan.id, name: plan.name, interval: plan.interval, priceInCents: plan.priceInCents },
      teamName: team.name,
      discountApplied: (checkout as any).referralDiscountCents ?? 0,
      referralCreditCents,
      setPasswordPath: setPassword?.path ?? null,
    };
  }

  /** Plano da equipe: planId explícito; senão o do intervalo pedido (mensal/trimestral/semestral); senão o 1º ativo. */
  private async pickTeamPlan(teamId: string, planId?: string, planType?: string) {
    const plans = await this.prisma.teamPlan.findMany({
      where: { teamId, isActive: true, priceInCents: { gt: 0 } },
      orderBy: [{ sortOrder: 'asc' }, { priceInCents: 'asc' }],
    });
    if (!plans.length) return null;
    if (planId) {
      const p = plans.find((x) => x.id === planId);
      if (!p) throw new BadRequestException('Plano não encontrado nesta equipe');
      return p;
    }
    const intervalMap: Record<string, string> = {
      mensal: 'MONTHLY', trimestral: 'QUARTERLY', semestral: 'SEMIANNUAL',
      MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', SEMIANNUAL: 'SEMIANNUAL',
    };
    const wanted = planType ? intervalMap[planType] : undefined;
    return (wanted && plans.find((p) => p.interval === wanted)) || plans[0];
  }

  /**
   * M14: token de definição de senha no mesmo formato do /reset-password (AppConfig password_reset:<id>,
   * hash bcrypt, uso único) com validade de 72 h; enviado por e-mail e devolvido para a tela de sucesso.
   */
  private async issueSetPasswordLink(athlete: { id: string; email: string | null; name: string }) {
    if (!athlete.email) return null;
    const token = randomBytes(32).toString('hex');
    const bcrypt = await import('bcrypt');
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const key = `password_reset:${athlete.id}`;
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: { tokenHash, expiresAt } },
      update: { value: { tokenHash, expiresAt } },
    });
    const path = `/reset-password?token=${token}&email=${encodeURIComponent(athlete.email)}&welcome=1`;
    const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001';
    const safeName = String(athlete.name ?? '').replace(/[<>&"']/g, '');
    this.emailService
      .sendTransactional(
        athlete.email,
        'Defina sua senha de acesso',
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="margin-bottom:8px">Bem-vindo(a), ${safeName}!</h2>
          <p>Seu cadastro foi criado. Defina sua senha para acessar o app e acompanhar seus treinos:</p>
          <a href="${appUrl}${path}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Definir minha senha</a>
          <p style="color:#6B7280;font-size:13px">O link vale por 72 horas. Depois disso use "Esqueci minha senha" na tela de login.</p>
        </div>`,
      )
      .catch((err: any) => this.logger.error(`Falha ao enviar e-mail de definição de senha: ${err?.message ?? err}`));
    return { path, expiresAt };
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

export interface SubmitOnboardingInput {
  athleteName: string;
  athleteEmail: string;
  athletePhone?: string;
  answers: Record<string, any>;
  referralCode?: string;
  acceptTerms: boolean;
  termsVersion: string;
  privacyVersion: string;
  healthDataConsent: boolean;
  marketingOptIn?: boolean;
}
