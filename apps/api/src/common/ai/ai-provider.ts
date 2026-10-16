import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { decryptApiKey } from '../../modules/coach-brain/byok-crypto';

/**
 * Fonte única de verdade sobre provedores/modelos de IA e sobre a disponibilidade de chave
 * (chave da plataforma via env OU chave própria do treinador — BYOK).
 */

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'grok';

export const AI_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'gemini', 'grok'];

/** Modelos padrão por provedor — usados pelo backend e exibidos na UI (via /coach-brain/settings). */
export const PROVIDER_DEFAULTS: Record<AIProvider, { model: string; label: string }> = {
  anthropic: { model: 'claude-opus-4-6', label: 'Claude (Anthropic)' },
  openai: { model: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  gemini: { model: 'gemini-2.0-flash-exp', label: 'Gemini (Google)' },
  grok: { model: 'grok-3', label: 'Grok (xAI)' },
};

export const AI_NOT_CONFIGURED_MESSAGE = 'IA não configurada — adicione sua chave em Configurações > IA';
export const AI_NOT_CONFIGURED_CODE = 'AI_NOT_CONFIGURED';

/** 503 padronizado quando não há chave de IA (plataforma ou BYOK). */
export class AiNotConfiguredException extends ServiceUnavailableException {
  constructor(message: string = AI_NOT_CONFIGURED_MESSAGE) {
    super({ statusCode: 503, message, code: AI_NOT_CONFIGURED_CODE, error: 'Service Unavailable' });
  }
}

export interface AiCredentials {
  provider: AIProvider;
  apiKey: string;
  model: string;
  source: 'byok' | 'platform';
}

export function platformKey(provider: AIProvider): string | undefined {
  const raw = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    grok: process.env.GROK_API_KEY,
  }[provider];
  const v = (raw ?? '').trim();
  // Placeholders comuns de .env ('not-set', 'changeme', 'sk-...') não contam como chave
  if (!v || v.length < 10 || /^(not-set|changeme|xxx+|sk-\.\.\.)$/i.test(v)) return undefined;
  return v;
}

export function hasAnyPlatformKey(providers: AIProvider[] = AI_PROVIDERS): boolean {
  return providers.some((p) => !!platformKey(p));
}

interface CoachAiFields {
  aiProvider?: string | null;
  aiModel?: string | null;
  aiByok?: boolean | null;
  aiApiKey?: string | null;
}

/**
 * Resolve credenciais a partir dos campos do treinador (sem I/O).
 * Ordem: BYOK do treinador → chave da plataforma do provedor escolhido → primeira chave de plataforma disponível
 * entre `allowed`. Retorna null se nada estiver configurado.
 */
export function resolveFromCoach(coach: CoachAiFields | null | undefined, allowed: AIProvider[] = AI_PROVIDERS): AiCredentials | null {
  const chosen = (AI_PROVIDERS.includes(coach?.aiProvider as AIProvider) ? coach!.aiProvider : 'anthropic') as AIProvider;
  if (coach?.aiByok && coach.aiApiKey && allowed.includes(chosen)) {
    let key: string | null = null;
    try {
      key = decryptApiKey(coach.aiApiKey);
    } catch {
      key = null;
    }
    if (key) {
      return { provider: chosen, apiKey: key, model: coach.aiModel || PROVIDER_DEFAULTS[chosen].model, source: 'byok' };
    }
  }
  const order = [chosen, ...allowed.filter((p) => p !== chosen)].filter((p) => allowed.includes(p));
  for (const p of order) {
    const key = platformKey(p);
    if (key) {
      const model = p === chosen && coach?.aiModel ? coach.aiModel : PROVIDER_DEFAULTS[p].model;
      return { provider: p, apiKey: key, model, source: 'platform' };
    }
  }
  return null;
}

