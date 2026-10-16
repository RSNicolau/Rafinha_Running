import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { detectFileType, sanitizeStoragePath, UploadsService } from '../uploads.service';
import { FilesController } from '../files.controller';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

const file = (buffer: Buffer, extra: Partial<Express.Multer.File> = {}) =>
  ({ buffer, size: buffer.length, originalname: 'x.png', mimetype: 'image/png', ...extra }) as Express.Multer.File;

describe('UploadsService (H8)', () => {
  const env = { ...process.env };
  let svc: UploadsService;

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.UPLOADS_DIR = mkdtempSync(path.join(tmpdir(), 'rr-uploads-'));
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.API_PUBLIC_URL;
    delete process.env.API_URL;
    svc = new UploadsService();
  });
  afterAll(() => { process.env = env; });

  it('detecta tipos por magic bytes', () => {
    expect(detectFileType(PNG)?.mime).toBe('image/png');
    expect(detectFileType(JPG)?.mime).toBe('image/jpeg');
    expect(detectFileType(WEBP)?.mime).toBe('image/webp');
    expect(detectFileType(PDF)?.mime).toBe('application/pdf');
    expect(detectFileType(HTML)).toBeNull();
  });

  it('imagens: rejeita HTML disfarçado e PDF; aceita PNG', () => {
    expect(() => svc.validateImage(file(HTML))).toThrow(BadRequestException);
    expect(() => svc.validateImage(file(PDF))).toThrow(BadRequestException);
    expect(svc.validateImage(file(PNG)).ext).toBe('png');
  });

  it('limites de tamanho: imagem 5MB, documento 15MB', () => {
    expect(() => svc.validateImage(file(PNG, { size: 5 * 1024 * 1024 + 1 }))).toThrow(BadRequestException);
    expect(() => svc.validateDocument(file(PDF, { size: 15 * 1024 * 1024 + 1 }))).toThrow(BadRequestException);
    expect(svc.validateDocument(file(PDF)).kind).toBe('pdf');
  });

  it('extensão vem do tipo detectado, não do nome original', async () => {
    const url = await svc.uploadPublicImage(file(JPG, { originalname: 'evil.html' }), 'avatars/u1/avatar');
    expect(url).toMatch(/^\/api\/v1\/files\/public\/avatars\/u1\/avatar\.jpg\?v=\d+$/);
  });

  it('bloqueia path traversal', () => {
    expect(() => sanitizeStoragePath('../../etc/passwd')).not.toThrow(); // ".." removido
    expect(sanitizeStoragePath('../../etc/passwd')).toBe('etc/passwd');
    expect(() => sanitizeStoragePath('a/b c')).toThrow(BadRequestException);
  });

  it('privado local: retorna caminho, URL assinada expira e assinatura é verificada', async () => {
    const stored = await svc.uploadPrivate(PDF, 'athlete-docs/a1/doc.pdf', 'application/pdf');
    expect(stored).toBe('athlete-docs/a1/doc.pdf');
    expect(stored.startsWith('http')).toBe(false);

    const signed = (await svc.getPrivateSignedUrl(stored))!;
    const u = new URL(signed, 'http://x');
    const rel = u.pathname.replace('/api/v1/files/private/', '');
    expect(svc.verifyLocalSignature(rel, u.searchParams.get('exp')!, u.searchParams.get('sig')!)).toBe(true);
    expect(svc.verifyLocalSignature('athlete-docs/a2/doc.pdf', u.searchParams.get('exp')!, u.searchParams.get('sig')!)).toBe(false);
    expect(svc.verifyLocalSignature(rel, String(Math.floor(Date.now() / 1000) - 1), u.searchParams.get('sig')!)).toBe(false);
  });

  it('FilesController: arquivo privado sem assinatura → 403; público servido', async () => {
    const ctrl = new FilesController(svc);
    await svc.uploadPrivate(PDF, 'athlete-docs/a1/x.pdf', 'application/pdf');
    await expect(ctrl.getPrivate(['athlete-docs', 'a1', 'x.pdf'], '9999999999', 'a'.repeat(64), {} as any)).rejects.toBeDefined();
    // privado não é acessível pela rota pública
    await expect(ctrl.getPublic(['athlete-docs', 'a1', 'x.pdf'], {} as any)).rejects.toBeInstanceOf(NotFoundException);

    await svc.uploadPublicImage(file(PNG), 'avatars/u1/avatar');
    const res: any = { setHeader: jest.fn(), end: jest.fn() };
    await ctrl.getPublic(['avatars', 'u1', 'avatar.png'], res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('URL pública legada do Supabase é interpretada (bucket + caminho)', () => {
    const ref = svc.parseStoredRef('https://abc.supabase.co/storage/v1/object/public/athlete-uploads/athlete-docs/a1/1_x.pdf');
    expect(ref).toEqual(expect.objectContaining({ bucket: 'athlete-uploads', path: 'athlete-docs/a1/1_x.pdf' }));
  });
});
