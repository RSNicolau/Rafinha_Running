import { BadgesService } from './badges.service';

const mockPrisma = {
  badge: { findMany: jest.fn(), count: jest.fn(), upsert: jest.fn() },
  athleteBadge: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  workout: { findMany: jest.fn() },
  workoutResult: { findMany: jest.fn() },
};

describe('BadgesService', () => {
  let service: BadgesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BadgesService(mockPrisma as any);
    mockPrisma.badge.count.mockResolvedValue(12);
  });

  it('awards first_run badge after one completed workout', async () => {
    mockPrisma.badge.findMany.mockResolvedValue([
      { id: 'b1', key: 'first_run' }
    ]);
    mockPrisma.workout.findMany.mockResolvedValue([
      { completedAt: new Date(), scheduledDate: new Date() }
    ]);
    mockPrisma.workoutResult.findMany.mockResolvedValue([]);
    mockPrisma.athleteBadge.findUnique.mockResolvedValue(null);
    mockPrisma.athleteBadge.create.mockResolvedValue({});

    const awarded = await service.checkAndAwardBadges('athlete-1');
    expect(awarded).toContain('first_run');
  });

  it('does not award badge already earned', async () => {
    mockPrisma.badge.findMany.mockResolvedValue([{ id: 'b1', key: 'first_run' }]);
    mockPrisma.workout.findMany.mockResolvedValue([{ completedAt: new Date(), scheduledDate: new Date() }]);
    mockPrisma.workoutResult.findMany.mockResolvedValue([]);
    mockPrisma.athleteBadge.findUnique.mockResolvedValue({ id: 'existing' }); // already earned

    const awarded = await service.checkAndAwardBadges('athlete-1');
    expect(awarded).not.toContain('first_run');
    expect(mockPrisma.athleteBadge.create).not.toHaveBeenCalled();
  });
});
