import {
  Controller, Post, Get, Param, Body, UseGuards, UseInterceptors,
  UploadedFile, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AthleteDocumentsService } from './athlete-documents.service';

@ApiTags('AthleteDocuments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('athlete-documents')
export class AthleteDocumentsController {
  constructor(private readonly athleteDocumentsService: AthleteDocumentsService) {}

  @Post('upload')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Athlete faz upload de documento (exame, foto, planilha, áudio)' })
  async upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('coachId') coachId: string,
    @Body('category') category?: string,
    @Body('description') description?: string,
  ) {
    return this.athleteDocumentsService.uploadDocument(
      userId,
      coachId,
      file,
      category,
      description,
    );
  }

  @Get('my')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Athlete vê seus próprios documentos' })
  async getMy(@CurrentUser('id') athleteId: string) {
    return this.athleteDocumentsService.getMyDocuments(athleteId);
  }

  @Get('athlete/:id')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coach vê documentos de um atleta' })
  async getByAthlete(
    @Param('id') athleteId: string,
    @CurrentUser('id') coachId: string,
  ) {
    return this.athleteDocumentsService.getDocumentsByAthlete(athleteId, coachId);
  }

  @Get(':id')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Detalhes de um documento com análise IA' })
  async getOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.athleteDocumentsService.getDocument(id, userId);
  }

  @Post(':id/analyze')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '(Re)analisar documento com IA' })
  async reanalyze(@Param('id') id: string, @CurrentUser('id') coachId: string) {
    return this.athleteDocumentsService.reanalyze(id, coachId);
  }
}
