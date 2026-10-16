import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { TwoFactorService } from '../two-factor.service';
import { UploadsService } from '../../uploads/uploads.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { InvitesService } from '../../invites/invites.service';

/** Guard fake: usuário vem do header x-test-user (JSON). */
class FakeJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) return false;
    req.user = JSON.parse(raw);
    return true;
  }
}

const ATHLETE = 'athlete-1';
const TEAM = 'team-1';

function makePrisma() {
  const profile = { coachId: 'coachA', teamId: TEAM };
  const memberships: Record<string, string> = { owner1: 'OWNER', staff1: 'STAFF' };
  return {
    athleteProfile: {
      findUnique: jest.fn(async ({ where }: any) => (where.userId === ATHLETE ? profile : null)),
    },
    teamMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        const role = memberships[where.userId];
        if (!role || where.teamId !== TEAM) return null;
        return where.role.in.includes(role) ? { role } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const role = memberships[where.userId];
        return role && where.role.in.includes(role) ? [{ teamId: TEAM }] : [];
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === ATHLETE
          ? {
              id: ATHLETE, name: 'Atleta', email: 'a@x.com',
              athleteProfile: { ...profile, weight: 70, height: 175, vo2max: 50, restingHR: 50, maxHR: 190, level: 'BEGINNER' },
            }
          : null,
      ),
    },
  };
}

describe('UsersController — GET /users/athletes/:athleteId', () => {
  let app: INestApplication;
  const as = (u: any) => ({ 'x-test-user': JSON.stringify(u) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: PrismaService, useValue: makePrisma() },
        { provide: CacheService, useValue: {} },
        { provide: InvitesService, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: UploadsService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(FakeJwtGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  it('route is declared (and before :id)', () => {
    const proto = UsersController.prototype as any;
    expect(typeof proto.getAthlete).toBe('function');
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('getAthlete')).toBeLessThan(names.indexOf('getUser'));
  });

  it('assigned COACH gets the athlete with health fields', async () => {
    const res = await request(app.getHttpServer()).get(`/users/athletes/${ATHLETE}`).set(as({ id: 'coachA', role: 'COACH' }));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ATHLETE);
    expect(res.body.athleteProfile.weight).toBe(70);
  });

  it('team OWNER gets the athlete with health fields', async () => {
    const res = await request(app.getHttpServer()).get(`/users/athletes/${ATHLETE}`).set(as({ id: 'owner1', role: 'COACH' }));
    expect(res.status).toBe(200);
    expect(res.body.athleteProfile.vo2max).toBe(50);
  });

  it('team STAFF gets the athlete WITHOUT health fields', async () => {
    const res = await request(app.getHttpServer()).get(`/users/athletes/${ATHLETE}`).set(as({ id: 'staff1', role: 'COACH' }));
    expect(res.status).toBe(200);
    expect(res.body.athleteProfile.weight).toBeNull();
    expect(res.body.athleteProfile.maxHR).toBeNull();
    expect(res.body.athleteProfile.healthDataHidden).toBe(true);
  });

  it('coach from another team → 404', async () => {
    const res = await request(app.getHttpServer()).get(`/users/athletes/${ATHLETE}`).set(as({ id: 'otherCoach', role: 'COACH' }));
    expect(res.status).toBe(404);
  });

  it('athlete role → 403 (route is COACH-only)', async () => {
    const res = await request(app.getHttpServer()).get(`/users/athletes/${ATHLETE}`).set(as({ id: 'x', role: 'ATHLETE' }));
    expect(res.status).toBe(403);
  });
});
