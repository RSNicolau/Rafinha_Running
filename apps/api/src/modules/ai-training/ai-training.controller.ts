import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AiTrainingService } from './ai-training.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('IA - Treinos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('api/ai-training')
export class AiTrainingController {
  constructor(private readonly aiTrainingService: AiTrainingService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Gerar plano de treino com IA baseado nos dados do atleta' })
  async generatePlan(
    @CurrentUser('id') coachId: string,
    @Body() dto: GeneratePlanDto,
  ) {
    return this.aiTrainingService.generatePlan(coachId, dto);
  }
}
