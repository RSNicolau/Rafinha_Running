import {
  Controller, Post, Get, Put, Delete, Param, Body, UseGuards, Res,
  UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CoachBrainService, AIProvider } from './coach-brain.service';

@ApiTags('CoachBrain')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('coach-brain')
export class CoachBrainController {
  constructor(private readonly coachBrainService: CoachBrainService) {}

  // ─── Chat ────────────────────────────────────────────────────────────────

  @Post('chat')
  @ApiOperation({ summary: 'Chat com a IA do coach (SSE streaming, suporta multipart/form-data com arquivos)' })
  @UseInterceptors(FilesInterceptor('files', 5, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por arquivo
  }))
  async chat(
    @CurrentUser('id') coachId: string,
    @Body() body: { message: string; sessionId?: string },
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    await this.coachBrainService.chatStreamMultimodal(
      coachId, body.sessionId ?? null, body.message, files ?? [], res,
    );
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'Listar sessões de chat com a IA' })
  async getSessions(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.getSessions(coachId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhes de uma sessão' })
  async getSession(@CurrentUser('id') coachId: string, @Param('id') sessionId: string) {
    return this.coachBrainService.getSession(coachId, sessionId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Excluir sessão' })
  async deleteSession(@CurrentUser('id') coachId: string, @Param('id') sessionId: string) {
    return this.coachBrainService.deleteSession(coachId, sessionId);
  }

  // ─── AI Settings ─────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Configurações de IA do coach (provedor, modelo, BYOK)' })
  async getAISettings(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.getAISettings(coachId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Atualizar configurações de IA (provedor, modelo, BYOK, API key)' })
  async updateAISettings(
    @CurrentUser('id') coachId: string,
    @Body() body: { provider: AIProvider; model?: string; byok: boolean; apiKey?: string },
  ) {
    return this.coachBrainService.updateAISettings(coachId, body);
  }

  @Post('settings/test')
  @ApiOperation({ summary: 'Testar conexão com o provedor de IA configurado' })
  async testConnection(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.testConnection(coachId);
  }

  // ─── AI Jobs ─────────────────────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({ summary: 'Listar AI jobs do coach' })
  async getJobs(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.getJobs(coachId);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({ summary: 'Re-tentar um AI job manualmente' })
  async retryJob(@CurrentUser('id') coachId: string, @Param('id') jobId: string) {
    return this.coachBrainService.retryJob(coachId, jobId);
  }

  // ─── Apply Plan ───────────────────────────────────────────────────────────

  @Post('apply-plan')
  @ApiOperation({ summary: 'Aplicar planilha gerada pela IA como treinos reais' })
  async applyPlan(
    @CurrentUser('id') coachId: string,
    @Body() body: { athleteId: string; planText: string },
  ) {
    return this.coachBrainService.applyPlanFromChat(coachId, body.athleteId, body.planText);
  }
}
