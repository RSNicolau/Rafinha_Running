import { TrainingLoadService } from './training-load.service';

const mockPrisma = {
  workout: { findMany: jest.fn() },
};

describe('TrainingLoadService', () => {
  let service: TrainingLoadService;

  beforeEach(() => {
    service = new TrainingLoadService(mockPrisma as any);
  });

  it('returns empty array when no workouts', async () => {
    mockPrisma.workout.findMany.mockResolvedValue([]);
    const result = await service.getTrainingLoad('athlete-1', 30);
    expect(result).toHaveLength(31); // 30 days + today
    expect(result[0].load).toBe(0);
    expect(result[0].atl).toBe(0);
    expect(result[0].ctl).toBe(0);
  });

  it('ATL always >= CTL when training starts from 0', async () => {
    // With a single big workout, ATL (7d avg) rises faster than CTL (42d avg)
    mockPrisma.workout.findMany.mockResolvedValue([{
      scheduledDate: new Date(),
      result: { distanceMeters: 10000 },
    }]);
    const result = await service.getTrainingLoad('athlete-1', 7);
    const last = result[result.length - 1];
    expect(last.atl).toBeGreaterThanOrEqual(last.ctl);
  });

  it('TSB equals CTL minus ATL', async () => {
    mockPrisma.workout.findMany.mockResolvedValue([]);
    const result = await service.getTrainingLoad('athlete-1', 14);
    result.forEach(point => {
      expect(Math.abs(point.tsb - (point.ctl - point.atl))).toBeLessThan(0.01);
    });
  });
});
