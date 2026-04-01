import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

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

  @Get('athletes')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Listar atletas do treinador' })
  async getAthletes(@CurrentUser('id') coachId: string) {
    return this.usersService.getCoachAthletes(coachId);
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
