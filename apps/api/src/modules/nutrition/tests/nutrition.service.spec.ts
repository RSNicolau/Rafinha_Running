import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NutritionService } from '../nutrition.service';
import { PrismaService } from '../../../prisma/prisma.service';

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const todayDate = new Date(todayStr);

const mockMeal = {
  id: 'meal-1',
  userId: 'user-1',
  date: todayDate,
  mealName: 'Café da manhã',
  mealTime: '07:00',
  calories: 420,
  protein: 28,
  carbs: 45,
  fat: 12,
  items: ['Ovos mexidos', 'Pão integral'],
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWater = {
  id: 'water-1',
  userId: 'user-1',
  date: todayDate,
  amount: 1500,
  goal: 3000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  nutritionLog: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  waterLog: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('NutritionService', () => {
  let service: NutritionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NutritionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NutritionService>(NutritionService);
    jest.clearAllMocks();
  });

  describe('getDaySummary', () => {
    it('should return totals and water for a given day', async () => {
      mockPrisma.nutritionLog.findMany.mockResolvedValue([mockMeal]);
      mockPrisma.waterLog.findUnique.mockResolvedValue(mockWater);

      const result = await service.getDaySummary('user-1', todayStr);

      expect(result.meals).toHaveLength(1);
      expect(result.totals.calories).toBe(420);
      expect(result.totals.protein).toBe(28);
      expect(result.water.amount).toBe(1500);
      expect(result.water.goal).toBe(3000);
    });

    it('should return zeros when no data exists', async () => {
      mockPrisma.nutritionLog.findMany.mockResolvedValue([]);
      mockPrisma.waterLog.findUnique.mockResolvedValue(null);

      const result = await service.getDaySummary('user-1', todayStr);

      expect(result.meals).toHaveLength(0);
      expect(result.totals.calories).toBe(0);
      expect(result.water.amount).toBe(0);
      expect(result.water.goal).toBe(3000);
    });
  });

  describe('logMeal', () => {
    it('should create a nutrition log entry', async () => {
      mockPrisma.nutritionLog.create.mockResolvedValue(mockMeal);

      const result = await service.logMeal('user-1', {
        date: todayStr,
        mealName: 'Café da manhã',
        mealTime: '07:00',
        calories: 420,
        protein: 28,
        carbs: 45,
        fat: 12,
        items: ['Ovos mexidos', 'Pão integral'],
      });

      expect(mockPrisma.nutritionLog.create).toHaveBeenCalledTimes(1);
      expect(result.mealName).toBe('Café da manhã');
      expect(result.calories).toBe(420);
    });
  });

  describe('deleteMeal', () => {
    it('should delete meal belonging to user', async () => {
      mockPrisma.nutritionLog.findUnique.mockResolvedValue(mockMeal);
      mockPrisma.nutritionLog.delete.mockResolvedValue(mockMeal);

      await service.deleteMeal('user-1', 'meal-1');

      expect(mockPrisma.nutritionLog.delete).toHaveBeenCalledWith({ where: { id: 'meal-1' } });
    });

    it('should throw NotFoundException for non-existent meal', async () => {
      mockPrisma.nutritionLog.findUnique.mockResolvedValue(null);

      await expect(service.deleteMeal('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for meal belonging to another user', async () => {
      mockPrisma.nutritionLog.findUnique.mockResolvedValue({ ...mockMeal, userId: 'other-user' });

      await expect(service.deleteMeal('user-1', 'meal-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateWater', () => {
    it('should upsert water log', async () => {
      mockPrisma.waterLog.upsert.mockResolvedValue(mockWater);

      const result = await service.updateWater('user-1', { date: todayStr, amount: 2000 });

      expect(mockPrisma.waterLog.upsert).toHaveBeenCalledTimes(1);
      expect(result.amount).toBe(1500); // mock returns 1500
    });
  });

  describe('getWeekHistory', () => {
    it('should return 7 days of data', async () => {
      mockPrisma.nutritionLog.findMany.mockResolvedValue([mockMeal]);
      mockPrisma.waterLog.findMany.mockResolvedValue([mockWater]);

      const result = await service.getWeekHistory('user-1');

      expect(result).toHaveLength(7);
      result.forEach((day) => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('calories');
        expect(day).toHaveProperty('water');
      });
    });
  });
});