/** Carrega o treinador e resolve credenciais. `null` = IA não configurada. */
export async function resolveAiCredentials(prisma: any, userId: string | null | undefined, allowed: AIProvider[] = AI_PROVIDERS): Promise<AiCredentials | null> {
  let coach: CoachAiFields | null = null;
  if (userId && prisma?.user?.findUnique) {
    coach = await prisma.user
      .findUnique({ where: { id: userId }, select: { aiProvider: true, aiModel: true, aiByok: true, aiApiKey: true } })
      .catch(() => null);
  }
  return resolveFromCoach(coach, allowed);
}

/** Igual a resolveAiCredentials, mas lança 503 (AiNotConfiguredException) se não houver chave. */
export async function requireAiCredentials(prisma: any, userId: string | null | undefined, allowed: AIProvider[] = AI_PROVIDERS, message?: string): Promise<AiCredentials> {
  const creds = await resolveAiCredentials(prisma, userId, allowed);
  if (!creds) throw new AiNotConfiguredException(message);
  return creds;
}

/**
 * Converte erro cru do provedor em mensagem amigável em PT (nunca repassa JSON do provedor ao usuário).
 */
export function mapAiError(err: any): HttpException {
  if (err instanceof HttpException) return err;
  const status: number | undefined = err?.status ?? err?.statusCode ?? err?.response?.status;
  const raw = String(err?.message ?? '').toLowerCase();
  if (status === 401 || status === 403 || /invalid.*(api|x-api)[- ]?key|incorrect api key|authentication|api key not valid|permission/.test(raw)) {
    return new BadRequestException('Chave de IA inválida ou sem permissão. Verifique em Configurações > IA.');
  }
  if (status === 404 || /model.*(not found|does not exist)|not_found_error/.test(raw)) {
    return new BadRequestException('Modelo de IA não encontrado para este provedor. Ajuste o modelo em Configurações > IA.');
  }
  if (/credit balance|insufficient_quota|quota|billing/.test(raw)) {
    return new ServiceUnavailableException('Sua conta no provedor de IA está sem créditos ou cota. Verifique o plano do provedor.');
  }
  if (status === 429 || /rate limit|overloaded/.test(raw) || status === 529) {
    return new ServiceUnavailableException('O provedor de IA está sobrecarregado ou atingiu o limite de uso. Tente novamente em alguns minutos.');
  }
  return new ServiceUnavailableException('O serviço de IA está indisponível no momento. Tente novamente em instantes.');
}

/** Mensagem amigável (texto) para uso em SSE. */
export function friendlyAiErrorMessage(err: any): string {
  const ex = mapAiError(err);
  const res = ex.getResponse() as any;
  return typeof res === 'string' ? res : String(res?.message ?? ex.message);
}

export interface AiCompleteArgs {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

/** Completação de texto única, multi-provedor. Lança HttpException amigável em caso de falha. */
export async function aiComplete(creds: AiCredentials, args: AiCompleteArgs): Promise<string> {
  const maxTokens = args.maxTokens ?? 1000;
  try {
    switch (creds.provider) {
      case 'openai':
      case 'grok': {
        const client = new OpenAI({ apiKey: creds.apiKey, ...(creds.provider === 'grok' ? { baseURL: 'https://api.x.ai/v1' } : {}) });
        const r = await client.chat.completions.create({
          model: creds.model,
          max_tokens: maxTokens,
          messages: [
            ...(args.system ? [{ role: 'system' as const, content: args.system }] : []),
            { role: 'user' as const, content: args.prompt },
          ],
        });
        return r.choices[0]?.message?.content ?? '';
      }
      case 'gemini': {
        const genAI = new GoogleGenerativeAI(creds.apiKey);
        const m = genAI.getGenerativeModel({ model: creds.model, ...(args.system ? { systemInstruction: args.system } : {}) });
        const r = await m.generateContent(args.prompt);
        return r.response.text();
      }
      default: {
        const client = new Anthropic({ apiKey: creds.apiKey });
        const msg = await client.messages.create({
          model: creds.model,
          max_tokens: maxTokens,
          ...(args.system ? { system: args.system } : {}),
          messages: [{ role: 'user', content: args.prompt }],
        });
        const block = msg.content.find((b: any) => b.type === 'text') as any;
        return block?.text ?? '';
      }
    }
  } catch (err) {
    throw mapAiError(err);
  }
}
