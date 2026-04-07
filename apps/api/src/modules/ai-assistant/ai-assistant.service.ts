import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';
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
  private client: Anthropic;

  constructor(
    private prisma: PrismaService,
  ) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  private tools: Anthropic.Tool[] = [
    {
      name: 'get_athlete_profile',
      description: 'Busca perfil completo de um atleta pelo ID',
      input_schema: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
        },
        required: ['athleteId'],
      },
    },
    {
      name: 'get_workout_history',
      description: 'Busca histórico de treinos de um atleta',
      input_schema: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          weeks: { type: 'number', description: 'Número de semanas para buscar (padrão: 4)' },
        },
        required: ['athleteId'],
      },
    },
    {
      name: 'generate_training_plan',
      description: 'Gera um plano de treino estruturado para um atleta',
      input_schema: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          durationWeeks: { type: 'number', description: 'Duração do plano em semanas' },
          goal: { type: 'string', description: 'Objetivo do atleta (ex: 5K, 10K, maratona)' },
          startDate: { type: 'string', description: 'Data de início (ISO 8601)' },
        },
        required: ['athleteId', 'durationWeeks', 'goal'],
      },
    },
    {
      name: 'analyze_performance',
      description: 'Analisa a performance e evolução de um atleta',
      input_schema: {
        type: 'object' as const,
        properties: {
          athleteId: { type: 'string', description: 'ID do atleta' },
          weeks: { type: 'number', description: 'Número de semanas para analisar (padrão: 8)' },
        },
        required: ['athleteId'],
      },
    },
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
    const messages: Anthropic.MessageParam[] = [
      ...(dto.history ?? []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: dto.message },
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        tools: this.tools,
        messages,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: block.name })}\n\n`);
          const result = await this.executeTool(block.name, block.input as Record<string, unknown>, coachId);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        // end_turn — stream text to client
        for (const block of response.content) {
          if (block.type === 'text') {
            // Stream token by token
            const words = block.text.split(' ');
            for (const word of words) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: word + ' ' })}\n\n`);
            }
          }
        }
        break;
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }

  async generatePlan(coachId: string, dto: GeneratePlanAiDto): Promise<{ plan: string }> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: this.tools,
      messages: [{
        role: 'user',
        content: `Crie um plano de treino detalhado para o atleta ${dto.athleteId}, com duração de ${dto.durationWeeks} semanas, objetivo: ${dto.goal}. Data de início: ${dto.startDate ?? 'hoje'}. Use as ferramentas para buscar o perfil e histórico do atleta antes de criar o plano.`,
      }],
    });

    const textContent = response.content.find(b => b.type === 'text');
    return { plan: textContent?.type === 'text' ? textContent.text : 'Plano gerado' };
  }

  async getInsight(coachId: string): Promise<{ insight: string }> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    const athletes = await this.prisma.athleteProfile.findMany({
      where: { coachId },
      include: { user: true },
      take: 5,
    });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Gere um insight rápido e motivador sobre a semana da assessoria. Você tem ${athletes.length} atletas ativos. Seja breve (máximo 3 frases).`,
      }],
    });

    const textContent = response.content.find(b => b.type === 'text');
    return { insight: textContent?.type === 'text' ? textContent.text : 'Semana em progresso!' };
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
