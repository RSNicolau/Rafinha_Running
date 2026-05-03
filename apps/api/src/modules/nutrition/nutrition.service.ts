import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMealDto, UpdateWaterDto } from './dto/nutrition.dto';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

  constructor(private prisma: PrismaService) {}

  // ── AI Macro Estimator ────────────────────────────────────────────────────

  async analyzeMacrosWithAI(description: string): Promise<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    analysis: string;
  }> {
    if (!description?.trim()) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, analysis: '' };
    }

    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: `Você é um nutricionista especializado em nutrição esportiva para corredores.
Analise a descrição de alimento e retorne SOMENTE um JSON válido com os macronutrientes estimados.
Use valores típicos brasileiros. Seja preciso e realista.
Formato OBRIGATÓRIO (apenas JSON, sem texto extra):
{"calories":450,"protein":30,"carbs":40,"fat":15,"analysis":"Estimativa para X: rico em proteínas"}`,
        messages: [{
          role: 'user',
          content: `Alimento: ${description}\n\nRetorne apenas o JSON com calories (kcal), protein (g), carbs (g), fat (g) e analysis (string curta).`,
        }],
      });

      const text = (msg.content[0] as any)?.text ?? '{}';
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const result = JSON.parse(jsonMatch[0]);

      return {
        calories: Math.round(result.calories ?? 0),
        protein: Math.round((result.protein ?? 0) * 10) / 10,
        carbs: Math.round((result.carbs ?? 0) * 10) / 10,
        fat: Math.round((result.fat ?? 0) * 10) / 10,
        analysis: result.analysis ?? '',
      };
    } catch (err: any) {
      this.logger.error(`Nutrition AI error: ${err.message}`);
      return { calories: 0, protein: 0, carbs: 0, fat: 0, analysis: 'Erro ao estimar — preencha manualmente.' };
    }
  }

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

  async getWaterLog(userId: string, date: string) {
    const dateObj = new Date(date);
    const waterLog = await this.prisma.waterLog.findUnique({
      where: { userId_date: { userId, date: dateObj } },
    });
    return {
      date,
      amount: waterLog?.amount ?? 0,
      goal: waterLog?.goal ?? 2000,
    };
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
