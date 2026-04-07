import { Controller, Post, Get, Put, Body, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AiAssistantService } from './ai-assistant.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { GeneratePlanAiDto } from './dto/generate-plan-ai.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('ai-assistant')
@UseGuards(AuthGuard('jwt'))
export class AiAssistantController {
  constructor(private readonly service: AiAssistantService) {}

  @Post('chat')
  async streamChat(
    @CurrentUser('id') coachId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await this.service.streamToResponse(coachId, dto, res);
  }

  @Post('generate-plan')
  async generatePlan(
    @CurrentUser('id') coachId: string,
    @Body() dto: GeneratePlanAiDto,
  ) {
    return this.service.generatePlan(coachId, dto);
  }

  @Get('insight')
  async getInsight(@CurrentUser('id') coachId: string) {
    return this.service.getInsight(coachId);
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
