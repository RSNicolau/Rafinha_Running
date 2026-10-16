import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NutritionService } from './nutrition.service';
import {
  CreateMealDto, UpdateWaterDto, CreateNutritionLogDto, CreateWaterLogDto,
  AnalyzeMacrosDto, CreateSupplementDto, ToggleSupplementDto,
} from './dto/nutrition.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCoachOwnsAthlete } from '../../common/utils/ownership';

@Controller('nutrition')
@UseGuards(AuthGuard('jwt'))
export class NutritionController {
  constructor(
    private readonly nutritionService: NutritionService,
    private readonly prisma: PrismaService,
  ) {}

  // ── AI macro estimation ────────────────────────────────────────────────────

  @Post('analyze')
  analyzeMacros(@Body() body: AnalyzeMacrosDto) {
    return this.nutritionService.analyzeMacrosWithAI(body.description);
  }

  // ── Original endpoints (kept for backwards compat) ──────────────────────────

  @Get('day')
  getDaySummary(@CurrentUser('id') userId: string, @Query('date') date: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getDaySummary(userId, date || today);
  }

  @Get('week')
  getWeekHistory(@CurrentUser('id') userId: string) {
    return this.nutritionService.getWeekHistory(userId);
  }

  @Post('meal')
  logMeal(@CurrentUser('id') userId: string, @Body() dto: CreateMealDto) {
    return this.nutritionService.logMeal(userId, dto);
  }

  @Delete('meal/:id')
  deleteMeal(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.nutritionService.deleteMeal(userId, id);
  }

  @Post('water')
  updateWater(@CurrentUser('id') userId: string, @Body() dto: UpdateWaterDto) {
    return this.nutritionService.updateWater(userId, dto);
  }

  // ── Supplements ──────────────────────────────────────────────────────────────

  /** GET /nutrition/supplements?date=YYYY-MM-DD — lista com estado "tomado" do dia */
  @Get('supplements')
  getSupplements(@CurrentUser('id') userId: string, @Query('date') date: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getSupplements(userId, date || today);
  }

  @Post('supplements')
  createSupplement(
    @CurrentUser('id') userId: string,
    @Body() body: CreateSupplementDto,
  ) {
    return this.nutritionService.createSupplement(userId, {
      name: body.name, dose: body.dose, timeOfDay: body.timeOfDay, color: body.color, icon: body.icon,
    });
  }

  @Delete('supplements/:id')
  deleteSupplement(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.nutritionService.deleteSupplement(userId, id);
  }

  /** POST /nutrition/supplements/:id/toggle — marca/desmarca ingestão do dia */
  @Post('supplements/:id/toggle')
  toggleSupplement(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: ToggleSupplementDto,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.toggleSupplementIntake(userId, id, body?.date || today);
  }

  // ── New standardized endpoints ───────────────────────────────────────────────

  /** GET /nutrition/my — athlete fetches their own logs (day + week) */
  @Get('my')
  getMyLogs(@CurrentUser('id') userId: string, @Query('date') date: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getDaySummary(userId, date || today);
  }

  /** POST /nutrition — athlete registers a meal */
  @Post()
  createNutritionLog(@CurrentUser('id') userId: string, @Body() dto: CreateNutritionLogDto) {
    const mealDto: CreateMealDto = {
      date: dto.loggedAt ? dto.loggedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      mealName: dto.description,
      mealTime: dto.mealType,
      calories: dto.calories ?? 0,
      protein: dto.protein ?? 0,
      carbs: dto.carbs ?? 0,
      fat: dto.fat ?? 0,
    };
    return this.nutritionService.logMeal(userId, mealDto);
  }

  /** DELETE /nutrition/:id */
  @Delete(':id')
  deleteNutritionLog(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.nutritionService.deleteMeal(userId, id);
  }

  /** GET /nutrition/water/my — athlete fetches water logs */
  @Get('water/my')
  getMyWaterLogs(@CurrentUser('id') userId: string, @Query('date') date: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getWaterLog(userId, date || today);
  }

  /** POST /nutrition/water/log — athlete adds water intake */
  @Post('water/log')
  addWaterLog(@CurrentUser('id') userId: string, @Body() dto: CreateWaterLogDto) {
    const waterDto: UpdateWaterDto = {
      amount: dto.amountMl,
      date: dto.loggedAt ? dto.loggedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
    return this.nutritionService.updateWater(userId, waterDto);
  }

  /** GET /nutrition/coach/:athleteId — coach views athlete logs */
  @Get('coach/:athleteId')
  async getAthleteLogsForCoach(
    @CurrentUser() user: { id: string; role: string },
    @Param('athleteId') athleteId: string,
    @Query('date') date: string,
  ) {
    if (user.role !== 'COACH' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acesso restrito a coaches');
    }
    // Coach só vê atletas vinculados a ele (ADMIN/SUPER_ADMIN liberados)
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false, healthData: true });
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getDaySummary(athleteId, date || today);
  }
}
