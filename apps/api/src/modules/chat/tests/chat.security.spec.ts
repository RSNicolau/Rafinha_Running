import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../chat.service';
import { ChatGateway } from '../chat.gateway';

function makePrisma() {
  return {
    conversation: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    athleteProfile: { findUnique: jest.fn() },
    message: { create: jest.fn(), count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  } as any;
}

describe('ChatService — participação (C3)', () => {
  let prisma: any;
  let service: ChatService;
  beforeEach(() => {
    prisma = makePrisma();
    service = new ChatService(prisma);
  });

  it('assertParticipant bloqueia não participante', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1' });
    await expect(service.assertParticipant('c1', { id: 'intruder', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertParticipant permite participante e ADMIN', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1' });
    await expect(service.assertParticipant('c1', { id: 'a1', role: 'ATHLETE' })).resolves.toBeTruthy();
    await expect(service.assertParticipant('c1', { id: 'x', role: 'ADMIN' })).resolves.toBeTruthy();
  });

  it('coach não cria conversa com atleta de outro coach', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'other' });
    await expect(
      service.getOrCreateForUser({ id: 'k1', role: 'COACH' }, { athleteId: 'a-victim' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('atleta não escolhe coach arbitrário (coachId do corpo ≠ próprio treinador)', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'my-coach' });
    await expect(
      service.getOrCreateForUser({ id: 'a1', role: 'ATHLETE' }, { coachId: 'other-coach', athleteId: 'someone' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('atleta sem treinador recebe 400', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: null });
    await expect(service.getOrCreateForUser({ id: 'a1', role: 'ATHLETE' }, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('atleta cria conversa com o próprio coach (lado derivado do JWT)', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'my-coach' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'new' });
    const conv = await service.getOrCreateForUser({ id: 'a1', role: 'ATHLETE' }, { athleteId: 'ignored' });
    expect(conv.id).toBe('new');
    expect(prisma.conversation.create).toHaveBeenCalledWith({ data: { athleteId: 'a1', coachId: 'my-coach' } });
  });
});

describe('ChatGateway — revogação de sessão', () => {
  function setup(user: any, payload: any) {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(user);
    const jwt = { verify: jest.fn().mockReturnValue(payload) } as any;
    const gw = new ChatGateway({} as any, jwt, prisma);
    const client: any = { id: 's1', handshake: { auth: { token: 't' }, headers: {} }, disconnect: jest.fn(), join: jest.fn() };
    return { gw, client };
  }

  it('desconecta quando tv não confere (sessão revogada)', async () => {
    const { gw, client } = setup({ id: 'u1', isActive: true, deletedAt: null, tokenVersion: 2 }, { sub: 'u1', tv: 1 });
    await gw.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('desconecta usuário inativo', async () => {
    const { gw, client } = setup({ id: 'u1', isActive: false, deletedAt: null, tokenVersion: 0 }, { sub: 'u1', tv: 0 });
    await gw.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('aceita token válido', async () => {
    const { gw, client } = setup({ id: 'u1', isActive: true, deletedAt: null, tokenVersion: 0 }, { sub: 'u1', tv: 0 });
    await gw.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('user:u1');
  });
});
