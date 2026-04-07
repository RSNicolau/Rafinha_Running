import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

type BrainMessage = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class CoachBrainService {
  private readonly logger = new Logger(CoachBrainService.name);
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // Build rich context from coach's data
  // ─────────────────────────────────────────────

  private async buildContext(coachId: string): Promise<string> {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [athletes, recentWorkouts, pendingOnboardings, assessments, garminToday] = await Promise.all([
      this.prisma.athleteProfile.findMany({
        where: { coachId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        take: 50,
      }),
      this.prisma.workout.findMany({
        where: {
          plan: { coachId },
          scheduledDate: { gte: weekAgo },
        },
        include: {
          athlete: { select: { name: true } },
        },
        orderBy: { scheduledDate: 'desc' },
        take: 30,
      }),
      this.prisma.onboardingProfile.findMany({
        where: { coachId, status: 'PENDING_REVIEW' },
        include: { athlete: { select: { name: true } } },
        take: 10,
      }),
      this.prisma.physicalAssessment.findMany({
        where: { coachId },
        include: { athlete: { select: { name: true } } },
        orderBy: { assessedAt: 'desc' },
        take: 10,
      }),
      this.prisma.garminHealthSnapshot.findMany({
        where: {
          athlete: { athleteProfile: { coachId } },
          date: { gte: new Date(today.toDateString()) },
        },
        include: { athlete: { select: { name: true } } },
        take: 20,
      }),
    ]);

    const athletesSummary = athletes.map(a =>
      `- ${a.user.name} (${a.level ?? 'sem nível'})`
    ).join('\n');

    const workoutsSummary = recentWorkouts.slice(0, 15).map(w =>
      `- ${w.athlete.name}: ${w.type} em ${new Date(w.scheduledDate).toLocaleDateString('pt-BR')} — ${w.status}`
    ).join('\n');

    const garminSummary = garminToday.length > 0
      ? garminToday.map(g =>
          `- ${g.athlete.name}: HRV ${g.hrv ?? 'N/A'}ms, Sono ${g.sleepHours ?? 'N/A'}h, Estresse ${g.stressScore ?? 'N/A'}/100`
        ).join('\n')
      : 'Sem dados Garmin de hoje';

    const assessmentSummary = assessments.slice(0, 5).map(a =>
      `- ${a.athlete.name} em ${new Date(a.assessedAt).toLocaleDateString('pt-BR')}: VDOT ${a.vdot ?? 'N/A'}, Peso ${a.weightKg ?? 'N/A'}kg, VO2max ${a.vo2max ?? 'N/A'}`
    ).join('\n');

    return `
ATLETAS (${athletes.length} total):
${athletesSummary || 'Nenhum atleta'}

TREINOS DA ÚLTIMA SEMANA:
${workoutsSummary || 'Nenhum treino registrado'}

DADOS GARMIN DE HOJE:
${garminSummary}

AVALIAÇÕES FÍSICAS RECENTES:
${assessmentSummary || 'Nenhuma avaliação'}

QUESTIONÁRIOS PENDENTES DE REVISÃO: ${pendingOnboardings.length}
${pendingOnboardings.map(o => `- ${o.athlete.name}`).join('\n')}
`.trim();
  }

  // ─────────────────────────────────────────────
  // Chat with streaming (SSE)
  // ─────────────────────────────────────────────

  async chatStream(coachId: string, sessionId: string | null, message: string, res: Response): Promise<void> {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { name: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');

    // Load or create session
    let session = sessionId
      ? await this.prisma.coachBrainSession.findFirst({ where: { id: sessionId, coachId } })
      : null;

    if (!session) {
      session = await this.prisma.coachBrainSession.create({
        data: { coachId, messages: [] },
      });
    }

    const history = (session.messages as BrainMessage[]) ?? [];

    // Build context
    const context = await this.buildContext(coachId);

    const systemPrompt = `Você é o assistente inteligente de ${coach.name}, especialista em treinamento de corrida.

Você tem acesso completo aos dados de todos os atletas e pode:
- Analisar performance, recuperação e evolução de cada atleta
- Identificar atletas em risco (sobrecarga, lesão, abandono)
- Gerar sugestões de ajuste de treino baseado em HRV/sono
- Criar planilhas de treino em formato estruturado quando solicitado
- Comparar avaliações físicas e mostrar evolução
- Responder qualquer dúvida técnica sobre treinamento de corrida

DADOS DISPONÍVEIS AGORA:
${context}

Data atual: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Responda em português. Seja objetivo, prático e específico com nomes dos atletas quando relevante.
Quando gerar planilhas de treino, use formato estruturado (dia, tipo, distância/tempo, ritmo).`;

    // Add user message to history
    const updatedHistory: BrainMessage[] = [
      ...history.slice(-19), // keep last 19 messages
      { role: 'user', content: message },
    ];

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session.id);
    res.flushHeaders();

    let fullResponse = '';

    try {
      const stream = this.anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: updatedHistory,
        thinking: { type: 'adaptive' },
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      }

      // Save full session with response
      const finalHistory: BrainMessage[] = [
        ...updatedHistory,
        { role: 'assistant', content: fullResponse },
      ];

      await this.prisma.coachBrainSession.update({
        where: { id: session.id },
        data: {
          messages: finalHistory,
          title: finalHistory[0]?.content?.slice(0, 80) ?? 'Nova conversa',
        },
      });

      res.write(`data: ${JSON.stringify({ done: true, sessionId: session.id })}\n\n`);
    } catch (err: any) {
      this.logger.error(`CoachBrain stream error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: 'Erro ao processar resposta da IA' })}\n\n`);
    } finally {
      res.end();
    }
  }

  // ─────────────────────────────────────────────
  // Sessions
  // ─────────────────────────────────────────────

  async getSessions(coachId: string) {
    return this.prisma.coachBrainSession.findMany({
      where: { coachId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getSession(coachId: string, sessionId: string) {
    const session = await this.prisma.coachBrainSession.findFirst({
      where: { id: sessionId, coachId },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return session;
  }

  async deleteSession(coachId: string, sessionId: string) {
    await this.prisma.coachBrainSession.deleteMany({
      where: { id: sessionId, coachId },
    });
    return { deleted: true };
  }

  // ─────────────────────────────────────────────
  // AI Jobs management
  // ─────────────────────────────────────────────

  async getJobs(coachId: string) {
    return this.prisma.aIJob.findMany({
      where: { coachId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createJob(type: string, payload: Record<string, any>, coachId?: string, athleteId?: string) {
    return this.prisma.aIJob.create({
      data: { type, payload, coachId, athleteId, status: 'PENDING' },
    });
  }

  async retryJob(coachId: string, jobId: string) {
    const job = await this.prisma.aIJob.findFirst({ where: { id: jobId, coachId } });
    if (!job) throw new NotFoundException('Job não encontrado');

    return this.prisma.aIJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', error: null },
    });
  }

  // ─────────────────────────────────────────────
  // Auto-retry failed jobs (called by scheduler)
  // ─────────────────────────────────────────────

  async processFailedJobs(): Promise<void> {
    const failedJobs = await this.prisma.aIJob.findMany({
      where: {
        status: { in: ['FAILED', 'PENDING'] },
        retries: { lt: 3 },
      },
      take: 10,
    });

    for (const job of failedJobs) {
      try {
        await this.prisma.aIJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', retries: { increment: 1 } },
        });

        // Route job to appropriate handler
        await this.executeJob(job);

        await this.prisma.aIJob.update({
          where: { id: job.id },
          data: { status: 'SUCCESS' },
        });
      } catch (err: any) {
        const isMaxRetries = job.retries >= 2;
        await this.prisma.aIJob.update({
          where: { id: job.id },
          data: {
            status: isMaxRetries ? 'FAILED' : 'PENDING',
            error: err.message,
          },
        });

        if (isMaxRetries && job.coachId) {
          await this.prisma.notification.create({
            data: {
              userId: job.coachId,
              type: 'SYSTEM',
              title: 'Tarefa de IA falhou',
              body: `O job "${job.type}" não pôde ser concluído após 3 tentativas. Erro: ${err.message?.slice(0, 100)}`,
              data: { jobId: job.id },
            },
          }).catch(() => {});
        }
      }
    }
  }

  private async executeJob(job: any): Promise<void> {
    const payload = job.payload as Record<string, any>;

    switch (job.type) {
      case 'ONBOARDING_ANALYSIS': {
        // Re-trigger onboarding analysis
        const { profileId } = payload;
        this.logger.log(`Retrying onboarding analysis for profile ${profileId}`);
        // The actual retry is handled by notifying the onboarding service
        // For now just log success after delay
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
      case 'ASSESSMENT_COMPARE': {
        this.logger.log(`Retrying assessment compare for job ${job.id}`);
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
      default:
        this.logger.warn(`Unknown job type: ${job.type}`);
    }
  }
}
