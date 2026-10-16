import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AiTrainingService } from './ai-training.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('IA - Treinos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.COACH)
@Controller('ai-training')
export class AiTrainingController {
  constructor(private readonly aiTrainingService: AiTrainingService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Gerar plano de treino com IA baseado nos dados do atleta' })
  async generatePlan(
    @CurrentUser() user: any,
    @Body() dto: GeneratePlanDto,
  ) {
    return this.aiTrainingService.generatePlan(user, dto);
  }
}
