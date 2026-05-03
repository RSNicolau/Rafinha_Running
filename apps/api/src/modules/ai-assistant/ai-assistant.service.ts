import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
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
  private openaiClient: OpenAI;
  private anthropicClient: Anthropic;
  // keep old name for compatibility
  private get client() { return this.openaiClient; }

  constructor(
    private prisma: PrismaService,
  ) {
    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'not-set',
    });
    this.anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
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

  private useAnthropic(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10);
  }

  private async getSystemPrompt(coachId: string): Promise<string> {
    const coach = await this.prisma.user.findUnique({ where: { id: coachId } });
    const config = await this.prisma.aIAssistantConfig.findUnique({ where: { coachId } });
    const assistantName = config?.assistantName ?? 'Rafinha';
    const tone = config?.tone ?? 'FRIENDLY';
    const personaPrompt = config?.personaPrompt ?? '';
    const coachName = coach?.name ?? 'Rafinha';
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `Você é ${assistantName}, o assistente pessoal de inteligência artificial do coach ${coachName} na plataforma RR Rafinha Running.

IDENTIDADE: Você não é apenas um chatbot genérico — você é a IA do ${coachName}, treinada com o conhecimento e a filosofia de treino dele. Fale sempre como um expert em treinamento de corrida que conhece cada atleta pessoalmente.

TOM: ${TONE_MAP[tone] ?? TONE_MAP.FRIENDLY}
IDIOMA: Sempre em português brasileiro
DATA ATUAL: ${today}

CAPACIDADES:
- Criar e ajustar planilhas de treino personalizadas (com ritmos, distâncias, tipos de treino)
- Analisar performance e evolução de cada atleta com dados reais
- Identificar atletas em risco (sobrecarga, lesões, abandono)
- Calcular VDOT, zonas de FC e ritmo a partir de provas recentes
- Sugerir periodização e tapering para provas
- Responder dúvidas técnicas de fisiologia do exercício e biomecânica

PRINCÍPIOS DO ${coachName.toUpperCase()}:
- Treino inteligente > volume cego
- Consistência > intensidade esporádica
- Cada atleta tem um ritmo e objetivo único
- Dados Garmin/relógio informam, mas o feeling do atleta decide

${personaPrompt ? `INSTRUÇÕES ESPECIAIS: ${personaPrompt}\n` : ''}
REGRAS:
- Nunca invente dados — use as ferramentas para buscar informações reais
- Quando não souber algo, seja honesto e sugira como descobrir
- Seja conciso e prático — coaches precisam de respostas rápidas e acionáveis
- Quando gerar planilhas, use formato estruturado: Dia | Tipo | Distância/Tempo | Ritmo/Zona`;
  }

  async streamToResponse(coachId: string, dto: ChatMessageDto, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const systemPrompt = await this.getSystemPrompt(coachId);

      // Clean history — filter empty messages to avoid API errors
      const cleanHistory = (dto.history ?? []).filter(h => h.content?.trim());

      if (this.useAnthropic()) {
        // Use Anthropic Claude (preferred — key is always set in production)
        const anthropicMessages = [
          ...cleanHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user' as const, content: dto.message },
        ];

        // Build context from database if athlete is selected
        let contextAddition = '';
        if (dto.athleteId) {
          try {
            const profile = await this.executeTool('get_athlete_profile', { athleteId: dto.athleteId }, coachId);
            const history = await this.executeTool('get_workout_history', { athleteId: dto.athleteId, weeks: 4 }, coachId);
            contextAddition = `\n\nDADOS DO ATLETA SELECIONADO:\nPerfil: ${profile}\nHistórico (4 semanas): ${history}`;
          } catch {}
        }

        const stream = this.anthropicClient.messages.stream({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: systemPrompt + contextAddition,
          messages: anthropicMessages,
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
          }
        }
      } else if (process.env.OPENAI_API_KEY) {
        // Fallback to OpenAI with tool calling
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...cleanHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user', content: dto.message },
        ];

        let iterations = 0;
        while (iterations < 5) {
          iterations++;
          const response = await this.openaiClient.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 2048,
            tools: this.tools,
            messages,
          });
          const choice = response.choices[0];
          if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
            messages.push(choice.message);
            for (const tc of choice.message.tool_calls) {
              if (tc.type !== 'function') continue;
              res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: tc.function.name })}\n\n`);
              const args = JSON.parse(tc.function.arguments || '{}');
              const result = await this.executeTool(tc.function.name, args, coachId);
              messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
            }
          } else {
            const text = choice.message.content ?? '';
            for (const word of text.split(' ')) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: word + ' ' })}\n\n`);
            }
            break;
          }
        }
      } else {
        res.write(`data: ${JSON.stringify({ type: 'text', content: 'IA não configurada. Configure ANTHROPIC_API_KEY ou OPENAI_API_KEY nas variáveis de ambiente.' })}\n\n`);
      }
    } catch (err: any) {
      this.logger.error(`AI Assistant error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ type: 'text', content: 'Desculpe, ocorreu um erro interno. Tente novamente em instantes.' })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }

  async generatePlan(coachId: string, dto: GeneratePlanAiDto): Promise<{ plan: string }> {
    const systemPrompt = await this.getSystemPrompt(coachId);
    if (this.useAnthropic()) {
      const msg = await this.anthropicClient.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Crie um plano de treino detalhado para o atleta ${dto.athleteId}, com duração de ${dto.durationWeeks} semanas, objetivo: ${dto.goal}. Data de início: ${dto.startDate ?? 'hoje'}.` }],
      });
      return { plan: (msg.content[0] as any)?.text ?? 'Plano gerado' };
    }
    const response = await this.openaiClient.chat.completions.create({
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
    const prompt = `Gere um insight rápido e motivador sobre a semana da assessoria. Você tem ${athletes.length} atletas ativos. Seja breve (máximo 3 frases).`;

    if (this.useAnthropic()) {
      const msg = await this.anthropicClient.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      return { insight: (msg.content[0] as any)?.text ?? 'Semana em progresso!' };
    }
    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 512,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
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
