import { ChatService } from '../chat.service';
import { ChatController } from '../chat.controller';

function makePrisma() {
  return {
    conversation: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    athleteProfile: { findUnique: jest.fn() },
    message: { create: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn(), updateMany: jest.fn() },
  } as any;
}

const athlete = { id: 'a1', name: 'Beatriz Silva', avatarUrl: null };
const coach = { id: 'k1', name: 'Rafinha', avatarUrl: null };

describe('ChatService — conversas (A2)', () => {
  it('lista conversas em que participa como coach OU atleta, com otherUser = o outro participante', async () => {
    const prisma = makePrisma();
    const service = new ChatService(prisma);
    prisma.conversation.findMany.mockResolvedValue([
      { id: 'c1', athleteId: 'a1', coachId: 'k1', athlete, coach, messages: [] },
    ]);

    const asAthlete = await service.getConversations('a1', 'ATHLETE');
    expect(prisma.conversation.findMany.mock.calls[0][0].where).toEqual({ OR: [{ coachId: 'a1' }, { athleteId: 'a1' }] });
    expect(asAthlete[0].otherUser.name).toBe('Rafinha');
    expect(asAthlete[0].myRole).toBe('ATHLETE');

    // ADMIN que também é treinador da conversa vê o atleta como o outro lado
    const asAdminCoach = await service.getConversations('k1', 'ADMIN');
    expect(asAdminCoach[0].otherUser.name).toBe('Beatriz Silva');
    expect(asAdminCoach[0].myRole).toBe('COACH');
  });

  it('getOrCreateForUser devolve a conversa decorada (otherUser) para o atleta', async () => {
    const prisma = makePrisma();
    const service = new ChatService(prisma);
    prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'k1' });
    prisma.conversation.findFirst.mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1' });
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1', athlete, coach, messages: [] });
    const conv: any = await service.getOrCreateForUser({ id: 'a1', role: 'ATHLETE' }, {});
    expect(conv.otherUser.name).toBe('Rafinha');
  });

  it('getMessages devolve {data,total,page,totalPages} em ordem cronológica', async () => {
    const prisma = makePrisma();
    const service = new ChatService(prisma);
    prisma.message.count.mockResolvedValue(3);
    prisma.message.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
    const res = await service.getMessages('c1', 1, 50);
    expect(res).toEqual({ data: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], total: 3, page: 1, totalPages: 1 });
  });
});

describe('ChatController — tempo real em mensagens via REST', () => {
  it('notifica o gateway após enviar mensagem pelo REST', async () => {
    const service: any = {
      assertParticipant: jest.fn().mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1' }),
      sendMessage: jest.fn().mockResolvedValue({ id: 'm1', content: 'oi' }),
    };
    const gateway: any = { notifyMessage: jest.fn() };
    const ctrl = new ChatController(service, gateway);
    const msg = await ctrl.sendMessage('c1', { id: 'a1', role: 'ATHLETE' }, { content: 'oi' });
    expect(msg).toEqual({ id: 'm1', content: 'oi' });
    expect(gateway.notifyMessage).toHaveBeenCalledWith({ id: 'c1', athleteId: 'a1', coachId: 'k1' }, { id: 'm1', content: 'oi' });
  });

  it('funciona sem gateway (testes / sem websocket)', async () => {
    const service: any = {
      assertParticipant: jest.fn().mockResolvedValue({ id: 'c1', athleteId: 'a1', coachId: 'k1' }),
      sendMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    };
    const ctrl = new ChatController(service);
    await expect(ctrl.sendMessage('c1', { id: 'a1' }, { content: 'x' })).resolves.toEqual({ id: 'm1' });
  });
});
