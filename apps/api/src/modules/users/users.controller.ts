import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { TwoFactorService } from './two-factor.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(6) newPassword: string;
}

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private twoFactorService: TwoFactorService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter perfil do usuário atual' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
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
  async enable2FA(@CurrentUser('id') userId: string, @Body('token') token: string) {
    return this.twoFactorService.enableTotp(userId, token);
  }

  @Post('me/2fa/disable')
  @ApiOperation({ summary: 'Desativar 2FA' })
  async disable2FA(@CurrentUser('id') userId: string, @Body('token') token: string) {
    return this.twoFactorService.disableTotp(userId, token);
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
  ) {
    return this.usersService.getCoachAthletes(coachId, +page, +limit);
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
  @ApiOperation({ summary: 'Adicionar atleta por e-mail' })
  async addAthlete(@CurrentUser('id') coachId: string, @Body('email') email: string) {
    return this.usersService.addAthleteByEmail(coachId, email);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter usuário por ID (campos públicos)' })
  async getUser(@Param('id') id: string) {
    return this.usersService.findPublicById(id);
  }
}
