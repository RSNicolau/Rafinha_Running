import {
  BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhooksController } from './webhooks.controller';
import { hashOAuthState } from './oauth-state';

const STATE = 'b'.repeat(64);

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

describe('WebhooksController', () => {
  const svc = {
    handleCallback: jest.fn(),
    peekOAuthState: jest.fn(),
    handleStravaWebhook: jest.fn().mockResolvedValue('created'),
    handleGarminActivity: jest.fn(),
    handleGarminHealth: jest.fn(),
    handleGarminDeauth: jest.fn(),
    handleCorosActivity: jest.fn(),
    handleCorosDeauth: jest.fn(),
  };
  let ctrl: WebhooksController;
  const ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV };
    process.env.APP_URL = 'https://app.example.com';
    process.env.STRAVA_CLIENT_ID = 'cid';
    process.env.STRAVA_CLIENT_SECRET = 'cs';
    delete process.env.GARMIN_CLIENT_ID;
    delete process.env.GARMIN_CLIENT_SECRET;
    delete process.env.GARMIN_WEBHOOK_SECRET;
    delete process.env.COROS_CLIENT_ID;
    delete process.env.COROS_CLIENT_SECRET;
    delete process.env.COROS_WEBHOOK_SECRET;
    delete process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
    ctrl = new WebhooksController(svc as any);
  });

  afterAll(() => { process.env = ENV; });

  // ── Strava hub.challenge ──
  describe('GET /webhooks/strava', () => {
    it('echoes the challenge when the verify token matches', () => {
      process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = 'vt';
      const res = mockRes();
      ctrl.verifyStravaWebhook('subscribe', 'vt', 'ch123', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ 'hub.challenge': 'ch123' });
    });

    it('403 on wrong token', () => {
      process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = 'vt';
      const res = mockRes();
      ctrl.verifyStravaWebhook('subscribe', 'nope', 'ch', res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('fails closed when STRAVA_WEBHOOK_VERIFY_TOKEN is unset', () => {
      delete process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
      const res = mockRes();
      ctrl.verifyStravaWebhook('subscribe', '', 'ch', res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  // ── Strava events ──
  describe('POST /webhooks/strava', () => {
    const ev = { object_type: 'activity', object_id: 1, aspect_type: 'create', owner_id: 2, subscription_id: 77 };

    it('rejects malformed events', () => {
      expect(() => ctrl.handleStravaWebhook({ foo: 1 })).toThrow(BadRequestException);
    });

    it('rejects events from another subscription when STRAVA_WEBHOOK_SUBSCRIPTION_ID is set', () => {
      process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '77';
      expect(() => ctrl.handleStravaWebhook({ ...ev, subscription_id: 78 })).toThrow(ForbiddenException);
    });

    it('acks immediately and processes asynchronously', async () => {
      process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '77';
      expect(ctrl.handleStravaWebhook(ev)).toEqual({ status: 'ok' });
      expect(svc.handleStravaWebhook).not.toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      expect(svc.handleStravaWebhook).toHaveBeenCalledWith(expect.objectContaining({ object_id: 1, owner_id: 2 }));
    });

    it('404 when Strava is not configured', () => {
      delete process.env.STRAVA_CLIENT_ID;
      expect(() => ctrl.handleStravaWebhook(ev)).toThrow(NotFoundException);
    });
  });

  // ── Garmin fail-closed ──
  describe('Garmin webhooks', () => {
    const body = { dailies: [{ userId: 'g1', calendarDate: '2026-10-14', restingHeartRateInBeatsPerMinute: 50 }] };
    const req = (raw?: Buffer) => ({ rawBody: raw } as any);

    it('rejects when Garmin is not configured', async () => {
      await expect(ctrl.handleGarminHealth(req(Buffer.from('{}')), 'sig', body)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the webhook secret is missing even if credentials exist', async () => {
      process.env.GARMIN_CLIENT_ID = 'g'; process.env.GARMIN_CLIENT_SECRET = 's';
      await expect(ctrl.handleGarminHealth(req(Buffer.from('{}')), 'sig', body)).rejects.toThrow(NotFoundException);
    });

    it('rejects bad / missing signatures', async () => {
      process.env.GARMIN_CLIENT_ID = 'g'; process.env.GARMIN_CLIENT_SECRET = 's'; process.env.GARMIN_WEBHOOK_SECRET = 'whs';
      await expect(ctrl.handleGarminHealth(req(Buffer.from('{}')), 'bad', body)).rejects.toThrow(UnauthorizedException);
      await expect(ctrl.handleGarminHealth(req(undefined), 'bad', body)).rejects.toThrow(UnauthorizedException);
      expect(svc.handleGarminHealth).not.toHaveBeenCalled();
    });

    it('accepts a valid signature and drops out-of-range values', async () => {
      process.env.GARMIN_CLIENT_ID = 'g'; process.env.GARMIN_CLIENT_SECRET = 's'; process.env.GARMIN_WEBHOOK_SECRET = 'whs';
      const raw = Buffer.from(JSON.stringify(body));
      const sig = crypto.createHmac('sha256', 'whs').update(raw).digest('base64');
      await ctrl.handleGarminHealth(req(raw), sig, {
        dailies: [{ userId: 'g1', calendarDate: '2026-10-14', restingHeartRateInBeatsPerMinute: 50, lastNightAvg5MinHrv: 99999 }],
      });
      expect(svc.handleGarminHealth).toHaveBeenCalledWith(expect.objectContaining({ userId: 'g1', restingHR: 50, hrv: undefined }));
    });
  });

  // ── COROS fail-closed ──
  describe('COROS webhook', () => {
    it('rejects when not configured', async () => {
      await expect(ctrl.handleCorosWebhook('x', 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('rejects a wrong secret', async () => {
      process.env.COROS_CLIENT_ID = 'c'; process.env.COROS_CLIENT_SECRET = 's'; process.env.COROS_WEBHOOK_SECRET = 'cws';
      await expect(ctrl.handleCorosWebhook('nope', undefined as any, {})).rejects.toThrow(UnauthorizedException);
    });

    it('accepts the secret and only triggers a pull sync', async () => {
      process.env.COROS_CLIENT_ID = 'c'; process.env.COROS_CLIENT_SECRET = 's'; process.env.COROS_WEBHOOK_SECRET = 'cws';
      await ctrl.handleCorosWebhook(undefined as any, 'cws', { openId: 'o1', sportDataList: [{ mode: 100, distance: 1e9 }] });
      expect(svc.handleCorosActivity).toHaveBeenCalledWith(expect.objectContaining({ openId: 'o1', distance: 0 }));
    });
  });

  // ── OAuth callback (CSRF / browser binding) ──
  describe('GET /webhooks/oauth/:provider/callback', () => {
    const reqWithCookie = (cookie?: string) => ({ headers: cookie ? { cookie } : {} } as any);

    it('completes when the rr_oauth_nonce cookie matches the state', async () => {
      svc.handleCallback.mockResolvedValue({ success: true });
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', STATE, undefined as any, 'read,activity:read_all',
        reqWithCookie(`other=1; rr_oauth_nonce=${hashOAuthState(STATE)}`), res);
      expect(svc.handleCallback).toHaveBeenCalledWith('STRAVA', 'code', STATE, { grantedScope: 'read,activity:read_all' });
      expect(res.redirect).toHaveBeenCalledWith(302, 'https://app.example.com/dashboard/integrations?oauth=success&provider=STRAVA');
      expect(res.clearCookie).toHaveBeenCalledWith('rr_oauth_nonce', { path: '/api' });
    });

    it('rejects (without exchanging) when the cookie is missing — victim-link attack', async () => {
      svc.peekOAuthState.mockResolvedValue({ userId: 'attacker', client: 'web' });
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', STATE, undefined as any, undefined as any, reqWithCookie(), res);
      expect(svc.handleCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, 'https://app.example.com/dashboard/integrations?oauth=error&error=session_mismatch&provider=STRAVA');
    });

    it('rejects when the cookie belongs to a different state', async () => {
      svc.peekOAuthState.mockResolvedValue({ userId: 'u', client: 'web' });
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', STATE, undefined as any, undefined as any,
        reqWithCookie(`rr_oauth_nonce=${hashOAuthState('c'.repeat(64))}`), res);
      expect(svc.handleCallback).not.toHaveBeenCalled();
    });

    it('hands mobile flows back to the app via deep link (app completes authenticated)', async () => {
      svc.peekOAuthState.mockResolvedValue({ userId: 'u1', client: 'mobile' });
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', STATE, undefined as any, 'read,activity:read_all', reqWithCookie(), res);
      expect(svc.handleCallback).not.toHaveBeenCalled();
      const target: string = res.redirect.mock.calls[0][1];
      expect(target.startsWith('rrrafinha://integrations/complete?')).toBe(true);
      expect(target).toContain(`state=${STATE}`);
    });

    it('user denial in a mobile flow returns to the app with error', async () => {
      svc.peekOAuthState.mockResolvedValue({ userId: 'u1', client: 'mobile' });
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', undefined as any, STATE, 'access_denied', undefined as any, reqWithCookie(), res);
      expect(res.redirect).toHaveBeenCalledWith(302, 'rrrafinha://integrations/complete?provider=STRAVA&error=access_denied');
    });

    it('never redirects outside APP_URL and does not reflect error messages', async () => {
      svc.handleCallback.mockRejectedValue(new Error('<script>evil</script>'));
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', STATE, undefined as any, undefined as any,
        reqWithCookie(`rr_oauth_nonce=${hashOAuthState(STATE)}`), res);
      const target: string = res.redirect.mock.calls[0][1];
      expect(target).toBe('https://app.example.com/dashboard/integrations?oauth=error&error=exchange_failed&provider=STRAVA');
    });

    it('rejects unavailable providers (Garmin without credentials)', async () => {
      const res = mockRes();
      await ctrl.oauthCallback('garmin', 'code', STATE, undefined as any, undefined as any, reqWithCookie(), res);
      expect(res.redirect.mock.calls[0][1]).toContain('error=provider_unavailable');
    });

    it('rejects malformed state', async () => {
      const res = mockRes();
      await ctrl.oauthCallback('STRAVA', 'code', 'short', undefined as any, undefined as any, reqWithCookie(), res);
      expect(res.redirect.mock.calls[0][1]).toContain('error=invalid_request');
    });
  });
});
