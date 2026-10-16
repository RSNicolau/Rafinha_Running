import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LiveTrackingController } from '../live-tracking.controller';
import { LiveTrackingGateway } from '../live-tracking.gateway';
import { LiveTrackingService } from '../live-tracking.service';

function cacheMock(store: Record<string, any> = {}) {
  return {
    get: jest.fn(async (k: string) => store[k] ?? null),
    set: jest.fn(async (k: string, v: any) => { store[k] = v; }),
    del: jest.fn(async (k: string) => { delete store[k]; }),
    getKeysByPattern: jest.fn(async () => Object.keys(store).filter((k) => k.startsWith('live:session:'))),
  };
}

describe('H2 — live-tracking REST', () => {
  it('GET /active: coach só vê os próprios atletas', async () => {
    const store = {
      'live:session:mine': { athleteId: 'mine', startedAt: 1, lastUpdate: null },
      'live:session:theirs': { athleteId: 'theirs', startedAt: 1, lastUpdate: null },
    };
    const svc = new LiveTrackingService(cacheMock(store) as any);
    const prisma: any = { athleteProfile: { findMany: jest.fn().mockResolvedValue([{ userId: 'mine' }]) } };
    const ctrl = new LiveTrackingController(svc, prisma);
    const res = await ctrl.getActiveAthletes({ id: 'coach-1', role: 'COACH' });
    expect(res.map((r: any) => r.athleteId)).toEqual(['mine']);
    await expect(ctrl.getActiveAthletes({ id: 'a', role: 'ATHLETE' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('position/route: coach de outro tenant recebe 404', async () => {
    const svc = new LiveTrackingService(cacheMock() as any);
    const prisma: any = { athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'other' }) } };
    const ctrl = new LiveTrackingController(svc, prisma);
    await expect(ctrl.getAthletePosition('victim', { id: 'coach-1', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.getAthleteRoute('victim', { id: 'coach-1', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('H2 — live-tracking gateway', () => {
  function setup(dbUser: any, payload: any) {
    const store: Record<string, any> = {};
    const svc = new LiveTrackingService(cacheMock(store) as any);
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(dbUser) } };
    const jwt: any = { verify: jest.fn().mockReturnValue(payload) };
    const gw = new LiveTrackingGateway(svc, jwt, prisma);
    gw.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;
    const client: any = { id: 'sock-1', handshake: { auth: { token: 't' }, headers: {} }, disconnect: jest.fn(), join: jest.fn(), emit: jest.fn() };
    return { gw, client, store, svc };
  }

  it('rejeita token com tv revogado', async () => {
    const { gw, client } = setup({ id: 'u', role: 'ATHLETE', isActive: true, deletedAt: null, tokenVersion: 3 }, { sub: 'u', tv: 2 });
    await gw.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('coach (ou outro atleta) não publica posição em nome de um atleta', async () => {
    const { gw, client } = setup({ id: 'coach-1', role: 'COACH', isActive: true, deletedAt: null, tokenVersion: 0 }, { sub: 'coach-1', tv: 0 });
    await gw.handleConnection(client);
    const r = await gw.handleStartTracking(client, { athleteId: 'victim' });
    expect(r).toEqual({ error: 'Não autorizado' });
  });

  it('atleta só publica location-update da própria sessão', async () => {
    const { gw, client, store } = setup({ id: 'ath-1', role: 'ATHLETE', isActive: true, deletedAt: null, tokenVersion: 0 }, { sub: 'ath-1', tv: 0 });
    await gw.handleConnection(client);
    await gw.handleStartTracking(client, { athleteId: 'ath-1' });
    const pt = { athleteId: 'ath-1', latitude: 1, longitude: 2, pace: 5, distance: 100, elapsed: 30, timestamp: Date.now() };
    await gw.handleLocationUpdate(client, pt);
    expect(store['live:session:ath-1'].lastUpdate.latitude).toBe(1);

    await gw.handleLocationUpdate(client, { ...pt, athleteId: 'ath-2' });
    expect(store['live:session:ath-2']).toBeUndefined();
  });
});
