import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AiNotConfiguredException,
  mapAiError,
  platformKey,
  requireAiCredentials,
  resolveFromCoach,
} from './ai-provider';
import { encryptApiKey } from '../../modules/coach-brain/byok-crypto';

const KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY'];

describe('ai-provider — disponibilidade de chave', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
    process.env.API_KEY_ENCRYPTION_SECRET = 'test-secret-for-byok-123456';
  });
  afterAll(() => { process.env = saved; });

  it('sem chave da plataforma nem BYOK → null / 503 com mensagem em PT', async () => {
    expect(resolveFromCoach({ aiProvider: 'anthropic', aiByok: false, aiApiKey: null })).toBeNull();
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ aiProvider: 'openai', aiByok: false }) } };
    const err: any = await requireAiCredentials(prisma, 'coach-1').catch((e) => e);
    expect(err).toBeInstanceOf(AiNotConfiguredException);
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse().message).toBe(AI_NOT_CONFIGURED_MESSAGE);
  });

  it('placeholders de .env não contam como chave', () => {
    process.env.OPENAI_API_KEY = 'not-set';
    process.env.ANTHROPIC_API_KEY = '';
    expect(platformKey('openai')).toBeUndefined();
    expect(platformKey('anthropic')).toBeUndefined();
  });

  it('BYOK do treinador tem prioridade e respeita provedor/modelo escolhidos', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key-xxxxx';
    const creds = resolveFromCoach({ aiProvider: 'openai', aiModel: 'gpt-4o-mini', aiByok: true, aiApiKey: encryptApiKey('sk-coach-own-key-1234') });
    expect(creds).toEqual({ provider: 'openai', apiKey: 'sk-coach-own-key-1234', model: 'gpt-4o-mini', source: 'byok' });
  });

  it('sem BYOK: usa a chave da plataforma do provedor escolhido; senão cai para outra disponível', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key-xxxxx';
    expect(resolveFromCoach({ aiProvider: 'anthropic' })).toMatchObject({ provider: 'anthropic', source: 'platform', model: 'claude-opus-4-6' });
    expect(resolveFromCoach({ aiProvider: 'gemini' })).toMatchObject({ provider: 'anthropic', source: 'platform' });
    expect(resolveFromCoach({ aiProvider: 'gemini' }, ['gemini'])).toBeNull();
  });

  it('BYOK corrompido não quebra (cai para plataforma ou null)', () => {
    expect(resolveFromCoach({ aiProvider: 'anthropic', aiByok: true, aiApiKey: 'lixo' })).toBeNull();
  });
});

describe('ai-provider — erros do provedor viram mensagens amigáveis (B11)', () => {
  it('401/chave inválida → 400 em PT, sem JSON cru', () => {
    const e = mapAiError(Object.assign(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'), { status: 401 }));
    expect(e).toBeInstanceOf(BadRequestException);
    expect(String((e.getResponse() as any).message)).toMatch(/Chave de IA inválida/);
    expect(String((e.getResponse() as any).message)).not.toMatch(/x-api-key|\{/);
  });

  it('429/sobrecarga → 503; modelo inexistente → 400; desconhecido → 503 genérico', () => {
    expect(mapAiError({ status: 429, message: 'rate limit' })).toBeInstanceOf(ServiceUnavailableException);
    expect(mapAiError({ status: 404, message: 'model not found' })).toBeInstanceOf(BadRequestException);
    const g = mapAiError(new Error('socket hang up'));
    expect(g.getStatus()).toBe(503);
    expect(String((g.getResponse() as any).message)).toMatch(/indisponível/);
  });
});
