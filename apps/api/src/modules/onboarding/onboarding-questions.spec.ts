import { OnboardingService } from './onboarding.service';

function svcWith(prisma: any) {
  // Apenas os métodos de perguntas do formulário usam prisma; demais dependências não são tocadas
  return new (OnboardingService as any)(prisma, {}, {}, {}, {}, {}, {}, {}) as OnboardingService;
}

describe('A5 — excluir pergunta do questionário', () => {
  const base = () => ({
    onboardingForm: { findUnique: jest.fn().mockResolvedValue({ id: 'form-1', coachId: 'coach-1' }) },
    onboardingQuestion: { update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) },
  });

  it('pergunta nunca respondida é excluída de vez', async () => {
    const prisma: any = { ...base(), $queryRaw: jest.fn().mockResolvedValue([{ c: 0 }]) };
    const r = await svcWith(prisma).deleteQuestion('coach-1', 'q-1');
    expect(r).toEqual({ deleted: true, removed: true });
    expect(prisma.onboardingQuestion.delete).toHaveBeenCalledWith({ where: { id: 'q-1', formId: 'form-1' } });
    expect(prisma.onboardingQuestion.update).not.toHaveBeenCalled();
  });

  it('pergunta já respondida é só desativada (preserva o histórico)', async () => {
    const prisma: any = { ...base(), $queryRaw: jest.fn().mockResolvedValue([{ c: 2 }]) };
    const r = await svcWith(prisma).deleteQuestion('coach-1', 'q-1');
    expect(r).toEqual({ deleted: true });
    expect(prisma.onboardingQuestion.delete).not.toHaveBeenCalled();
    expect(prisma.onboardingQuestion.update).toHaveBeenCalledWith({ where: { id: 'q-1', formId: 'form-1' }, data: { isActive: false } });
  });

  it('falha na checagem → caminho seguro (desativar)', async () => {
    const prisma: any = { ...base(), $queryRaw: jest.fn().mockRejectedValue(new Error('db')) };
    await svcWith(prisma).deleteQuestion('coach-1', 'q-1');
    expect(prisma.onboardingQuestion.delete).not.toHaveBeenCalled();
  });
});
