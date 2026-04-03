import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMealDto, UpdateWaterDto } from './dto/nutrition.dto';

@Injectable()
export class NutritionService {
  constructor(private prisma: PrismaService) {}

  async getDaySummary(userId: string, date: string) {
    const dateObj = new Date(date);

    const [meals, water] = await Promise.all([
      this.prisma.nutritionLog.findMany({
        where: { userId, date: dateObj },
        orderBy: { mealTime: 'asc' },
      }),
      this.prisma.waterLog.findUnique({
        where: { userId_date: { userId, date: dateObj } },
      }),
    ]);

    const totals = meals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return {
      date,
      meals,
      totals,
      water: {
        amount: water?.amount ?? 0,
        goal: water?.goal ?? 3000,
      },
    };
  }

  async logMeal(userId: string, dto: CreateMealDto) {
    return this.prisma.nutritionLog.create({
      data: {
        userId,
        date: new Date(dto.date),
        mealName: dto.mealName,
        mealTime: dto.mealTime,
        calories: dto.calories,
        protein: dto.protein,
        carbs: dto.carbs,
        fat: dto.fat,
        items: dto.items ?? [],
        notes: dto.notes,
      },
    });
  }

  async deleteMeal(userId: string, mealId: string) {
    const meal = await this.prisma.nutritionLog.findUnique({ where: { id: mealId } });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    if (meal.userId !== userId) throw new NotFoundException('Refeição não encontrada');
    return this.prisma.nutritionLog.delete({ where: { id: mealId } });
  }

  async updateWater(userId: string, dto: UpdateWaterDto) {
    const dateObj = new Date(dto.date);
    return this.prisma.waterLog.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: { amount: dto.amount, ...(dto.goal && { goal: dto.goal }) },
      create: { userId, date: dateObj, amount: dto.amount, goal: dto.goal ?? 3000 },
    });
  }

  async getWeekHistory(userId: string) {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [meals, water] = await Promise.all([
      this.prisma.nutritionLog.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lte: today },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.waterLog.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lte: today },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Group by date
    const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; water: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
    }

    meals.forEach((m) => {
      const key = m.date.toISOString().slice(0, 10);
      if (byDate[key]) {
        byDate[key].calories += m.calories;
        byDate[key].protein += m.protein;
        byDate[key].carbs += m.carbs;
        byDate[key].fat += m.fat;
      }
    });

    water.forEach((w) => {
      const key = w.date.toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].water = w.amount;
    });

    return Object.entries(byDate).map(([date, data]) => ({ date, ...data }));
  }
}
