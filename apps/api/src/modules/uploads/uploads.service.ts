import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import * as nodePath from 'path';

export type DetectedFile = { mime: string; ext: string; kind: 'image' | 'pdf' };

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 300;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIMES = [...IMAGE_MIMES, 'application/pdf'];

/** Detecta o tipo REAL do arquivo pelos magic bytes (ignora mimetype/extensão enviados pelo cliente). */
export function detectFileType(buf: Buffer | undefined | null): DetectedFile | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  }
  if (buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' };
  return null;
}

function hasSupabase(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Normaliza um caminho relativo de storage e impede path traversal. */
export function sanitizeStoragePath(p: string): string {
  const parts = String(p ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..');
  if (parts.length === 0) throw new BadRequestException('Caminho inválido');
  for (const s of parts) {
    if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new BadRequestException('Caminho inválido');
  }
  return parts.join('/');
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private _supabase: SupabaseClient | null = null;

  // Lazy: só instancia o cliente quando um upload é realmente feito.
  private get supabase(): SupabaseClient {
    if (!this._supabase) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new ServiceUnavailableException('Upload indisponível no momento (armazenamento não configurado)');
      }
      this._supabase = createClient(url, key);
    }
    return this._supabase;
  }

  get usingLocalStorage(): boolean {
    return !hasSupabase();
  }

  private get publicBucket(): string {
    return process.env.SUPABASE_PUBLIC_BUCKET || 'athlete-uploads';
  }

  private get privateBucket(): string {
    return process.env.SUPABASE_PRIVATE_BUCKET || 'athlete-private';
  }

  get uploadsDir(): string {
    return nodePath.resolve(process.env.UPLOADS_DIR || './uploads');
  }

  /** Base pública da API para montar URLs de arquivos locais (ex.: https://api.meudominio.com). Vazio → URL relativa. */
  private get publicApiBase(): string {
    // Aceita API_PUBLIC_URL com ou sem o sufixo /api/v1 (integrações usam com sufixo); cai para APP_URL
    // (no VPS o Caddy encaminha /api/v1/files/* do mesmo domínio direto para a API).
    return (process.env.API_PUBLIC_URL || process.env.APP_URL || '')
      .replace(/\/+$/, '')
      .replace(/\/api\/v1$/, '');
  }

  // ─── Validação ─────────────────────────────────────────────────────────────

  /** Imagens (avatar, banner, logo): jpeg/png/webp por magic bytes, até 5MB. */
  validateImage(file: Express.Multer.File | undefined): DetectedFile {
    if (!file?.buffer) throw new BadRequestException('Arquivo não enviado');
    if (file.size > IMAGE_MAX_BYTES || file.buffer.length > IMAGE_MAX_BYTES) {
      throw new BadRequestException('Imagem muito grande (máximo 5MB)');
    }
    const detected = detectFileType(file.buffer);
    if (!detected || !IMAGE_MIMES.includes(detected.mime)) {
      throw new BadRequestException('Formato de imagem não suportado. Envie JPG, PNG ou WEBP.');
    }
    return detected;
  }

  /** Documentos do atleta: PDF ou imagem por magic bytes, até 15MB. */
  validateDocument(file: Express.Multer.File | undefined): DetectedFile {
    if (!file?.buffer) throw new BadRequestException('Arquivo não enviado');
    if (file.size > DOCUMENT_MAX_BYTES || file.buffer.length > DOCUMENT_MAX_BYTES) {
      throw new BadRequestException('Arquivo muito grande (máximo 15MB)');
    }
    const detected = detectFileType(file.buffer);
    if (!detected || !DOCUMENT_MIMES.includes(detected.mime)) {
      throw new BadRequestException('Formato não suportado. Envie PDF, JPG, PNG ou WEBP.');
    }
    return detected;
  }

  // ─── Público (avatares, banners, logos) ────────────────────────────────────

  /**
   * Upload em armazenamento PÚBLICO. Retorna a URL pública.
   * NÃO valida o conteúdo — não use para arquivos enviados por usuários (prefira uploadPublicImage).
   */
  async uploadFile(buffer: Buffer, _fileName: string, mimeType: string, path: string): Promise<string> {
    const safePath = sanitizeStoragePath(path);
    if (!hasSupabase()) {
      await this.writeLocal('public', safePath, buffer);
      return this.localPublicUrl(safePath);
    }
    const { error } = await this.supabase.storage
      .from(this.publicBucket)
      .upload(safePath, buffer, { contentType: mimeType, upsert: true });
    if (error) {
      this.logger.error(`Upload falhou (${safePath}): ${error.message}`);
      throw new ServiceUnavailableException('Falha ao enviar o arquivo. Tente novamente.');
    }
    const { data } = this.supabase.storage.from(this.publicBucket).getPublicUrl(safePath);
    return data.publicUrl;
  }

  /** Valida (magic bytes) e envia imagem pública. `basePath` sem extensão — a extensão vem do tipo detectado. */
  async uploadPublicImage(file: Express.Multer.File, basePath: string, bucket?: string): Promise<string> {
    const detected = this.validateImage(file);
    const path = sanitizeStoragePath(`${basePath}.${detected.ext}`);
    if (!hasSupabase()) {
      await this.writeLocal('public', path, file.buffer);
      // cache-buster: o caminho é fixo por usuário (upsert)
      return `${this.localPublicUrl(path)}?v=${Date.now()}`;
    }
    const b = bucket || this.publicBucket;
    const { error } = await this.supabase.storage
      .from(b)
      .upload(path, file.buffer, { contentType: detected.mime, upsert: true });
    if (error) throw new BadRequestException(`Erro ao fazer upload: ${error.message}`);
    const { data } = this.supabase.storage.from(b).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  // ─── Privado (documentos/exames do atleta) ─────────────────────────────────

  /** Envia para armazenamento PRIVADO. Retorna o caminho de storage (NÃO uma URL). */
  async uploadPrivate(buffer: Buffer, path: string, mimeType: string): Promise<string> {
    const safePath = sanitizeStoragePath(path);
    if (!hasSupabase()) {
      await this.writeLocal('private', safePath, buffer);
      return safePath;
    }
    const { error } = await this.supabase.storage
      .from(this.privateBucket)
      .upload(safePath, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new BadRequestException(`Erro ao fazer upload: ${error.message}`);
    return safePath;
  }

  /**
   * Converte o valor armazenado em {bucket, path}. Aceita:
   *  - caminho de storage (novo formato) → bucket privado;
   *  - URL pública legada do Supabase (.../storage/v1/object/public/<bucket>/<path>) → bucket legado.
   * Retorna null se não for possível interpretar.
   */
  parseStoredRef(stored: string | null | undefined): { bucket: string; path: string; legacyUrl?: string } | null {
    if (!stored) return null;
    if (/^https?:\/\//i.test(stored)) {
      const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
      if (m) return { bucket: m[1], path: decodeURIComponent(m[2]), legacyUrl: stored };
      return null;
    }
    try {
      return { bucket: this.privateBucket, path: sanitizeStoragePath(stored) };
    } catch {
      return null;
    }
  }

  /**
   * URL de leitura de curta duração (300s) para um arquivo privado.
   * Chame SOMENTE após verificar a permissão do solicitante.
   */
  async getPrivateSignedUrl(stored: string | null | undefined, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
    const ref = this.parseStoredRef(stored);
    if (!ref) return null;
    if (!hasSupabase()) {
      if (ref.legacyUrl) return null; // arquivo legado no Supabase sem credenciais configuradas
      return this.localSignedUrl(ref.path, ttlSeconds);
    }
    const { data, error } = await this.supabase.storage.from(ref.bucket).createSignedUrl(ref.path, ttlSeconds);
    if (error || !data?.signedUrl) {
      this.logger.warn(`createSignedUrl falhou (${ref.bucket}): ${error?.message}`);
      return null;
    }
    return data.signedUrl;
  }

  /** Lê o conteúdo de um arquivo privado (para análise de IA / download autenticado). */
  async readPrivate(stored: string): Promise<{ buffer: Buffer; mime: string }> {
    const ref = this.parseStoredRef(stored);
    if (!ref) throw new NotFoundException('Arquivo não encontrado');
    let buffer: Buffer;
    if (!hasSupabase()) {
      if (ref.legacyUrl) throw new NotFoundException('Arquivo não disponível');
      buffer = await this.readLocal('private', ref.path);
    } else {
      const { data, error } = await this.supabase.storage.from(ref.bucket).download(ref.path);
      if (error || !data) throw new NotFoundException('Arquivo não encontrado');
      buffer = Buffer.from(await data.arrayBuffer());
    }
    const mime = detectFileType(buffer)?.mime ?? 'application/octet-stream';
    return { buffer, mime };
  }

  // ─── Armazenamento local (sem Supabase — VPS/docker) ───────────────────────

  private localPath(area: 'public' | 'private', relPath: string): string {
    const root = nodePath.join(this.uploadsDir, area);
    const full = nodePath.resolve(root, sanitizeStoragePath(relPath));
    if (!full.startsWith(root + nodePath.sep)) throw new BadRequestException('Caminho inválido');
    return full;
  }

  private async writeLocal(area: 'public' | 'private', relPath: string, buffer: Buffer) {
    const full = this.localPath(area, relPath);
    await fs.mkdir(nodePath.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer, { mode: 0o640 });
  }

  async readLocal(area: 'public' | 'private', relPath: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.localPath(area, relPath));
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new NotFoundException('Arquivo não encontrado');
    }
  }

  private localPublicUrl(relPath: string): string {
    return `${this.publicApiBase}/api/v1/files/public/${relPath}`;
  }

  private signingSecret(): string {
    const s = process.env.FILES_SIGNING_SECRET || process.env.JWT_SECRET;
    if (!s) throw new Error('FILES_SIGNING_SECRET/JWT_SECRET não configurado');
    return s;
  }

  private sign(relPath: string, exp: number): string {
    return createHmac('sha256', this.signingSecret()).update(`private:${relPath}:${exp}`).digest('hex');
  }

  localSignedUrl(relPath: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): string {
    const path = sanitizeStoragePath(relPath);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.publicApiBase}/api/v1/files/private/${path}?exp=${exp}&sig=${this.sign(path, exp)}`;
  }

  verifyLocalSignature(relPath: string, exp: string | number, sig: string): boolean {
    const expN = Number(exp);
    if (!Number.isFinite(expN) || expN < Math.floor(Date.now() / 1000)) return false;
    if (typeof sig !== 'string' || !/^[a-f0-9]{64}$/.test(sig)) return false;
    const expected = Buffer.from(this.sign(sanitizeStoragePath(relPath), expN), 'hex');
    const got = Buffer.from(sig, 'hex');
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  /** Nome de arquivo aleatório (não previsível). */
  randomName(ext: string): string {
    return `${Date.now()}_${randomBytes(16).toString('hex')}.${ext}`;
  }

  // Detect file type category
  categorizeFile(mimeType: string): 'image' | 'pdf' | 'excel' | 'audio' | 'video' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'excel';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  }
}
