import { HttpException, UnauthorizedException } from '@nestjs/common';
import { WhatsappService, WHATSAPP_WEBHOOK_RATE_LIMIT } from './whatsapp.service';
import { decrypt } from '../../common/utils/encryption';

const SECRET = 'f'.repeat(64);
const KEY = '0123456789abcdef'.repeat(4);

describe('WhatsappService', () => {
  let prisma: any;
  let svc: WhatsappService;
  const fetchMock = jest.fn();

  const config = (over: Record<string, any> = {}) => ({
    coachId: 'coach1',
    provider: 'zapi',
    phone: '+55 21 99999-0000',
    apiToken: 'tok_secret_1234',
    instanceId: 'inst',
    webhookSecret: SECRET,
    welcomeMessage: 'Olá {nome}! {onboardingLink}',
    isConnected: true,
    ...over,
  });

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
    process.env.APP_URL = 'https://app.example.com';
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;
    prisma = {
      whatsappConfig: {
        findUnique: jest.fn().mockResolvedValue(config()),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      whatsappConversation: { upsert: jest.fn().mockResolvedValue({ id: 'conv1' }) },
      whatsappMessage: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Coach', coachProfile: { slug: 'coach' } }) },
    };
    svc = new WhatsappService(prisma);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.APP_URL;
  });

  const msg = (over: Record<string, any> = {}) => ({
    type: 'ReceivedCallback', phone: '5521988887777', fromMe: false, text: { message: 'oi' }, senderName: 'Ana', ...over,
  });

  describe('webhook authentication (fail-closed)', () => {
    it('rejects when the coach has no webhook secret configured', async () => {
      prisma.whatsappConfig.findUnique.mockResolvedValue(config({ webhookSecret: null }));
      await expect(svc.handleIncomingMessage('coach1', msg(), [undefined, undefined, undefined])).rejects.toThrow(UnauthorizedException);
      await expect(svc.handleIncomingMessage('coach1', msg(), [''])).rejects.toThrow(UnauthorizedException);
      expect(prisma.whatsappMessage.create).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unknown coach', async () => {
      prisma.whatsappConfig.findUnique.mockResolvedValue(null);
      await expect(svc.handleIncomingMessage('nobody', msg(), [SECRET])).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong secret', async () => {
      await expect(svc.handleIncomingMessage('coach1', msg(), ['nope', undefined, undefined])).rejects.toThrow(UnauthorizedException);
    });

    it.each([
      ['header x-rr-webhook-secret', [SECRET, undefined, undefined]],
      ['query ?secret=', [undefined, SECRET, undefined]],
      ['Client-Token', [undefined, undefined, SECRET]],
    ])('accepts the secret via %s and auto-replies on first contact', async (_label, secrets) => {
      const r = await svc.handleIncomingMessage('coach1', msg(), secrets as any);
      expect(r).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/send-text');
    });
  });

  it('ignores fromMe messages (no auto-reply loop)', async () => {
    const r = await svc.handleIncomingMessage('coach1', msg({ fromMe: true }), [SECRET]);
    expect(r).toMatchObject({ ignored: 'from_me' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores messages from the coach own number', async () => {
    const r = await svc.handleIncomingMessage('coach1', msg({ phone: '5521999990000' }), [SECRET]);
    expect(r).toMatchObject({ ignored: 'own_number' });
  });

  it('ignores group messages and status callbacks', async () => {
    expect(await svc.handleIncomingMessage('coach1', msg({ isGroup: true }), [SECRET])).toMatchObject({ ignored: 'group' });
    expect(await svc.handleIncomingMessage('coach1', msg({ type: 'MessageStatusCallback' }), [SECRET])).toMatchObject({ ignored: 'not_message' });
  });

  it('only auto-replies on the first message of a conversation', async () => {
    prisma.whatsappMessage.count.mockResolvedValue(3);
    await svc.handleIncomingMessage('coach1', msg(), [SECRET]);
    expect(prisma.whatsappMessage.create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it(`rate limits to ${WHATSAPP_WEBHOOK_RATE_LIMIT}/min per coach`, async () => {
    prisma.whatsappMessage.count.mockResolvedValue(1);
    for (let i = 0; i < WHATSAPP_WEBHOOK_RATE_LIMIT; i++) {
      await svc.handleIncomingMessage('coach1', msg(), [SECRET]);
    }
    await expect(svc.handleIncomingMessage('coach1', msg(), [SECRET])).rejects.toThrow(HttpException);
    // outro coach não é afetado
    await expect(svc.handleIncomingMessage('coach2', msg(), [SECRET])).resolves.toEqual({ ok: true });
  });

  describe('config', () => {
    it('GET never returns the apiToken, only a mask, and embeds the secret in the webhook URL', async () => {
      const cfg: any = await svc.getConfig('coach1');
      expect(JSON.stringify(cfg)).not.toContain('tok_secret_1234');
      expect(cfg.apiTokenMasked).toBe('••••1234');
      expect(cfg.hasToken).toBe(true);
      expect(cfg.webhookUrl).toBe(`https://app.example.com/api/v1/webhooks/whatsapp/coach1?secret=${SECRET}`);
    });

    it('save generates a 32-byte hex secret when missing, encrypts the token and returns the masked view', async () => {
      prisma.whatsappConfig.findUnique.mockResolvedValueOnce(null).mockResolvedValue(config());
      const out: any = await svc.saveConfig('coach1', { apiToken: 'newtoken9999', phone: '+5521999990000' });
      const data = prisma.whatsappConfig.create.mock.calls[0][0].data;
      expect(data.webhookSecret).toMatch(/^[a-f0-9]{64}$/);
      expect(data.apiToken).not.toBe('newtoken9999');
      expect(decrypt(data.apiToken)).toBe('newtoken9999');
      expect(out.apiToken).toBeUndefined();
    });

    it('save keeps an existing secret', async () => {
      await svc.saveConfig('coach1', { welcomeMessage: 'x' });
      expect(prisma.whatsappConfig.update.mock.calls[0][0].data.webhookSecret).toBeUndefined();
    });

    it('rotate issues a new secret', async () => {
      await svc.rotateWebhookSecret('coach1');
      const s = prisma.whatsappConfig.update.mock.calls[0][0].data.webhookSecret;
      expect(s).toMatch(/^[a-f0-9]{64}$/);
      expect(s).not.toBe(SECRET);
    });
  });
});
