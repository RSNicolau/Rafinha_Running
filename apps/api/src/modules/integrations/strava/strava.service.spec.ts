/**
 * StravaService — caminho de lançamento (Strava é a ponte única para relógios).
 * fetch é mockado; Prisma é mockado em memória o suficiente para cada cenário.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  StravaService, STRAVA_TOKEN_URL, STRAVA_API_BASE, pickMatchingWorkout, parseStravaWebhookEvent,
  mapStravaActivityToResult,
} from './strava.service';
import { decrypt, encrypt } from '../../../common/utils/encryption';

const STATE = 'a'.repeat(64);
const KEY = '0123456789abcdef'.repeat(4); // 32 bytes hex

function makePrisma() {
  return {
    appConfig: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    fitnessIntegration: {
      upsert: jest.fn().mockResolvedValue({ id: 'fi_1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
    },
    workout: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workoutResult: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'wr_1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function jsonRes(status: number, body: any, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

const runActivity = (over: Record<string, any> = {}) => ({
  id: 12345,
  athlete: { id: 99999 },
  type: 'Run',
  sport_type: 'Run',
  start_date: '2026-10-14T09:00:00Z',
  start_date_local: '2026-10-14T06:00:00Z',
  utc_offset: -10800,
  distance: 10050.4,
  moving_time: 3000,
  elapsed_time: 3100,
  average_heartrate: 152.6,
  max_heartrate: 176.2,
  total_elevation_gain: 42.5,
  calories: 712.3,
  map: { summary_polyline: 'abc~def', polyline: 'full~poly' },
  ...over,
});

const scheduledWorkout = { id: 'w_1', scheduledDate: new Date('2026-10-14T00:00:00Z'), targetDistanceMeters: 10000, targetDurationSeconds: null };

describe('StravaService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: StravaService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env.STRAVA_CLIENT_ID = 'cid';
    process.env.STRAVA_CLIENT_SECRET = 'csecret';
    process.env.APP_URL = 'https://app.example.com';
    delete process.env.STRAVA_REDIRECT_URI;
    process.env.ENCRYPTION_KEY = KEY;
    prisma = makePrisma();
    service = new StravaService(prisma as any);
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    service.onModuleDestroy();
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.APP_URL;
  });

  const integration = (over: Record<string, any> = {}) => ({
    id: 'fi_1',
    userId: 'u1',
    provider: 'STRAVA',
    accessToken: encrypt('at_valid'),
    refreshToken: encrypt('rt_valid'),
    externalUserId: '99999',
    expiresAt: new Date(Date.now() + 3600_000),
    isActive: true,
    ...over,
  });

  // ── connect URL ──
  describe('getAuthUrl', () => {
    it('throws when credentials are not configured', async () => {
      delete process.env.STRAVA_CLIENT_ID;
      await expect(service.getAuthUrl('u1')).rejects.toThrow(BadRequestException);
    });

    it('builds the authorize URL with read + activity:read_all and an env-derived redirect URI', async () => {
      const { url, state } = await service.getAuthUrl('u1');
      const u = new URL(url);
      expect(u.origin + u.pathname).toBe('https://www.strava.com/oauth/authorize');
      expect(u.searchParams.get('scope')).toBe('read,activity:read_all');
      expect(u.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/v1/webhooks/oauth/STRAVA/callback');
      expect(u.searchParams.get('state')).toBe(state);
      expect(state).toMatch(/^[a-f0-9]{64}$/);
      // state guardado no servidor com userId + expiração; nunca o userId na URL
      const call = prisma.appConfig.upsert.mock.calls[0][0];
      expect(call.where.key).toBe(`oauth_state:strava:${state}`);
      expect(call.create.value).toMatchObject({ userId: 'u1', provider: 'STRAVA', client: 'web' });
      expect(url).not.toContain('u1');
    });
  });

  // ── callback ──
  describe('handleCallback', () => {
    const stateRow = (over: Record<string, any> = {}) => ({
      key: `oauth_state:strava:${STATE}`,
      value: { userId: 'u1', provider: 'STRAVA', client: 'web', expiresAt: new Date(Date.now() + 60_000).toISOString(), ...over },
    });

    it('exchanges the code and stores ENCRYPTED tokens', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(stateRow());
      fetchMock.mockImplementation(async (url: string) => {
        if (url === STRAVA_TOKEN_URL) {
          return jsonRes(200, {
            access_token: 'at_plain', refresh_token: 'rt_plain',
            expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 99999 },
          });
        }
        return jsonRes(200, []); // backfill
      });

      const result = await service.handleCallback('the_code', STATE, { grantedScope: 'read,activity:read_all' });

      expect(result).toMatchObject({ success: true, provider: 'STRAVA', userId: 'u1' });
      const tokenBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(tokenBody).toMatchObject({ code: 'the_code', grant_type: 'authorization_code', client_id: 'cid' });

      const up = prisma.fitnessIntegration.upsert.mock.calls[0][0];
      expect(up.create.accessToken).not.toBe('at_plain');
      expect(up.create.refreshToken).not.toBe('rt_plain');
      expect(decrypt(up.create.accessToken)).toBe('at_plain');
      expect(decrypt(up.create.refreshToken)).toBe('rt_plain');
      expect(up.create.externalUserId).toBe('99999');
      // state consumido (uso único)
      expect(prisma.appConfig.deleteMany).toHaveBeenCalledWith({ where: { key: `oauth_state:strava:${STATE}` } });
      // a mesma conta Strava não alimenta dois usuários
      expect(prisma.fitnessIntegration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ externalUserId: '99999', NOT: { userId: 'u1' } }),
      }));
    });

    it('rejects an unknown state', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(null);
      await expect(service.handleCallback('c', STATE)).rejects.toThrow(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a replayed state (already consumed concurrently)', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(stateRow());
      prisma.appConfig.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.handleCallback('c', STATE)).rejects.toThrow(/já utilizado/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when the authenticated user is not the state owner (mobile complete)', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(stateRow({ userId: 'attacker' }));
      await expect(service.handleCallback('c', STATE, { expectedUserId: 'victim' })).rejects.toThrow(ForbiddenException);
      expect(prisma.appConfig.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects when the athlete unticked activity scope', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(stateRow());
      await expect(service.handleCallback('c', STATE, { grantedScope: 'read' })).rejects.toThrow(/Permiss/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an expired state', async () => {
      prisma.appConfig.findUnique.mockResolvedValue(stateRow({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
      await expect(service.handleCallback('c', STATE)).rejects.toThrow(/expirado/);
    });
  });

  // ── webhook ──
  describe('handleWebhookEvent', () => {
    const createEvent = { object_type: 'activity' as const, object_id: 12345, aspect_type: 'create' as const, owner_id: 99999, subscription_id: 1 };

    it('create → fetches the activity with the athlete token → upserts a mapped WorkoutResult', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      prisma.workout.findMany.mockResolvedValue([scheduledWorkout]);
      fetchMock.mockResolvedValue(jsonRes(200, runActivity()));

      const outcome = await service.handleWebhookEvent(createEvent);

      expect(outcome).toBe('created');
      expect(fetchMock).toHaveBeenCalledWith(`${STRAVA_API_BASE}/activities/12345`, expect.objectContaining({
        headers: { Authorization: 'Bearer at_valid' },
      }));
      expect(prisma.workout.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'w_1', status: 'SCHEDULED' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }));
      const up = prisma.workoutResult.upsert.mock.calls[0][0];
      expect(up.where).toEqual({ workoutId: 'w_1' });
      expect(up.create).toMatchObject({
        workoutId: 'w_1',
        source: 'STRAVA',
        externalId: 'strava_12345',
        distanceMeters: 10050,
        durationSeconds: 3000,
        avgPace: '4:58',
        avgHeartRate: 153,
        maxHeartRate: 176,
        calories: 712,
        elevationGain: 42.5,
        gpsRoute: { format: 'google-encoded-polyline', polyline: 'full~poly' },
      });
    });

    it('same event twice → second is a no-op (idempotent by externalId)', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      prisma.workout.findMany.mockResolvedValue([scheduledWorkout]);
      fetchMock.mockResolvedValue(jsonRes(200, runActivity()));

      expect(await service.handleWebhookEvent(createEvent)).toBe('created');
      prisma.workoutResult.findFirst.mockResolvedValue({ id: 'wr_1', workoutId: 'w_1' });
      expect(await service.handleWebhookEvent(createEvent)).toBe('duplicate');

      expect(prisma.workoutResult.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.workout.updateMany).toHaveBeenCalledTimes(1);
    });

    it('concurrent duplicates → workout claimed only once', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      prisma.workout.findMany.mockResolvedValue([scheduledWorkout]);
      prisma.workout.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      fetchMock.mockResolvedValue(jsonRes(200, runActivity()));

      const outcomes = await Promise.all([service.handleWebhookEvent(createEvent), service.handleWebhookEvent(createEvent)]);
      expect(outcomes.filter((o) => o === 'created')).toHaveLength(1);
      expect(prisma.workoutResult.upsert).toHaveBeenCalledTimes(1);
    });

    it('update on an existing result refreshes metrics', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      prisma.workoutResult.findFirst.mockResolvedValue({ id: 'wr_1', workoutId: 'w_1' });
      fetchMock.mockResolvedValue(jsonRes(200, runActivity({ distance: 10200 })));
      expect(await service.handleWebhookEvent({ ...createEvent, aspect_type: 'update' })).toBe('updated');
      expect(prisma.workoutResult.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'wr_1' }, data: expect.objectContaining({ distanceMeters: 10200 }),
      }));
    });

    it('ignores events for unknown athletes without calling Strava', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(null);
      expect(await service.handleWebhookEvent(createEvent)).toBe('no_integration');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ignores an activity whose real owner differs from the event owner_id', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      fetchMock.mockResolvedValue(jsonRes(200, runActivity({ athlete: { id: 1 } })));
      expect(await service.handleWebhookEvent(createEvent)).toBe('owner_mismatch');
      expect(prisma.workoutResult.upsert).not.toHaveBeenCalled();
    });

    it('ignores non-running activities', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      fetchMock.mockResolvedValue(jsonRes(200, runActivity({ type: 'Ride', sport_type: 'Ride' })));
      expect(await service.handleWebhookEvent(createEvent)).toBe('not_run');
    });

    it('refreshes an expired token before fetching, storing the new tokens encrypted', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration({ expiresAt: new Date(Date.now() - 1000) }));
      prisma.workout.findMany.mockResolvedValue([scheduledWorkout]);
      fetchMock.mockImplementation(async (url: string, init: any) => {
        if (url === STRAVA_TOKEN_URL) {
          expect(JSON.parse(init.body)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'rt_valid' });
          return jsonRes(200, { access_token: 'at_new', refresh_token: 'rt_new', expires_at: Math.floor(Date.now() / 1000) + 21600 });
        }
        expect(init.headers.Authorization).toBe('Bearer at_new');
        return jsonRes(200, runActivity());
      });

      expect(await service.handleWebhookEvent(createEvent)).toBe('created');
      const upd = prisma.fitnessIntegration.update.mock.calls.find((c: any[]) => c[0].data.accessToken)![0];
      expect(decrypt(upd.data.accessToken)).toBe('at_new');
      expect(upd.data.accessToken).not.toBe('at_new');
      expect(decrypt(upd.data.refreshToken)).toBe('rt_new');
    });

    it('also refreshes when the token expires within the safety margin', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration({ expiresAt: new Date(Date.now() + 60_000) }));
      fetchMock.mockImplementation(async (url: string) => (url === STRAVA_TOKEN_URL
        ? jsonRes(200, { access_token: 'at_new', refresh_token: 'rt_new', expires_at: Math.floor(Date.now() / 1000) + 21600 })
        : jsonRes(200, runActivity({ type: 'Ride', sport_type: 'Ride' }))));
      await service.handleWebhookEvent(createEvent);
      expect(fetchMock.mock.calls[0][0]).toBe(STRAVA_TOKEN_URL);
    });

    it('reads legacy plaintext tokens and re-encrypts them', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration({ accessToken: 'legacy_plain_at', refreshToken: 'legacy_plain_rt' }));
      fetchMock.mockResolvedValue(jsonRes(200, runActivity({ type: 'Ride', sport_type: 'Ride' })));
      await service.handleWebhookEvent(createEvent);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer legacy_plain_at');
      await new Promise((r) => setImmediate(r));
      const upd = prisma.fitnessIntegration.update.mock.calls.find((c: any[]) => c[0].data.accessToken)![0];
      expect(decrypt(upd.data.accessToken)).toBe('legacy_plain_at');
      expect(upd.data.accessToken).not.toBe('legacy_plain_at');
    });

    // ── deauthorization ──
    const deauthEvent = { object_type: 'athlete' as const, object_id: 99999, aspect_type: 'update' as const, owner_id: 99999, subscription_id: 1, updates: { authorized: 'false' } };

    it('deauth: deactivates only after Strava rejects the token', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      fetchMock.mockResolvedValue(jsonRes(401, { message: 'Authorization Error' }));
      expect(await service.handleWebhookEvent(deauthEvent)).toBe('deauthorized');
      expect(fetchMock).toHaveBeenCalledWith(`${STRAVA_API_BASE}/athlete`, expect.anything());
      expect(prisma.fitnessIntegration.update).toHaveBeenCalledWith({ where: { id: 'fi_1' }, data: { isActive: false } });
    });

    it('deauth: forged event is ignored when the token still works', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      fetchMock.mockResolvedValue(jsonRes(200, { id: 99999 }));
      expect(await service.handleWebhookEvent(deauthEvent)).toBe('deauth_rejected');
      expect(prisma.fitnessIntegration.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    });

    it('deauth: expired token + refresh rejected (400) → deactivated', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration({ expiresAt: new Date(Date.now() - 1000) }));
      fetchMock.mockResolvedValue(jsonRes(400, { message: 'Bad Request' }));
      expect(await service.handleWebhookEvent(deauthEvent)).toBe('deauthorized');
    });

    it('delete: only unlinks after Strava confirms 404', async () => {
      prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
      fetchMock.mockResolvedValueOnce(jsonRes(200, runActivity()));
      expect(await service.handleWebhookEvent({ ...createEvent, aspect_type: 'delete' })).toBe('ignored');
      expect(prisma.workoutResult.updateMany).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(jsonRes(404, {}));
      expect(await service.handleWebhookEvent({ ...createEvent, aspect_type: 'delete' })).toBe('deleted');
      expect(prisma.workoutResult.updateMany).toHaveBeenCalled();
    });

    // ── rate limit ──
    it('429 → event deferred and further calls short-circuit until the window resets', async () => {
      {
        prisma.fitnessIntegration.findFirst.mockResolvedValue(integration());
        fetchMock.mockResolvedValue(jsonRes(429, {}, { 'x-ratelimit-usage': '101,500', 'x-ratelimit-limit': '100,1000' }));
        expect(await service.handleWebhookEvent(createEvent)).toBe('deferred');
        expect(await service.handleWebhookEvent({ ...createEvent, object_id: 2 })).toBe('deferred');
        expect(fetchMock).toHaveBeenCalledTimes(1); // segunda chamada nem saiu
      }
    });
  });

  // ── backfill / manual sync ──
  describe('syncActivities', () => {
    it('pulls recent activities, skips non-runs and already-imported ones', async () => {
      fetchMock.mockResolvedValue(jsonRes(200, [
        runActivity({ id: 1 }),
        runActivity({ id: 2, type: 'Ride', sport_type: 'Ride' }),
        runActivity({ id: 3 }),
      ]));
      prisma.workout.findMany.mockResolvedValue([scheduledWorkout]);
      prisma.workoutResult.findFirst.mockImplementation(async ({ where }: any) =>
        where.externalId === 'strava_3' ? { id: 'x', workoutId: 'w_9' } : null);

      const result = await service.syncActivities('u1', integration() as any);
      expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`^${STRAVA_API_BASE}/athlete/activities\\?after=\\d+&per_page=50$`));
      expect(result).toMatchObject({ provider: 'STRAVA', synced: 1, duplicates: 1 });
      expect(prisma.workoutResult.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns rate_limited instead of throwing on 429', async () => {
      fetchMock.mockResolvedValue(jsonRes(429, {}));
      const result: any = await service.syncActivities('u1', integration() as any);
      expect(result.error).toBe('rate_limited');
    });
  });
});

describe('Strava helpers', () => {
  it('parseStravaWebhookEvent validates shape strictly', () => {
    expect(parseStravaWebhookEvent({ object_type: 'activity', object_id: 1, aspect_type: 'create', owner_id: 2, subscription_id: 3 })).not.toBeNull();
    expect(parseStravaWebhookEvent({ object_type: 'activity', object_id: 'x', aspect_type: 'create', owner_id: 2, subscription_id: 3 })).toBeNull();
    expect(parseStravaWebhookEvent({ object_type: 'club', object_id: 1, aspect_type: 'create', owner_id: 2, subscription_id: 3 })).toBeNull();
    expect(parseStravaWebhookEvent({ object_type: 'activity', object_id: 1, aspect_type: 'create', owner_id: 2 })).toBeNull();
    expect(parseStravaWebhookEvent(null)).toBeNull();
  });

  it('pickMatchingWorkout uses the athlete local date (late-evening run in UTC-3)', () => {
    // 22:30 em São Paulo = 01:30Z do dia seguinte; o treino é do dia local
    const w = { id: 'w', scheduledDate: new Date('2026-10-14T00:00:00Z'), targetDistanceMeters: 8000, targetDurationSeconds: null };
    const m = pickMatchingWorkout([w], { localDate: '2026-10-14', utcOffsetSeconds: -10800, distanceMeters: 8300, movingTimeSeconds: 2400 });
    expect(m?.id).toBe('w');
  });

  it('pickMatchingWorkout enforces ±10% distance and prefers the closest', () => {
    const base = { scheduledDate: new Date('2026-10-14T12:00:00Z'), targetDurationSeconds: null };
    const cands = [
      { id: 'far', targetDistanceMeters: 15000, ...base },
      { id: 'near', targetDistanceMeters: 10100, ...base },
      { id: 'ok', targetDistanceMeters: 9300, ...base },
    ];
    const act = { localDate: '2026-10-14', utcOffsetSeconds: 0, distanceMeters: 10000, movingTimeSeconds: 3000 };
    expect(pickMatchingWorkout(cands, act)?.id).toBe('near');
    expect(pickMatchingWorkout([cands[0]], act)).toBeNull();
    expect(pickMatchingWorkout([{ ...cands[1], scheduledDate: new Date('2026-10-16T12:00:00Z') }], act)).toBeNull();
  });

  it('pickMatchingWorkout falls back to duration target when there is no distance target', () => {
    const w = { id: 'd', scheduledDate: new Date('2026-10-14T00:00:00Z'), targetDistanceMeters: null, targetDurationSeconds: 3600 };
    expect(pickMatchingWorkout([w], { localDate: '2026-10-14', utcOffsetSeconds: 0, distanceMeters: 11000, movingTimeSeconds: 3500 })?.id).toBe('d');
    expect(pickMatchingWorkout([w], { localDate: '2026-10-14', utcOffsetSeconds: 0, distanceMeters: 11000, movingTimeSeconds: 2000 })).toBeNull();
  });

  it('mapStravaActivityToResult rounds integer fields and leaves missing calories null', () => {
    const r = mapStravaActivityToResult({ id: 5, distance: 5000, moving_time: 1500, average_heartrate: 150.5 });
    expect(r).toMatchObject({ externalId: 'strava_5', distanceMeters: 5000, durationSeconds: 1500, avgPace: '5:00', avgHeartRate: 151, calories: null });
  });
});
