import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';
import { CoachBrainService } from '../coach-brain/coach-brain.service';
import { AiTrainingService } from '../ai-training/ai-training.service';
import { AI_NOT_CONFIGURED_MESSAGE } from '../../common/ai/ai-provider';

const KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY'];
const coach = { id: 'coach-1', role: 'COACH' };

function prismaNoKey() {
  return {
    athleteProfile: {
      findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }),
      count: jest.fn().mockResolvedValue(3),
    },
    teamMember: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'coach-1', name: 'C', aiProvider: 'anthropic', aiModel: null, aiByok: false, aiApiKey: null }),
      findFirst: jest.fn(),
    },
    aIAssistantConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    trainingPlan: { findFirst: jest.fn(), create: jest.fn() },
    workout: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

function expect503(err: any) {
  expect(err).toBeInstanceOf(ServiceUnavailableException);
  expect((err as HttpException).getStatus()).toBe(503);
  expect(((err as HttpException).getResponse() as any).message).toBe(AI_NOT_CONFIGURED_MESSAGE);
}

describe('A3 — endpoints de IA sem chave respondem 503 (e não 500)', () => {
  const saved = { ...process.env };
  beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
  afterAll(() => { process.env = saved; });

  it('POST /ai-assistant/chat: 503 ANTES de abrir o stream', async () => {
    const svc = new AiAssistantService(prismaNoKey());
    const ctrl = new AiAssistantController(svc);
    const res: any = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    const err = await ctrl.streamChat(coach, { message: 'oi' } as any, res).catch((e) => e);
    expect503(err);
    expect(res.flushHeaders).not.toHaveBeenCalled();
  });

  it('chat: atleta alheio continua 404 (posse checada antes da chave)', async () => {
    const prisma = prismaNoKey();
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'other', teamId: null });
    const ctrl = new AiAssistantController(new AiAssistantService(prisma));
    const res: any = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
    await expect(ctrl.streamChat(coach, { message: 'oi', athleteId: 'victim' } as any, res)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET /ai-assistant/insight e POST /ai-assistant/generate-plan: 503', async () => {
    const svc = new AiAssistantService(prismaNoKey());
    expect503(await svc.getInsight('coach-1').catch((e) => e));
    expect503(await svc.generatePlan(coach, { athleteId: 'ath-1', durationWeeks: 8, goal: '10K' } as any).catch((e) => e));
  });

  it('GET /ai-assistant/status informa configured=false com a mensagem', async () => {
    const svc = new AiAssistantService(prismaNoKey());
    await expect(svc.getAiStatus('coach-1')).resolves.toEqual({ configured: false, message: AI_NOT_CONFIGURED_MESSAGE });
  });

  it('stream sem chave (chamada direta ao service) envia evento de erro amigável, nunca texto cru', async () => {
    const svc = new AiAssistantService(prismaNoKey());
    const writes: string[] = [];
    const res: any = { headersSent: true, setHeader: jest.fn(), flushHeaders: jest.fn(), write: (s: string) => writes.push(s), end: jest.fn() };
    await svc.streamToResponse(coach, { message: 'oi' } as any, res);
    const events = writes.map((w) => JSON.parse(w.replace(/^data: /, '').trim()));
    expect(events[0]).toEqual({ type: 'error', code: 'AI_NOT_CONFIGURED', content: AI_NOT_CONFIGURED_MESSAGE });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  });

  it('POST /coach-brain/settings/test: 503 (antes: 500)', async () => {
    const svc = new CoachBrainService(prismaNoKey());
    expect503(await svc.testConnection('coach-1').catch((e) => e));
  });

  it('POST /coach-brain/apply-plan: 503 sem gravar nada', async () => {
    const prisma = prismaNoKey();
    const svc = new CoachBrainService(prisma);
    expect503(await svc.applyPlanFromChat(coach, 'ath-1', '2026-11-03 corrida leve 5km').catch((e) => e));
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });

  it('GET /coach-brain/settings: configured=false', async () => {
    const svc = new CoachBrainService(prismaNoKey());
    const s: any = await svc.getAISettings('coach-1');
    expect(s.configured).toBe(false);
    expect(s.availableProviders.every((p: any) => p.platformAvailable === false)).toBe(true);
    expect(s.defaultModel).toBe('claude-opus-4-6');
  });

  it('coach-brain chat sem chave: evento SSE com a mensagem padrão', async () => {
    const svc = new CoachBrainService(prismaNoKey());
    const writes: string[] = [];
    const res: any = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: (s: string) => writes.push(s), end: jest.fn() };
    await svc.chatStream('coach-1', null, 'oi', res);
    expect(JSON.parse(writes[0].replace(/^data: /, ''))).toEqual({ error: AI_NOT_CONFIGURED_MESSAGE });
  });
});

describe('B11 — gerador de planilha sem IA não se diz "gerado por IA"', () => {
  const saved = { ...process.env };
  beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
  afterAll(() => { process.env = saved; });

  it('descrição por regras e generator=rules; datas ao meio-dia UTC', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      user: {
        findUnique: jest.fn(async ({ select }: any) =>
          select ? { aiProvider: 'anthropic', aiByok: false, aiApiKey: null, aiModel: null }
            : { id: 'ath-1', name: 'Ana', dateOfBirth: null, athleteProfile: { level: 'INTERMEDIATE', weeklyGoalKm: 30 } }),
      },
      workoutResult: { findMany: jest.fn().mockResolvedValue([]) },
      onboardingProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      trainingPlan: { create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })) },
      workout: { create: jest.fn().mockResolvedValue({}) },
    };
    const svc = new AiTrainingService(prisma);
    const r: any = await svc.generatePlan(coach, { athleteId: 'ath-1', weeks: 4, goal: 'BASE_BUILDING' as any, startDate: '2026-11-02' });
    expect(r.generator).toBe('rules');
    expect(r.planDescription).not.toMatch(/gerado por IA/i);
    const plan = prisma.trainingPlan.create.mock.calls[0][0].data;
    expect(plan.startDate.toISOString()).toBe('2026-11-02T12:00:00.000Z');
    expect(plan.endDate.toISOString()).toBe('2026-11-29T12:00:00.000Z');
    for (const c of prisma.workout.create.mock.calls) {
      expect(c[0].data.scheduledDate.toISOString()).toMatch(/T12:00:00\.000Z$/);
    }
  });
});
