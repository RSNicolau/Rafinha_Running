import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NutritionService } from './nutrition.service';
import { CreateMealDto, UpdateWaterDto } from './dto/nutrition.dto';

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get('day')
  getDaySummary(@Request() req: any, @Query('date') date: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.nutritionService.getDaySummary(req.user.sub, date || today);
  }

  @Get('week')
  getWeekHistory(@Request() req: any) {
    return this.nutritionService.getWeekHistory(req.user.sub);
  }

  @Post('meal')
  logMeal(@Request() req: any, @Body() dto: CreateMealDto) {
    return this.nutritionService.logMeal(req.user.sub, dto);
  }

  @Delete('meal/:id')
  deleteMeal(@Request() req: any, @Param('id') id: string) {
    return this.nutritionService.deleteMeal(req.user.sub, id);
  }

  @Post('water')
  updateWater(@Request() req: any, @Body() dto: UpdateWaterDto) {
    return this.nutritionService.updateWater(req.user.sub, dto);
  }
}
