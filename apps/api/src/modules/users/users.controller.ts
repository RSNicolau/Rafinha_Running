import { Controller, Get, Put, Patch, Post, Delete, Body, Param, Query, Req, UseGuards, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { TwoFactorService } from './two-factor.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddAthleteDto, ChangePasswordDto, TotpTokenDto, UpdateAiSettingsDto } from './dto/user-settings.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UploadsService } from '../uploads/uploads.service';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private twoFactorService: TwoFactorService,
    private uploadsService: UploadsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter perfil do usuário atual' })
  async getProfile(@CurrentUser('id') userId: string, @Req() req: any) {
    const h = req?.headers?.['x-team-id'];
    return this.usersService.findById(userId, typeof h === 'string' ? h : null);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de foto de perfil' })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    // Tipo validado por magic bytes (jpeg/png/webp, ≤5MB); extensão derivada do tipo detectado
    const url = await this.uploadsService.uploadPublicImage(file, `avatars/${userId}/avatar`);
    return this.usersService.updateAvatarUrl(userId, url);
  }

  @Post('me/banner')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de banner de perfil' })
  async uploadBanner(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    const url = await this.uploadsService.uploadPublicImage(file, `banners/${userId}/banner`);
    return this.usersService.updateBannerUrl(userId, url);
  }

  @Patch('me/ai-settings')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Atualizar configurações de IA do treinador (chave BYOK criptografada)' })
  async updateAiSettings(
    @CurrentUser('id') userId: string,
    @Body() body: UpdateAiSettingsDto,
  ) {
    return this.usersService.updateAiSettings(userId, body);
  }

  @Put('me')
  @ApiOperation({ summary: 'Atualizar perfil' })
  async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Alterar senha' })
  async changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Excluir conta (LGPD - soft-delete com anonimização)' })
  async deleteAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAccount(userId);
  }

  @Get('me/export')
  @ApiOperation({ summary: 'Exportar dados pessoais (LGPD)' })
  async exportMyData(@CurrentUser('id') userId: string) {
    return this.usersService.exportMyData(userId);
  }

  @Post('me/2fa/setup')
  @ApiOperation({ summary: 'Gerar QR Code para configurar 2FA (TOTP)' })
  async setup2FA(@CurrentUser('id') userId: string, @CurrentUser('email') email: string) {
    return this.twoFactorService.generateSetup(userId, email);
  }

  @Post('me/2fa/enable')
  @ApiOperation({ summary: 'Ativar 2FA verificando o código TOTP' })
  async enable2FA(@CurrentUser('id') userId: string, @Body() dto: TotpTokenDto) {
    return this.twoFactorService.enableTotp(userId, dto.token);
  }

  @Post('me/2fa/disable')
  @ApiOperation({ summary: 'Desativar 2FA' })
  async disable2FA(@CurrentUser('id') userId: string, @Body() dto: TotpTokenDto) {
    return this.twoFactorService.disableTotp(userId, dto.token);
  }

  @Get('me/2fa/status')
  @ApiOperation({ summary: 'Status do 2FA do usuário' })
  async get2FAStatus(@CurrentUser('id') userId: string) {
    return this.twoFactorService.getStatus(userId);
  }

  @Get('athletes')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Listar atletas do treinador' })
  async getAthletes(
    @CurrentUser('id') coachId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('q') q?: string,
  ) {
    const p = Math.max(1, Math.floor(+page) || 1);
    const l = Math.min(100, Math.max(1, Math.floor(+limit) || 20));
    return this.usersService.getCoachAthletes(coachId, p, l, typeof q === 'string' ? q.slice(0, 100) : undefined);
  }

  @Get('athletes/alerts')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Alertas de atletas com treinos perdidos' })
  async getAlerts(@CurrentUser('id') coachId: string) {
    return this.usersService.getCoachAlerts(coachId);
  }

  @Get('athletes/stats')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Estatísticas da turma do treinador' })
  async getCoachStats(@CurrentUser('id') coachId: string) {
    return this.usersService.getCoachStats(coachId);
  }

  @Post('athletes/add')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Convidar atleta por e-mail (o vínculo só ocorre quando o atleta aceita)' })
  async addAthlete(@CurrentUser('id') coachId: string, @Body() dto: AddAthleteDto) {
    return this.usersService.addAthleteByEmail(coachId, dto.email);
  }

  /**
   * Perfil completo do atleta para o painel do treinador (detalhe, relatório, criação de planos).
   * Escopo: treinador atribuído, OWNER/ADMIN/STAFF da equipe do atleta (STAFF sem dados de saúde) ou admin.
   * Precisa ficar ANTES de @Get(':id').
   */
  @Get('athletes/:athleteId')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Obter atleta do treinador/equipe (STAFF sem dados de saúde)' })
  async getAthlete(
    @Param('athleteId') athleteId: string,
    @CurrentUser() caller: { id: string; role: string },
  ) {
    return this.usersService.getAthleteForCoach(caller, athleteId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter usuário por ID (campos públicos; só usuários relacionados ao chamador)' })
  async getUser(@Param('id') id: string, @CurrentUser() caller: { id: string; role: string }) {
    return this.usersService.findPublicById(id, caller);
  }
}
