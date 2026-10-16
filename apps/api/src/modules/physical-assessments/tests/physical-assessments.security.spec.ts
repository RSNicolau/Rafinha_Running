import { NotFoundException, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { AI_NOT_CONFIGURED_MESSAGE } from '../../../common/ai/ai-provider';
import { PhysicalAssessmentsService } from '../physical-assessments.service';
import { UpdateAssessmentDto } from '../dto/assessment.dto';

describe('H2 — physical-assessments update', () => {
  it('DTO rejeita athleteId/coachId/aiAnalysis (forbidNonWhitelisted)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(
      pipe.transform({ weightKg: 70, athleteId: 'x', coachId: 'y', aiAnalysis: 'z' }, { type: 'body', metatype: UpdateAssessmentDto }),
    ).rejects.toBeDefined();
    await expect(pipe.transform({ weightKg: 70 }, { type: 'body', metatype: UpdateAssessmentDto })).resolves.toBeTruthy();
  });

  it('service ignora campos proibidos mesmo se chegarem', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      physicalAssessment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pa', athleteId: 'ath-1', coachId: 'old-coach', best5kTime: null, best10kTime: null, maxHR: null }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = new PhysicalAssessmentsService(prisma);
    await svc.update('coach-1', 'pa', { weightKg: 70, athleteId: 'evil', coachId: 'evil', aiAnalysis: 'fake' } as any);
    const data = prisma.physicalAssessment.update.mock.calls[0][0].data;
    expect(data.weightKg).toBe(70);
    expect(data.athleteId).toBeUndefined();
    expect(data.coachId).toBeUndefined();
    expect(data.aiAnalysis).toBeUndefined();
  });

  it('coach não atualiza avaliação de atleta que não é (mais) dele — acesso pelo vínculo ATUAL', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      physicalAssessment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pa', athleteId: 'ath-1', coachId: 'coach-2' }),
        update: jest.fn(),
      },
    };
    const svc = new PhysicalAssessmentsService(prisma);
    // coach-2 criou a avaliação, mas o atleta hoje é do coach-1
    await expect(svc.update('coach-2', 'pa', { weightKg: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.physicalAssessment.update).not.toHaveBeenCalled();
  });

  it('avaliação inexistente → 404', async () => {
    const prisma: any = { physicalAssessment: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const svc = new PhysicalAssessmentsService(prisma);
    await expect(svc.update('coach-1', 'pa', { weightKg: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Comparar com IA sem chave (M1)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROK_API_KEY;
  });
  afterAll(() => { process.env = saved; });

  it('retorna 503 com mensagem clara (antes: 500)', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      user: {
        findUnique: jest.fn(async ({ select }: any) =>
          select ? { aiProvider: 'anthropic', aiModel: null, aiByok: false, aiApiKey: null } : { id: 'ath-1', name: 'Ana' }),
      },
      physicalAssessment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a2', assessedAt: new Date('2026-10-15T12:00:00Z'), weightKg: 70 },
          { id: 'a1', assessedAt: new Date('2026-09-15T12:00:00Z'), weightKg: 72 },
        ]),
        update: jest.fn(),
      },
    };
    const svc = new PhysicalAssessmentsService(prisma);
    const err: any = await svc.compareWithAI({ id: 'coach-1', role: 'COACH' }, 'ath-1').catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.getStatus()).toBe(503);
    expect((err.getResponse() as any).message).toBe(AI_NOT_CONFIGURED_MESSAGE);
    expect(prisma.physicalAssessment.update).not.toHaveBeenCalled();
  });
});

describe('Zonas de pace (B1)', () => {
  it('nunca formata "m:60" (arredonda o total antes de separar)', () => {
    const svc = new PhysicalAssessmentsService({} as any);
    const fmt = (sec: number) => (svc as any).secondsToMMSS(sec);
    expect(fmt(359.6)).toBe('6:00');
    expect(fmt(359.4)).toBe('5:59');
    expect(fmt(330)).toBe('5:30');
    for (let v = 200; v < 600; v += 0.37) expect(fmt(v)).not.toMatch(/:60$/);
  });
});
