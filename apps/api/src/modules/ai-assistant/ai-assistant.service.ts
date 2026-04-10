import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
import { Response } from 'express';
import { ChatMessageDto } from './dto/chat-message.dto';
import { GeneratePlanAiDto } from './dto/generate-plan-ai.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

const TONE_MAP = {
  FRIENDLY: 'amigável, próximo e encorajador',
  PROFESSIONAL: 'profissional, técnico e objetivo',
  MOTIVATIONAL: 'motivador, energético e inspirador',
};

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private client: OpenAI;

  constructor(
    private prisma: PrismaService,
  ) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
      name: 'get_athlete_profile',
      description: 'Busca perfil completo de um atleta pelo ID',
      parameters: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
        },
        required: ['athleteId'],
      },
    }},
    {
      type: 'function',
      function: {
      name: 'get_workout_history',
      description: 'Busca histórico de treinos de um atleta',
      parameters: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          weeks: { type: 'number', description: 'Número de semanas para buscar (padrão: 4)' },
        },
        required: ['athleteId'],
      },
    }},
    {
      type: 'function',
      function: {
      name: 'generate_training_plan',
      description: 'Gera um plano de treino estruturado para um atleta',
      parameters: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          durationWeeks: { type: 'number', description: 'Duração do plano em semanas' },
          goal: { type: 'string', description: 'Objetivo do atleta (ex: 5K, 10K, maratona)' },
          startDate: { type: 'string', description: 'Data de início (ISO 8601)' },
        },
        required: ['athleteId', 'durationWeeks', 'goal'],
      },
    }},
    {
      type: 'function',
      function: {
      name: 'analyze_performance',
      description: 'Analisa a performance e evolução de um atleta',
      parameters: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          weeks: { type: 'number', description: 'Número de semanas para analisar (padrão: 8)' },
        },
        required: ['athleteId'],
      },
    }},
  ];

  private async executeTool(toolName: string, toolInput: Record<string, unknown>, coachId: string): Promise<string> {
    try {
      switch (toolName) {
        case 'get_athlete_profile': {
          const athlete = await this.prisma.user.findFirst({
            where: { id: toolInput.athleteId as string },
            include: { athleteProfile: true, coachProfile: true },
          });
          if (!athlete) return JSON.stringify({ error: 'Atleta não encontrado' });
          return JSON.stringify({
            id: athlete.id,
            name: athlete.name,
            email: athlete.email,
            profile: athlete.athleteProfile,
          });
        }
        case 'get_workout_history': {
          const weeks = (toolInput.weeks as number) || 4;
          const since = new Date();
          since.setDate(since.getDate() - weeks * 7);
          const workouts = await this.prisma.workout.findMany({
            where: {
              athleteId: toolInput.athleteId as string,
              scheduledDate: { gte: since },
            },
            orderBy: { scheduledDate: 'desc' },
            take: 50,
          });
          return JSON.stringify({ workouts, total: workouts.length });
        }
        case 'generate_training_plan': {
          return JSON.stringify({
            status: 'plan_generated',
            message: 'Plano estruturado gerado. Use POST /training-plans para salvar.',
            athleteId: toolInput.athleteId,
            durationWeeks: toolInput.durationWeeks,
            goal: toolInput.goal,
          });
        }
        case 'analyze_performance': {
          const weeks = (toolInput.weeks as number) || 8;
          const since = new Date();
          since.setDate(since.getDate() - weeks * 7);
          const workouts = await this.prisma.workout.findMany({
            where: {
              athleteId: toolInput.athleteId as string,
              status: 'COMPLETED',
              scheduledDate: { gte: since },
            },
            include: { result: true },
            orderBy: { scheduledDate: 'asc' },
          });
          const totalMeters = workouts.reduce((sum, w) => sum + (w.result?.distanceMeters ?? 0), 0);
          const totalKm = totalMeters / 1000;
          return JSON.stringify({
            period: `${weeks} semanas`,
            totalWorkouts: workouts.length,
            totalKm: Math.round(totalKm * 10) / 10,
            workouts: workouts.slice(0, 10).map(w => ({
              id: w.id,
              date: w.scheduledDate,
              type: w.type,
              distanceMeters: w.result?.distanceMeters,
              durationSeconds: w.result?.durationSeconds,
              avgPace: w.result?.avgPace,
            })),
          });
        }
        default:
          return JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
      }
    } catch (err) {
      this.logger.error(`Tool ${toolName} error`, err);
      return JSON.stringify({ error: 'Erro ao executar ferramenta' });
    }
  }

  private async getSystemPrompt(coachId: string): Promise<string> {
    const coach = await this.prisma.user.findUnique({ where: { id: coachId } });
    const config = await this.prisma.aIAssistantConfig.findUnique({ where: { coachId } });
    const assistantName = config?.assistantName ?? 'Rafinha';
    const tone = config?.tone ?? 'FRIENDLY';
    const personaPrompt = config?.personaPrompt ?? '';
    return `Você é ${assistantName}, o assistente IA do coach ${coach?.name ?? 'Coach'} na plataforma Rafinha Running.
Tom: ${TONE_MAP[tone] ?? TONE_MAP.FRIENDLY}. Responda sempre em português brasileiro.
${personaPrompt ? `Instruções especiais: ${personaPrompt}` : ''}
Você ajuda o coach a criar planilhas de treino, analisar performance dos atletas, responder dúvidas e tomar decisões baseadas em dados reais.
Nunca invente dados — use as ferramentas disponíveis para buscar informações reais.
Seja conciso e direto. Quando relevante, sugira ações práticas.`;
  }

  async streamToResponse(coachId: string, dto: ChatMessageDto, res: Response): Promise<void> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(dto.history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: dto.message },
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2048,
        tools: this.tools,
        messages,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
        messages.push(choice.message);
        for (const tc of choice.message.tool_calls) {
          res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: tc.function.name })}\n\n`);
          const args = JSON.parse(tc.function.arguments || '{}');
          const result = await this.executeTool(tc.function.name, args, coachId);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
      } else {
        const text = choice.message.content ?? '';
        const words = text.split(' ');
        for (const word of words) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: word + ' ' })}\n\n`);
        }
        break;
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }

  async generatePlan(coachId: string, dto: GeneratePlanAiDto): Promise<{ plan: string }> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Crie um plano de treino detalhado para o atleta ${dto.athleteId}, com duração de ${dto.durationWeeks} semanas, objetivo: ${dto.goal}. Data de início: ${dto.startDate ?? 'hoje'}.` },
      ],
    });
    return { plan: response.choices[0]?.message?.content ?? 'Plano gerado' };
  }

  async getInsight(coachId: string): Promise<{ insight: string }> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    const athletes = await this.prisma.athleteProfile.findMany({
      where: { coachId },
      include: { user: true },
      take: 5,
    });

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Gere um insight rápido e motivador sobre a semana da assessoria. Você tem ${athletes.length} atletas ativos. Seja breve (máximo 3 frases).` },
      ],
    });
    return { insight: response.choices[0]?.message?.content ?? 'Semana em progresso!' };
  }

  async getConfig(coachId: string) {
    let config = await this.prisma.aIAssistantConfig.findUnique({ where: { coachId } });
    if (!config) {
      config = await this.prisma.aIAssistantConfig.create({
        data: { coachId },
      });
    }
    return config;
  }

  async updateConfig(coachId: string, dto: UpdateConfigDto) {
    return this.prisma.aIAssistantConfig.upsert({
      where: { coachId },
      create: { coachId, ...dto },
      update: dto,
    });
  }
}
