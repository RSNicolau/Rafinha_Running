import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

type BrainMessage = { role: 'user' | 'assistant'; content: string | any[] };

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'grok';

export const PROVIDER_DEFAULTS: Record<AIProvider, { model: string; label: string }> = {
  anthropic: { model: 'claude-opus-4-6',      label: 'Claude (Anthropic)' },
  openai:    { model: 'gpt-4o',               label: 'GPT-4o (OpenAI)' },
  gemini:    { model: 'gemini-2.0-flash-exp', label: 'Gemini (Google)' },
  grok:      { model: 'grok-3',               label: 'Grok (xAI)' },
};

// ─── Encryption helpers (for BYOK API keys) ───────────────────────────────────

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'fallback-32-char-key-for-dev-only';
if (!process.env.API_KEY_ENCRYPTION_SECRET) {
  console.error('[CoachBrainService] WARNING: API_KEY_ENCRYPTION_SECRET not set. BYOK API keys are NOT securely encrypted. Set this env var in production.');
}

function encryptKey(plaintext: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CoachBrainService {
  private readonly logger = new Logger(CoachBrainService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Context builder ──────────────────────────────────────────────────────

  private async buildContext(coachId: string): Promise<string> {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [athletes, recentWorkouts, pendingOnboardings, assessments, garminToday] = await Promise.all([
      this.prisma.athleteProfile.findMany({
        where: { coachId },
        include: { user: { select: { id: true, name: true, email: true } } },
        take: 50,
      }),
      this.prisma.workout.findMany({
        where: { plan: { coachId }, scheduledDate: { gte: weekAgo } },
        include: { athlete: { select: { name: true } } },
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

    const athletesSummary = athletes.map(a => `- ${a.user.name} (${a.level ?? 'sem nível'})`).join('\n');
    const workoutsSummary = recentWorkouts.slice(0, 15).map(w =>
      `- ${w.athlete.name}: ${w.type} em ${new Date(w.scheduledDate).toLocaleDateString('pt-BR')} — ${w.status}`
    ).join('\n');
    const garminSummary = garminToday.length > 0
      ? garminToday.map(g => `- ${g.athlete.name}: HRV ${g.hrv ?? 'N/A'}ms, Sono ${g.sleepHours ?? 'N/A'}h, Estresse ${g.stressScore ?? 'N/A'}/100`).join('\n')
      : 'Sem dados Garmin de hoje';
    const assessmentSummary = assessments.slice(0, 5).map(a =>
      `- ${a.athlete.name} em ${new Date(a.assessedAt).toLocaleDateString('pt-BR')}: VDOT ${a.vdot ?? 'N/A'}, Peso ${a.weightKg ?? 'N/A'}kg`
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

  // ─── Resolve API key ──────────────────────────────────────────────────────

  private resolveApiKey(provider: AIProvider, coach: { aiByok: boolean; aiApiKey: string | null }): string {
    if (coach.aiByok && coach.aiApiKey) {
      try {
        return decryptKey(coach.aiApiKey);
      } catch {
        throw new Error('Chave API inválida. Reconfigure nas configurações.');
      }
    }

    // Platform keys (from Railway env vars)
    const platformKeys: Record<AIProvider, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai:    process.env.OPENAI_API_KEY,
      gemini:    process.env.GEMINI_API_KEY,
      grok:      process.env.GROK_API_KEY,
    };

    const key = platformKeys[provider];
    if (!key) {
      throw new Error(`Provedor ${provider} não está configurado na plataforma. Use sua própria chave (BYOK) ou contate o suporte.`);
    }
    return key;
  }

  // ─── Provider streamers ───────────────────────────────────────────────────

  private async streamAnthropic(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: BrainMessage[],
    res: Response,
  ): Promise<string> {
    const client = new Anthropic({ apiKey });
    let full = '';

    const stream = client.messages.stream({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: messages as any,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text;
        res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
      }
    }

    return full;
  }

  private async streamOpenAI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: BrainMessage[],
    res: Response,
    baseURL?: string,
  ): Promise<string> {
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    let full = '';

    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) {
        full += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    return full;
  }

  private async streamGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: BrainMessage[],
    res: Response,
  ): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });

    // Convert to Gemini history format — ensure content is a string
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: Array.isArray(m.content) ? m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') : m.content }],
    }));
    const rawLastContent = messages[messages.length - 1].content;
    const lastMessage = Array.isArray(rawLastContent)
      ? rawLastContent.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      : rawLastContent;

    const chat = geminiModel.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    let full = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        full += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    return full;
  }

  // ─── Main chat method ─────────────────────────────────────────────────────

  async chatStream(coachId: string, sessionId: string | null, message: string, res: Response): Promise<void> {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { name: true, aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');

    const provider = (coach.aiProvider ?? 'anthropic') as AIProvider;
    const providerInfo = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;
    const model = coach.aiModel ?? providerInfo.model;

    let apiKey: string;
    try {
      apiKey = this.resolveApiKey(provider, coach);
    } catch (err: any) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      return;
    }

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

    const updatedHistory: BrainMessage[] = [
      ...history.slice(-19),
      { role: 'user', content: message },
    ];

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session.id);
    res.setHeader('X-AI-Provider', provider);
    res.setHeader('X-AI-Model', model);
    res.flushHeaders();

    let fullResponse = '';

    try {
      switch (provider) {
        case 'openai':
          fullResponse = await this.streamOpenAI(apiKey, model, systemPrompt, updatedHistory, res);
          break;
        case 'gemini':
          fullResponse = await this.streamGemini(apiKey, model, systemPrompt, updatedHistory, res);
          break;
        case 'grok':
          // Grok uses OpenAI-compatible API
          fullResponse = await this.streamOpenAI(apiKey, model, systemPrompt, updatedHistory, res, 'https://api.x.ai/v1');
          break;
        default:
          fullResponse = await this.streamAnthropic(apiKey, model, systemPrompt, updatedHistory, res);
      }

      const finalHistory: BrainMessage[] = [
        ...updatedHistory,
        { role: 'assistant', content: fullResponse },
      ];

      await this.prisma.coachBrainSession.update({
        where: { id: session.id },
        data: {
          messages: finalHistory,
          title: typeof finalHistory[0]?.content === 'string'
            ? finalHistory[0].content.slice(0, 80)
            : 'Nova conversa',
        },
      });

      res.write(`data: ${JSON.stringify({ done: true, sessionId: session.id, provider, model })}\n\n`);
    } catch (err: any) {
      this.logger.error(`CoachBrain [${provider}] stream error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: `Erro ao processar resposta (${providerInfo.label}): ${err.message?.slice(0, 120)}` })}\n\n`);
    } finally {
      res.end();
    }
  }

  // ─── File type helper ────────────────────────────────────────────────────

  private categorizeFile(mimeType: string): 'image' | 'pdf' | 'excel' | 'audio' | 'video' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'excel';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  }

  // ─── File pre-processor ───────────────────────────────────────────────────

  async preprocessFiles(files: Express.Multer.File[]): Promise<{
    textAdditions: string[];
    imageBlocks: any[];
    documentBlocks: any[];
  }> {
    const textAdditions: string[] = [];
    const imageBlocks: any[] = [];
    const documentBlocks: any[] = [];

    for (const file of files) {
      const type = this.categorizeFile(file.mimetype);

      if (type === 'image') {
        const base64 = file.buffer.toString('base64');
        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: file.mimetype, data: base64 },
        });
      } else if (type === 'pdf') {
        const base64 = file.buffer.toString('base64');
        documentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        });
      } else if (type === 'excel') {
        const XLSX = require('xlsx');
        const wb = XLSX.read(file.buffer, { type: 'buffer' });
        const sheets = wb.SheetNames.map((name: string) => {
          const ws = wb.Sheets[name];
          return `=== ${name} ===\n${XLSX.utils.sheet_to_csv(ws)}`;
        }).join('\n\n');
        textAdditions.push(`[Planilha Excel: ${file.originalname}]\n${sheets.slice(0, 8000)}`);
      } else if (type === 'audio') {
        try {
          const openaiKey = process.env.OPENAI_API_KEY;
          if (!openaiKey) throw new Error('OPENAI_API_KEY not set');
          const openai = new OpenAI({ apiKey: openaiKey });
          const { File } = await import('node:buffer');
          const audioFile = new File([file.buffer], file.originalname, { type: file.mimetype });
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile as any,
            model: 'whisper-1',
            language: 'pt',
          });
          textAdditions.push(`[Áudio transcrito: ${file.originalname}]\n${transcription.text}`);
        } catch (err: any) {
          textAdditions.push(`[Áudio: ${file.originalname} — transcrição falhou: ${err.message}]`);
        }
      } else if (type === 'video') {
        textAdditions.push(
          `[Vídeo recebido: ${file.originalname} — ${Math.round(file.size / 1024)}KB. Análise de vídeo não disponível automaticamente; descreva o que deseja analisar.]`,
        );
      }
    }

    return { textAdditions, imageBlocks, documentBlocks };
  }

  // ─── Multimodal chat (streaming) ──────────────────────────────────────────

  async chatStreamMultimodal(
    coachId: string,
    sessionId: string | null,
    message: string,
    files: Express.Multer.File[],
    res: Response,
  ): Promise<void> {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { name: true, aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');

    const provider = (coach.aiProvider ?? 'anthropic') as AIProvider;
    const providerInfo = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;
    const model = coach.aiModel ?? providerInfo.model;

    let apiKey: string;
    try {
      apiKey = this.resolveApiKey(provider, coach);
    } catch (err: any) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      return;
    }

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
    const context = await this.buildContext(coachId);

    const systemPrompt = `Você é o assistente inteligente de ${coach.name}, especialista em treinamento de corrida.

Você tem acesso completo aos dados de todos os atletas e pode:
- Analisar performance, recuperação e evolução de cada atleta
- Identificar atletas em risco (sobrecarga, lesão, abandono)
- Gerar sugestões de ajuste de treino baseado em HRV/sono
- Criar planilhas de treino em formato estruturado quando solicitado
- Comparar avaliações físicas e mostrar evolução
- Responder qualquer dúvida técnica sobre treinamento de corrida
- Analisar imagens, PDFs, planilhas e áudios enviados

DADOS DISPONÍVEIS AGORA:
${context}

Data atual: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Responda em português. Seja objetivo, prático e específico com nomes dos atletas quando relevante.
Quando gerar planilhas de treino, use formato estruturado (dia, tipo, distância/tempo, ritmo).`;

    // Pre-process files
    const { textAdditions, imageBlocks, documentBlocks } = files.length > 0
      ? await this.preprocessFiles(files)
      : { textAdditions: [], imageBlocks: [], documentBlocks: [] };

    // Build user content — multimodal if files present
    let userContent: string | any[];
    if (imageBlocks.length > 0 || documentBlocks.length > 0 || textAdditions.length > 0) {
      userContent = [
        ...imageBlocks,
        ...documentBlocks,
        ...textAdditions.map((t) => ({ type: 'text', text: t })),
        { type: 'text', text: message },
      ];
    } else {
      userContent = message;
    }

    const updatedHistory: BrainMessage[] = [
      ...history.slice(-19),
      { role: 'user', content: userContent },
    ];

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session.id);
    res.setHeader('X-AI-Provider', provider);
    res.setHeader('X-AI-Model', model);
    res.flushHeaders();

    let fullResponse = '';

    try {
      // For multimodal content (images/PDFs), only Anthropic supports natively
      // For OpenAI, images are supported via image_url
      // For Gemini/Grok, fallback to text only
      if (provider === 'anthropic') {
        fullResponse = await this.streamAnthropic(apiKey, model, systemPrompt, updatedHistory, res);
      } else if (provider === 'openai') {
        // Convert history: for OpenAI, image blocks need image_url format
        // Simple fallback: send text only for non-text messages
        const openaiHistory: BrainMessage[] = updatedHistory.map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
            : m.content,
        }));
        fullResponse = await this.streamOpenAI(apiKey, model, systemPrompt, openaiHistory, res);
      } else if (provider === 'gemini') {
        const geminiHistory: BrainMessage[] = updatedHistory.map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
            : m.content,
        }));
        fullResponse = await this.streamGemini(apiKey, model, systemPrompt, geminiHistory, res);
      } else if (provider === 'grok') {
        const grokHistory: BrainMessage[] = updatedHistory.map((m) => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
            : m.content,
        }));
        fullResponse = await this.streamOpenAI(apiKey, model, systemPrompt, grokHistory, res, 'https://api.x.ai/v1');
      } else {
        fullResponse = await this.streamAnthropic(apiKey, model, systemPrompt, updatedHistory, res);
      }

      // Store assistant response as plain text in history
      const finalHistory: BrainMessage[] = [
        ...updatedHistory,
        { role: 'assistant', content: fullResponse },
      ];

      await this.prisma.coachBrainSession.update({
        where: { id: session.id },
        data: {
          messages: finalHistory,
          title: typeof finalHistory[0]?.content === 'string'
            ? finalHistory[0].content.slice(0, 80)
            : 'Nova conversa',
        },
      });

      res.write(`data: ${JSON.stringify({ done: true, sessionId: session.id, provider, model })}\n\n`);
    } catch (err: any) {
      this.logger.error(`CoachBrain multimodal [${provider}] error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: `Erro ao processar resposta (${providerInfo.label}): ${err.message?.slice(0, 120)}` })}\n\n`);
    } finally {
      res.end();
    }
  }

  // ─── AI Settings ──────────────────────────────────────────────────────────

  async getAISettings(coachId: string) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');

    return {
      provider: (coach.aiProvider ?? 'anthropic') as AIProvider,
      model: coach.aiModel ?? null,
      byok: coach.aiByok,
      hasApiKey: !!coach.aiApiKey,
      providerLabel: PROVIDER_DEFAULTS[(coach.aiProvider ?? 'anthropic') as AIProvider]?.label,
      defaultModel: PROVIDER_DEFAULTS[(coach.aiProvider ?? 'anthropic') as AIProvider]?.model,
      availableProviders: Object.entries(PROVIDER_DEFAULTS).map(([key, val]) => ({
        id: key,
        label: val.label,
        defaultModel: val.model,
        platformAvailable: !!this.getPlatformKey(key as AIProvider),
      })),
    };
  }

  async updateAISettings(
    coachId: string,
    dto: { provider: AIProvider; model?: string; byok: boolean; apiKey?: string },
  ) {
    const updateData: any = {
      aiProvider: dto.provider,
      aiModel: dto.model ?? null,
      aiByok: dto.byok,
    };

    if (dto.byok && dto.apiKey) {
      updateData.aiApiKey = encryptKey(dto.apiKey);
    } else if (!dto.byok) {
      updateData.aiApiKey = null; // clear key when switching to platform mode
    }

    await this.prisma.user.update({ where: { id: coachId }, data: updateData });
    return { updated: true };
  }

  async testConnection(coachId: string): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }> {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true },
    });
    if (!coach) throw new NotFoundException('Coach não encontrado');

    const provider = (coach.aiProvider ?? 'anthropic') as AIProvider;
    const model = coach.aiModel ?? PROVIDER_DEFAULTS[provider].model;
    const apiKey = this.resolveApiKey(provider, coach);

    const start = Date.now();

    try {
      switch (provider) {
        case 'openai': {
          const client = new OpenAI({ apiKey });
          await client.chat.completions.create({
            model,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ping' }],
          });
          break;
        }
        case 'gemini': {
          const genAI = new GoogleGenerativeAI(apiKey);
          const m = genAI.getGenerativeModel({ model });
          await m.generateContent('ping');
          break;
        }
        case 'grok': {
          const client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
          await client.chat.completions.create({
            model,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ping' }],
          });
          break;
        }
        default: {
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ping' }],
          });
        }
      }
      return { ok: true, provider, model, latencyMs: Date.now() - start };
    } catch (err: any) {
      throw new Error(`Conexão falhou (${PROVIDER_DEFAULTS[provider].label}): ${err.message?.slice(0, 200)}`);
    }
  }

  private getPlatformKey(provider: AIProvider): string | undefined {
    return {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai:    process.env.OPENAI_API_KEY,
      gemini:    process.env.GEMINI_API_KEY,
      grok:      process.env.GROK_API_KEY,
    }[provider];
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async getSessions(coachId: string) {
    return this.prisma.coachBrainSession.findMany({
      where: { coachId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  async getSession(coachId: string, sessionId: string) {
    const session = await this.prisma.coachBrainSession.findFirst({ where: { id: sessionId, coachId } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return session;
  }

  async deleteSession(coachId: string, sessionId: string) {
    await this.prisma.coachBrainSession.deleteMany({ where: { id: sessionId, coachId } });
    return { deleted: true };
  }

  // ─── AI Jobs ──────────────────────────────────────────────────────────────

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
    return this.prisma.aIJob.update({ where: { id: jobId }, data: { status: 'PENDING', error: null } });
  }

  // ─── Apply Plan from Chat ──────────────────────────────────────────────────

  async applyPlanFromChat(coachId: string, athleteId: string, planText: string): Promise<{ created: number }> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const parseResponse = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Extraia do seguinte texto de planilha de treino um array JSON de treinos.

Cada treino deve ter:
- date: "YYYY-MM-DD" (a partir de amanhã)
- type: string (ex: "Corrida Leve", "Intervalado", "Longão", "Descanso")
- distanceMeters: number | null (em metros)
- durationMinutes: number | null
- description: string (detalhes do treino)
- targetPace: string | null (ex: "5:30/km")

Responda APENAS com o JSON array, sem markdown, sem explicação.

Texto da planilha:
${planText}`
      }]
    });

    const jsonText = (parseResponse.content[0] as any).text.trim();
    const workouts = JSON.parse(jsonText);

    // Find or create a plan for this athlete
    let plan = await this.prisma.trainingPlan.findFirst({
      where: { coachId, athleteId, status: 'ACTIVE' },
    });

    if (!plan) {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);
      plan = await this.prisma.trainingPlan.create({
        data: {
          coachId,
          athleteId,
          name: `Plano IA — ${now.toLocaleDateString('pt-BR')}`,
          status: 'ACTIVE',
          startDate: now,
          endDate,
        },
      });
    }

    let created = 0;
    for (const w of workouts) {
      if (!w.date || w.type === 'Descanso') continue;
      await this.prisma.workout.create({
        data: {
          planId: plan.id,
          athleteId,
          type: 'EASY_RUN',
          title: w.type,
          description: w.description ?? null,
          scheduledDate: new Date(w.date),
          targetDistanceMeters: w.distanceMeters ?? null,
          targetDurationSeconds: w.durationMinutes ? w.durationMinutes * 60 : null,
          targetPace: w.targetPace ?? null,
          status: 'SCHEDULED',
        },
      });
      created++;
    }

    // Notify athlete
    await this.prisma.notification.create({
      data: {
        userId: athleteId,
        type: 'SYSTEM',
        title: '📋 Nova planilha criada',
        body: `Seu coach criou ${created} treinos para você via IA.`,
        data: { planId: plan.id },
      },
    }).catch(() => {});

    return { created };
  }

  async processFailedJobs(): Promise<void> {
    const failedJobs = await this.prisma.aIJob.findMany({
      where: { status: { in: ['FAILED', 'PENDING'] }, retries: { lt: 3 } },
      take: 10,
    });

    for (const job of failedJobs) {
      try {
        await this.prisma.aIJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', retries: { increment: 1 } },
        });
        await this.executeJob(job);
        await this.prisma.aIJob.update({ where: { id: job.id }, data: { status: 'SUCCESS' } });
      } catch (err: any) {
        const isMaxRetries = job.retries >= 2;
        await this.prisma.aIJob.update({
          where: { id: job.id },
          data: { status: isMaxRetries ? 'FAILED' : 'PENDING', error: err.message },
        });
        if (isMaxRetries && job.coachId) {
          await this.prisma.notification.create({
            data: {
              userId: job.coachId,
              type: 'SYSTEM',
              title: 'Tarefa de IA falhou',
              body: `O job "${job.type}" não pôde ser concluído após 3 tentativas.`,
              data: { jobId: job.id },
            },
          }).catch(() => {});
        }
      }
    }
  }

  private async executeJob(job: any): Promise<void> {
    switch (job.type) {
      case 'ONBOARDING_ANALYSIS':
      case 'ASSESSMENT_COMPARE':
        this.logger.log(`Retrying ${job.type} for job ${job.id}`);
        await new Promise(r => setTimeout(r, 1000));
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.type}`);
    }
  }
}
