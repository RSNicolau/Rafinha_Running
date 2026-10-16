import {
  Controller, Post, Get, Param, Body, UseGuards, UseInterceptors,
  UploadedFile, Res, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AthleteDocumentsService } from './athlete-documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DOCUMENT_MAX_BYTES } from '../uploads/uploads.service';

@ApiTags('AthleteDocuments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('athlete-documents')
export class AthleteDocumentsController {
  constructor(private readonly athleteDocumentsService: AthleteDocumentsService) {}

  @Post('upload')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: DOCUMENT_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de documento do atleta (PDF ou imagem, até 15MB) — armazenamento privado' })
  async upload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    return this.athleteDocumentsService.uploadDocument(user, file, dto);
  }

  @Get('my')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atleta vê seus próprios documentos' })
  async getMy(@CurrentUser('id') athleteId: string) {
    return this.athleteDocumentsService.getMyDocuments(athleteId);
  }

  @Get('athlete/:id')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coach vê documentos de um atleta' })
  async getByAthlete(@Param('id') athleteId: string, @CurrentUser() user: any) {
    return this.athleteDocumentsService.getDocumentsByAthlete(athleteId, user);
  }

  @Get(':id/download')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Download autenticado do arquivo (checa permissão)' })
  async download(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const { buffer, mime, fileName } = await this.athleteDocumentsService.downloadDocument(id, user);
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.end(buffer);
  }

  @Get(':id')
  @Roles(UserRole.ATHLETE, UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Detalhes de um documento com análise IA' })
  async getOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.athleteDocumentsService.getDocument(id, user);
  }

  @Post(':id/analyze')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '(Re)analisar documento com IA' })
  async reanalyze(@Param('id') id: string, @CurrentUser() user: any) {
    return this.athleteDocumentsService.reanalyze(id, user);
  }
}
