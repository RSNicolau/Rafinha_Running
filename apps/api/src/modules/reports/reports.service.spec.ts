import { ReportsService } from './reports.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const mockPrisma = {
  user: { findUnique: jest.fn() },
  workout: { findMany: jest.fn() },
  physicalAssessment: { findMany: jest.fn() },
  garminHealthSnapshot: { findMany: jest.fn() },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(mockPrisma as any);
  });

  it('throws NotFoundException when athlete not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.generateMonthlyPdf('req-1', 'unknown', '2026-03'))
      .rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when requester is not athlete or coach', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'athlete-1',
      name: 'João',
      athleteProfile: { coachId: 'coach-1', coach: { name: 'Rafinha' } },
    });
    mockPrisma.workout.findMany.mockResolvedValue([]);
    mockPrisma.physicalAssessment.findMany.mockResolvedValue([]);
    mockPrisma.garminHealthSnapshot.findMany.mockResolvedValue([]);

    await expect(service.generateMonthlyPdf('stranger-id', 'athlete-1', '2026-03'))
      .rejects.toThrow(ForbiddenException);
  });

  it('generates PDF buffer for valid athlete request', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'athlete-1',
      name: 'João',
      athleteProfile: { coachId: 'coach-1', coach: { name: 'Rafinha' } },
    });
    mockPrisma.workout.findMany.mockResolvedValue([]);
    mockPrisma.physicalAssessment.findMany.mockResolvedValue([]);
    mockPrisma.garminHealthSnapshot.findMany.mockResolvedValue([]);

    const result = await service.generateMonthlyPdf('athlete-1', 'athlete-1', '2026-03');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(100);
  });
});
