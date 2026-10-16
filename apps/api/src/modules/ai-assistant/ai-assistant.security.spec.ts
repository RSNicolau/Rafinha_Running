import { NotFoundException } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiTrainingService } from '../ai-training/ai-training.service';
import { CoachBrainService } from '../coach-brain/coach-brain.service';

const coach = { id: 'coach-1', role: 'COACH' };

function prismaWithOwner(owner: string | null) {
  return {
    athleteProfile: { findUnique: jest.fn().mockResolvedValue(owner ? { coachId: owner } : null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'victim', name: 'V', email: 'v@x', athleteProfile: {} }), findUnique: jest.fn() },
    workout: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    trainingPlan: { findFirst: jest.fn(), create: jest.fn() },
    aIAssistantConfig: { findUnique: jest.fn() },
  } as any;
}

describe('H1 — IA escopada ao tenant do coach', () => {
  it('ai-assistant: ferramenta não lê atleta de outro coach', async () => {
    const prisma = prismaWithOwner('other-coach');
    const svc = new AiAssistantService(prisma);
    const out = await (svc as any).executeTool('get_athlete_profile', { athleteId: 'victim' }, coach);
    expect(JSON.parse(out)).toEqual({ error: 'Atleta não encontrado' });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    const out2 = await (svc as any).executeTool('get_workout_history', { athleteId: 'victim' }, coach);
    expect(JSON.parse(out2).error).toBeDefined();
    expect(prisma.workout.findMany).not.toHaveBeenCalled();
  });

  it('ai-assistant: ferramenta funciona para atleta do próprio coach', async () => {
    const prisma = prismaWithOwner('coach-1');
    const svc = new AiAssistantService(prisma);
    const out = JSON.parse(await (svc as any).executeTool('get_athlete_profile', { athleteId: 'mine' }, coach));
    expect(out.id).toBe('victim');
  });

  it('ai-assistant: generatePlan bloqueia atleta alheio', async () => {
    const svc = new AiAssistantService(prismaWithOwner('other-coach'));
    await expect(svc.generatePlan(coach, { athleteId: 'victim', durationWeeks: 8, goal: '10K' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ai-training: generatePlan bloqueia atleta alheio', async () => {
    const prisma = prismaWithOwner('other-coach');
    const svc = new AiTrainingService(prisma);
    await expect(svc.generatePlan(coach, { athleteId: 'victim', weeks: 8, goal: 'BASE_BUILDING' as any })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('coach-brain: applyPlanFromChat bloqueia atleta alheio antes de chamar IA/gravar', async () => {
    const prisma = prismaWithOwner('other-coach');
    const svc = new CoachBrainService(prisma);
    await expect(svc.applyPlanFromChat(coach, 'victim', 'texto')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });

  it('ADMIN é liberado (cross-tenant)', async () => {
    const prisma = prismaWithOwner('other-coach');
    const svc = new AiAssistantService(prisma);
    await expect(svc.assertAthleteAccess({ id: 'adm', role: 'ADMIN' }, 'victim')).resolves.toBeUndefined();
  });
});
