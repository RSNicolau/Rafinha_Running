import { Controller, Post, Get, Put, Body, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AiAssistantService } from './ai-assistant.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { GeneratePlanAiDto } from './dto/generate-plan-ai.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('ai-assistant')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.COACH)
export class AiAssistantController {
  constructor(private readonly service: AiAssistantService) {}

  @Post('chat')
  async streamChat(
    @CurrentUser() user: any,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    // Checagem de posse ANTES de abrir o stream (resposta 404 normal se o atleta não é do coach)
    if (dto.athleteId) await this.service.assertAthleteAccess(user, dto.athleteId);
    // Sem chave (plataforma/BYOK) → 503 JSON normal, ANTES de abrir o stream
    const creds = await this.service.requireCredentials(user.id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await this.service.streamToResponse(user, dto, res, creds);
  }

  @Post('generate-plan')
  async generatePlan(
    @CurrentUser() user: any,
    @Body() dto: GeneratePlanAiDto,
  ) {
    return this.service.generatePlan(user, dto);
  }

  @Get('insight')
  async getInsight(@CurrentUser('id') coachId: string) {
    return this.service.getInsight(coachId);
  }

  @Get('status')
  async getStatus(@CurrentUser('id') coachId: string) {
    return this.service.getAiStatus(coachId);
  }

  @Get('config')
  async getConfig(@CurrentUser('id') coachId: string) {
    return this.service.getConfig(coachId);
  }

  @Put('config')
  async updateConfig(
    @CurrentUser('id') coachId: string,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.service.updateConfig(coachId, dto);
  }
}
