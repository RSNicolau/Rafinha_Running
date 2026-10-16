import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AthleteDocumentsService } from '../athlete-documents.service';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)]);

function setup(doc?: any) {
  const prisma: any = {
    athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1' }) },
    athleteDocument: {
      create: jest.fn(async ({ data }: any) => ({ id: 'd1', ...data })),
      findUnique: jest.fn().mockResolvedValue(doc ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
  const uploads: any = {
    validateDocument: jest.fn(() => ({ mime: 'application/pdf', ext: 'pdf', kind: 'pdf' })),
    uploadPrivate: jest.fn(async (_b: Buffer, p: string) => p),
    randomName: jest.fn(() => 'rand.pdf'),
    getPrivateSignedUrl: jest.fn(async () => 'https://signed.example/x?token=1'),
    readPrivate: jest.fn(),
  };
  const svc = new AthleteDocumentsService(prisma, uploads);
  jest.spyOn(svc, 'analyzeDocument').mockResolvedValue(undefined);
  return { svc, prisma, uploads };
}

describe('H8 — athlete documents', () => {
  it('coachId vem do vínculo do atleta (corpo ignorado) e grava caminho privado', async () => {
    const { svc, prisma } = setup();
    const res: any = await svc.uploadDocument(
      { id: 'ath-1', role: 'ATHLETE' },
      { buffer: PDF, size: PDF.length, originalname: 'exame.pdf', mimetype: 'application/pdf' } as any,
      { category: 'exam', coachId: 'evil-coach' } as any,
    );
    const data = prisma.athleteDocument.create.mock.calls[0][0].data;
    expect(data.coachId).toBe('coach-1');
    expect(data.fileUrl).toBe('athlete-docs/ath-1/rand.pdf');
    expect(res.fileUrl).toBe('https://signed.example/x?token=1');
  });

  it('atleta sem coach não envia', async () => {
    const { svc, prisma } = setup();
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: null });
    await expect(svc.uploadDocument({ id: 'a', role: 'ATHLETE' }, { buffer: PDF, size: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coach não envia documento para atleta de outro coach', async () => {
    const { svc, prisma } = setup();
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'other' });
    await expect(
      svc.uploadDocument({ id: 'coach-1', role: 'COACH' }, { buffer: PDF, size: 1 } as any, { athleteId: 'victim' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leitura: terceiro não obtém URL assinada; dono obtém', async () => {
    const doc = { id: 'd1', athleteId: 'ath-1', coachId: 'coach-1', fileUrl: 'athlete-docs/ath-1/r.pdf', fileName: 'r.pdf' };
    const { svc, uploads } = setup(doc);
    await expect(svc.getDocument('d1', { id: 'intruder', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
    expect(uploads.getPrivateSignedUrl).not.toHaveBeenCalled();
    const ok: any = await svc.getDocument('d1', { id: 'ath-1', role: 'ATHLETE' });
    expect(ok.fileUrl).toContain('signed');
    await expect(svc.downloadDocument('d1', { id: 'intruder', role: 'ATHLETE' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('coach lista documentos somente de atleta próprio', async () => {
    const { svc, prisma } = setup();
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'other' });
    await expect(svc.getDocumentsByAthlete('victim', { id: 'coach-1', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
