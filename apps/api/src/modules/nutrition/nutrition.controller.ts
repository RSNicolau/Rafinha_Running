import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NutritionService } from './nutrition.service';
import { CreateMealDto, UpdateWaterDto } from './dto/nutrition.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('nutrition')
@UseGuards(AuthGuard('jwt'))
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

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
}
