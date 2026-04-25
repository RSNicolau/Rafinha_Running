import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class AthleteDocumentsService {
  private readonly logger = new Logger(AthleteDocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  async uploadDocument(
    athleteId: string,
    coachId: string,
    file: Express.Multer.File,
    category: string = 'general',
    description?: string,
  ) {
    const fileType = this.uploads.categorizeFile(file.mimetype);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `athlete-docs/${athleteId}/${Date.now()}_${safeName}`;

    const fileUrl = await this.uploads.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      path,
    );

    const doc = await this.prisma.athleteDocument.create({
      data: {
        athleteId,
        coachId,
        fileName: file.originalname,
        fileUrl,
        fileType,
        fileSizeKb: Math.round(file.size / 1024),
        category,
        description,
        uploadedBy: athleteId,
        aiStatus: 'PENDING',
      },
    });

    // Fire-and-forget AI analysis
    this.analyzeDocument(doc.id).catch((err) =>
      this.logger.error(`AI analysis error for doc ${doc.id}: ${err.message}`),
    );

    return doc;
  }

  async analyzeDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.athleteDocument.findUnique({
      where: { id: documentId },
      include: {
        athlete: { select: { name: true } },
        coach: { select: { name: true } },
      },
    });

    if (!doc) return;

    await this.prisma.athleteDocument.update({
      where: { id: documentId },
      data: { aiStatus: 'PROCESSING' },
    });

    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');

      const client = new Anthropic({ apiKey: anthropicKey });
      const systemPrompt = `Você é especialista em medicina esportiva e treinamento de corrida.
Analise este documento enviado pelo atleta ${doc.athlete.name} para o coach ${doc.coach.name}.
Categoria: ${doc.category}

Forneça:
1. RESUMO: O que o documento contém
2. ACHADOS IMPORTANTES: Métricas, valores, resultados relevantes
3. IMPACTO NO TREINO: Como isso afeta a prescrição de treino
4. RECOMENDAÇÕES: Ações concretas para o coach (ajustes de carga, consultas médicas, etc.)

Seja técnico e objetivo. Responda em português.`;

      let aiAnalysis: string;

      if (doc.fileType === 'image') {
        // Fetch image and encode to base64
        const response = await fetch(doc.fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';

        const message = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType as any, data: base64 },
                },
                { type: 'text', text: 'Analise este documento do atleta.' },
              ],
            },
          ],
        });

        aiAnalysis = message.content[0].type === 'text' ? message.content[0].text : 'Análise não disponível';
      } else if (doc.fileType === 'pdf') {
        // Fetch PDF and encode to base64
        const response = await fetch(doc.fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');

        const message = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                } as any,
                { type: 'text', text: 'Analise este documento do atleta.' },
              ],
            },
          ],
        });

        aiAnalysis = message.content[0].type === 'text' ? message.content[0].text : 'Análise não disponível';
      } else if (doc.fileType === 'excel') {
        // Excel: download, parse with xlsx
        const response = await fetch(doc.fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const XLSX = require('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const sheets = wb.SheetNames.map((name: string) => {
          const ws = wb.Sheets[name];
          return `=== ${name} ===\n${XLSX.utils.sheet_to_csv(ws)}`;
        }).join('\n\n');

        const message = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `[Planilha Excel: ${doc.fileName}]\n${sheets.slice(0, 8000)}\n\nAnalise esta planilha do atleta.`,
            },
          ],
        });

        aiAnalysis = message.content[0].type === 'text' ? message.content[0].text : 'Análise não disponível';
      } else if (doc.fileType === 'audio') {
        // Audio: transcribe with Whisper then analyze
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) throw new Error('OPENAI_API_KEY not configured for audio transcription');

        const openai = new OpenAI({ apiKey: openaiKey });
        const response = await fetch(doc.fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const { File } = await import('node:buffer');
        const audioFile = new File([buffer], doc.fileName, { type: 'audio/mpeg' });

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile as any,
          model: 'whisper-1',
          language: 'pt',
        });

        const message = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `[Áudio transcrito: ${doc.fileName}]\n${transcription.text}\n\nAnalise este áudio do atleta.`,
            },
          ],
        });

        aiAnalysis = message.content[0].type === 'text' ? message.content[0].text : 'Análise não disponível';
      } else {
        aiAnalysis = 'Análise automática não disponível para este tipo de arquivo. Revisão manual necessária.';
      }

      await this.prisma.athleteDocument.update({
        where: { id: documentId },
        data: { aiAnalysis, aiStatus: 'DONE' },
      });

      // Notify coach
      await this.prisma.notification.create({
        data: {
          userId: doc.coachId,
          type: 'SYSTEM',
          title: `📎 ${doc.athlete.name} enviou um documento`,
          body: `${doc.category}: ${doc.fileName} — análise IA disponível`,
          data: { documentId: doc.id, athleteId: doc.athleteId } as any,
        },
      });
    } catch (err: any) {
      this.logger.error(`AI analysis failed for doc ${documentId}: ${err.message}`);
      await this.prisma.athleteDocument.update({
        where: { id: documentId },
        data: { aiStatus: 'FAILED' },
      });
    }
  }

  async getDocumentsByAthlete(athleteId: string, coachId: string) {
    return this.prisma.athleteDocument.findMany({
      where: { athleteId, coachId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyDocuments(athleteId: string) {
    return this.prisma.athleteDocument.findMany({
      where: { athleteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocument(id: string, requesterId: string) {
    const doc = await this.prisma.athleteDocument.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true } },
        coach: { select: { id: true, name: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.athleteId !== requesterId && doc.coachId !== requesterId) {
      throw new ForbiddenException('Acesso negado');
    }
    return doc;
  }

  async reanalyze(documentId: string, coachId: string) {
    const doc = await this.prisma.athleteDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.coachId !== coachId) throw new ForbiddenException('Acesso negado');

    await this.prisma.athleteDocument.update({
      where: { id: documentId },
      data: { aiStatus: 'PENDING', aiAnalysis: null },
    });

    this.analyzeDocument(documentId).catch((err) =>
      this.logger.error(`Reanalysis error for doc ${documentId}: ${err.message}`),
    );

    return { queued: true, documentId };
  }
}
