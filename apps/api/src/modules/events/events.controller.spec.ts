import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as nodePath from 'path';
import { EventsController } from './events.controller';
import { UploadsService } from '../uploads/uploads.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

function multerFile(buffer: Buffer, originalname: string, mimetype: string): Express.Multer.File {
  return { buffer, originalname, mimetype, size: buffer.length, fieldname: 'file' } as Express.Multer.File;
}

describe('EventsController — cover image upload', () => {
  const EVENT_ID = '11111111-1111-4111-8111-111111111111';
  const user = { id: 'coach-1', role: 'COACH' } as any;
  const envBackup = { ...process.env };
  let tmpDir: string;
  let uploads: UploadsService;
  let events: any;
  let controller: EventsController;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'rr-events-cover-'));
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.UPLOADS_DIR = tmpDir;
    process.env.API_PUBLIC_URL = 'https://api.example.com';
    uploads = new UploadsService();
    events = {
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(async (_id: string, _u: any, dto: any) => ({ id: EVENT_ID, ...dto })),
    };
    controller = new EventsController(events, uploads);
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses the validated public image upload (magic bytes) and derives the extension from the detected type', async () => {
    const spy = jest.spyOn(uploads, 'uploadPublicImage');
    // Cliente diz que é .gif/image/gif, mas o conteúdo é PNG → salva como .png
    const res: any = await controller.uploadCoverImage(EVENT_ID, user, multerFile(PNG, 'capa.gif', 'image/gif'));

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ buffer: PNG }), expect.stringMatching(new RegExp(`^events/${EVENT_ID}/cover-\\d+$`)));
    expect(res.coverImageUrl).toMatch(new RegExp(`^https://api\\.example\\.com/api/v1/files/public/events/${EVENT_ID}/cover-\\d+\\.png\\?v=\\d+$`));
    expect(events.update).toHaveBeenCalledWith(EVENT_ID, user, { coverImageUrl: res.coverImageUrl });

    const files = await fs.readdir(nodePath.join(tmpDir, 'public', 'events', EVENT_ID));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^cover-\d+\.png$/);
  });

  it('ignores a spoofed extension/mimetype: JPEG content is stored as .jpg', async () => {
    const res: any = await controller.uploadCoverImage(EVENT_ID, user, multerFile(JPEG, 'capa.html', 'text/html'));
    expect(res.coverImageUrl).toMatch(/cover-\d+\.jpg\?v=\d+$/);
  });

  it('rejects non-image content even when declared as image/png (nothing is stored, event not updated)', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    await expect(
      controller.uploadCoverImage(EVENT_ID, user, multerFile(html, 'capa.png', 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.update).not.toHaveBeenCalled();
    await expect(fs.readdir(nodePath.join(tmpDir, 'public'))).rejects.toThrow();
  });

  it('rejects SVG (script-capable) covers', async () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(
      controller.uploadCoverImage(EVENT_ID, user, multerFile(svg, 'capa.svg', 'image/svg+xml')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects images larger than 5MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(
      controller.uploadCoverImage(EVENT_ID, user, multerFile(big, 'capa.png', 'image/png')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.update).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    await expect(controller.uploadCoverImage(EVENT_ID, user, undefined as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(events.assertCanManage).not.toHaveBeenCalled();
  });

  it('checks event ownership before storing anything', async () => {
    events.assertCanManage.mockRejectedValueOnce(new ForbiddenException());
    const spy = jest.spyOn(uploads, 'uploadPublicImage');
    await expect(
      controller.uploadCoverImage(EVENT_ID, user, multerFile(PNG, 'capa.png', 'image/png')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(spy).not.toHaveBeenCalled();
    expect(events.update).not.toHaveBeenCalled();
  });
});
