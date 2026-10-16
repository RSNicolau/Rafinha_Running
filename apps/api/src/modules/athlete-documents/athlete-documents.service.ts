import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { assertCoachOwnsAthlete, AuthUserLike, isPlatformAdmin } from '../../common/utils/ownership';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { AiNotConfiguredException, PROVIDER_DEFAULTS, platformKey, resolveAiCredentials, AiCredentials, mapAiError } from '../../common/ai/ai-provider';

/** Mensagem quando não há chave capaz de ler PDF/imagem (Claude). */
export const DOC_AI_NOT_CONFIGURED_MESSAGE =
  'IA não configurada — adicione sua chave em Configurações > IA (a análise de documentos usa Claude/Anthropic)';
/** aiStatus quando a análise não pôde rodar por falta de chave de IA (UI mostra "IA indisponível", não "Erro"). */
export const DOC_AI_UNAVAILABLE = 'UNAVAILABLE';

@Injectable()
export class AthleteDocumentsService {
  private readonly logger = new Logger(AthleteDocumentsService.name);
  /** Última falha de análise por documento (mensagem amigável, em memória). */
  private readonly lastErrors = new Map<string, HttpException>();

  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  /**
   * Upload para armazenamento PRIVADO. Tipo real validado por magic bytes (PDF/JPEG/PNG/WEBP, ≤15MB);
   * nome no storage é aleatório; coachId vem do vínculo do atleta (nunca do corpo).
   */
  async uploadDocument(user: AuthUserLike, file: Express.Multer.File, dto: UploadDocumentDto = {}) {
    const detected = this.uploads.validateDocument(file);

    let athleteId: string;
    let coachId: string;
    if (user.role === 'ATHLETE') {
      athleteId = user.id;
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: athleteId },
        select: { coachId: true },
      });
      if (!profile?.coachId) throw new BadRequestException('Você precisa estar vinculado a um treinador para enviar documentos');
      coachId = profile.coachId;
    } else {
      if (!dto.athleteId) throw new BadRequestException('athleteId é obrigatório');
      athleteId = dto.athleteId;
      await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false, healthData: true });
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: athleteId },
        select: { coachId: true },
      });
      if (!profile?.coachId) throw new BadRequestException('Atleta sem treinador vinculado');
      coachId = profile.coachId;
    }

    const storagePath = `athlete-docs/${athleteId}/${this.uploads.randomName(detected.ext)}`;
    const stored = await this.uploads.uploadPrivate(file.buffer, storagePath, detected.mime);
    const displayName = (file.originalname || `documento.${detected.ext}`).replace(/[\u0000-\u001f<>"\\/]/g, '_').slice(0, 200);

    const doc = await this.prisma.athleteDocument.create({
      data: {
        athleteId,
        coachId,
        fileName: displayName,
        fileUrl: stored, // caminho no storage privado (não é URL pública)
        fileType: detected.kind,
        fileSizeKb: Math.round(file.size / 1024),
        category: dto.category ?? 'general',
        description: dto.description,
        uploadedBy: user.id,
        aiStatus: 'PENDING',
      },
    });

    // Fire-and-forget AI analysis (se não houver chave, fica marcado como IA indisponível)
    this.analyzeDocument(doc.id).catch((err) =>
      this.logger.error(`AI analysis error for doc ${doc.id}: ${err.message}`),
    );

    return this.withSignedUrl(doc);
  }

  /** Substitui fileUrl (caminho privado / URL pública legada) por URL assinada de 300s. */
  private async withSignedUrl<T extends { fileUrl: string }>(doc: T): Promise<T> {
    const signed = await this.uploads.getPrivateSignedUrl(doc.fileUrl).catch(() => null);
    return { ...doc, fileUrl: signed ?? '' };
  }

  private async withSignedUrls<T extends { fileUrl: string }>(docs: T[]): Promise<T[]> {
    return Promise.all(docs.map((d) => this.withSignedUrl(d)));
  }

  private async loadBytes(doc: { fileUrl: string }): Promise<{ buffer: Buffer; mime: string }> {
    return this.uploads.readPrivate(doc.fileUrl);
  }

  /**
   * Credenciais Anthropic (único provedor aqui com leitura nativa de PDF/imagem): BYOK do treinador ATUAL do atleta
   * (ou de quem pediu a análise) se o provedor dele for Anthropic; senão a chave da plataforma.
   */
  private async docAiCredentials(requesterId?: string | null, athleteId?: string): Promise<AiCredentials | null> {
    const ids: string[] = [];
    if (requesterId) ids.push(requesterId);
    if (athleteId) {
      const profile = await this.prisma.athleteProfile.findUnique({ where: { userId: athleteId }, select: { coachId: true } }).catch(() => null);
      if (profile?.coachId && !ids.includes(profile.coachId)) ids.push(profile.coachId);
    }
    for (const id of ids) {
      const c = await resolveAiCredentials(this.prisma, id, ['anthropic']);
      if (c) return c;
    }
    const key = platformKey('anthropic');
    return key ? { provider: 'anthropic', apiKey: key, model: PROVIDER_DEFAULTS.anthropic.model, source: 'platform' } : null;
  }

  async analyzeDocument(documentId: string, requesterId?: string): Promise<void> {
    const doc = await this.prisma.athleteDocument.findUnique({
      where: { id: documentId },
      include: {
        athlete: { select: { name: true } },
        coach: { select: { name: true } },
      },
    });

    if (!doc) return;

    const creds = await this.docAiCredentials(requesterId, doc.athleteId);
    if (!creds) {
      await this.prisma.athleteDocument.update({ where: { id: documentId }, data: { aiStatus: DOC_AI_UNAVAILABLE } });
      return;
    }

    await this.prisma.athleteDocument.update({
      where: { id: documentId },
      data: { aiStatus: 'PROCESSING' },
    });

    // Treinador ATUAL do atleta (o documento pode ter sido enviado quando ele tinha outro treinador)
    const currentProfile = await this.prisma.athleteProfile.findUnique({ where: { userId: doc.athleteId }, select: { coachId: true } }).catch(() => null);
    const notifyCoachId = currentProfile?.coachId ?? doc.coachId;

    try {
      const client = new Anthropic({ apiKey: creds.apiKey });
      const model = creds.model;
      const systemPrompt = `Você é especialista em medicina esportiva e treinamento de corrida.
Analise este documento enviado pelo atleta ${doc.athlete.name}.
Categoria: ${doc.category}

Forneça:
1. RESUMO: O que o documento contém
2. ACHADOS IMPORTANTES: Métricas, valores, resultados relevantes
3. IMPACTO NO TREINO: Como isso afeta a prescrição de treino
4. RECOMENDAÇÕES: Ações concretas para o coach (ajustes de carga, consultas médicas, etc.)

Seja técnico e objetivo. Responda em português.`;

      let aiAnalysis: string;

      if (doc.fileType === 'image') {
        // Lê do storage privado e codifica em base64
        const { buffer, mime } = await this.loadBytes(doc);
        const base64 = buffer.toString('base64');
        const mimeType = mime.startsWith('image/') ? mime : 'image/jpeg';

        const message = await client.messages.create({
          model,
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
        // Lê do storage privado e codifica em base64
        const { buffer } = await this.loadBytes(doc);
        const base64 = buffer.toString('base64');

        const message = await client.messages.create({
          model,
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
        // Excel (somente registros legados): download, parse with xlsx
        const { buffer } = await this.loadBytes(doc);
        const XLSX = require('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const sheets = wb.SheetNames.map((name: string) => {
          const ws = wb.Sheets[name];
          return `=== ${name} ===\n${XLSX.utils.sheet_to_csv(ws)}`;
        }).join('\n\n');

        const message = await client.messages.create({
          model,
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
        if (!openaiKey) throw new ServiceUnavailableException('Transcrição de áudio indisponível no momento');

        const openai = new OpenAI({ apiKey: openaiKey });
        const { buffer } = await this.loadBytes(doc);
        const { File } = await import('node:buffer');
        const audioFile = new File([buffer], doc.fileName, { type: 'audio/mpeg' });

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile as any,
          model: 'whisper-1',
          language: 'pt',
        });

        const message = await client.messages.create({
          model,
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
          userId: notifyCoachId,
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
        // Guarda só a mensagem amigável (nunca o JSON cru do provedor)
        data: { aiStatus: 'FAILED', aiAnalysis: null },
      });
      this.lastErrors.set(documentId, mapAiError(err));
    }
  }

  async getDocumentsByAthlete(athleteId: string, user: AuthUserLike) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false, healthData: true });
    // Quem tem acesso ATUAL ao atleta vê todos os documentos dele (independente de quem era o treinador no upload)
    const docs = await this.prisma.athleteDocument.findMany({
      where: { athleteId },
      orderBy: { createdAt: 'desc' },
    });
    return this.withSignedUrls(docs);
  }

  async getMyDocuments(athleteId: string) {
    const docs = await this.prisma.athleteDocument.findMany({
      where: { athleteId },
      orderBy: { createdAt: 'desc' },
    });
    return this.withSignedUrls(docs);
  }

  /** Busca o documento e verifica permissão: atleta dono, coach do documento ou ADMIN/SUPER_ADMIN. */
  private async findAuthorized(id: string, user: AuthUserLike) {
    const doc = await this.prisma.athleteDocument.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true } },
        coach: { select: { id: true, name: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    // Acesso segue o vínculo ATUAL do atleta: o próprio atleta, o treinador atual, OWNER/ADMIN da equipe atual
    // (STAFF nunca — dado de saúde). doc.coachId (treinador na época do upload) NÃO concede acesso.
    if (!isPlatformAdmin(user) && doc.athleteId !== user.id) {
      try {
        await assertCoachOwnsAthlete(this.prisma, user, doc.athleteId, { allowSelf: false, healthData: true });
      } catch (e) {
        if (e instanceof ForbiddenException && user.role === 'COACH') throw e;
        throw new NotFoundException('Documento não encontrado');
      }
    }
    return doc;
  }

  async getDocument(id: string, user: AuthUserLike) {
    const doc = await this.findAuthorized(id, user);
    return this.withSignedUrl(doc);
  }

  async downloadDocument(id: string, user: AuthUserLike) {
    const doc = await this.findAuthorized(id, user);
    const { buffer, mime } = await this.loadBytes(doc);
    return { buffer, mime, fileName: doc.fileName };
  }

  async reanalyze(documentId: string, user: AuthUserLike) {
    const doc = await this.findAuthorized(documentId, user);
    if (!isPlatformAdmin(user) && doc.athleteId === user.id) throw new ForbiddenException('Acesso negado');

    // Sem chave → 503 com mensagem clara (antes: 201 e depois status "Erro")
    const creds = await this.docAiCredentials(user.id, doc.athleteId);
    if (!creds) throw new AiNotConfiguredException(DOC_AI_NOT_CONFIGURED_MESSAGE);

    await this.prisma.athleteDocument.update({
      where: { id: documentId },
      data: { aiStatus: 'PROCESSING', aiAnalysis: null },
    });
    this.lastErrors.delete(documentId);

    // Aguarda a análise para devolver o resultado à UI
    await this.analyzeDocument(documentId, user.id);
    const updated = await this.prisma.athleteDocument.findUnique({ where: { id: documentId } });
    if (updated?.aiStatus === 'FAILED') {
      const ex = this.lastErrors.get(documentId) ?? mapAiError(new Error('falha'));
      this.lastErrors.delete(documentId);
      throw ex;
    }
    return { queued: false, documentId, aiStatus: updated?.aiStatus ?? 'DONE', aiAnalysis: updated?.aiAnalysis ?? null };
  }
}
