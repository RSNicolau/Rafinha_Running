import {
  Controller, Post, Get, Delete, Param, Body, UseGuards, Res, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CoachBrainService } from './coach-brain.service';

@ApiTags('CoachBrain')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('coach-brain')
export class CoachBrainController {
  constructor(private readonly coachBrainService: CoachBrainService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat com a IA do coach (SSE streaming)' })
  async chat(
    @CurrentUser('id') coachId: string,
    @Body() body: { message: string; sessionId?: string },
    @Res() res: Response,
  ) {
    await this.coachBrainService.chatStream(coachId, body.sessionId ?? null, body.message, res);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Listar sessões de chat com a IA' })
  async getSessions(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.getSessions(coachId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhes de uma sessão' })
  async getSession(
    @CurrentUser('id') coachId: string,
    @Param('id') sessionId: string,
  ) {
    return this.coachBrainService.getSession(coachId, sessionId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Excluir sessão' })
  async deleteSession(
    @CurrentUser('id') coachId: string,
    @Param('id') sessionId: string,
  ) {
    return this.coachBrainService.deleteSession(coachId, sessionId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Listar AI jobs do coach' })
  async getJobs(@CurrentUser('id') coachId: string) {
    return this.coachBrainService.getJobs(coachId);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({ summary: 'Re-tentar um AI job manualmente' })
  async retryJob(
    @CurrentUser('id') coachId: string,
    @Param('id') jobId: string,
  ) {
    return this.coachBrainService.retryJob(coachId, jobId);
  }
}
