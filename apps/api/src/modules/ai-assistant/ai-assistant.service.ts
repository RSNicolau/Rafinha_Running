import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { ChatMessageDto } from './dto/chat-message.dto';
import { GeneratePlanAiDto } from './dto/generate-plan-ai.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { assertCoachOwnsAthlete, athleteProfileScopeWhere, AuthUserLike } from '../../common/utils/ownership';
import {
  AiCredentials,
  AI_NOT_CONFIGURED_CODE,
  AI_NOT_CONFIGURED_MESSAGE,
  aiComplete,
  friendlyAiErrorMessage,
  requireAiCredentials,
  resolveAiCredentials,
} from '../../common/ai/ai-provider';

const TONE_MAP = {
  FRIENDLY: 'amigável, próximo e encorajador',
  PROFESSIONAL: 'profissional, técnico e objetivo',
  MOTIVATIONAL: 'motivador, energético e inspirador',
};

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  constructor(
    private prisma: PrismaService,
  ) {}

  /** Credenciais de IA do treinador (BYOK) ou da plataforma; lança 503 se não houver chave. */
  requireCredentials(coachId: string): Promise<AiCredentials> {
    return requireAiCredentials(this.prisma, coachId);
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

  /** Atleta precisa pertencer ao coach chamador (ADMIN/SUPER_ADMIN liberados). */
  async assertAthleteAccess(user: AuthUserLike, athleteId: string) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
  }

  private async executeTool(toolName: string, toolInput: Record<string, unknown>, user: AuthUserLike): Promise<string> {
    try {
      // Toda ferramenta recebe athleteId vindo do modelo/usuário → sempre checar posse
      if (toolInput && 'athleteId' in toolInput) {
        if (typeof toolInput.athleteId !== 'string') return JSON.stringify({ error: 'Atleta não encontrado' });
        try {
          await this.assertAthleteAccess(user, toolInput.athleteId);
        } catch {
          return JSON.stringify({ error: 'Atleta não encontrado' });
        }
      }
      switch (toolName) {
        case 'get_athlete_profile': {
          const athlete = await this.prisma.user.findFirst({
            where: { id: toolInput.athleteId as string },
            include: { athleteProfile: true },
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

  async streamToResponse(user: AuthUserLike, dto: ChatMessageDto, res: Response, credsArg?: AiCredentials): Promise<void> {
    const coachId = user.id;
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
    }
    const send = (payload: Record<string, unknown>) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    try {
      const creds = credsArg ?? (await resolveAiCredentials(this.prisma, coachId));
      if (!creds) {
        send({ type: 'error', code: AI_NOT_CONFIGURED_CODE, content: AI_NOT_CONFIGURED_MESSAGE });
      } else {
        const systemPrompt = await this.getSystemPrompt(coachId);
        // Clean history — filter empty messages to avoid API errors
        const cleanHistory = (dto.history ?? []).filter(h => h.content?.trim());

        // Contexto do atleta selecionado (posse já checada no controller; executeTool checa de novo)
        let contextAddition = '';
        if (dto.athleteId) {
          const profile = await this.executeTool('get_athlete_profile', { athleteId: dto.athleteId }, user);
          const history = await this.executeTool('get_workout_history', { athleteId: dto.athleteId, weeks: 4 }, user);
          contextAddition = `\n\nDADOS DO ATLETA SELECIONADO:\nPerfil: ${profile}\nHistórico (4 semanas): ${history}`;
        }

        if (creds.provider === 'anthropic') {
          const client = new Anthropic({ apiKey: creds.apiKey });
          const stream = client.messages.stream({
            model: creds.model,
            max_tokens: 2048,
            system: systemPrompt + contextAddition,
            messages: [
              ...cleanHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
              { role: 'user' as const, content: dto.message },
            ],
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'text', content: event.delta.text });
            }
          }
        } else if (creds.provider === 'openai' || creds.provider === 'grok') {
          // OpenAI-compatível com tool calling
          const client = new OpenAI({ apiKey: creds.apiKey, ...(creds.provider === 'grok' ? { baseURL: 'https://api.x.ai/v1' } : {}) });
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt + contextAddition },
            ...cleanHistory.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user', content: dto.message },
          ];
          let iterations = 0;
          while (iterations < 5) {
            iterations++;
            const response = await client.chat.completions.create({
              model: creds.model,
              max_tokens: 2048,
              tools: this.tools,
              messages,
            });
            const choice = response.choices[0];
            if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
              messages.push(choice.message);
              for (const tc of choice.message.tool_calls) {
                if (tc.type !== 'function') continue;
                send({ type: 'tool_call', tool: tc.function.name });
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
                const result = await this.executeTool(tc.function.name, args, user);
                messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
              }
            } else {
              send({ type: 'text', content: choice.message.content ?? '' });
              break;
            }
          }
        } else {
          const historyText = cleanHistory.map(h => `${h.role === 'user' ? 'Treinador' : 'Assistente'}: ${h.content}`).join('\n');
          const text = await aiComplete(creds, {
            system: systemPrompt + contextAddition,
            prompt: historyText ? `${historyText}\nTreinador: ${dto.message}` : dto.message,
            maxTokens: 2048,
          });
          send({ type: 'text', content: text });
        }
      }
    } catch (err: any) {
      this.logger.error(`AI Assistant error: ${err?.message}`);
      send({ type: 'error', content: friendlyAiErrorMessage(err) });
    }

    send({ type: 'done' });
    res.end();
  }

  async generatePlan(user: AuthUserLike, dto: GeneratePlanAiDto): Promise<{ plan: string }> {
    await this.assertAthleteAccess(user, dto.athleteId);
    const coachId = user.id;
    const creds = await this.requireCredentials(coachId);
    const systemPrompt = await this.getSystemPrompt(coachId);
    const athlete = await this.prisma.user.findUnique({ where: { id: dto.athleteId }, select: { name: true } }).catch(() => null);
    const plan = await aiComplete(creds, {
      system: systemPrompt,
      prompt: `Crie um plano de treino detalhado para o atleta ${athlete?.name ?? dto.athleteId}, com duração de ${dto.durationWeeks} semanas, objetivo: ${dto.goal}. Data de início: ${dto.startDate ?? 'hoje'}.`,
      maxTokens: 4096,
    });
    return { plan: plan || 'Plano gerado' };
  }

  async getInsight(coachId: string): Promise<{ insight: string }> {
    const creds = await this.requireCredentials(coachId);
    const systemPrompt = await this.getSystemPrompt(coachId);
    const total = await this.prisma.athleteProfile.count({ where: await athleteProfileScopeWhere(this.prisma, { id: coachId, role: 'COACH' }) });
    const prompt = `Gere um insight rápido e motivador sobre a semana da assessoria. Você tem ${total} atletas ativos. Seja breve (máximo 3 frases).`;
    const insight = await aiComplete(creds, { system: systemPrompt, prompt, maxTokens: 512 });
    return { insight: insight || 'Semana em progresso!' };
  }

  /** Indica se há IA configurada para o treinador (sem expor chave). */
  async getAiStatus(coachId: string) {
    const creds = await resolveAiCredentials(this.prisma, coachId);
    return creds
      ? { configured: true, provider: creds.provider, model: creds.model, source: creds.source }
      : { configured: false, message: AI_NOT_CONFIGURED_MESSAGE };
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
    const data: Record<string, any> = {};
    if (dto.assistantName !== undefined) data.assistantName = dto.assistantName;
    if (dto.tone !== undefined) data.tone = dto.tone;
    if (dto.personaPrompt !== undefined) data.personaPrompt = dto.personaPrompt;
    if (dto.voiceEnabled !== undefined) data.voiceEnabled = dto.voiceEnabled;
    return this.prisma.aIAssistantConfig.upsert({
      where: { coachId },
      create: { coachId, ...data },
      update: data,
    });
  }
}
