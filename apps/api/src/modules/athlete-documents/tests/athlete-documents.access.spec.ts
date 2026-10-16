import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AthleteDocumentsService, DOC_AI_UNAVAILABLE } from '../athlete-documents.service';

const KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY'];

/**
 * Cenário do relatório (A6): o documento foi enviado quando a atleta era do ASSISTENTE (doc.coachId),
 * e hoje ela é do DONO (athleteProfile.coachId = owner).
 */
function setup() {
  const doc = { id: 'd1', athleteId: 'ath-1', coachId: 'assistant', fileUrl: 'athlete-docs/ath-1/r.pdf', fileName: 'exame.pdf', fileType: 'pdf', category: 'exam', athlete: { name: 'Bia' }, coach: { name: 'Assistente' } };
  const prisma: any = {
    athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'owner', teamId: null }) },
    teamMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ aiProvider: 'anthropic', aiByok: false, aiApiKey: null, aiModel: null }) },
    athleteDocument: {
      findUnique: jest.fn().mockResolvedValue(doc),
      findMany: jest.fn().mockResolvedValue([doc]),
      update: jest.fn().mockResolvedValue({}),
    },
    notification: { create: jest.fn() },
  };
  const uploads: any = {
    getPrivateSignedUrl: jest.fn(async () => 'https://signed/x'),
    readPrivate: jest.fn(async () => ({ buffer: Buffer.from('%PDF'), mime: 'application/pdf' })),
  };
  return { svc: new AthleteDocumentsService(prisma, uploads), prisma, uploads, doc };
}

describe('A6 — acesso a documentos segue o vínculo ATUAL do atleta', () => {
  const saved = { ...process.env };
  beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
  afterAll(() => { process.env = saved; });

  const OWNER = { id: 'owner', role: 'COACH' };
  const OLD = { id: 'assistant', role: 'COACH' };

  it('ex-treinador (quem recebeu o upload) perde acesso: detalhe, download e análise = 404', async () => {
    const { svc, uploads, prisma } = setup();
    await expect(svc.getDocument('d1', OLD)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.downloadDocument('d1', OLD)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reanalyze('d1', OLD)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getDocumentsByAthlete('ath-1', OLD)).rejects.toBeInstanceOf(NotFoundException);
    expect(uploads.readPrivate).not.toHaveBeenCalled();
    expect(prisma.athleteDocument.update).not.toHaveBeenCalled();
  });

  it('treinador atual vê todos os documentos do atleta e baixa', async () => {
    const { svc, prisma, uploads } = setup();
    const list = await svc.getDocumentsByAthlete('ath-1', OWNER);
    expect(prisma.athleteDocument.findMany.mock.calls[0][0].where).toEqual({ athleteId: 'ath-1' });
    expect(list).toHaveLength(1);
    const dl = await svc.downloadDocument('d1', OWNER);
    expect(dl.fileName).toBe('exame.pdf');
    expect(uploads.readPrivate).toHaveBeenCalled();
  });

  it('treinador atual pode pedir análise (antes: 403); sem chave → 503 claro, sem marcar "Erro"', async () => {
    const { svc, prisma } = setup();
    const err: any = await svc.reanalyze('d1', OWNER).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.getResponse().message).toMatch(/^IA não configurada — adicione sua chave em Configurações > IA/);
    expect(prisma.athleteDocument.update).not.toHaveBeenCalled();
  });

  it('upload sem chave de IA: análise automática marca UNAVAILABLE (não FAILED)', async () => {
    const { svc, prisma } = setup();
    await svc.analyzeDocument('d1');
    expect(prisma.athleteDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { aiStatus: DOC_AI_UNAVAILABLE } });
  });

  it('o próprio atleta continua acessando o seu documento', async () => {
    const { svc } = setup();
    await expect(svc.getDocument('d1', { id: 'ath-1', role: 'ATHLETE' })).resolves.toBeTruthy();
  });
});
