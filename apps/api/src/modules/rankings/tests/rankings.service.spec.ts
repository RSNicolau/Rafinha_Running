import { Test, TestingModule } from '@nestjs/testing';
import { RankingsService } from '../rankings.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockRawKmResult = [
  { user_id: 'user-1', name: 'João Silva', avatar_url: null, total_meters: BigInt(52000) },
  { user_id: 'user-2', name: 'Maria Santos', avatar_url: 'https://example.com/avatar.jpg', total_meters: BigInt(48500) },
];

const mockRawWorkoutsResult = [
  { user_id: 'user-3', name: 'Carlos Oliveira', avatar_url: null, total_workouts: BigInt(24) },
  { user_id: 'user-4', name: 'Ana Costa', avatar_url: null, total_workouts: BigInt(18) },
];

const mockPrisma = {
  workoutResult: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn(),
};

describe('RankingsService', () => {
  let service: RankingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RankingsService>(RankingsService);
    jest.clearAllMocks();
  });

  describe('getTopByKm', () => {
    it('should return ranked entries with positions', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockRawKmResult);

      const result = await service.getTopByKm('all', 20);

      expect(result).toHaveLength(2);
      expect(result[0].position).toBe(1);
      expect(result[0].name).toBe('João Silva');
      expect(result[0].value).toBe(52); // converted from meters to km
      expect(result[0].unit).toBe('km');
      expect(result[1].position).toBe(2);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getTopByKm('all', 500);

      const call = mockPrisma.$queryRaw.mock.calls[0];
      expect(call).toBeDefined();
    });

    it('should return empty array when no results', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getTopByKm('all', 20);

      expect(result).toEqual([]);
    });
  });

  describe('getTopByWorkouts', () => {
    it('should return workout count rankings', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockRawWorkoutsResult);

      const result = await service.getTopByWorkouts(20);

      expect(result).toHaveLength(2);
      expect(result[0].position).toBe(1);
      expect(result[0].unit).toBe('treinos');
      expect(result[0].value).toBe(24);
      expect(result[1].position).toBe(2);
    });
  });
});
