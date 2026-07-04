/**
 * Unit tests for the upcoming-events newsletter job.
 *
 * Instantiates SchedulerService directly with mocked dependencies — no DB needed.
 */

import { SchedulerService } from './scheduler.service';

function makeMocks() {
  const prisma: any = {
    event: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    eventRegistration: { findMany: jest.fn() },
  };
  const email: any = { sendUpcomingEventsNewsletter: jest.fn().mockResolvedValue(undefined) };
  const cache: any = {};
  const rankings: any = {};
  const coachBrain: any = {};
  const service = new SchedulerService(prisma, cache, email, rankings, coachBrain);
  return { prisma, email, service };
}

describe('SchedulerService — upcoming events newsletter', () => {
  it('skips entirely when there are no upcoming published events', async () => {
    const { prisma, email, service } = makeMocks();
    prisma.event.findMany.mockResolvedValue([]);

    await service.sendUpcomingEventsNewsletter();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(email.sendUpcomingEventsNewsletter).not.toHaveBeenCalled();
  });

  it('emails each athlete only the events they are not registered for', async () => {
    const { prisma, email, service } = makeMocks();
    prisma.event.findMany.mockResolvedValue([
      { id: 'ev1', title: 'São Garrafa', eventDate: new Date('2026-12-13'), location: 'SP', city: 'São Paulo', modality: '10K', price: 8500 },
      { id: 'ev2', title: 'Meia SP', eventDate: new Date('2027-05-23'), location: 'Ibirapuera', city: 'São Paulo', modality: '21K', price: 18900 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'a1', email: 'a1@t.com', name: 'Ana' },
      { id: 'a2', email: 'a2@t.com', name: 'Bia' },
    ]);
    // Ana já está inscrita no ev1; Bia em nenhum
    prisma.eventRegistration.findMany.mockResolvedValue([{ eventId: 'ev1', userId: 'a1' }]);

    await service.sendUpcomingEventsNewsletter();

    expect(email.sendUpcomingEventsNewsletter).toHaveBeenCalledTimes(2);
    const anaCall = email.sendUpcomingEventsNewsletter.mock.calls.find((c: any[]) => c[0] === 'a1@t.com');
    const biaCall = email.sendUpcomingEventsNewsletter.mock.calls.find((c: any[]) => c[0] === 'a2@t.com');
    expect(anaCall[2].map((e: any) => e.title)).toEqual(['Meia SP']);
    expect(biaCall[2].map((e: any) => e.title)).toEqual(['São Garrafa', 'Meia SP']);
  });

  it('skips athletes already registered for every upcoming event', async () => {
    const { prisma, email, service } = makeMocks();
    prisma.event.findMany.mockResolvedValue([
      { id: 'ev1', title: 'São Garrafa', eventDate: new Date('2026-12-13'), location: null, city: null, modality: null, price: 0 },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'a1', email: 'a1@t.com', name: 'Ana' }]);
    prisma.eventRegistration.findMany.mockResolvedValue([{ eventId: 'ev1', userId: 'a1' }]);

    await service.sendUpcomingEventsNewsletter();

    expect(email.sendUpcomingEventsNewsletter).not.toHaveBeenCalled();
  });
});
